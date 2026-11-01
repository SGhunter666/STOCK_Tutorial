/**
 * Order handling: market orders fill immediately at the opposite side of the spread,
 * limit orders rest until the quote crosses, and stop / trailing-stop orders wait
 * for their trigger before sending a market order. Pure functions keep this layer
 * testable without any UI or storage.
 */
import {
  availableCash, availableShares, availableShortShares, buy, cover, sell, short,
} from './account.js';

export const ORDER_STATUS = {
  open: 'open',
  filled: 'filled',
  cancelled: 'cancelled',
  rejected: 'rejected',
};

export const ORDER_TYPES = ['market', 'limit', 'stop', 'trailing', 'stop-limit', 'oco'];
export const ORDER_SIDES = ['buy', 'sell', 'short', 'cover'];

const MARKET_SIDES = new Set(['buy', 'cover']);

function makeOrder(input, id, day = 0, tick = 0) {
  const ref = Number(input.refPrice) || null;
  const trail = input.type === 'trailing' ? Math.max(0.01, Number(input.trailAmount) || 0) : null;
  const limitTypes = new Set(['limit', 'stop-limit', 'oco']);
  const stopTypes = new Set(['stop', 'stop-limit', 'oco']);
  let stop = null;
  if (stopTypes.has(input.type)) stop = Number(input.stopPrice) || null;
  if (input.type === 'trailing' && ref) stop = MARKET_SIDES.has(input.side) ? ref + trail : ref - trail;
  return {
    id,
    ticker: input.ticker,
    side: input.side,
    type: input.type,
    qty: Math.floor(input.qty),
    limitPrice: limitTypes.has(input.type) ? Number(input.limitPrice) : null,
    stopPrice: stop,
    trailAmount: trail,
    extremePrice: ref,
    armed: false,
    ocoGroup: null,
    ocoRole: null,
    status: ORDER_STATUS.open,
    createdAt: { day, tick },
    refPrice: ref,
    filledAt: null,
    fillPrice: null,
    fee: 0,
    reason: null,
  };
}

function executeSide(account, side, { ticker, qty, price, fee, day, tick, allowDebit }) {
  if (side === 'buy') return buy(account, { ticker, qty, price, fee, day, tick, allowDebit });
  if (side === 'sell') return sell(account, { ticker, qty, price, fee, day, tick });
  if (side === 'short') return short(account, { ticker, qty, price, fee, day, tick });
  return cover(account, { ticker, qty, price, fee, day, tick, allowDebit });
}

export function validateOrderInput({
  account, orders, input, quote, fee = 0, buyingPower, shortCapacity, allowDebit = false,
}) {
  if (!quote) return { ok: false, error: 'error.unknownTicker' };
  if (!ORDER_SIDES.includes(input.side)) return { ok: false, error: 'error.sideInvalid' };
  if (!ORDER_TYPES.includes(input.type)) return { ok: false, error: 'error.typeInvalid' };
  const qty = Math.floor(input.qty);
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'error.qtyInvalid' };

  const isConditional = ['stop', 'trailing', 'stop-limit', 'oco'].includes(input.type);
  if (input.type === 'limit') {
    const limit = Number(input.limitPrice);
    if (!Number.isFinite(limit) || limit <= 0) return { ok: false, error: 'error.priceInvalid' };
  }
  if (input.type === 'stop' || input.type === 'stop-limit') {
    const stop = Number(input.stopPrice);
    if (!Number.isFinite(stop) || stop <= 0) return { ok: false, error: 'error.priceInvalid' };
    if (MARKET_SIDES.has(input.side) && stop < quote.last) return { ok: false, error: 'error.stopDirection' };
    if (!MARKET_SIDES.has(input.side) && stop > quote.last) return { ok: false, error: 'error.stopDirection' };
  }
  if (input.type === 'stop-limit') {
    const limit = Number(input.limitPrice);
    if (!Number.isFinite(limit) || limit <= 0) return { ok: false, error: 'error.priceInvalid' };
    const stop = Number(input.stopPrice);
    if (MARKET_SIDES.has(input.side) && limit < stop) return { ok: false, error: 'error.stopLimitRange' };
    if (!MARKET_SIDES.has(input.side) && limit > stop) return { ok: false, error: 'error.stopLimitRange' };
  }
  if (input.type === 'oco') {
    if (input.side !== 'sell' && input.side !== 'cover') {
      return { ok: false, error: 'error.ocoSide' };
    }
    const limit = Number(input.limitPrice);
    const stop = Number(input.stopPrice);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(stop) || stop <= 0) {
      return { ok: false, error: 'error.priceInvalid' };
    }
    const isSell = input.side === 'sell';
    if (isSell && limit < quote.last) return { ok: false, error: 'error.priceInvalid' };
    if (!isSell && limit > quote.last) return { ok: false, error: 'error.priceInvalid' };
    if (isSell && stop > quote.last) return { ok: false, error: 'error.stopDirection' };
    if (!isSell && stop < quote.last) return { ok: false, error: 'error.stopDirection' };
  }
  if (input.type === 'trailing') {
    const trail = Number(input.trailAmount);
    if (!Number.isFinite(trail) || trail <= 0) return { ok: false, error: 'error.priceInvalid' };
  }

  const cashLimit = Number.isFinite(buyingPower) ? buyingPower : availableCash(account, orders, fee);
  // Conditional orders only check direction and share availability at placement;
  // cash is checked again when the trigger fires.
  if (input.side === 'sell' && qty > availableShares(account, orders, input.ticker)) {
    return { ok: false, error: 'error.insufficientShares' };
  }
  if (input.side === 'cover' && qty > availableShortShares(account, input.ticker)) {
    return { ok: false, error: 'error.insufficientShortShares' };
  }
  if (input.side === 'short') {
    const capacity = Number.isFinite(shortCapacity)
      ? shortCapacity
      : Math.max(0, Math.floor((account.cash * 2) / quote.bid));
    if (qty > capacity) return { ok: false, error: 'error.insufficientMargin' };
  }
  if (isConditional) return { ok: true };

  if (!isConditional && (input.side === 'buy' || (input.side === 'cover' && !allowDebit))) {
    const price = input.type === 'limit' ? Number(input.limitPrice) : quote.ask;
    if (qty * price + fee > cashLimit + 1e-9) {
      return { ok: false, error: 'error.insufficientCash' };
    }
  }
  if (!allowDebit && account.cash < 0 && (input.side === 'buy' || input.side === 'cover')) {
    return { ok: false, error: 'error.insufficientCash' };
  }
  return { ok: true };
}

/** Preview numbers for the order ticket. Never mutates state. */
export function estimateOrder({ input, quote, fee = 0 }) {
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  const type = input.type;
  const side = input.side;
  const marketSide = MARKET_SIDES.has(side);
  const execPrice = type === 'market'
    ? (marketSide ? quote.ask : quote.bid)
    : type === 'limit' ? Number(input.limitPrice) || 0 : quote.last;
  const gross = qty * execPrice;
  const total = marketSide ? gross + fee : gross - fee;
  return {
    qty,
    execPrice,
    gross,
    fee,
    total,
    maxLoss: side === 'short' ? null : marketSide ? gross + fee : null,
    breakeven: execPrice,
    conditional: ['stop', 'trailing', 'stop-limit', 'oco'].includes(type),
    stopPrice: ['stop', 'stop-limit', 'oco'].includes(type) ? Number(input.stopPrice) || 0 : null,
    limitPrice: ['limit', 'stop-limit', 'oco'].includes(type) ? Number(input.limitPrice) || 0 : null,
  };
}

export function placeMarketOrder({
  account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1,
  buyingPower, shortCapacity, allowDebit = false,
}) {
  const validation = validateOrderInput({
    account, orders, input, quote, fee, buyingPower, shortCapacity, allowDebit,
  });
  if (!validation.ok) return validation;

  const price = MARKET_SIDES.has(input.side) ? quote.ask : quote.bid;
  const order = makeOrder({ ...input, qty: Math.floor(input.qty), refPrice: quote.last }, seq, day, tick);
  const result = executeSide(account, input.side, {
    ticker: input.ticker, qty: order.qty, price, fee, day, tick, allowDebit,
  });
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

export function placeLimitOrder({
  account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1,
  buyingPower, shortCapacity, allowDebit = false,
}) {
  const validation = validateOrderInput({
    account, orders, input, quote, fee, buyingPower, shortCapacity, allowDebit,
  });
  if (!validation.ok) return validation;

  const limit = Number(input.limitPrice);
  const side = input.side;
  const wouldFillNow = MARKET_SIDES.has(side) ? quote.ask <= limit : quote.bid >= limit;

  if (wouldFillNow) {
    const price = MARKET_SIDES.has(side) ? Math.min(limit, quote.ask) : Math.max(limit, quote.bid);
    const result = executeSide(account, side, {
      ticker: input.ticker, qty: Math.floor(input.qty), price, fee, day, tick, allowDebit,
    });
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

/** Stop, trailing-stop and stop-limit orders rest until their trigger is crossed. */
export function placeConditionalOrder({
  account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1,
  buyingPower, shortCapacity,
}) {
  const validation = validateOrderInput({
    account, orders, input, quote, fee, buyingPower, shortCapacity, allowDebit: false,
  });
  if (!validation.ok) return validation;

  const order = makeOrder({ ...input, qty: Math.floor(input.qty), refPrice: quote.last }, seq, day, tick);
  return { ok: true, account, order: { ...order, status: ORDER_STATUS.open, reason: 'order.stopResting' } };
}

/**
 * One-cancels-other exit: a take-profit limit leg plus a protective stop leg. The
 * first leg to fill (or be rejected) cancels its sibling.
 */
export function placeOcoOrder({
  account, orders, input, quote, fee = 0, day = 0, tick = 0, seq = 1,
  buyingPower, shortCapacity,
}) {
  const validation = validateOrderInput({
    account, orders, input, quote, fee, buyingPower, shortCapacity, allowDebit: false,
  });
  if (!validation.ok) return validation;

  const qty = Math.floor(input.qty);
  const group = `oco-${seq}`;
  const base = { ...input, qty, refPrice: quote.last };
  const limitLeg = {
    ...makeOrder({ ...base, type: 'limit' }, seq, day, tick),
    ocoGroup: group,
    ocoRole: 'takeProfit',
    reason: 'order.ocoResting',
  };
  const stopLeg = {
    ...makeOrder({ ...base, type: 'stop' }, seq + 1, day, tick),
    ocoGroup: group,
    ocoRole: 'stopLoss',
    reason: 'order.ocoResting',
  };
  return {
    ok: true,
    account,
    orders: [limitLeg, stopLeg],
    order: limitLeg,
    group,
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

function nextTrailing(order, quote) {
  if (order.type !== 'trailing') return order;
  const last = quote.last;
  const extreme = MARKET_SIDES.has(order.side)
    ? Math.min(order.extremePrice ?? last, last)
    : Math.max(order.extremePrice ?? last, last);
  const stopPrice = MARKET_SIDES.has(order.side)
    ? extreme + order.trailAmount
    : extreme - order.trailAmount;
  return { ...order, extremePrice: extreme, stopPrice: Math.max(0.01, stopPrice) };
}

function triggered(order, quote) {
  if (!order.stopPrice) return false;
  return MARKET_SIDES.has(order.side) ? quote.last >= order.stopPrice : quote.last <= order.stopPrice;
}

/**
 * Called after every market tick. Fills resting limits and fires triggered stop
 * orders. Trailing stops first tighten their stop, then test the trigger.
 */
export function processOpenOrders({
  account, orders, quotes, fee = 0, day = 0, tick = 0, allowDebit = false,
}) {
  let nextAccount = account;
  const fills = [];
  const settledGroups = new Set();

  let nextOrders = orders.map((original) => {
    if (original.status !== ORDER_STATUS.open) return original;
    if (original.ocoGroup && settledGroups.has(original.ocoGroup)) {
      return { ...original, status: ORDER_STATUS.cancelled, reason: 'order.ocoCancelled' };
    }
    const quote = quotes[original.ticker];
    if (!quote) return original;

    const order = nextTrailing(original, quote);

    if (order.type === 'stop' || order.type === 'trailing') {
      if (!triggered(order, quote)) return order;
      const price = MARKET_SIDES.has(order.side) ? quote.ask : quote.bid;
      const result = executeSide(nextAccount, order.side, {
        ticker: order.ticker, qty: order.qty, price, fee, day, tick, allowDebit,
      });
      if (!result.ok) {
        if (order.ocoGroup) settledGroups.add(order.ocoGroup);
        return { ...order, status: ORDER_STATUS.rejected, reason: result.error, fee: 0 };
      }
      if (order.ocoGroup) settledGroups.add(order.ocoGroup);
      nextAccount = result.account;
      const filled = {
        ...order,
        status: ORDER_STATUS.filled,
        fillPrice: price,
        filledAt: { day, tick },
        fee,
        reason: 'order.stopTriggered',
      };
      fills.push({ order: filled, trade: result.trade });
      return filled;
    }

    // A stop-limit order first waits for its trigger, then behaves like a limit order.
    let effective = order;
    let stopReason = null;
    if (order.type === 'stop-limit' && !order.armed) {
      if (!triggered(order, quote)) return order;
      effective = { ...order, armed: true };
      stopReason = 'order.stopLimitTriggered';
    }

    const canFill = MARKET_SIDES.has(effective.side)
      ? quote.ask <= effective.limitPrice
      : quote.bid >= effective.limitPrice;
    if (!canFill) return effective;

    const price = MARKET_SIDES.has(effective.side)
      ? Math.min(effective.limitPrice, quote.ask)
      : Math.max(effective.limitPrice, quote.bid);
    const result = executeSide(nextAccount, effective.side, {
      ticker: effective.ticker, qty: effective.qty, price, fee, day, tick, allowDebit,
    });
    if (!result.ok) {
      if (effective.ocoGroup) settledGroups.add(effective.ocoGroup);
      return { ...effective, status: ORDER_STATUS.rejected, reason: result.error, fee: 0 };
    }

    if (effective.ocoGroup) settledGroups.add(effective.ocoGroup);
    nextAccount = result.account;
    const filled = {
      ...effective,
      status: ORDER_STATUS.filled,
      fillPrice: price,
      filledAt: { day, tick },
      fee,
      reason: stopReason || 'order.filledOnCross',
    };
    fills.push({ order: filled, trade: result.trade });
    return filled;
  });

  // The first OCO leg to fill or reject cancels its sibling.
  if (settledGroups.size) {
    nextOrders = nextOrders.map((order) => (
      order.status === ORDER_STATUS.open && order.ocoGroup && settledGroups.has(order.ocoGroup)
        ? { ...order, status: ORDER_STATUS.cancelled, reason: 'order.ocoCancelled' }
        : order
    ));
  }

  return { account: nextAccount, orders: nextOrders, fills };
}
