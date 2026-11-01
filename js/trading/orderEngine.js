/**
 * Order handling: market orders fill immediately at the opposite side of the spread,
 * limit orders rest until the simulated quote crosses the limit price.
 * Pure functions keep this layer testable without any UI or storage.
 */
import { availableCash, availableShares, buy, sell } from './account.js';

export const ORDER_STATUS = {
  open: 'open',
  filled: 'filled',
  cancelled: 'cancelled',
  rejected: 'rejected',
};

function makeOrder(input, id, day = 0, tick = 0) {
  return {
    id,
    ticker: input.ticker,
    side: input.side,
    type: input.type,
    qty: Math.floor(input.qty),
    limitPrice: input.type === 'limit' ? Number(input.limitPrice) : null,
    status: ORDER_STATUS.open,
    createdAt: { day, tick },
    refPrice: Number(input.refPrice) || null,
    filledAt: null,
    fillPrice: null,
    fee: 0,
    reason: null,
  };
}

export function validateOrderInput({ account, orders, input, quote, fee = 0 }) {
  if (!quote) return { ok: false, error: 'error.unknownTicker' };
  if (!['buy', 'sell'].includes(input.side)) return { ok: false, error: 'error.sideInvalid' };
  if (!['market', 'limit'].includes(input.type)) return { ok: false, error: 'error.typeInvalid' };
  const qty = Math.floor(input.qty);
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (input.type === 'limit') {
    const limit = Number(input.limitPrice);
    if (!Number.isFinite(limit) || limit <= 0) return { ok: false, error: 'error.priceInvalid' };
  }
  if (input.side === 'buy') {
    if (input.type === 'market') {
      if (qty * quote.ask + fee > account.cash + 1e-9) {
        return { ok: false, error: 'error.insufficientCash' };
      }
    } else if (qty * Number(input.limitPrice) + fee > availableCash(account, orders, fee) + 1e-9) {
      return { ok: false, error: 'error.insufficientCash' };
    }
  } else if (qty > availableShares(account, orders, input.ticker)) {
    return { ok: false, error: 'error.insufficientShares' };
  }
  return { ok: true };
}

/** Preview numbers for the order ticket. Never mutates state. */
export function estimateOrder({ input, quote, fee = 0 }) {
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  const type = input.type;
  const side = input.side;
  const execPrice = type === 'market'
    ? (side === 'buy' ? quote.ask : quote.bid)
    : Number(input.limitPrice) || 0;
  const gross = qty * execPrice;
  const total = side === 'buy' ? gross + fee : gross - fee;
  return {
    qty,
    execPrice,
    gross,
    fee,
    total,
    maxLoss: side === 'buy' ? gross + fee : null,
    breakeven: execPrice,
  };
}

export function placeMarketOrder({ account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1 }) {
  const validation = validateOrderInput({ account, orders, input, quote, fee });
  if (!validation.ok) return validation;

  const price = input.side === 'buy' ? quote.ask : quote.bid;
  const order = makeOrder({ ...input, qty: Math.floor(input.qty), refPrice: quote.last }, seq, day, tick);
  const result = input.side === 'buy'
    ? buy(account, { ticker: input.ticker, qty: order.qty, price, fee, day, tick })
    : sell(account, { ticker: input.ticker, qty: order.qty, price, fee, day, tick });

  if (!result.ok) return result;

  const filled = {
    ...order,
    status: ORDER_STATUS.filled,
    fillPrice: price,
    filledAt: { day, tick },
    fee,
  };
  return { ok: true, account: result.account, order: filled, trade: result.trade };
}

export function placeLimitOrder({ account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1 }) {
  const validation = validateOrderInput({ account, orders, input, quote, fee });
  if (!validation.ok) return validation;

  const limit = Number(input.limitPrice);
  const side = input.side;
  const wouldFillNow = side === 'buy' ? quote.ask <= limit : quote.bid >= limit;

  if (wouldFillNow) {
    const price = side === 'buy' ? Math.min(limit, quote.ask) : Math.max(limit, quote.bid);
    const result = side === 'buy'
      ? buy(account, { ticker: input.ticker, qty: Math.floor(input.qty), price, fee, day, tick })
      : sell(account, { ticker: input.ticker, qty: Math.floor(input.qty), price, fee, day, tick });
    if (!result.ok) return result;
    const order = makeOrder({ ...input, qty: Math.floor(input.qty), refPrice: quote.last }, seq, day, tick);
    return {
      ok: true,
      account: result.account,
      trade: result.trade,
      order: {
        ...order,
        status: ORDER_STATUS.filled,
        fillPrice: price,
        filledAt: { day, tick },
        fee,
        reason: 'order.filledImmediately',
      },
    };
  }

  const order = makeOrder({ ...input, qty: Math.floor(input.qty), refPrice: quote.last }, seq, day, tick);
  return {
    ok: true,
    account,
    order: { ...order, status: ORDER_STATUS.open, reason: 'order.resting' },
  };
}

export function cancelOrder(orders, orderId) {
  let changed = null;
  const next = orders.map((order) => {
    if (order.id !== orderId || order.status !== ORDER_STATUS.open) return order;
    changed = { ...order, status: ORDER_STATUS.cancelled };
    return changed;
  });
  return { ok: Boolean(changed), orders: next, order: changed };
}

/**
 * Called after every market tick. Fills resting limit orders whose price condition
 * is satisfied by the new quote.
 */
export function processOpenOrders({ account, orders, quotes, fee = 0, day = 0, tick = 0 }) {
  let nextAccount = account;
  const fills = [];

  const nextOrders = orders.map((order) => {
    if (order.status !== ORDER_STATUS.open) return order;
    const quote = quotes[order.ticker];
    if (!quote) return order;

    const canFill = order.side === 'buy' ? quote.ask <= order.limitPrice : quote.bid >= order.limitPrice;
    if (!canFill) return order;

    const price = order.side === 'buy'
      ? Math.min(order.limitPrice, quote.ask)
      : Math.max(order.limitPrice, quote.bid);

    const result = order.side === 'buy'
      ? buy(nextAccount, { ticker: order.ticker, qty: order.qty, price, fee, day, tick })
      : sell(nextAccount, { ticker: order.ticker, qty: order.qty, price, fee, day, tick });

    if (!result.ok) {
      return { ...order, status: ORDER_STATUS.rejected, reason: result.error, fee: 0 };
    }

    nextAccount = result.account;
    const filled = {
      ...order,
      status: ORDER_STATUS.filled,
      fillPrice: price,
      filledAt: { day, tick },
      fee,
      reason: 'order.filledOnCross',
    };
    fills.push({ order: filled, trade: result.trade });
    return filled;
  });

  return { account: nextAccount, orders: nextOrders, fills };
}
