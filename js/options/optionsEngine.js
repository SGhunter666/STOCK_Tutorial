/**
 * Option positions support both long and short contracts. Premiums, collateral
 * and settlement all flow through the same cash account as stocks. Short options
 * are cash-settled at expiry in this simulation; real brokers may deliver stock.
 */
import { CONTRACT_SIZE, blackScholes } from './pricing.js';
import { reservedCash, reservedShares } from '../trading/account.js';

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
  const key = optionKey(contract);
  const existing = (account.options || []).find((position) => position.key === key);
  if (existing && existing.qty < 0) {
    return { ok: false, error: 'error.optionIsShort' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = contract.premium * CONTRACT_SIZE * quantity;
  const cost = gross + safeFee;
  if (cost > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }

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

/** Open or add to a short option position. Premium is received up front. */
export function sellOption(account, { contract, qty, fee = 0, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!contract || contract.premium <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const key = optionKey(contract);
  const existing = (account.options || []).find((position) => position.key === key);
  if (existing && existing.qty > 0) {
    return { ok: false, error: 'error.optionIsLong' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = contract.premium * CONTRACT_SIZE * quantity;
  const proceeds = gross - safeFee;

  const nextPosition = existing
    ? {
      ...existing,
      qty: existing.qty - quantity,
      costBasis: existing.costBasis + proceeds,
      premium: (existing.costBasis + proceeds) / ((Math.abs(existing.qty) + quantity) * CONTRACT_SIZE),
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
      qty: -quantity,
      costBasis: proceeds,
      premium: proceeds / (quantity * CONTRACT_SIZE),
      currentValue: contract.premium,
      vol: contract.vol,
      delta: contract.delta,
      theta: contract.theta,
      openedDay: day,
      contractSize: CONTRACT_SIZE,
    };

  const draft = {
    ...account,
    cash: round2(account.cash + proceeds),
    options: existing
      ? account.options.map((position) => (position.key === key ? nextPosition : position))
      : [...(account.options || []), nextPosition],
    feesPaid: account.feesPaid + safeFee,
  };
  const trade = pushOptionTrade(draft, {
    side: 'sell',
    ticker: contract.ticker,
    optionType: contract.type,
    strike: contract.strike,
    expiryDay: contract.expiryDay,
    qty: quantity,
    premium: contract.premium,
    fee: safeFee,
    gross,
    cash: proceeds,
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

/** Close a long or short contract at the model value. */
export function closeOption(account, { key, qty, fee = 0, day = 0, tick = 0 }) {
  const position = (account.options || []).find((entry) => entry.key === key);
  if (!position) return { ok: false, error: 'error.noOptionPosition' };
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (quantity > Math.abs(position.qty)) {
    return { ok: false, error: 'error.insufficientContracts' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const absQty = Math.abs(position.qty);
  const basisPart = (position.costBasis / absQty) * quantity;
  const isLong = position.qty > 0;
  const gross = position.currentValue * CONTRACT_SIZE * quantity;
  const proceeds = isLong ? round2(gross - safeFee) : 0;
  const cost = isLong ? 0 : round2(gross + safeFee);
  if (!isLong && cost > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }
  const realized = isLong ? round2(proceeds - basisPart) : round2(basisPart - cost);
  const signedRemaining = position.qty - (isLong ? quantity : -quantity);
  const options = signedRemaining !== 0
    ? account.options.map((entry) => (entry.key === key
      ? { ...entry, qty: signedRemaining, costBasis: round2(entry.costBasis - basisPart) }
      : entry))
    : account.options.filter((entry) => entry.key !== key);

  const draft = {
    ...account,
    cash: round2(account.cash + (isLong ? proceeds : -cost)),
    options,
    feesPaid: account.feesPaid + safeFee,
    optionRealized: round2((account.optionRealized || 0) + realized),
  };
  const trade = pushOptionTrade(draft, {
    side: isLong ? 'close' : 'buyToClose',
    ticker: position.ticker,
    optionType: position.type,
    strike: position.strike,
    expiryDay: position.expiryDay,
    qty: quantity,
    premium: position.currentValue,
    fee: safeFee,
    gross,
    cash: isLong ? proceeds : -cost,
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
    const isLong = position.qty > 0;
    const quantity = Math.abs(position.qty);
    const proceeds = round2(intrinsic * CONTRACT_SIZE * quantity);
    const realized = isLong
      ? round2(proceeds - position.costBasis)
      : round2(position.costBasis - proceeds);
    cash = round2(cash + (isLong ? proceeds : -proceeds));
    realizedTotal = round2(realizedTotal + realized);
    const settlement = {
      ticker: position.ticker,
      optionType: position.type,
      strike: position.strike,
      expiryDay: position.expiryDay,
      qty: position.qty,
      spot,
      intrinsic: round2(intrinsic),
      proceeds: isLong ? proceeds : -proceeds,
      cost: position.costBasis,
      realized,
    };
    settlements.push(settlement);
    pushOptionTrade(draft, {
      side: isLong ? 'expire' : 'assigned',
      ticker: position.ticker,
      optionType: position.type,
      strike: position.strike,
      expiryDay: position.expiryDay,
      qty: quantity,
      premium: intrinsic,
      fee: 0,
      gross: proceeds,
      cash: isLong ? proceeds : -proceeds,
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

export function optionPositionRows(account, day = 0) {
  return (account.options || [])
    .map((position) => {
      const quantity = Math.abs(position.qty);
      const value = round2((position.currentValue || 0) * CONTRACT_SIZE * position.qty);
      const pnl = position.qty > 0
        ? round2(value - position.costBasis)
        : round2(position.costBasis + value);
      return {
        ...position,
        qty: position.qty,
        absQty: quantity,
        side: position.qty > 0 ? 'long' : 'short',
        value,
        pnl,
        pnlPct: position.costBasis > 0 ? (pnl / position.costBasis) * 100 : 0,
        daysLeft: Math.max(0, position.expiryDay - day),
      };
    })
    .sort((a, b) => a.expiryDay - b.expiryDay);
}

/**
 * Cash collateral required by short options. Covered calls use stock or long
 * calls as cover; cash-secured puts use the strike; uncovered calls need 20%
 * of notional. Long options need no collateral.
 */
export function optionCollateral(account, quotes) {
  const positions = account.options || [];
  if (!positions.length) return 0;
  let collateral = 0;
  const tickers = new Set(positions.map((position) => position.ticker));
  for (const ticker of tickers) {
    const quote = quotes[ticker];
    const spot = quote ? quote.last : 0;
    const shortCalls = positions
      .filter((position) => position.ticker === ticker && position.type === 'call' && position.qty < 0)
      .reduce((sum, position) => sum + -position.qty, 0);
    const longCalls = positions
      .filter((position) => position.ticker === ticker && position.type === 'call' && position.qty > 0)
      .reduce((sum, position) => sum + position.qty, 0);
    const shortPuts = positions
      .filter((position) => position.ticker === ticker && position.type === 'put' && position.qty < 0)
      .reduce((sum, position) => sum + -position.qty, 0);
    const longPuts = positions
      .filter((position) => position.ticker === ticker && position.type === 'put' && position.qty > 0)
      .reduce((sum, position) => sum + position.qty, 0);
    const stock = account.positions[ticker];
    const shares = stock && stock.qty > 0 ? stock.qty : 0;
    const coveredCalls = Math.min(shortCalls, Math.floor(shares / 100) + longCalls);
    const nakedCalls = Math.max(0, shortCalls - coveredCalls);
    collateral += nakedCalls * spot * CONTRACT_SIZE * 0.2;
    const coveredPuts = Math.min(shortPuts, longPuts);
    let remainingCovered = coveredPuts;
    for (const position of positions) {
      if (position.ticker !== ticker || position.type !== 'put' || position.qty >= 0) continue;
      const quantity = -position.qty;
      const covered = Math.min(quantity, remainingCovered);
      remainingCovered -= covered;
      const naked = quantity - covered;
      collateral += naked * position.strike * CONTRACT_SIZE;
    }
  }
  return round2(collateral);
}

export function availableOptionCash(account, quotes, { fee = 0, orders = [] } = {}) {
  return Math.max(0, round2(
    account.cash - reservedCash(orders, fee) - optionCollateral(account, quotes),
  ));
}

/** Shares available to cover a new short call, after stock orders and existing calls. */
export function availableCoveredShares(account, ticker, orders = []) {
  const stock = account.positions[ticker];
  const shares = stock && stock.qty > 0 ? stock.qty : 0;
  const shortCalls = (account.options || [])
    .filter((position) => position.ticker === ticker && position.type === 'call' && position.qty < 0)
    .reduce((sum, position) => sum + -position.qty, 0);
  return Math.max(0, shares - reservedShares(orders, ticker) - shortCalls * CONTRACT_SIZE);
}

/** Apply several option legs atomically; used by strategy presets. */
export function executeOptionLegs(account, legs, { fee = 0, day = 0, tick = 0 } = {}) {
  let next = account;
  const trades = [];
  for (const leg of legs) {
    const result = leg.side === 'buy'
      ? buyOption(next, { contract: leg.contract, qty: leg.qty, fee, day, tick })
      : sellOption(next, { contract: leg.contract, qty: leg.qty, fee, day, tick });
    if (!result.ok) return result;
    next = result.account;
    trades.push(result.trade);
  }
  return { ok: true, account: next, trades };
}
