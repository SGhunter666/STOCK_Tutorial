/**
 * Account mathematics. All functions are pure: they receive an account object and
 * return a new account plus the trade that was produced. Fees are included in the
 * cost basis for buys so total P&L always reconciles with equity.
 *
 * Positions are signed: long positions have qty > 0 and costBasis = total cost,
 * short positions have qty < 0 and costBasis = net proceeds received. This keeps
 * shorts on the same ledger as longs without mixing the two accounting rules.
 */
import { bondValue } from '../assets/bonds.js';
import { fxValue } from '../assets/fx.js';

export const TRADE_LOG_LIMIT = 250;
export const MAINTENANCE_LONG = 0.25;
export const MAINTENANCE_SHORT = 0.30;

export function createAccount(initialCash = 10000) {
  return {
    initialCash,
    cash: initialCash,
    positions: {},
    realizedPnl: 0,
    feesPaid: 0,
    financingPaid: 0,
    careerIncome: 0,
    marginCalls: [],
    options: [],
    optionTrades: [],
    optionSeq: 1,
    optionRealized: 0,
    futures: [],
    futuresTrades: [],
    futuresSeq: 1,
    futuresRealized: 0,
    futuresPnl: 0,
    bonds: [],
    bondRealized: 0,
    fx: [],
    fxRealized: 0,
    trades: [],
    tradeSeq: 1,
    dividends: [],
    equityHistory: [],
  };
}

export function positionOf(account, ticker) {
  const pos = account.positions[ticker];
  if (!pos || !pos.qty) return { ticker, qty: 0, costBasis: 0, avgCost: 0, side: 'flat' };
  return {
    ticker,
    qty: pos.qty,
    costBasis: pos.costBasis,
    avgCost: pos.costBasis / Math.abs(pos.qty),
    side: pos.qty > 0 ? 'long' : 'short',
  };
}


function pushTrade(account, trade) {
  const next = {
    ...trade,
    id: account.tradeSeq,
  };
  account.tradeSeq += 1;
  account.trades = [next, ...account.trades].slice(0, TRADE_LOG_LIMIT);
  return next;
}

export function buy(account, { ticker, qty, price, fee, day = 0, tick = 0, allowDebit = false }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const existing = account.positions[ticker];
  if (existing && existing.qty < 0) {
    return { ok: false, error: 'error.positionIsShort' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const total = gross + safeFee;
  if (!allowDebit && total > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }

  const nextPos = existing
    ? { qty: existing.qty + quantity, costBasis: existing.costBasis + total }
    : { qty: quantity, costBasis: total };

  const draft = {
    ...account,
    cash: account.cash - total,
    positions: { ...account.positions, [ticker]: nextPos },
    feesPaid: account.feesPaid + safeFee,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'buy',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized: 0,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

export function sell(account, { ticker, qty, price, fee, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  const pos = account.positions[ticker];
  if (!pos || pos.qty <= 0 || pos.qty < quantity) {
    return { ok: false, error: 'error.insufficientShares' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const proceeds = gross - safeFee;
  const costPart = (pos.costBasis / pos.qty) * quantity;
  const realized = proceeds - costPart;
  const remainingQty = pos.qty - quantity;

  const nextPositions = { ...account.positions };
  if (remainingQty > 0) {
    nextPositions[ticker] = { qty: remainingQty, costBasis: Math.max(0, pos.costBasis - costPart) };
  } else {
    delete nextPositions[ticker];
  }

  const draft = {
    ...account,
    cash: account.cash + proceeds,
    positions: nextPositions,
    feesPaid: account.feesPaid + safeFee,
    realizedPnl: account.realizedPnl + realized,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'sell',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/**
 * Open or add to a short position. The net proceeds (gross minus fee) are added to
 * cash and recorded as the short's cost basis, so buying the shares back later
 * produces a realised P&L against that basis.
 */
export function short(account, { ticker, qty, price, fee, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const existing = account.positions[ticker];
  if (existing && existing.qty > 0) {
    return { ok: false, error: 'error.positionIsLong' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const proceeds = gross - safeFee;
  const nextPos = existing && existing.qty < 0
    ? { qty: existing.qty - quantity, costBasis: existing.costBasis + proceeds }
    : { qty: -quantity, costBasis: proceeds };

  const draft = {
    ...account,
    cash: account.cash + proceeds,
    positions: { ...account.positions, [ticker]: nextPos },
    feesPaid: account.feesPaid + safeFee,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'short',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized: 0,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

/** Buy back borrowed shares. Realised P&L = proceeds basis minus the cover cost. */
export function cover(account, { ticker, qty, price, fee, day = 0, tick = 0, allowDebit = false }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const pos = account.positions[ticker];
  const shortQty = pos && pos.qty < 0 ? -pos.qty : 0;
  if (!shortQty) return { ok: false, error: 'error.noShortPosition' };
  if (quantity > shortQty) return { ok: false, error: 'error.insufficientShortShares' };

  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const total = gross + safeFee;
  if (!allowDebit && total > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }
  const basisPart = (pos.costBasis / shortQty) * quantity;
  const realized = basisPart - total;
  const remaining = pos.qty + quantity;

  const nextPositions = { ...account.positions };
  if (remaining < 0) {
    nextPositions[ticker] = { qty: remaining, costBasis: Math.max(0, pos.costBasis - basisPart) };
  } else {
    delete nextPositions[ticker];
  }

  const draft = {
    ...account,
    cash: account.cash - total,
    positions: nextPositions,
    feesPaid: account.feesPaid + safeFee,
    realizedPnl: account.realizedPnl + realized,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'cover',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

export function marketValue(account, quotes) {
  let value = 0;
  for (const [ticker, pos] of Object.entries(account.positions)) {
    if (!pos || !pos.qty) continue;
    const quote = quotes[ticker];
    const last = quote ? quote.last : 0;
    value += pos.qty * last;
  }
  return value;
}

export function unrealizedPnl(account, quotes) {
  let pnl = 0;
  for (const [ticker, pos] of Object.entries(account.positions)) {
    if (!pos || !pos.qty) continue;
    const quote = quotes[ticker];
    const last = quote ? quote.last : 0;
    pnl += pos.qty > 0 ? pos.qty * last - pos.costBasis : pos.costBasis + pos.qty * last;
  }
  return pnl;
}

export function optionValue(account) {
  return (account.options || []).reduce((sum, position) => (
    sum + (position.currentValue || 0) * position.qty * 100
  ), 0);
}

export function optionUnrealizedPnl(account) {
  return (account.options || []).reduce((sum, position) => (
    sum + ((position.currentValue || 0) * position.qty * 100 - position.costBasis)
  ), 0);
}

export function equity(account, quotes) {
  return account.cash + marketValue(account, quotes) + optionValue(account)
    + (account.futuresPnl || 0) + bondValue(account) + fxValue(account);
}

export function totalPnl(account, quotes) {
  return equity(account, quotes) - account.initialCash;
}

export function returnPct(account, quotes) {
  if (!account.initialCash) return 0;
  return (totalPnl(account, quotes) / account.initialCash) * 100;
}

export function positionRows(account, quotes) {
  return Object.entries(account.positions)
    .filter(([, pos]) => pos && pos.qty)
    .map(([ticker, pos]) => {
      const quote = quotes[ticker] || { last: 0 };
      const last = quote.last || 0;
      const absQty = Math.abs(pos.qty);
      const avgCost = pos.costBasis / absQty;
      const value = pos.qty * last;
      const pnl = pos.qty > 0 ? value - pos.costBasis : pos.costBasis + value;
      const pnlPct = pos.costBasis > 0 ? (pnl / pos.costBasis) * 100 : 0;
      return {
        ticker,
        qty: pos.qty,
        side: pos.qty > 0 ? 'long' : 'short',
        absQty,
        avgCost,
        last,
        value,
        costBasis: pos.costBasis,
        pnl,
        pnlPct,
        changePct: quote.changePct || 0,
        weight: 0,
      };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** Cash already committed to resting buy limit and stop-limit orders. */
export function reservedCash(orders, fee = 0) {
  return orders
    .filter((o) => o.status === 'open' && o.side === 'buy'
      && (o.type === 'limit' || o.type === 'stop-limit'))
    .reduce((sum, o) => sum + o.qty * o.limitPrice + fee, 0);
}

/**
 * Shares already committed to resting sell orders. Both legs of an OCO reserve the
 * same shares, so grouped legs are counted once instead of twice.
 */
export function reservedShares(orders, ticker) {
  const groups = new Map();
  let total = 0;
  for (const order of orders) {
    if (order.status !== 'open' || order.side !== 'sell' || order.ticker !== ticker) continue;
    if (order.ocoGroup) {
      groups.set(order.ocoGroup, Math.max(groups.get(order.ocoGroup) || 0, order.qty));
    } else {
      total += order.qty;
    }
  }
  for (const qty of groups.values()) total += qty;
  return total;
}

export function availableCash(account, orders, fee = 0) {
  return Math.max(0, account.cash - reservedCash(orders, fee));
}

export function availableShares(account, orders, ticker) {
  const pos = account.positions[ticker];
  if (!pos) return 0;
  return Math.max(0, pos.qty - reservedShares(orders, ticker));
}

export function snapshotEquity(account, quotes, day) {
  const value = equity(account, quotes);
  const last = account.equityHistory[account.equityHistory.length - 1];
  if (last && last.day === day) {
    last.equity = value;
    return account.equityHistory;
  }
  const next = [...account.equityHistory, { day, equity: value }].slice(-400);
  return next;
}

export function longMarketValue(account, quotes) {
  let value = 0;
  for (const [ticker, pos] of Object.entries(account.positions || {})) {
    if (!pos || pos.qty <= 0) continue;
    const quote = quotes[ticker];
    value += (quote ? quote.last : 0) * pos.qty;
  }
  return value;
}

export function shortMarketValue(account, quotes) {
  let value = 0;
  for (const [ticker, pos] of Object.entries(account.positions || {})) {
    if (!pos || pos.qty >= 0) continue;
    const quote = quotes[ticker];
    value += (quote ? quote.last : 0) * -pos.qty;
  }
  return value;
}

export function grossExposure(account, quotes) {
  return longMarketValue(account, quotes) + shortMarketValue(account, quotes);
}

/** Maintenance requirement used by the simplified margin call check. */
export function maintenanceRequirement(account, quotes) {
  return longMarketValue(account, quotes) * MAINTENANCE_LONG
    + shortMarketValue(account, quotes) * MAINTENANCE_SHORT;
}

/**
 * Dollars available for a new buy. Without margin this is plain cash; with margin
 * the player can borrow up to 50% of current equity (1.5:1 leverage).
 */
export function buyingPower(account, quotes, { marginEnabled = false, fee = 0, orders = [] } = {}) {
  if (!marginEnabled) return availableCash(account, orders, fee);
  const eq = equity(account, quotes);
  return Math.max(0, account.cash - reservedCash(orders, fee)) + Math.max(0, eq * 0.5);
}

/** Shares that can still be shorted while keeping 50% collateral against the short. */
export function shortCapacity(account, quotes, price) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const eq = equity(account, quotes);
  const shortValue = shortMarketValue(account, quotes);
  return Math.max(0, Math.floor((eq * 2 - shortValue) / price));
}

export function availableShortShares(account, ticker) {
  const pos = account.positions[ticker];
  return pos && pos.qty < 0 ? -pos.qty : 0;
}
