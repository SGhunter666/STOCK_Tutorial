/**
 * Phase 3 fictional exchange: 50 companies, a persistent price-level book,
 * market maker, simulated traders and a player account. Everything is driven by
 * one deterministic seed and one simulated-second stream.
 */
import { createRng } from '../core/rng.js';
import { dateForTradingDay } from '../market/calendar.js';
import { SIM_COMPANIES } from './companies50.js';
import { SimOrderBook } from './orderBook.js';
import { SIM_SESSION_SECONDS } from './simulationClock.js';
import {
  createMinuteSeries, applyTradeToSeries, finalizeDay, getSeriesCandles,
} from './minuteSeries.js';
import {
  reportQuarterForDay, getQuarterReport, latestReportForDay,
  reportHistoryForDay, plannedSplitsForQuarter, isDividendDay, dividendQuarterForDay,
  isGuidanceDay, guidanceQuarterForDay, isCapitalActionDay, capitalQuarterForDay,
  plannedCapitalActionsForQuarter, adjustReportForCapitalActions,
  isStructuralActionDay, structuralQuarterForDay, plannedStructuralActionsForQuarter,
  adjustReportForStructuralActions, isHaltDay, haltQuarterForDay, plannedHaltsForQuarter,
  isRightsDay, rightsQuarterForDay, plannedRightsForQuarter,
  isBankruptcyDay, bankruptcyQuarterForDay, plannedBankruptciesForQuarter,
  reportDayForQuarter, splitFactorThrough, SIM_QUARTER_DAYS,
} from './fundamentals.js';
import { newsForDay } from './news.js';
import {
  advanceMacro, createMacroState,
} from './macroEconomy.js';
import {
  macroImpactForCompany, macroDriftForCompany, sectorSpillovers,
} from './industryModel.js';
import {
  createMarginState, normalizeAccount, canOpenPosition,
  marginSnapshot, evaluateMarginCall, accrueMarginCharges, nextLiquidationTarget,
  recordForcedLiquidation, closeMarginCall,
} from './margin.js';
import { SIM_ETF_INSTRUMENTS, SIM_ETF_TICKERS, etfNav } from './etfs.js';
import {
  SIM_OPTION_FEE_BPS, optionContract, buyOption, sellOption, closeOption,
  settleExpiredOptions, optionCollateral, optionMarketValue, exerciseOption,
  assignEarlyOptions, setOptionStyle,
} from './options.js';
import {
  accrueBondCoupons, bondMarketValue, buyBond, sellBond,
} from './bonds.js';
import {
  createChallengeState, challengeGuard, startChallenge, abandonChallenge,
  updateChallenge, challengeSnapshot,
} from './challenges.js';
import {
  createTimelineState, recordTimeline, findSnapshot, truncateTimeline,
  recordBranch, timelineRows,
} from './timeline.js';

export const SIM_START_CASH = 100_000;
export const SIM_EXCHANGE_SAVE_KEY = 'sma.sim-exchange-v1';
export const SIM_FEE_BPS = 1;
export const SIM_TRADER_TYPES = Object.freeze(['noise', 'momentum', 'value']);

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function simDate(dayIndex) {
  return dateForTradingDay(dayIndex).toISOString().slice(0, 10);
}

export function simClock(second) {
  const value = Math.max(0, Math.min(SIM_SESSION_SECONDS - 1, Math.floor(second || 0)));
  const total = 9 * 60 * 60 + 30 * 60 + value;
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function resolveOrderAction(side, action) {
  if (['openLong', 'closeLong', 'openShort', 'closeShort'].includes(action)) return action;
  if (side === 'short') return 'openShort';
  if (side === 'cover') return 'closeShort';
  if (side === 'sell') return 'closeLong';
  if (side === 'buy') return 'openLong';
  return '';
}

export function bookSideForAction(action) {
  return action === 'openLong' || action === 'closeShort' ? 'buy' : 'sell';
}

export function actionForOrder(order) {
  return resolveOrderAction(order.side, order.action);
}

export function bookSideForOrder(order) {
  return order.bookSide || bookSideForAction(actionForOrder(order));
}

function mmSizeFor(company) {
  return Math.max(40, Math.round(company.avgVolume / 8_000));
}

function createCompanyState(company) {
  const mmSize = mmSizeFor(company);
  const book = new SimOrderBook(company.ticker);
  const half = Math.max(0.01, company.price * company.spread / 20_000);
  book.setMarketMaker({
    bid: company.price - half,
    ask: company.price + half,
    size: mmSize,
  });
  return {
    company,
    fairValue: company.price,
    last: company.price,
    prevClose: company.price,
    open: company.price,
    high: company.price,
    low: company.price,
    volume: 0,
    trades: 0,
    inventory: 0,
    ema: company.price,
    mmSize,
    book,
    series: createMinuteSeries(),
    splitFactor: 1,
    capitalFactor: 1,
    haltedUntilDay: null,
    delisted: false,
    isEtf: Boolean(company.isEtf),
    lastReportQuarter: reportQuarterForDay(0),
  };
}

function updateQuote(state, ticker) {
  const cs = state.companies[ticker];
  const bid = cs.book.bestBid();
  const ask = cs.book.bestAsk();
  const changePct = cs.prevClose ? ((cs.last - cs.prevClose) / cs.prevClose) * 100 : 0;
  const quote = state.quotes[ticker] || (state.quotes[ticker] = { ticker });
  quote.last = round(cs.last, 2);
  quote.bid = bid === null ? null : round(bid, 2);
  quote.ask = ask === null ? null : round(ask, 2);
  quote.open = round(cs.open, 2);
  quote.high = round(cs.high, 2);
  quote.low = round(cs.low, 2);
  quote.volume = cs.volume;
  quote.trades = cs.trades;
  quote.changePct = round(changePct, 4);
  quote.fairValue = round(cs.fairValue, 2);
  quote.source = 'SIMULATED';
  return quote;
}

function refreshLiquidity(state, ticker) {
  const cs = state.companies[ticker];
  const company = cs.company;
  if (!company) return;
  const inventoryRatio = cs.inventory / Math.max(1, company.avgVolume * cs.splitFactor);
  const inventoryShift = Math.max(-0.2, Math.min(0.2, inventoryRatio * company.impact * 0.5));
  const mid = cs.fairValue * (1 - inventoryShift);
  const half = Math.max(0.01, mid * company.spread / 20_000);
  cs.book.setMarketMaker({
    bid: Math.max(0.01, mid - half),
    ask: mid + half,
    size: cs.mmSize,
  });
}

/** Applies an overnight gap or event shock without rewriting the previous close. */
function shockQuote(state, ticker, impact) {
  if (!Number.isFinite(impact) || impact === 0) return false;
  const cs = state.companies[ticker];
  if (!cs) return false;
  if (isTradingHalted(state, ticker)) return false;
  const factor = 1 + impact;
  cs.last = Math.max(0.01, cs.last * factor);
  cs.fairValue = Math.max(0.01, cs.fairValue * factor);
  cs.open = Math.max(0.01, cs.open * factor);
  cs.high = Math.max(0.01, cs.high * factor);
  cs.low = Math.max(0.01, cs.low * factor);
  cs.ema = Math.max(0.01, cs.ema * factor);
  refreshLiquidity(state, ticker);
  updateQuote(state, ticker);
  return true;
}

function recordTrade(state, ticker, price, qty, meta) {
  const cs = state.companies[ticker];
  cs.last = round(price, 4);
  cs.high = Math.max(cs.high, cs.last);
  cs.low = Math.min(cs.low, cs.last);
  cs.volume += qty;
  cs.trades += 1;
  cs.ema = cs.ema * 0.98 + cs.last * 0.02;
  applyTradeToSeries(cs.series, {
    date: simDate(state.dayIndex),
    second: state.second,
    price: cs.last,
    qty,
  });
  state.trades.push({
    ticker,
    price: cs.last,
    qty,
    day: state.dayIndex,
    second: state.second,
    date: simDate(state.dayIndex),
    time: simClock(state.second),
    ...meta,
  });
  if (state.trades.length > 800) state.trades.splice(0, state.trades.length - 800);
  state.stats.tradeCount += 1;
  state.stats.volume += qty;
  updateQuote(state, ticker);
}

function applyAccountFill(state, order, qty, price, fee) {
  const account = normalizeAccount(state.account);
  const ticker = order.ticker;
  const action = actionForOrder(order);
  const gross = qty * price;
  let realized = 0;
  if (action === 'openLong') {
    const position = account.positions[ticker] || { qty: 0, avgCost: 0 };
    account.cash -= gross + fee;
    const nextQty = position.qty + qty;
    position.avgCost = nextQty ? (position.avgCost * position.qty + gross) / nextQty : 0;
    position.qty = nextQty;
    account.positions[ticker] = position;
  } else if (action === 'openShort') {
    const short = account.shorts[ticker] || { qty: 0, avgPrice: 0, openedDay: state.dayIndex };
    account.cash += gross - fee;
    const nextQty = short.qty + qty;
    short.avgPrice = nextQty ? (short.avgPrice * short.qty + gross) / nextQty : 0;
    short.qty = nextQty;
    short.openedDay = short.openedDay ?? state.dayIndex;
    account.shorts[ticker] = short;
  } else if (action === 'closeShort') {
    const short = account.shorts[ticker];
    if (!short || short.qty < qty) {
      order.status = 'rejected';
      order.reason = 'insufficientShortShares';
      return false;
    }
    account.cash -= gross + fee;
    realized = (short.avgPrice - price) * qty;
    account.realizedPnl += realized;
    short.qty -= qty;
    if (short.qty <= 0) delete account.shorts[ticker];
  } else {
    const position = account.positions[ticker];
    if (!position || position.qty < qty) {
      order.status = 'rejected';
      order.reason = 'insufficientShares';
      return false;
    }
    account.cash += gross - fee;
    realized = (price - position.avgCost) * qty;
    account.realizedPnl += realized;
    position.qty -= qty;
    if (position.qty <= 0) delete account.positions[ticker];
  }
  account.fees += fee;
  account.trades.push({
    ticker,
    side: order.side,
    action,
    qty,
    price: round(price, 4),
    fee,
    realized: round(realized, 2),
    orderId: order.id,
    day: state.dayIndex,
    second: state.second,
    date: simDate(state.dayIndex),
    time: simClock(state.second),
  });
  if (account.trades.length > 500) account.trades.splice(0, account.trades.length - 500);
  return true;
}

function applyOrderFill(state, order, fill) {
  if (!order || fill.qty <= 0) return false;
  const fee = order.owner === 'player'
    ? round(fill.qty * fill.price * SIM_FEE_BPS / 10_000, 2)
    : 0;
  if (order.owner === 'player' && !applyAccountFill(state, order, fill.qty, fill.price, fee)) {
    return false;
  }
  order.filledQty = (order.filledQty || 0) + fill.qty;
  order.avgPrice = order.filledQty
    ? round((order.avgPrice || 0) * (order.filledQty - fill.qty) / order.filledQty
      + (fill.qty * fill.price) / order.filledQty, 4)
    : 0;
  order.fills.push({
    price: round(fill.price, 4), qty: fill.qty, second: state.second,
  });
  const remaining = order.qty - order.filledQty;
  order.remaining = remaining;
  order.status = remaining <= 0 ? 'filled' : 'partiallyFilled';
  return true;
}

function findOrder(state, id) {
  return state.orders.find((order) => order.id === id);
}

function applyFills(state, order, fills, { rest = false, keepResting = false } = {}) {
  const action = actionForOrder(order);
  for (const fill of fills) {
    if (order.owner === 'player') {
      const fee = round(fill.qty * fill.price * SIM_FEE_BPS / 10_000, 2);
      if (action === 'openLong' || action === 'openShort') {
        if (!canOpenPosition(state, {
          action,
          gross: fill.qty * fill.price,
          fee,
          excludeOrderId: order.id,
        })) {
          order.reason = 'insufficientMargin';
          break;
        }
      } else if (action === 'closeLong') {
        const held = state.account.positions[order.ticker]?.qty || 0;
        if (fill.qty > held) {
          order.reason = 'insufficientShares';
          break;
        }
      } else if (action === 'closeShort') {
        const held = state.account.shorts?.[order.ticker]?.qty || 0;
        if (fill.qty > held) {
          order.reason = 'insufficientShortShares';
          break;
        }
      }
    }
    const cs = state.companies[order.ticker];
    if (fill.counterparty === 'mm' && cs) {
      cs.inventory += bookSideForOrder(order) === 'buy' ? -fill.qty : fill.qty;
    }
    recordTrade(state, order.ticker, fill.price, fill.qty, {
      orderId: order.id, owner: order.owner,
    });
    applyOrderFill(state, order, fill);
    if (fill.orderId) {
      const counterparty = findOrder(state, fill.orderId);
      if (counterparty) applyOrderFill(state, counterparty, fill);
    }
  }
  const remaining = order.qty - (order.filledQty || 0);
  const canRest = (rest || keepResting) && order.type === 'limit'
    && !['insufficientCash', 'insufficientShares', 'insufficientMargin',
      'insufficientShortShares', 'noShortPosition'].includes(order.reason);
  if (remaining > 0 && canRest) {
    order.status = order.filledQty ? 'partiallyFilled' : 'open';
    order.remaining = remaining;
    order.active = true;
    if (rest) {
      state.companies[order.ticker].book.addResting({
        id: order.id,
        side: bookSideForOrder(order),
        price: order.limitPrice,
        remaining,
        owner: order.owner,
        action: order.action,
      });
    }
  } else if (remaining > 0) {
    order.status = order.filledQty ? 'partiallyFilled' : 'cancelled';
    if (!order.reason) order.reason = 'insufficientLiquidity';
    order.remaining = remaining;
    order.active = false;
    if (keepResting) state.companies[order.ticker].book.removeOrder(order.id);
  } else {
    order.active = false;
  }
  if (order.ocoGroup && ['filled', 'cancelled', 'rejected'].includes(order.status)) {
    cancelOcoSiblings(state, order);
  }
  return order;
}

function isLiveOrder(order) {
  if (!order || order.active === false) return false;
  return ['pending', 'open', 'partiallyFilled'].includes(order.status);
}

/** Grouped reservation so an OCO pair never reserves the same shares twice. */
function reservedQuantity(state, ticker, action) {
  const groups = new Map();
  for (const order of state.orders) {
    if (order.owner !== 'player' || order.ticker !== ticker) continue;
    if (actionForOrder(order) !== action || !isLiveOrder(order)) continue;
    const remaining = order.qty - (order.filledQty || 0);
    if (remaining <= 0) continue;
    const key = order.ocoGroup || order.id;
    groups.set(key, Math.max(groups.get(key) || 0, remaining));
  }
  let total = 0;
  for (const qty of groups.values()) total += qty;
  return total;
}

function availableShares(state, ticker) {
  const held = state.account.positions[ticker]?.qty || 0;
  return Math.max(0, held - reservedQuantity(state, ticker, 'closeLong'));
}

export function availableShortShares(state, ticker) {
  const symbol = String(ticker || '').toUpperCase();
  const held = state.account.shorts?.[symbol]?.qty || 0;
  return Math.max(0, held - reservedQuantity(state, symbol, 'closeShort'));
}

function orderReservePrice(state, order) {
  if (order.type === 'limit') return order.limitPrice;
  if (order.type === 'stop' || order.type === 'stopLimit') return order.stopPrice;
  if (order.type === 'trailing') return state.quotes[order.ticker]?.last || 0;
  return state.quotes[order.ticker]?.ask || 0;
}

export function availableCash(state) {
  const groups = new Map();
  for (const order of state.orders) {
    if (order.owner !== 'player' || actionForOrder(order) !== 'openLong') continue;
    if (!isLiveOrder(order)) continue;
    const remaining = order.qty - (order.filledQty || 0);
    if (remaining <= 0) continue;
    const price = orderReservePrice(state, order) || 0;
    const value = remaining * price * (1 + SIM_FEE_BPS / 10_000);
    const key = order.ocoGroup || order.id;
    groups.set(key, Math.max(groups.get(key) || 0, value));
  }
  let reserved = 0;
  for (const value of groups.values()) reserved += value;
  return state.account.cash - reserved;
}

export function isTradingHalted(state, ticker) {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  return Boolean(cs && (cs.delisted
    || (Number.isFinite(cs.haltedUntilDay) && state.dayIndex <= cs.haltedUntilDay)));
}

export function submitOrder(state, {
  ticker, side, action = '', type = 'market', qty, limitPrice = null,
  stopPrice = null, stopLimitPrice = null, trailPct = null,
  owner = 'player', pending = false, ocoGroup = '', skipAvailability = false,
}) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  const quantity = Math.floor(Number(qty) || 0);
  const orderAction = resolveOrderAction(side, action);
  const orderSide = side === 'short' || side === 'cover' ? side : side === 'sell' ? 'sell' : side === 'buy' ? 'buy' : '';
  if (!cs || !orderAction || !orderSide || quantity <= 0) {
    return { ok: false, error: 'order.invalid' };
  }
  if (cs.delisted) {
    return { ok: false, error: 'order.delisted' };
  }
  if (isTradingHalted(state, symbol)) {
    return { ok: false, error: 'order.halted' };
  }
  const orderType = ['limit', 'stop', 'stopLimit', 'trailing'].includes(type)
    ? type : 'market';
  if (orderType === 'limit' && !Number.isFinite(Number(limitPrice))) {
    return { ok: false, error: 'order.limit' };
  }
  if ((orderType === 'stop' || orderType === 'stopLimit')
    && !Number.isFinite(Number(stopPrice))) {
    return { ok: false, error: 'order.stop' };
  }
  if (orderType === 'stopLimit' && !Number.isFinite(Number(stopLimitPrice))) {
    return { ok: false, error: 'order.stopLimit' };
  }
  if (orderType === 'trailing'
    && (!Number.isFinite(Number(trailPct)) || Number(trailPct) <= 0
      || Number(trailPct) >= 0.5)) {
    return { ok: false, error: 'order.trail' };
  }
  const bookSide = bookSideForAction(orderAction);
  const quote = state.quotes[symbol];
  const marketPrice = bookSide === 'buy' ? quote?.ask : quote?.bid;
  const referencePrice = orderType === 'limit'
    ? round(Number(limitPrice), 2)
    : (orderType === 'stop' || orderType === 'stopLimit')
      ? round(Number(stopPrice), 2)
      : orderType === 'trailing'
        ? round(quote?.last || 0, 2)
        : marketPrice;
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { ok: false, error: 'order.noLiquidity' };
  }
  if (owner === 'player') {
    const fee = round(quantity * referencePrice * SIM_FEE_BPS / 10_000, 2);
    if (orderAction === 'openLong') {
      if ((state.account.shorts?.[symbol]?.qty || 0) > 0) {
        return { ok: false, error: 'order.shortPosition' };
      }
      if (!canOpenPosition(state, {
        action: orderAction, gross: quantity * referencePrice, fee,
      })) return { ok: false, error: 'order.insufficientMargin' };
    } else if (orderAction === 'openShort') {
      if ((state.account.positions[symbol]?.qty || 0) > 0) {
        return { ok: false, error: 'order.longPosition' };
      }
      if (!canOpenPosition(state, {
        action: orderAction, gross: quantity * referencePrice, fee,
      })) return { ok: false, error: 'order.insufficientMargin' };
    } else if (orderAction === 'closeLong') {
      if (!skipAvailability && quantity > availableShares(state, symbol)) {
        return { ok: false, error: 'order.insufficientShares' };
      }
    } else if (orderAction === 'closeShort') {
      if (!(state.account.shorts?.[symbol]?.qty > 0)) {
        return { ok: false, error: 'order.noShortPosition' };
      }
      if (!skipAvailability && quantity > availableShortShares(state, symbol)) {
        return { ok: false, error: 'order.insufficientShortShares' };
      }
    }
    if (orderAction === 'openLong' || orderAction === 'openShort') {
      const existing = orderAction === 'openLong'
        ? (state.account.positions[symbol]?.qty || 0)
        : (state.account.shorts?.[symbol]?.qty || 0);
      const guard = challengeGuard(state, {
        asset: cs.isEtf ? 'etf' : 'stock',
        action: orderAction,
        gross: quantity * referencePrice,
        fee,
        positionValue: (existing + quantity) * referencePrice,
        equityValue: equity(state),
      });
      if (!guard.ok) return guard;
    }
  }

  const order = {
    id: `O${state.nextOrderId}`,
    ticker: symbol,
    side: orderSide,
    action: orderAction,
    bookSide,
    type: orderType,
    qty: quantity,
    limitPrice: orderType === 'limit' ? referencePrice : null,
    stopPrice: (orderType === 'stop' || orderType === 'stopLimit')
      ? referencePrice : null,
    stopLimitPrice: orderType === 'stopLimit' ? round(Number(stopLimitPrice), 2) : null,
    trailPct: orderType === 'trailing' ? Number(trailPct) : null,
    trailBest: orderType === 'trailing' ? referencePrice : null,
    ocoGroup,
    filledQty: 0,
    avgPrice: 0,
    remaining: quantity,
    status: 'open',
    active: true,
    owner,
    createdAt: { day: state.dayIndex, second: state.second },
    expiresAt: owner === 'player' ? null : state.second + 300,
    fills: [],
    reason: '',
  };
  if (orderType === 'trailing') {
    order.stopPrice = round(bookSide === 'sell'
      ? referencePrice * (1 - order.trailPct)
      : referencePrice * (1 + order.trailPct), 2);
  }
  state.nextOrderId += 1;
  state.orders.push(order);

  if (pending) {
    order.status = 'pending';
    return { ok: true, order };
  }
  if (['stop', 'stopLimit', 'trailing'].includes(orderType)) {
    return { ok: true, order };
  }

  const result = cs.book.match({ ...order, side: bookSide, remaining: quantity });
  applyFills(state, order, result.fills, { rest: true });
  if (order.status === 'open' || order.status === 'partiallyFilled') {
    // applyFills already rested limit remainders; market remainders are cancelled.
    if (order.type === 'market' && order.remaining > 0 && !order.reason) {
      order.reason = 'insufficientLiquidity';
    }
  }
  updateQuote(state, symbol);
  return { ok: true, order };
}

function activatePending(state) {
  for (const order of state.orders) {
    if (order.owner !== 'player' || order.status !== 'pending') continue;
    const cs = state.companies[order.ticker];
    if (!cs) {
      order.status = 'rejected';
      order.reason = 'order.invalid';
      order.active = false;
      continue;
    }
    if (isTradingHalted(state, order.ticker)) continue;
    order.status = 'open';
    if (['stop', 'stopLimit', 'trailing'].includes(order.type)) continue;
    const result = cs.book.match({
      ...order,
      side: bookSideForOrder(order),
      remaining: order.qty - (order.filledQty || 0),
    });
    applyFills(state, order, result.fills, { rest: true });
    if (order.status === 'open' || order.status === 'partiallyFilled') {
      if (order.type === 'market' && order.remaining > 0 && !order.reason) {
        order.reason = 'insufficientLiquidity';
        order.status = order.filledQty ? 'partiallyFilled' : 'cancelled';
      }
    }
    updateQuote(state, order.ticker);
  }
}

export function cancelOrder(state, orderId, owner = 'player') {
  const order = state.orders.find((item) => item.id === orderId && item.owner === owner);
  if (!order) return { ok: false, error: 'order.notFound' };
  if (!['pending', 'open', 'partiallyFilled'].includes(order.status)) {
    return { ok: false, error: 'order.notOpen' };
  }
  state.companies[order.ticker].book.removeOrder(order.id);
  order.status = 'cancelled';
  order.reason = 'order.cancelled';
  order.active = false;
  cancelOcoSiblings(state, order);
  return { ok: true, order };
}

function cancelOcoSiblings(state, order) {
  if (!order.ocoGroup) return;
  for (const sibling of state.orders) {
    if (sibling === order || sibling.ocoGroup !== order.ocoGroup) continue;
    if (!isLiveOrder(sibling)) continue;
    const cs = state.companies[sibling.ticker];
    if (cs) cs.book.removeOrder(sibling.id);
    sibling.status = 'cancelled';
    sibling.reason = 'ocoTriggered';
    sibling.active = false;
  }
}

/**
 * Watches stop, stop-limit and trailing orders against the live quote and
 * converts a triggered order into a market or limit execution.
 */
function processConditionalOrders(state) {
  for (const order of state.orders) {
    if (order.owner !== 'player') continue;
    if (!['stop', 'stopLimit', 'trailing'].includes(order.type)) continue;
    if (order.status !== 'open' || order.active === false) continue;
    if (isTradingHalted(state, order.ticker)) continue;
    const quote = state.quotes[order.ticker];
    const cs = state.companies[order.ticker];
    if (!quote || !cs) continue;
    const last = quote.last;
    if (!Number.isFinite(last) || last <= 0) continue;
    const side = bookSideForOrder(order);
    if (order.type === 'trailing') {
      const best = Number.isFinite(order.trailBest) ? order.trailBest : last;
      order.trailBest = side === 'sell' ? Math.max(best, last) : Math.min(best, last);
      order.stopPrice = round(side === 'sell'
        ? order.trailBest * (1 - order.trailPct)
        : order.trailBest * (1 + order.trailPct), 2);
    }
    const triggered = side === 'buy' ? last >= order.stopPrice : last <= order.stopPrice;
    if (!triggered) continue;
    order.triggeredAt = { day: state.dayIndex, second: state.second, price: round(last, 2) };
    if (order.type === 'stopLimit') {
      order.triggeredFrom = 'stopLimit';
      order.type = 'limit';
      order.limitPrice = order.stopLimitPrice;
    } else {
      order.triggeredFrom = order.type;
      order.type = 'market';
      order.limitPrice = null;
    }
    const result = cs.book.match({
      ...order,
      side,
      remaining: order.qty - (order.filledQty || 0),
    });
    applyFills(state, order, result.fills, { rest: order.triggeredFrom === 'stopLimit' });
    if (order.type === 'market' && order.remaining > 0 && !order.reason) {
      order.reason = 'insufficientLiquidity';
      if (order.status === 'open') order.status = 'cancelled';
      order.active = false;
    }
    updateQuote(state, order.ticker);
  }
}

/**
 * Submits a linked take-profit limit and stop-loss pair for an existing long or
 * short. When either leg fills or is cancelled the sibling is cancelled.
 */
export function submitOco(state, {
  ticker, action = 'closeLong', qty, takeProfitPrice, stopPrice,
}) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  const quantity = Math.floor(Number(qty) || 0);
  const side = action === 'closeShort' ? 'cover' : 'sell';
  if (!cs || quantity <= 0) return { ok: false, error: 'order.invalid' };
  if (!Number.isFinite(Number(takeProfitPrice)) || !Number.isFinite(Number(stopPrice))) {
    return { ok: false, error: 'order.oco' };
  }
  const available = action === 'closeShort'
    ? availableShortShares(state, symbol)
    : availableShares(state, symbol);
  if (quantity > available) {
    return {
      ok: false,
      error: action === 'closeShort' ? 'order.insufficientShortShares' : 'order.insufficientShares',
    };
  }
  const ocoGroup = `OCO${state.nextOrderId}`;
  const first = submitOrder(state, {
    ticker: symbol,
    side,
    action,
    type: 'limit',
    qty: quantity,
    limitPrice: Number(takeProfitPrice),
    ocoGroup,
  });
  if (!first.ok) return first;
  if (first.order.status === 'filled') {
    return { ok: true, orders: [first.order], ocoGroup };
  }
  const second = submitOrder(state, {
    ticker: symbol,
    side,
    action,
    type: 'stop',
    qty: quantity,
    stopPrice: Number(stopPrice),
    ocoGroup,
    skipAvailability: true,
  });
  if (!second.ok) {
    cancelOrder(state, first.order.id);
    return second;
  }
  return { ok: true, orders: [first.order, second.order], ocoGroup };
}

/** Immediate dealer fill for a European option, still on the unified ledger. */
export function submitOptionOrder(state, {
  ticker, type, strike, expiryDay, qty, side,
}) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  const quantity = Math.floor(Number(qty) || 0);
  if (!cs || !['call', 'put'].includes(type) || quantity <= 0) {
    return { ok: false, error: 'option.invalid' };
  }
  if (cs.delisted) return { ok: false, error: 'order.delisted' };
  if (isTradingHalted(state, symbol)) return { ok: false, error: 'order.halted' };
  if (Number(expiryDay) <= state.dayIndex) return { ok: false, error: 'option.expired' };
  const contract = optionContract(state, { ticker: symbol, type, strike, expiryDay });
  if (!contract) return { ok: false, error: 'option.invalid' };
  const quote = side === 'sell' ? contract.bid : contract.ask;
  const gross = round(quote * contract.contractSize * quantity, 2);
  const fee = round(gross * SIM_OPTION_FEE_BPS / 10_000, 2);
  const guard = challengeGuard(state, {
    asset: 'option',
    action: side === 'sell' ? 'openShort' : 'openLong',
    gross,
    fee,
    positionValue: gross,
    equityValue: equity(state),
  });
  if (!guard.ok) return guard;
  if (side === 'buy') {
    if (gross + fee > availableCash(state) + 1e-9) {
      return { ok: false, error: 'option.insufficientCash' };
    }
    const result = buyOption(state, { contract, qty: quantity, fee });
    if (!result.ok) return result;
    checkMargin(state);
    return { ...result, side, fee };
  }
  if (side === 'sell') {
    const snapshot = marginSnapshot(state);
    const extra = {
      ticker: symbol,
      type,
      strike: contract.strike,
      expiryDay: contract.expiryDay,
      qty: -quantity,
    };
    const extraCollateral = round(
      optionCollateral(state, [extra]) - optionCollateral(state), 2,
    );
    if (snapshot.equity - fee < snapshot.initialRequirement + extraCollateral) {
      return { ok: false, error: 'option.insufficientMargin' };
    }
    const result = sellOption(state, { contract, qty: quantity, fee });
    if (!result.ok) return result;
    checkMargin(state);
    return { ...result, side, fee };
  }
  return { ok: false, error: 'option.invalid' };
}

export function closeOptionPosition(state, key, qty) {
  const result = closeOption(state, key, qty);
  if (result.ok) checkMargin(state);
  return result;
}

export function setExchangeOptionStyle(state, style) {
  return setOptionStyle(state, style);
}

export function exerciseOptionPosition(state, key, qty) {
  const position = (state.account.options || []).find((item) => item.key === key);
  if (position && position.type === 'call') {
    const cs = state.companies[position.ticker];
    const shares = Math.floor(Number(qty) || 0) * 100;
    const existing = state.account.positions[position.ticker]?.qty || 0;
    const guard = challengeGuard(state, {
      asset: cs?.isEtf ? 'etf' : 'stock',
      action: 'openLong',
      gross: position.strike * shares,
      positionValue: (existing + shares) * position.strike,
      equityValue: equity(state),
    });
    if (!guard.ok) return guard;
  }
  const result = exerciseOption(state, key, qty);
  if (result.ok) checkMargin(state);
  return result;
}

/** Dealer-quoted corporate bond trade on the same cash account and ledger. */
export function submitBondOrder(state, { id, side, qty }) {
  if (side === 'buy') {
    const quote = bondMarketValue(state);
    const guard = challengeGuard(state, {
      asset: 'bond',
      action: 'openLong',
      gross: Number(qty) * 100,
      positionValue: quote + Number(qty) * 100,
      equityValue: equity(state),
    });
    if (!guard.ok) return guard;
    return buyBond(state, id, qty, { availableCash: availableCash(state) });
  }
  if (side === 'sell') return sellBond(state, id, qty);
  return { ok: false, error: 'bond.invalid' };
}

function executeResting(state) {
  for (const ticker of Object.keys(state.companies)) {
    const results = state.companies[ticker].book.matchResting();
    for (const result of results) {
      const order = findOrder(state, result.order.id);
      if (!order) continue;
      applyFills(state, order, result.fills, { keepResting: true });
    }
  }
  for (const order of state.orders) {
    if (order.owner !== 'player' && ['open', 'partiallyFilled'].includes(order.status)
      && order.expiresAt !== null && state.second >= order.expiresAt) {
      state.companies[order.ticker].book.removeOrder(order.id);
      order.status = 'cancelled';
      order.reason = 'order.expired';
      order.active = false;
    }
  }
}

function pruneOrders(state) {
  if (state.orders.length <= 500) return;
  const active = state.orders.filter(isLiveOrder);
  const tradeOrderIds = new Set(state.account.trades.map((trade) => trade.orderId));
  const referenced = state.orders.filter((order) => tradeOrderIds.has(order.id));
  const playerDone = state.orders
    .filter((order) => order.owner === 'player' && !isLiveOrder(order))
    .slice(-500);
  const simDone = state.orders
    .filter((order) => order.owner !== 'player' && !isLiveOrder(order))
    .slice(-120);
  const keep = new Set([...active, ...referenced, ...playerDone, ...simDone]);
  state.orders = state.orders.filter((order) => keep.has(order));
}

function updateFactors(state, rng) {
  state.marketFactor = state.marketFactor * 0.92 + rng.normal() * 0.0009;
  for (const sector of Object.keys(state.sectorFactors)) {
    state.sectorFactors[sector] = state.sectorFactors[sector] * 0.93 + rng.normal() * 0.0007;
  }
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
    if (cs.isEtf) continue;
    if (isTradingHalted(state, ticker)) continue;
    const company = cs.company;
    const sector = state.sectorFactors[company.sector] || 0;
    const idio = rng.normal() * company.vol * 0.012;
    const drift = company.beta * state.marketFactor * 0.0012
      + company.sectorCorrelation * sector * 0.0009 + idio;
    cs.fairValue = Math.max(0.01, cs.fairValue * Math.exp(drift));
    cs.fairValue = Math.min(company.price * 6, Math.max(company.price * 0.15, cs.fairValue));
    state.quotes[ticker].fairValue = round(cs.fairValue, 2);
  }
}

function cancelCorporateOrders(state, ticker, reason) {
  for (const order of state.orders) {
    if (order.ticker !== ticker || !isLiveOrder(order)) continue;
    const cs = state.companies[ticker];
    if (cs) cs.book.removeOrder(order.id);
    order.status = 'cancelled';
    order.reason = reason;
    order.active = false;
  }
}

function applySplit(state, ticker, ratio, quarter) {
  const cs = state.companies[ticker];
  if (!cs || ratio <= 0 || cs.delisted) return;
  cancelCorporateOrders(state, ticker, 'corporateAction');
  const postPrice = cs.last / ratio;
  let fractionalShares = 0;
  let cashInLieu = 0;
  const position = state.account.positions[ticker];
  if (position) {
    const rawQty = position.qty * ratio;
    const wholeQty = Math.floor(rawQty + 1e-9);
    fractionalShares = rawQty - wholeQty;
    if (fractionalShares > 1e-9) {
      cashInLieu = round(fractionalShares * postPrice, 2);
      state.account.cash += cashInLieu;
      state.account.realizedPnl += cashInLieu - position.avgCost * fractionalShares;
    }
    position.qty = wholeQty;
    position.avgCost = wholeQty ? position.avgCost / ratio : 0;
    if (wholeQty <= 0) delete state.account.positions[ticker];
  }
  const short = state.account.shorts?.[ticker];
  let shortCashInLieu = 0;
  if (short && short.qty > 0) {
    const rawQty = short.qty * ratio;
    const wholeQty = Math.floor(rawQty + 1e-9);
    const fractional = rawQty - wholeQty;
    if (fractional > 1e-9) {
      shortCashInLieu = round(fractional * postPrice, 2);
      state.account.cash -= shortCashInLieu;
      state.account.realizedPnl += (short.avgPrice / ratio - postPrice) * fractional;
    }
    short.qty = wholeQty;
    short.avgPrice = wholeQty ? short.avgPrice / ratio : 0;
    if (wholeQty <= 0) delete state.account.shorts[ticker];
  }
  cs.splitFactor *= ratio;
  cs.last /= ratio;
  cs.fairValue /= ratio;
  cs.prevClose /= ratio;
  cs.open /= ratio;
  cs.high /= ratio;
  cs.low /= ratio;
  cs.ema /= ratio;
  cs.volume *= ratio;
  cs.inventory *= ratio;
  cs.mmSize = Math.max(1, Math.round(cs.mmSize * ratio));
  cs.book = new SimOrderBook(ticker);
  refreshLiquidity(state, ticker);
  updateQuote(state, ticker);
  state.corporateActions.push({
    type: 'split',
    ticker,
    ratio,
    quarter,
    day: state.dayIndex,
    reverse: ratio < 1,
    fractionalShares: round(fractionalShares, 4),
    cashInLieu,
    shortCashInLieu,
  });
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function capitalShares(cs) {
  return cs.company.sharesOutstanding * cs.splitFactor * cs.capitalFactor;
}

function applyCapitalAction(state, action) {
  const cs = state.companies[action.ticker];
  if (!cs || !['buyback', 'offering'].includes(action.type) || cs.delisted) return;
  const shares = capitalShares(cs);
  const ratio = Math.max(0, Math.min(0.25, action.ratio));
  const price = Math.max(0.01, cs.last);
  const shareFactor = action.type === 'buyback' ? 1 - ratio : 1 + ratio;
  const sharesDelta = shares * (shareFactor - 1);
  const cashDelta = action.type === 'buyback'
    ? -round(Math.abs(sharesDelta) * price, 2)
    : round(sharesDelta * price * 0.97, 2);
  const impact = action.type === 'buyback'
    ? Math.min(0.03, ratio * 0.75)
    : -Math.min(0.04, ratio * 0.35);
  cs.capitalFactor *= shareFactor;
  shockQuote(state, action.ticker, impact);
  const event = {
    type: action.type,
    ticker: action.ticker,
    quarter: action.quarter,
    ratio,
    day: state.dayIndex,
    shareFactor: round(shareFactor, 6),
    sharesDelta: round(sharesDelta, 2),
    cashDelta,
    impact: round(impact, 4),
  };
  state.capitalActions.push(event);
  state.corporateActions.push(event);
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function releaseRights(state) {
  if (!isRightsDay(state.dayIndex)) return;
  const quarter = rightsQuarterForDay(state.dayIndex);
  for (const terms of plannedRightsForQuarter(quarter)) {
    const cs = state.companies[terms.ticker];
    if (!cs || cs.delisted) continue;
    const shares = capitalShares(cs);
    const newShares = shares * terms.ratio;
    const price = round(Math.max(0.01, cs.last * terms.discount), 2);
    const proceeds = round(newShares * price, 2);
    const shareFactor = 1 + terms.ratio;
    const impact = -Math.min(0.02, terms.ratio * 0.08);
    cs.capitalFactor *= shareFactor;
    state.capitalActions.push({
      type: 'rights',
      ticker: terms.ticker,
      quarter,
      day: state.dayIndex,
      ratio: terms.ratio,
      shareFactor,
      cashDelta: proceeds,
      impact: round(impact, 4),
    });
    shockQuote(state, terms.ticker, impact);
    const entitled = Math.floor((state.account.positions[terms.ticker]?.qty || 0) * terms.ratio);
    const offering = {
      id: `R${state.dayIndex}-${terms.ticker}`,
      ticker: terms.ticker,
      quarter,
      day: state.dayIndex,
      deadline: state.dayIndex + Math.max(1, terms.duration),
      ratio: terms.ratio,
      price,
      totalShares: round(newShares, 2),
      proceeds,
      entitled,
      status: 'open',
    };
    state.rightsOfferings.push(offering);
    state.corporateActions.push({
      type: 'rights',
      ticker: terms.ticker,
      quarter,
      day: state.dayIndex,
      ratio: terms.ratio,
      price,
      deadline: offering.deadline,
      entitled,
    });
  }
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

export function openRightsOfferings(state) {
  return (state.rightsOfferings || []).filter(
    (offer) => offer.status === 'open' && state.dayIndex < offer.deadline,
  );
}

export function subscribeRights(state, offeringId) {
  const offer = (state.rightsOfferings || []).find((item) => item.id === offeringId);
  if (!offer || offer.status !== 'open' || state.dayIndex >= offer.deadline) {
    return { ok: false, error: 'rights.closed' };
  }
  if (offer.entitled <= 0) return { ok: false, error: 'rights.none' };
  const qty = offer.entitled;
  const cost = round(qty * offer.price, 2);
  if (cost > availableCash(state)) return { ok: false, error: 'rights.insufficientCash' };
  state.account.cash -= cost;
  const position = state.account.positions[offer.ticker] || { qty: 0, avgCost: 0 };
  const nextQty = position.qty + qty;
  position.avgCost = nextQty ? (position.avgCost * position.qty + cost) / nextQty : 0;
  position.qty = nextQty;
  state.account.positions[offer.ticker] = position;
  state.account.trades.push({
    ticker: offer.ticker,
    side: 'buy',
    qty,
    price: offer.price,
    fee: 0,
    orderId: `RIGHTS-${offer.id}`,
    day: state.dayIndex,
    second: state.second,
    date: simDate(state.dayIndex),
    time: simClock(state.second),
    source: 'rights',
  });
  if (state.account.trades.length > 500) state.account.trades.splice(0, state.account.trades.length - 500);
  offer.status = 'subscribed';
  offer.subscribedQty = qty;
  offer.subscribedCost = cost;
  state.corporateActions.push({
    type: 'rightsSubscribed',
    ticker: offer.ticker,
    quarter: offer.quarter,
    day: state.dayIndex,
    qty,
    price: offer.price,
    cost,
  });
  return { ok: true, offering: offer, qty, cost };
}

export function declineRights(state, offeringId) {
  const offer = (state.rightsOfferings || []).find((item) => item.id === offeringId);
  if (!offer || offer.status !== 'open' || state.dayIndex >= offer.deadline) {
    return { ok: false, error: 'rights.closed' };
  }
  offer.status = 'declined';
  state.corporateActions.push({
    type: 'rightsDeclined',
    ticker: offer.ticker,
    quarter: offer.quarter,
    day: state.dayIndex,
    entitled: offer.entitled,
  });
  return { ok: true, offering: offer };
}

function expireRights(state) {
  for (const offer of state.rightsOfferings || []) {
    if (offer.status === 'open' && state.dayIndex >= offer.deadline) {
      offer.status = 'lapsed';
      state.corporateActions.push({
        type: 'rightsLapsed',
        ticker: offer.ticker,
        quarter: offer.quarter,
        day: state.dayIndex,
        deadline: offer.deadline,
      });
    }
  }
}

function applyStructuralAction(state, action) {
  const cs = state.companies[action.ticker];
  if (!cs || !['merger', 'spinoff'].includes(action.type) || cs.delisted) return;
  const company = cs.company;
  const annualRevenue = company.financials.revenue;
  const grossMargin = company.financials.grossProfit / Math.max(1, annualRevenue);
  let event;
  if (action.type === 'merger') {
    const targetRevenue = annualRevenue * action.revenueShare;
    const price = targetRevenue * action.purchaseMultiple;
    const cashPaid = price * 0.4;
    const debtIssued = price - cashPaid;
    const revenueDelta = targetRevenue / 4;
    const cogsDelta = revenueDelta * (1 - grossMargin);
    const interestDelta = debtIssued * 0.04 / 4;
    event = {
      type: 'merger',
      ticker: action.ticker,
      quarter: action.quarter,
      day: state.dayIndex,
      revenueShare: action.revenueShare,
      purchasePrice: round(price, 2),
      ppeDelta: round(price, 2),
      cashDelta: -round(cashPaid, 2),
      debtDelta: round(debtIssued, 2),
      revenueDelta: round(revenueDelta, 2),
      cogsDelta: round(cogsDelta, 2),
      operatingExpensesDelta: 0,
      interestDelta: round(interestDelta, 2),
      investingDelta: -round(price, 2),
      financingDelta: round(debtIssued, 2),
      impact: round(Math.min(0.03, action.revenueShare * 1.0), 4),
    };
  } else {
    const assetShare = Math.min(0.25, action.assetShare);
    const removedAssets = company.financials.totalAssets * assetShare;
    const revenueDelta = -annualRevenue * assetShare / 4;
    const cogsDelta = revenueDelta * (1 - grossMargin);
    const proceeds = removedAssets * 0.9;
    const shares = capitalShares(cs);
    const dps = proceeds / Math.max(1, shares);
    const qty = state.account.positions[action.ticker]?.qty || 0;
    const amount = round(qty * dps, 2);
    if (amount > 0) {
      state.account.cash += amount;
      state.account.dividends.push({
        ticker: action.ticker,
        qty,
        dps: round(dps, 4),
        amount,
        type: 'special',
        quarter: action.quarter,
        day: state.dayIndex,
      });
      if (state.account.dividends.length > 300) state.account.dividends.splice(0, 100);
    }
    const shortQty = state.account.shorts?.[action.ticker]?.qty || 0;
    const shortAmount = round(shortQty * dps, 2);
    if (shortAmount > 0) {
      state.account.cash -= shortAmount;
      state.account.dividends.push({
        ticker: action.ticker,
        qty: shortQty,
        dps: round(dps, 4),
        amount: -shortAmount,
        type: 'special',
        side: 'short',
        quarter: action.quarter,
        day: state.dayIndex,
      });
      if (state.account.dividends.length > 300) state.account.dividends.splice(0, 100);
    }
    event = {
      type: 'spinoff',
      ticker: action.ticker,
      quarter: action.quarter,
      day: state.dayIndex,
      assetShare,
      ppeDelta: -round(removedAssets, 2),
      cashDelta: 0,
      debtDelta: 0,
      revenueDelta: round(revenueDelta, 2),
      cogsDelta: round(cogsDelta, 2),
      operatingExpensesDelta: 0,
      interestDelta: 0,
      investingDelta: round(proceeds, 2),
      financingDelta: -round(proceeds, 2),
      distributionPerShare: round(dps, 4),
      distributionAmount: amount,
      impact: round(Math.min(0.035, assetShare * 0.3), 4),
    };
  }
  shockQuote(state, action.ticker, event.impact);
  state.structuralActions.push(event);
  state.corporateActions.push(event);
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function applyDividends(state, quarter) {
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
    if (cs.delisted || cs.isEtf) continue;
    const company = cs.company;
    const annual = Math.max(0, company.financials.dividendPerShare);
    const dps = annual / 4 / cs.splitFactor;
    if (!Number.isFinite(dps) || dps <= 0) continue;
    const position = state.account.positions[ticker];
    const qty = position?.qty || 0;
    const amount = round(qty * dps, 2);
    if (amount > 0) {
      state.account.cash += amount;
      state.account.dividends.push({
        ticker, qty, dps: round(dps, 4), amount, quarter, day: state.dayIndex,
      });
      if (state.account.dividends.length > 300) state.account.dividends.splice(0, 100);
    }
    const shortQty = state.account.shorts?.[ticker]?.qty || 0;
    const shortAmount = round(shortQty * dps, 2);
    if (shortAmount > 0) {
      state.account.cash -= shortAmount;
      state.account.dividends.push({
        ticker,
        qty: shortQty,
        dps: round(dps, 4),
        amount: -shortAmount,
        type: 'short',
        side: 'short',
        quarter,
        day: state.dayIndex,
      });
      if (state.account.dividends.length > 300) state.account.dividends.splice(0, 100);
    }
    const drop = Math.max(0, Math.min(dps, cs.last - 0.01));
    cs.last = Math.max(0.01, cs.last - drop);
    cs.fairValue = Math.max(0.01, cs.fairValue - drop);
    cs.prevClose = Math.max(0.01, cs.prevClose - drop);
    cs.open = Math.max(0.01, cs.open - drop);
    cs.high = Math.max(0.01, cs.high - drop);
    cs.low = Math.max(0.01, cs.low - drop);
    cs.ema = Math.max(0.01, cs.ema - drop);
    refreshLiquidity(state, ticker);
    updateQuote(state, ticker);
  }
}

function releaseReports(state) {
  const latest = reportQuarterForDay(state.dayIndex);
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
    if (cs.delisted || cs.isEtf) continue;
    while (cs.lastReportQuarter < latest) {
      const quarter = cs.lastReportQuarter + 1;
      cs.lastReportQuarter = quarter;
      const report = getQuarterReport(cs.company, quarter);
      if (!report) continue;
      const guidance = (state.guidance || []).find(
        (item) => item.ticker === ticker && item.quarter === quarter,
      );
      const expected = guidance ? guidance.eps : expectedEpsForState(state, ticker, quarter);
      const surprise = Math.abs(expected) > 1e-9
        ? (report.income.eps - expected) / Math.abs(expected)
        : 0;
      const impact = Math.max(-0.08,
        Math.min(0.08, surprise * cs.company.vol * 1.5));
      shockQuote(state, ticker, impact);
      state.reports.push({
        type: 'earnings',
        ticker,
        quarter,
        periodLabel: report.periodLabel,
        reportDate: report.reportDate,
        eps: report.income.eps,
        expectedEps: expected,
        surprise: round(surprise, 4),
        impact: round(impact, 4),
        guidance: Boolean(guidance),
        day: state.dayIndex,
      });
      if (state.reports.length > 300) state.reports.splice(0, 100);
    }
  }
}

function releaseNews(state) {
  if (state.dayIndex <= state.lastNewsDay) return;
  const companies = Object.values(state.companies)
    .filter((cs) => !cs.isEtf)
    .map((cs) => cs.company);
  const events = newsForDay({ seed: state.seed, dayIndex: state.dayIndex, companies });
  for (const event of events) {
    const impacts = new Map();
    if (event.scope === 'company') {
      if (state.companies[event.ticker]) impacts.set(event.ticker, event.impact);
    } else if (event.scope === 'sector') {
      for (const cs of Object.values(state.companies)) {
        if (cs.isEtf) continue;
        if (cs.company.sector === event.sector) {
          impacts.set(cs.company.ticker, event.impact * 0.85);
        }
      }
      for (const link of sectorSpillovers(event.sector)) {
        const spill = event.impact * link.weight * 0.55;
        if (!Number.isFinite(spill) || Math.abs(spill) < 1e-6) continue;
        for (const cs of Object.values(state.companies)) {
          if (cs.isEtf) continue;
          if (cs.company.sector === link.sector) {
            impacts.set(cs.company.ticker, (impacts.get(cs.company.ticker) || 0) + spill);
          }
        }
      }
    } else {
      for (const cs of Object.values(state.companies)) {
        if (cs.isEtf) continue;
        impacts.set(cs.company.ticker, event.impact * cs.company.beta);
      }
    }
    for (const [ticker, impact] of impacts.entries()) {
      shockQuote(state, ticker, Math.max(-0.08, Math.min(0.08, impact)));
    }
    state.news.push({
      ...event,
      targets: impacts.size,
      spillovers: event.scope === 'sector'
        ? sectorSpillovers(event.sector).map((link) => link.sector)
        : [],
    });
    if (state.news.length > 300) state.news.splice(0, 100);
  }
  state.lastNewsDay = state.dayIndex;
}

/** Daily overnight macro drift plus any release published today. */
function applyMacro(state) {
  if (state.dayIndex <= state.lastMacroDay) return;
  const sectorTotals = {};
  for (const cs of Object.values(state.companies)) {
    if (cs.delisted || cs.isEtf) continue;
    const sector = cs.company.sector;
    sectorTotals[sector] = sectorTotals[sector] || { sum: 0, count: 0 };
    sectorTotals[sector].sum += cs.fairValue
      / Math.max(0.01, cs.company.price / cs.splitFactor);
    sectorTotals[sector].count += 1;
  }
  const sectorPerformance = {};
  for (const [sector, totals] of Object.entries(sectorTotals)) {
    sectorPerformance[sector] = totals.sum / Math.max(1, totals.count);
  }
  const result = advanceMacro({
    seed: state.seed,
    dayIndex: state.dayIndex,
    macro: state.macro,
    sectorPerformance,
  });
  state.macro = result.macro;
  state.lastMacroDay = state.dayIndex;
  for (const cs of Object.values(state.companies)) {
    if (cs.isEtf) continue;
    const drift = macroDriftForCompany({ macro: state.macro, company: cs.company });
    const eventImpact = result.event
      ? macroImpactForCompany({ event: result.event, company: cs.company })
      : 0;
    shockQuote(state, cs.company.ticker, drift + eventImpact);
  }
}

/** Mid-quarter guidance changes the expectation used by the next release. */
function releaseGuidance(state) {
  if (!isGuidanceDay(state.dayIndex)) return;
  const quarter = guidanceQuarterForDay(state.dayIndex);
  const rng = createRng(`guidance:${state.seed}:${state.dayIndex}`);
  const tickers = Object.keys(state.companies).sort();
  const count = 2 + rng.int(0, 2);
  const chosen = rng.shuffle(tickers).slice(0, count);
  for (const ticker of chosen) {
    const cs = state.companies[ticker];
    if (!cs || cs.delisted || cs.isEtf) continue;
    if ((state.guidance || []).some(
      (item) => item.ticker === ticker && item.quarter === quarter,
    )) continue;
    const baseline = expectedEpsForState(state, ticker, quarter);
    if (!Number.isFinite(baseline) || baseline <= 0) continue;
    const delta = Math.max(-0.15, Math.min(0.15, rng.normal() * 0.08));
    const eps = round(baseline * (1 + delta), 4);
    const impact = Math.max(-0.025, Math.min(0.025, delta * 0.25));
    shockQuote(state, ticker, impact);
    const event = {
      type: 'guidance',
      ticker,
      quarter,
      eps,
      baseline: round(baseline, 4),
      delta: round(delta, 4),
      impact: round(impact, 4),
      day: state.dayIndex,
    };
    state.guidance.push(event);
    state.corporateActions.push(event);
  }
  if (state.guidance.length > 120) state.guidance.splice(0, 40);
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function capitalActionsThrough(state, ticker, reportDay) {
  return (state.capitalActions || []).filter(
    (action) => action.ticker === ticker && action.day <= reportDay,
  );
}

function adjustedReport(state, ticker, report) {
  if (!report) return report;
  let result = adjustReportForCapitalActions(
    report,
    capitalActionsThrough(state, ticker, report.reportDay),
  );
  const structural = (state.structuralActions || []).filter(
    (action) => action.ticker === ticker && action.day <= report.reportDay,
  );
  if (structural.length) {
    result = adjustReportForStructuralActions(result, structural);
  }
  return result;
}

/** Consensus EPS adjusted for splits and share-count changes since the prior report. */
function expectedEpsForState(state, ticker, quarter) {
  const cs = state.companies[ticker];
  if (!cs) return 0;
  const base = getQuarterReport(cs.company, quarter - 1);
  if (!base) return 0;
  const prior = adjustedReport(state, ticker, base);
  const currentFactor = splitFactorThrough(ticker, reportDayForQuarter(quarter));
  const sincePrior = capitalActionsThrough(state, ticker, reportDayForQuarter(quarter))
    .filter((action) => action.day > base.reportDay)
    .reduce((factor, action) => factor * (action.shareFactor || 1), 1);
  return prior.income.eps * (prior.splitFactor / currentFactor) / sincePrior;
}

function releaseCapitalActions(state) {
  if (!isCapitalActionDay(state.dayIndex)) return;
  const quarter = capitalQuarterForDay(state.dayIndex);
  for (const action of plannedCapitalActionsForQuarter(quarter)) {
    applyCapitalAction(state, action);
  }
}

function releaseStructuralActions(state) {
  if (!isStructuralActionDay(state.dayIndex)) return;
  const quarter = structuralQuarterForDay(state.dayIndex);
  for (const action of plannedStructuralActionsForQuarter(quarter)) {
    applyStructuralAction(state, action);
  }
}

function releaseHalts(state) {
  if (!isHaltDay(state.dayIndex)) return;
  const quarter = haltQuarterForDay(state.dayIndex);
  for (const halt of plannedHaltsForQuarter(quarter)) {
    const cs = state.companies[halt.ticker];
    if (!cs || cs.delisted) continue;
    cancelCorporateOrders(state, halt.ticker, 'halt');
    cs.haltedUntilDay = state.dayIndex + Math.max(1, halt.duration) - 1;
    state.corporateActions.push({
      type: 'halt',
      ticker: halt.ticker,
      quarter,
      day: state.dayIndex,
      until: cs.haltedUntilDay,
    });
  }
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function releaseBankruptcies(state) {
  if (!isBankruptcyDay(state.dayIndex)) return;
  const quarter = bankruptcyQuarterForDay(state.dayIndex);
  for (const plan of plannedBankruptciesForQuarter(quarter)) {
    const cs = state.companies[plan.ticker];
    if (!cs || cs.delisted) continue;
    cancelCorporateOrders(state, plan.ticker, 'bankruptcy');
    const position = state.account.positions[plan.ticker];
    const qty = position?.qty || 0;
    const loss = round(qty * (position?.avgCost || 0), 2);
    if (position) delete state.account.positions[plan.ticker];
    if (loss > 0) state.account.realizedPnl -= loss;
    const short = state.account.shorts?.[plan.ticker];
    const shortQty = short?.qty || 0;
    const shortPnl = shortQty ? round((short.avgPrice - 0.01) * shortQty, 2) : 0;
    if (short) {
      state.account.cash = round(state.account.cash - shortQty * 0.01, 2);
      state.account.realizedPnl += shortPnl;
      delete state.account.shorts[plan.ticker];
      state.account.trades.push({
        ticker: plan.ticker,
        side: 'cover',
        action: 'closeShort',
        qty: shortQty,
        price: 0.01,
        fee: 0,
        orderId: `BANKRUPTCY-${plan.ticker}-${state.dayIndex}`,
        day: state.dayIndex,
        second: state.second,
        date: simDate(state.dayIndex),
        time: simClock(state.second),
        source: 'bankruptcy',
      });
      if (state.account.trades.length > 500) {
        state.account.trades.splice(0, state.account.trades.length - 500);
      }
    }
    cs.delisted = true;
    cs.haltedUntilDay = null;
    cs.last = 0.01;
    cs.fairValue = 0.01;
    cs.prevClose = 0.01;
    cs.open = 0.01;
    cs.high = 0.01;
    cs.low = 0.01;
    cs.ema = 0.01;
    cs.volume = 0;
    cs.trades = 0;
    cs.inventory = 0;
    refreshLiquidity(state, plan.ticker);
    updateQuote(state, plan.ticker);
    state.corporateActions.push({
      type: 'bankruptcy',
      ticker: plan.ticker,
      quarter,
      day: state.dayIndex,
      qty,
      loss,
      shortQty,
      shortPnl,
    });
  }
  if (state.corporateActions.length > 300) state.corporateActions.splice(0, 100);
}

function applyCorporateActions(state) {
  if (state.dayIndex > 0 && state.dayIndex % SIM_QUARTER_DAYS === 0) {
    const quarter = state.dayIndex / SIM_QUARTER_DAYS;
    for (const split of plannedSplitsForQuarter(quarter)) {
      applySplit(state, split.ticker, split.ratio, quarter);
    }
    if (isDividendDay(state.dayIndex)) {
      applyDividends(state, dividendQuarterForDay(state.dayIndex));
    }
  }
  releaseCapitalActions(state);
  releaseRights(state);
  releaseStructuralActions(state);
  releaseGuidance(state);
  releaseReports(state);
  releaseNews(state);
}

function chooseSimulatedOrder(state, ticker, rng) {
  const cs = state.companies[ticker];
  const company = cs.company;
  const quote = state.quotes[ticker];
  const roll = rng.next();
  if (roll < 0.6) {
    return {
      side: rng.next() < 0.5 ? 'buy' : 'sell',
      type: 'market',
      qty: rng.int(20, 320),
    };
  }
  if (roll < 0.85) {
    const side = cs.last >= cs.ema ? 'buy' : 'sell';
    const limit = side === 'buy'
      ? Math.max(quote.ask || cs.last, cs.last * 1.0005)
      : Math.min(quote.bid || cs.last, cs.last * 0.9995);
    return {
      side, type: 'limit', qty: rng.int(40, 500), limitPrice: round(limit, 2),
    };
  }
  if (cs.last < cs.fairValue * 0.985) {
    return { side: 'buy', type: 'limit', qty: rng.int(80, 650), limitPrice: round(cs.fairValue * 0.995, 2) };
  }
  if (cs.last > cs.fairValue * 1.015) {
    return { side: 'sell', type: 'limit', qty: rng.int(80, 650), limitPrice: round(cs.fairValue * 1.005, 2) };
  }
  return null;
}

function runSimulatedTraders(state, rng) {
  const tickers = Object.keys(state.companies);
  const count = 2 + rng.int(0, 3);
  for (let index = 0; index < count; index += 1) {
    const ticker = tickers[rng.int(0, tickers.length - 1)];
    if (isTradingHalted(state, ticker)) continue;
    const intent = chooseSimulatedOrder(state, ticker, rng);
    if (!intent) continue;
    submitOrder(state, {
      ticker,
      side: intent.side,
      type: intent.type,
      qty: intent.qty,
      limitPrice: intent.limitPrice,
      owner: `sim:${SIM_TRADER_TYPES[rng.int(0, SIM_TRADER_TYPES.length - 1)]}`,
    });
  }
}

/**
 * Evaluates margin, cancels working orders and liquidates the largest positions
 * until maintenance margin is restored. Closing trades are always allowed.
 */
export function checkMargin(state) {
  const result = evaluateMarginCall(state);
  if (!result.liquidate) return result;
  const account = normalizeAccount(state.account);
  for (const order of state.orders) {
    if (order.owner !== 'player' || !isLiveOrder(order)) continue;
    const cs = state.companies[order.ticker];
    if (cs) cs.book.removeOrder(order.id);
    order.status = 'cancelled';
    order.reason = 'marginCall';
    order.active = false;
  }
  for (let step = 0; step < 12; step += 1) {
    const snapshot = marginSnapshot(state);
    if (snapshot.maintenanceExcess >= 0 && snapshot.equity > 0) break;
    const target = nextLiquidationTarget(state);
    if (!target) break;
    if (target.action === 'closeShortOption') {
      const closed = closeOption(state, target.key, target.qty);
      if (!closed.ok) break;
      recordForcedLiquidation(state, {
        ticker: target.ticker,
        action: target.action,
        qty: closed.qty,
        price: closed.price,
        orderId: target.key,
      });
      continue;
    }
    const side = target.action === 'closeLong' ? 'sell' : 'cover';
    const submitted = submitOrder(state, {
      ticker: target.ticker,
      side,
      action: target.action,
      type: 'market',
      qty: target.qty,
      owner: 'player',
    });
    if (!submitted.ok || !submitted.order.filledQty) break;
    recordForcedLiquidation(state, {
      ticker: target.ticker,
      action: target.action,
      qty: submitted.order.filledQty,
      price: submitted.order.avgPrice,
      orderId: submitted.order.id,
    });
  }
  const after = marginSnapshot(state);
  if (after.equity >= after.maintenanceRequirement) {
    closeMarginCall(state, 'liquidated');
  } else if (account.margin.call) {
    account.margin.call.dueDay = state.dayIndex;
  }
  return { ...result, snapshot: after, liquidated: true };
}

/** Marks every ETF to its weighted basket NAV and reprices its market-maker ladder. */
function updateEtfValuation(state) {
  for (const ticker of state.etfTickers || SIM_ETF_TICKERS) {
    const cs = state.companies[ticker];
    if (!cs || cs.delisted) continue;
    const nav = etfNav(state, ticker);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    cs.fairValue = nav;
    cs.last = nav;
    cs.high = Math.max(cs.high, cs.last);
    cs.low = Math.min(cs.low, cs.last);
    refreshLiquidity(state, ticker);
    updateQuote(state, ticker);
  }
}

export function startExchangeChallenge(state, id) {
  return startChallenge(state, id, equity(state));
}

export function abandonExchangeChallenge(state) {
  return abandonChallenge(state);
}

export function exchangeChallengeSnapshot(state) {
  return challengeSnapshot(state, equity(state));
}

export function exchangeTimelineRows(state) {
  return timelineRows(state);
}

/**
 * Restores prices and the account from a day-open snapshot and truncates every
 * later log, so the player can replay the session as a new branch. Working
 * orders from the discarded timeline are removed.
 */
export function rewindToDay(state, day) {
  const snapshot = findSnapshot(state, day);
  if (!snapshot) return { ok: false, error: 'timeline.notFound' };
  const target = Math.floor(Number(day));
  for (const order of state.orders) {
    const createdDay = order.createdAt?.day ?? 0;
    if (createdDay > target) {
      order.status = 'cancelled';
      order.reason = 'timelineRewind';
      order.active = false;
    } else if (isLiveOrder(order)) {
      order.status = 'cancelled';
      order.reason = 'timelineRewind';
      order.active = false;
    }
  }
  state.orders = state.orders.filter((order) => (order.createdAt?.day ?? 0) <= target);
  for (const [ticker, saved] of Object.entries(snapshot.prices || {})) {
    const cs = state.companies[ticker];
    if (!cs) continue;
    Object.assign(cs, saved);
    cs.mmSize = mmSizeFor(cs.company) * (cs.splitFactor || 1);
    cs.book = new SimOrderBook(ticker);
  }
  state.account = normalizeAccount(JSON.parse(JSON.stringify(snapshot.account)));
  state.challenge = snapshot.challenge
    ? JSON.parse(JSON.stringify(snapshot.challenge))
    : createChallengeState();
  state.challenge.history = state.challenge.history || [];
  state.macro = JSON.parse(JSON.stringify(snapshot.macro || state.macro));
  state.lastNewsDay = snapshot.lastNewsDay ?? target;
  state.lastMacroDay = snapshot.lastMacroDay ?? target;
  state.marketFactor = snapshot.marketFactor || 0;
  state.sectorFactors = snapshot.sectorFactors
    ? JSON.parse(JSON.stringify(snapshot.sectorFactors))
    : state.sectorFactors;
  state.rngState = JSON.parse(JSON.stringify(snapshot.rngState));
  state.stats = snapshot.stats
    ? JSON.parse(JSON.stringify(snapshot.stats))
    : state.stats;
  state.dayIndex = snapshot.day;
  state.second = snapshot.second;
  const before = (entry) => (entry.day ?? 0) <= target;
  state.news = state.news.filter(before);
  state.reports = state.reports.filter(before);
  state.corporateActions = state.corporateActions.filter(before);
  state.capitalActions = state.capitalActions.filter(before);
  state.structuralActions = state.structuralActions.filter(before);
  state.guidance = state.guidance.filter(before);
  state.rightsOfferings = state.rightsOfferings.filter(before);
  state.trades = state.trades.filter(before);
  for (const ticker of Object.keys(state.companies)) {
    refreshLiquidity(state, ticker);
    updateQuote(state, ticker);
  }
  updateEtfValuation(state);
  truncateTimeline(state, target);
  recordBranch(state, target, 'rewind');
  recordTimeline(state, equity(state));
  return { ok: true, snapshot, day: target };
}

export function createExchangeEngine({ seed = 'sim-exchange-v1', cash = SIM_START_CASH } = {}) {
  const companies = {};
  for (const company of [...SIM_COMPANIES, ...SIM_ETF_INSTRUMENTS]) {
    companies[company.ticker] = createCompanyState(company);
  }
  const sectors = [...new Set(SIM_COMPANIES.map((company) => company.sector))];
  const state = {
    seed,
    rngState: createRng(seed).getState(),
    dayIndex: 0,
    second: 0,
    nextOrderId: 1,
    marketFactor: 0,
    sectorFactors: Object.fromEntries(sectors.map((sector) => [sector, 0])),
    companies,
    etfTickers: [...SIM_ETF_TICKERS],
    quotes: {},
    orders: [],
    trades: [],
    reports: [],
    corporateActions: [],
    capitalActions: [],
    structuralActions: [],
    rightsOfferings: [],
    news: [],
    lastNewsDay: 0,
    macro: createMacroState(),
    lastMacroDay: 0,
    guidance: [],
    optionStyle: 'european',
    challenge: createChallengeState(),
    timeline: createTimelineState(),
    account: {
      cash,
      initialCash: cash,
      positions: {},
      shorts: {},
      options: [],
      optionSettlements: [],
      bonds: {},
      coupons: [],
      margin: createMarginState(),
      realizedPnl: 0,
      fees: 0,
      trades: [],
      dividends: [],
    },
    stats: { tradeCount: 0, volume: 0, seconds: 0 },
  };
  for (const ticker of Object.keys(companies)) updateQuote(state, ticker);
  updateEtfValuation(state);
  recordTimeline(state, equity(state));
  return state;
}

export function advanceSecond(state) {
  const rng = createRng(state.seed);
  rng.setState(state.rngState);
  state.second += 1;
  state.stats.seconds += 1;
  if (state.second >= SIM_SESSION_SECONDS) {
    const date = simDate(state.dayIndex);
    for (const order of state.orders) {
      if (order.owner !== 'player' && ['open', 'partiallyFilled'].includes(order.status)) {
        const cs = state.companies[order.ticker];
        if (cs) cs.book.removeOrder(order.id);
        order.status = 'cancelled';
        order.reason = 'sessionEnd';
        order.active = false;
      }
    }
    for (const ticker of Object.keys(state.companies)) {
      const cs = state.companies[ticker];
      finalizeDay(cs.series, date);
      cs.prevClose = cs.last;
      cs.open = cs.last;
      cs.high = cs.last;
      cs.low = cs.last;
      cs.volume = 0;
      cs.trades = 0;
      cs.inventory = 0;
    }
    state.dayIndex += 1;
    state.second = 0;
    expireRights(state);
    settleExpiredOptions(state);
    assignEarlyOptions(state);
    accrueBondCoupons(state);
    releaseBankruptcies(state);
    releaseHalts(state);
    applyMacro(state);
    applyCorporateActions(state);
    for (const ticker of Object.keys(state.companies)) updateQuote(state, ticker);
    updateEtfValuation(state);
    const account = normalizeAccount(state.account);
    accrueMarginCharges(state, state.dayIndex - account.margin.lastAccrualDay);
    checkMargin(state);
    updateChallenge(state, equity(state));
    recordTimeline(state, equity(state));
    state.rngState = rng.getState();
    return state;
  }
  if (state.second % 30 === 0) updateFactors(state, rng);
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
    refreshLiquidity(state, ticker);
    updateQuote(state, ticker);
  }
  updateEtfValuation(state);
  processConditionalOrders(state);
  activatePending(state);
  executeResting(state);
  runSimulatedTraders(state, rng);
  if (state.second % 10 === 0) checkMargin(state);
  pruneOrders(state);
  state.rngState = rng.getState();
  return state;
}

export function advanceSeconds(state, count = 1) {
  const n = Math.max(1, Math.floor(count));
  for (let index = 0; index < n; index += 1) advanceSecond(state);
  return state;
}

export function advanceMinute(state) {
  return advanceSeconds(state, 60);
}

/** Completes the current session and rolls into the next trading day. */
export function advanceDay(state) {
  const remaining = Math.max(1, SIM_SESSION_SECONDS - state.second);
  for (let index = 0; index < remaining; index += 1) advanceSecond(state);
  return state;
}

export function getCandles(state, ticker, timeframe = '1m') {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  if (!cs) return [];
  return getSeriesCandles(cs.series, timeframe, simDate(state.dayIndex));
}

export function getBook(state, ticker, levels = 6) {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  return cs ? cs.book.snapshot(levels) : { ticker, bids: [], asks: [] };
}

export function latestReport(state, ticker) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  if (!cs || cs.isEtf) return null;
  return adjustedReport(state, symbol, latestReportForDay(cs.company, state.dayIndex));
}

export function reportHistory(state, ticker, count = 4) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  if (!cs || cs.isEtf) return [];
  return reportHistoryForDay(cs.company, state.dayIndex, count)
    .map((report) => adjustedReport(state, symbol, report));
}

export function dividendPerShare(state, ticker) {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  if (!cs || cs.isEtf) return 0;
  return round(Math.max(0, cs.company.financials.dividendPerShare) / cs.splitFactor, 4);
}

export function equity(state) {
  let value = state.account.cash;
  for (const [ticker, position] of Object.entries(state.account.positions)) {
    value += position.qty * (state.quotes[ticker]?.last || 0);
  }
  for (const [ticker, short] of Object.entries(state.account.shorts || {})) {
    value -= short.qty * (state.quotes[ticker]?.last || 0);
  }
  value += optionMarketValue(state);
  value += bondMarketValue(state);
  return round(value, 2);
}

export function positionRows(state) {
  return Object.entries(state.account.positions).map(([ticker, position]) => {
    const quote = state.quotes[ticker];
    const last = quote?.last || 0;
    const marketValue = round(position.qty * last, 2);
    const unrealized = round((last - position.avgCost) * position.qty, 2);
    return {
      ticker,
      name: state.companies[ticker]?.company.name || ticker,
      qty: position.qty,
      avgCost: round(position.avgCost, 4),
      last,
      marketValue,
      unrealized,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
}

export function openOrderRows(state, owner = 'player') {
  return state.orders.filter((order) => order.owner === owner && isLiveOrder(order));
}

export function serializeExchange(state) {
  const companies = {};
  for (const [ticker, cs] of Object.entries(state.companies)) {
    companies[ticker] = {
      fairValue: cs.fairValue,
      last: cs.last,
      prevClose: cs.prevClose,
      open: cs.open,
      high: cs.high,
      low: cs.low,
      volume: cs.volume,
      trades: cs.trades,
      inventory: cs.inventory,
      ema: cs.ema,
      series: cs.series,
      splitFactor: cs.splitFactor,
      capitalFactor: cs.capitalFactor,
      haltedUntilDay: cs.haltedUntilDay,
      delisted: cs.delisted,
      lastReportQuarter: cs.lastReportQuarter,
      book: {
        mmBids: cs.book.mmBids.map((level) => ({ ...level })),
        mmAsks: cs.book.mmAsks.map((level) => ({ ...level })),
      },
    };
  }
  return JSON.stringify({
    version: 1,
    seed: state.seed,
    rngState: state.rngState,
    dayIndex: state.dayIndex,
    second: state.second,
    nextOrderId: state.nextOrderId,
    marketFactor: state.marketFactor,
    sectorFactors: state.sectorFactors,
    companies,
    orders: state.orders,
    trades: state.trades,
    reports: state.reports,
    corporateActions: state.corporateActions,
    capitalActions: state.capitalActions,
    structuralActions: state.structuralActions,
    rightsOfferings: state.rightsOfferings,
    news: state.news,
    lastNewsDay: state.lastNewsDay,
    macro: state.macro,
    lastMacroDay: state.lastMacroDay,
    guidance: state.guidance,
    optionStyle: state.optionStyle,
    challenge: state.challenge,
    timeline: state.timeline,
    account: state.account,
    stats: state.stats,
  });
}

export function deserializeExchange(snapshot) {
  const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  if (!data || data.version !== 1 || !data.companies) throw new Error('sim.save.invalid');
  const state = createExchangeEngine({ seed: data.seed, cash: data.account?.cash || SIM_START_CASH });
  state.rngState = data.rngState;
  state.dayIndex = data.dayIndex || 0;
  state.second = data.second || 0;
  state.nextOrderId = data.nextOrderId || 1;
  state.marketFactor = data.marketFactor || 0;
  state.sectorFactors = data.sectorFactors || state.sectorFactors;
  state.orders = data.orders || [];
  state.trades = data.trades || [];
  state.reports = data.reports || [];
  state.corporateActions = data.corporateActions || [];
  state.capitalActions = data.capitalActions || [];
  state.structuralActions = data.structuralActions || [];
  state.rightsOfferings = data.rightsOfferings || [];
  state.news = data.news || [];
  state.lastNewsDay = Number.isFinite(data.lastNewsDay) ? data.lastNewsDay : state.dayIndex;
  state.macro = { ...createMacroState(), ...(data.macro || {}) };
  state.macro.events = Array.isArray(state.macro.events) ? state.macro.events : [];
  state.lastMacroDay = Number.isFinite(data.lastMacroDay) ? data.lastMacroDay : state.dayIndex;
  state.guidance = data.guidance || [];
  state.optionStyle = data.optionStyle === 'american' ? 'american' : 'european';
  state.challenge = data.challenge || createChallengeState();
  state.challenge.active = state.challenge.active || null;
  state.challenge.history = Array.isArray(state.challenge.history)
    ? state.challenge.history : [];
  state.timeline = data.timeline || createTimelineState();
  state.timeline.snapshots = Array.isArray(state.timeline.snapshots)
    ? state.timeline.snapshots : [];
  state.timeline.branches = Array.isArray(state.timeline.branches)
    ? state.timeline.branches : [];
  state.account = normalizeAccount(data.account || state.account);
  state.account.dividends = state.account.dividends || [];
  state.stats = data.stats || state.stats;
  for (const order of state.orders) {
    order.action = actionForOrder(order);
    order.bookSide = bookSideForOrder(order);
  }
  const baselineReportQuarter = reportQuarterForDay(state.dayIndex);
  for (const [ticker, saved] of Object.entries(data.companies)) {
    const cs = state.companies[ticker];
    if (!cs) continue;
    Object.assign(cs, saved);
    cs.splitFactor = Number.isFinite(saved.splitFactor) ? saved.splitFactor : 1;
    cs.capitalFactor = Number.isFinite(saved.capitalFactor) ? saved.capitalFactor : 1;
    cs.haltedUntilDay = Number.isFinite(saved.haltedUntilDay) ? saved.haltedUntilDay : null;
    cs.delisted = Boolean(saved.delisted);
    cs.lastReportQuarter = Number.isFinite(saved.lastReportQuarter)
      ? saved.lastReportQuarter
      : baselineReportQuarter;
    cs.mmSize = mmSizeFor(cs.company) * cs.splitFactor;
    cs.book = new SimOrderBook(ticker);
    cs.series = saved.series || createMinuteSeries();
    if (saved.book && saved.book.mmBids && saved.book.mmAsks) {
      cs.book.mmBids = saved.book.mmBids.map((level) => ({ ...level }));
      cs.book.mmAsks = saved.book.mmAsks.map((level) => ({ ...level }));
    } else {
      refreshLiquidity(state, ticker);
    }
    updateQuote(state, ticker);
  }
  for (const order of state.orders) {
    if (order.active !== false && ['open', 'partiallyFilled'].includes(order.status) && order.type === 'limit') {
      const cs = state.companies[order.ticker];
      if (cs) cs.book.addResting({
        id: order.id,
        side: bookSideForOrder(order),
        price: order.limitPrice,
        remaining: order.qty - (order.filledQty || 0),
        owner: order.owner,
        action: order.action,
      });
    }
  }
  updateEtfValuation(state);
  return state;
}
