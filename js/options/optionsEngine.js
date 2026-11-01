/**
 * Long-only option positions: buy, mark to model, close early or settle at
 * expiry. Premiums and settlement flow through the same cash account as stocks.
 */
import { CONTRACT_SIZE, blackScholes } from './pricing.js';

const OPTION_TRADE_LIMIT = 160;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function optionKey(contract) {
  return `${contract.ticker}:${contract.type}:${contract.strike}:${contract.expiryDay}`;
}

function pushOptionTrade(account, trade) {
  const next = { ...trade, id: account.optionSeq };
  account.optionSeq = (account.optionSeq || 0) + 1;
  account.optionTrades = [next, ...(account.optionTrades || [])].slice(0, OPTION_TRADE_LIMIT);
  return next;
}

export function buyOption(account, { contract, qty, fee = 0, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!contract || contract.premium <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = contract.premium * CONTRACT_SIZE * quantity;
  const cost = gross + safeFee;
  if (cost > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }

  const key = optionKey(contract);
  const existing = (account.options || []).find((position) => position.key === key);
  const nextPosition = existing
    ? {
      ...existing,
      qty: existing.qty + quantity,
      costBasis: existing.costBasis + cost,
      premium: (existing.costBasis + cost) / ((existing.qty + quantity) * CONTRACT_SIZE),
      currentValue: contract.premium,
      delta: contract.delta,
      theta: contract.theta,
    }
    : {
      key,
      ticker: contract.ticker,
      type: contract.type,
      strike: contract.strike,
      expiryDay: contract.expiryDay,
      qty: quantity,
      costBasis: cost,
      premium: cost / (quantity * CONTRACT_SIZE),
      currentValue: contract.premium,
      vol: contract.vol,
      delta: contract.delta,
      theta: contract.theta,
      openedDay: day,
      contractSize: CONTRACT_SIZE,
    };

  const draft = {
    ...account,
    cash: round2(account.cash - cost),
    options: existing
      ? account.options.map((position) => (position.key === key ? nextPosition : position))
      : [...(account.options || []), nextPosition],
    feesPaid: account.feesPaid + safeFee,
  };
  const trade = pushOptionTrade(draft, {
    side: 'buy',
    ticker: contract.ticker,
    optionType: contract.type,
    strike: contract.strike,
    expiryDay: contract.expiryDay,
    qty: quantity,
    premium: contract.premium,
    fee: safeFee,
    gross,
    cash: -cost,
    realized: 0,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/** Mark every open contract to the model using the current spot and time left. */
export function markOptions(account, quotes, day) {
  const positions = account.options || [];
  if (!positions.length) return account;
  let changed = false;
  const options = positions.map((position) => {
    const quote = quotes[position.ticker];
    if (!quote) return position;
    const years = Math.max(0, position.expiryDay - day) / 252;
    const greeks = blackScholes({
      type: position.type,
      spot: quote.last,
      strike: position.strike,
      years,
      vol: position.vol,
    });
    if (Math.abs(greeks.price - (position.currentValue || 0)) < 0.005
      && Math.abs(greeks.delta - (position.delta || 0)) < 0.01) {
      return position;
    }
    changed = true;
    return {
      ...position,
      currentValue: greeks.price,
      delta: greeks.delta,
      theta: greeks.theta,
      lastMarkDay: day,
    };
  });
  return changed ? { ...account, options } : account;
}

/** Sell to close part or all of a long option position at the model value. */
export function closeOption(account, { key, qty, fee = 0, day = 0, tick = 0 }) {
  const position = (account.options || []).find((entry) => entry.key === key);
  if (!position) return { ok: false, error: 'error.noOptionPosition' };
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (quantity > position.qty) {
    return { ok: false, error: 'error.insufficientContracts' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const proceeds = round2(position.currentValue * CONTRACT_SIZE * quantity - safeFee);
  const basisPart = (position.costBasis / position.qty) * quantity;
  const realized = round2(proceeds - basisPart);
  const remaining = position.qty - quantity;
  const options = remaining > 0
    ? account.options.map((entry) => (entry.key === key
      ? { ...entry, qty: remaining, costBasis: round2(entry.costBasis - basisPart) }
      : entry))
    : account.options.filter((entry) => entry.key !== key);

  const draft = {
    ...account,
    cash: round2(account.cash + proceeds),
    options,
    feesPaid: account.feesPaid + safeFee,
    optionRealized: round2((account.optionRealized || 0) + realized),
  };
  const trade = pushOptionTrade(draft, {
    side: 'close',
    ticker: position.ticker,
    optionType: position.type,
    strike: position.strike,
    expiryDay: position.expiryDay,
    qty: quantity,
    premium: position.currentValue,
    fee: safeFee,
    gross: position.currentValue * CONTRACT_SIZE * quantity,
    cash: proceeds,
    realized,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/** Cash-settle every contract whose expiry day has been reached. */
export function settleOptions(account, quotes, day) {
  const positions = account.options || [];
  const expiring = positions.filter((position) => position.expiryDay <= day);
  if (!expiring.length) return { account, settlements: [] };

  let cash = account.cash;
  let realizedTotal = account.optionRealized || 0;
  const settlements = [];
  const draft = {
    ...account,
    optionTrades: account.optionTrades || [],
  };

  for (const position of expiring) {
    const quote = quotes[position.ticker];
    const spot = quote ? quote.last : position.currentValue;
    const intrinsic = position.type === 'call'
      ? Math.max(0, spot - position.strike)
      : Math.max(0, position.strike - spot);
    const proceeds = round2(intrinsic * CONTRACT_SIZE * position.qty);
    const realized = round2(proceeds - position.costBasis);
    cash = round2(cash + proceeds);
    realizedTotal = round2(realizedTotal + realized);
    const settlement = {
      ticker: position.ticker,
      optionType: position.type,
      strike: position.strike,
      expiryDay: position.expiryDay,
      qty: position.qty,
      spot,
      intrinsic: round2(intrinsic),
      proceeds,
      cost: position.costBasis,
      realized,
    };
    settlements.push(settlement);
    pushOptionTrade(draft, {
      side: 'expire',
      ticker: position.ticker,
      optionType: position.type,
      strike: position.strike,
      expiryDay: position.expiryDay,
      qty: position.qty,
      premium: intrinsic,
      fee: 0,
      gross: proceeds,
      cash: proceeds,
      realized,
      day,
      spot,
    });
  }

  return {
    account: {
      ...draft,
      cash,
      options: positions.filter((position) => position.expiryDay > day),
      optionRealized: realizedTotal,
    },
    settlements,
  };
}

export function optionPositionRows(account, day) {
  return (account.options || [])
    .map((position) => {
      const value = round2((position.currentValue || 0) * CONTRACT_SIZE * position.qty);
      const pnl = round2(value - position.costBasis);
      return {
        ...position,
        value,
        pnl,
        pnlPct: position.costBasis > 0 ? (pnl / position.costBasis) * 100 : 0,
        daysLeft: Math.max(0, position.expiryDay - day),
      };
    })
    .sort((a, b) => a.expiryDay - b.expiryDay);
}
