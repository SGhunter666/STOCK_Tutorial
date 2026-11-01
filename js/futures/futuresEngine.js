/**
 * Single-stock futures with daily variation margin and cash settlement. Opening a
 * contract reserves margin but does not deduct it; each day close credits or debits
 * the change in value since the previous settlement price.
 */
import { reservedCash } from '../trading/account.js';

export const FUTURES_MULTIPLIER = 100;
export const FUTURES_MARGIN_RATE = 0.15;
export const FUTURES_EXPIRIES = [30, 60, 90];
export const FUTURES_CARRY_RATE = 0.04;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function futuresPrice(spot, days) {
  return round2(Math.max(0.01, spot * (1 + FUTURES_CARRY_RATE * Math.max(0, days) / 365)));
}

export function buildFuturesChain(quote, day) {
  return {
    ticker: quote.ticker,
    spot: quote.last,
    expiries: FUTURES_EXPIRIES.map((days) => {
      const price = futuresPrice(quote.last, days);
      return {
        ticker: quote.ticker,
        days,
        expiryDay: day + days,
        price,
        basis: round2(price - quote.last),
        margin: round2(price * FUTURES_MULTIPLIER * FUTURES_MARGIN_RATE),
      };
    }),
  };
}

export function futuresMargin(account) {
  return round2((account.futures || []).reduce((sum, position) => (
    sum + (position.marginPerContract || 0) * Math.abs(position.qty)
  ), 0));
}

export function availableFuturesCash(account, { fee = 0, orders = [] } = {}) {
  return Math.max(0, round2(
    account.cash - reservedCash(orders, fee) - futuresMargin(account),
  ));
}

function pushFuturesTrade(account, trade) {
  const next = { ...trade, id: account.futuresSeq };
  account.futuresSeq = (account.futuresSeq || 0) + 1;
  account.futuresTrades = [next, ...(account.futuresTrades || [])].slice(0, 160);
  return next;
}

export function openFuture(account, { contract, side, qty, fee = 0, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!contract || contract.price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const margin = round2(contract.margin * quantity);
  if (margin > availableFuturesCash(account, { fee }) + 1e-9) {
    return { ok: false, error: 'error.insufficientFuturesMargin' };
  }
  const signed = side === 'short' ? -1 : 1;
  const key = `${contract.ticker}:${contract.expiryDay}:${side}`;
  const existing = (account.futures || []).find((position) => position.key === key);
  const nextPosition = existing
    ? {
      ...existing,
      qty: existing.qty + quantity,
      entryPrice: round2(
        (existing.entryPrice * existing.qty + contract.price * quantity) / (existing.qty + quantity),
      ),
      marginPerContract: contract.margin,
      currentPrice: contract.price,
      fees: round2((existing.fees || 0) + Math.max(0, fee || 0)),
    }
    : {
      key,
      ticker: contract.ticker,
      expiryDay: contract.expiryDay,
      side,
      signed,
      qty: quantity,
      entryPrice: contract.price,
      currentPrice: contract.price,
      settlementPrice: contract.price,
      marginPerContract: contract.margin,
      openedDay: day,
      fees: Math.max(0, fee || 0),
    };

  const draft = {
    ...account,
    cash: round2(account.cash - Math.max(0, fee || 0)),
    futures: existing
      ? account.futures.map((position) => (position.key === key ? nextPosition : position))
      : [...(account.futures || []), nextPosition],
    feesPaid: account.feesPaid + Math.max(0, fee || 0),
  };
  const trade = pushFuturesTrade(draft, {
    action: 'open',
    ticker: contract.ticker,
    side,
    qty: quantity,
    price: contract.price,
    expiryDay: contract.expiryDay,
    margin,
    fee,
    realized: 0,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/** Revalue open futures against the spot and record intraday unrealised P&L. */
export function markFutures(account, quotes, day) {
  const positions = account.futures || [];
  if (!positions.length) return account;
  let pnl = 0;
  const futures = positions.map((position) => {
    const quote = quotes[position.ticker];
    if (!quote) return position;
    const remaining = Math.max(0, position.expiryDay - day);
    const currentPrice = futuresPrice(quote.last, remaining);
    pnl += (currentPrice - position.settlementPrice) * position.signed * position.qty * FUTURES_MULTIPLIER;
    return { ...position, currentPrice };
  });
  return {
    ...account,
    futures,
    futuresPnl: round2(pnl),
  };
}

/** Daily variation margin: move intraday P&L into cash and reset the settlement price. */
export function applyFuturesVariation(account) {
  const variation = round2(account.futuresPnl || 0);
  if (!variation) return { account, variation: 0 };
  return {
    account: {
      ...account,
      cash: round2(account.cash + variation),
      futures: (account.futures || []).map((position) => ({
        ...position,
        settlementPrice: position.currentPrice,
      })),
      futuresPnl: 0,
      futuresVariation: round2((account.futuresVariation || 0) + variation),
    },
    variation,
  };
}

export function closeFuture(account, { key, qty, fee = 0, day = 0, tick = 0 }) {
  const position = (account.futures || []).find((entry) => entry.key === key);
  if (!position) return { ok: false, error: 'error.noFuturesPosition' };
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (quantity > position.qty) return { ok: false, error: 'error.insufficientContracts' };
  const variation = round2(
    (position.currentPrice - position.settlementPrice) * position.signed * quantity * FUTURES_MULTIPLIER,
  );
  const realized = round2(
    (position.currentPrice - position.entryPrice) * position.signed * quantity * FUTURES_MULTIPLIER
    - (fee || 0),
  );
  const remaining = position.qty - quantity;
  const futures = remaining > 0
    ? account.futures.map((entry) => (entry.key === key
      ? {
        ...entry,
        qty: remaining,
        settlementPrice: entry.currentPrice,
      }
      : entry))
    : account.futures.filter((entry) => entry.key !== key);

  const remainingPnl = futures.reduce((sum, entry) => (
    sum + (entry.currentPrice - entry.settlementPrice) * entry.signed * entry.qty * FUTURES_MULTIPLIER
  ), 0);
  const draft = {
    ...account,
    cash: round2(account.cash + variation - (fee || 0)),
    futures,
    futuresPnl: round2(remainingPnl),
    feesPaid: account.feesPaid + (fee || 0),
    futuresRealized: round2((account.futuresRealized || 0) + realized),
  };
  const trade = pushFuturesTrade(draft, {
    action: 'close',
    ticker: position.ticker,
    side: position.side,
    qty: quantity,
    price: position.currentPrice,
    expiryDay: position.expiryDay,
    margin: 0,
    fee,
    realized,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/** Expiry cash settlement. Prior variation has already been moved into cash. */
export function settleFutures(account, quotes, day) {
  const positions = account.futures || [];
  const expiring = positions.filter((position) => position.expiryDay <= day);
  if (!expiring.length) return { account, settlements: [] };

  let cash = account.cash;
  let realizedTotal = account.futuresRealized || 0;
  const settlements = [];
  const draft = {
    ...account,
    futuresTrades: account.futuresTrades || [],
  };

  for (const position of expiring) {
    const quote = quotes[position.ticker];
    const finalPrice = quote ? quote.last : position.currentPrice;
    const finalVariation = round2(
      (finalPrice - position.settlementPrice) * position.signed * position.qty * FUTURES_MULTIPLIER,
    );
    const realized = round2(
      (finalPrice - position.entryPrice) * position.signed * position.qty * FUTURES_MULTIPLIER
      - (position.fees || 0),
    );
    cash = round2(cash + finalVariation);
    realizedTotal = round2(realizedTotal + realized);
    settlements.push({
      ticker: position.ticker,
      side: position.side,
      qty: position.qty,
      entryPrice: position.entryPrice,
      finalPrice,
      expiryDay: position.expiryDay,
      variation: finalVariation,
      realized,
    });
    pushFuturesTrade(draft, {
      action: 'expire',
      ticker: position.ticker,
      side: position.side,
      qty: position.qty,
      price: finalPrice,
      expiryDay: position.expiryDay,
      margin: 0,
      fee: 0,
      realized,
      day,
    });
  }

  return {
    account: {
      ...draft,
      cash,
      futures: positions.filter((position) => position.expiryDay > day),
      futuresRealized: realizedTotal,
      futuresPnl: round2((account.futures || [])
        .filter((position) => position.expiryDay > day)
        .reduce((sum, position) => (
          sum + (position.currentPrice - position.settlementPrice) * position.signed * position.qty * FUTURES_MULTIPLIER
        ), 0)),
    },
    settlements,
  };
}

export function futuresPositionRows(account) {
  return (account.futures || []).map((position) => {
    const unrealized = round2(
      (position.currentPrice - position.entryPrice) * position.signed * position.qty * FUTURES_MULTIPLIER,
    );
    return {
      ...position,
      unrealized,
      margin: round2(position.marginPerContract * position.qty),
      notional: round2(position.currentPrice * position.qty * FUTURES_MULTIPLIER),
    };
  });
}
