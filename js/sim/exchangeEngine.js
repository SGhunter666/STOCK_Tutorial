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

export const SIM_START_CASH = 100_000;
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
  };
}

function updateQuote(state, ticker) {
  const cs = state.companies[ticker];
  const bid = cs.book.bestBid();
  const ask = cs.book.bestAsk();
  const changePct = cs.prevClose ? ((cs.last - cs.prevClose) / cs.prevClose) * 100 : 0;
  state.quotes[ticker] = {
    ticker,
    last: round(cs.last, 2),
    bid: bid === null ? null : round(bid, 2),
    ask: ask === null ? null : round(ask, 2),
    open: round(cs.open, 2),
    high: round(cs.high, 2),
    low: round(cs.low, 2),
    volume: cs.volume,
    trades: cs.trades,
    changePct: round(changePct, 4),
    fairValue: round(cs.fairValue, 2),
    source: 'SIMULATED',
  };
  return state.quotes[ticker];
}

function refreshLiquidity(state, ticker) {
  const cs = state.companies[ticker];
  const company = cs.company;
  const inventoryPenalty = cs.inventory / Math.max(1, company.avgVolume * 0.6);
  const mid = cs.fairValue * (1 - inventoryPenalty * 0.01);
  const half = Math.max(0.01, mid * company.spread / 20_000);
  cs.book.setMarketMaker({
    bid: Math.max(0.01, mid - half),
    ask: mid + half,
    size: cs.mmSize,
  });
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
  const account = state.account;
  const ticker = order.ticker;
  const position = account.positions[ticker] || { qty: 0, avgCost: 0 };
  const gross = qty * price;
  if (order.side === 'buy') {
    account.cash -= gross + fee;
    const nextQty = position.qty + qty;
    position.avgCost = nextQty ? (position.avgCost * position.qty + gross) / nextQty : 0;
    position.qty = nextQty;
    account.positions[ticker] = position;
  } else {
    if (position.qty < qty) {
      order.status = 'rejected';
      order.reason = 'insufficientShares';
      return false;
    }
    account.cash += gross - fee;
    account.realizedPnl += (price - position.avgCost) * qty;
    position.qty -= qty;
    if (position.qty <= 0) delete account.positions[ticker];
  }
  account.fees += fee;
  account.trades.push({
    ticker,
    side: order.side,
    qty,
    price: round(price, 4),
    fee,
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

function applyFills(state, order, fills, { rest = false } = {}) {
  for (const fill of fills) {
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
  if (remaining > 0 && rest && order.type === 'limit') {
    order.status = order.filledQty ? 'partiallyFilled' : 'open';
    order.remaining = remaining;
    state.companies[order.ticker].book.addResting({
      id: order.id,
      side: order.side,
      price: order.limitPrice,
      remaining,
      owner: order.owner,
    });
  } else if (remaining > 0) {
    order.status = order.filledQty ? 'partiallyFilled' : 'cancelled';
    order.reason = 'insufficientLiquidity';
    order.remaining = remaining;
  }
  return order;
}

function availableShares(state, ticker) {
  const held = state.account.positions[ticker]?.qty || 0;
  const reserved = state.orders
    .filter((order) => order.owner === 'player' && order.ticker === ticker
      && order.side === 'sell' && ['open', 'partiallyFilled'].includes(order.status))
    .reduce((sum, order) => sum + (order.qty - (order.filledQty || 0)), 0);
  return Math.max(0, held - reserved);
}

function availableCash(state) {
  const reserved = state.orders
    .filter((order) => order.owner === 'player' && order.side === 'buy'
      && order.type === 'limit' && ['open', 'partiallyFilled'].includes(order.status))
    .reduce((sum, order) => {
      const price = order.limitPrice || state.quotes[order.ticker]?.ask || 0;
      return sum + (order.qty - (order.filledQty || 0)) * price
        * (1 + SIM_FEE_BPS / 10_000);
    }, 0);
  return state.account.cash - reserved;
}

export function submitOrder(state, {
  ticker, side, type = 'market', qty, limitPrice = null, owner = 'player',
}) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  const quantity = Math.floor(Number(qty) || 0);
  const orderSide = side === 'sell' ? 'sell' : side === 'buy' ? 'buy' : '';
  if (!cs || !orderSide || quantity <= 0) {
    return { ok: false, error: 'order.invalid' };
  }
  if (type === 'limit' && !Number.isFinite(Number(limitPrice))) {
    return { ok: false, error: 'order.limit' };
  }
  const price = type === 'limit'
    ? round(Number(limitPrice), 2)
    : orderSide === 'buy' ? state.quotes[symbol]?.ask : state.quotes[symbol]?.bid;
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'order.noLiquidity' };
  }
  if (owner === 'player') {
    if (orderSide === 'buy') {
      const cost = quantity * price * (1 + SIM_FEE_BPS / 10_000);
      if (cost > availableCash(state)) return { ok: false, error: 'order.insufficientCash' };
    } else if (quantity > availableShares(state, symbol)) {
      return { ok: false, error: 'order.insufficientShares' };
    }
  }

  const order = {
    id: `O${state.nextOrderId}`,
    ticker: symbol,
    side: orderSide,
    type: type === 'limit' ? 'limit' : 'market',
    qty: quantity,
    limitPrice: type === 'limit' ? price : null,
    filledQty: 0,
    avgPrice: 0,
    remaining: quantity,
    status: 'open',
    owner,
    createdAt: { day: state.dayIndex, second: state.second },
    expiresAt: owner === 'player' ? null : state.second + 300,
    fills: [],
    reason: '',
  };
  state.nextOrderId += 1;
  state.orders.push(order);

  const result = cs.book.match(order);
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

export function cancelOrder(state, orderId, owner = 'player') {
  const order = state.orders.find((item) => item.id === orderId && item.owner === owner);
  if (!order) return { ok: false, error: 'order.notFound' };
  if (!['open', 'partiallyFilled'].includes(order.status)) {
    return { ok: false, error: 'order.notOpen' };
  }
  state.companies[order.ticker].book.removeOrder(order.id);
  order.status = 'cancelled';
  order.reason = 'order.cancelled';
  return { ok: true, order };
}

function executeResting(state) {
  for (const ticker of Object.keys(state.companies)) {
    const results = state.companies[ticker].book.matchResting();
    for (const result of results) {
      const order = findOrder(state, result.order.id);
      if (!order) continue;
      applyFills(state, order, result.fills);
    }
  }
  for (const order of state.orders) {
    if (order.owner !== 'player' && ['open', 'partiallyFilled'].includes(order.status)
      && order.expiresAt !== null && state.second >= order.expiresAt) {
      state.companies[order.ticker].book.removeOrder(order.id);
      order.status = 'cancelled';
      order.reason = 'order.expired';
    }
  }
}

function pruneOrders(state) {
  if (state.orders.length <= 500) return;
  const active = state.orders.filter((order) => ['open', 'partiallyFilled'].includes(order.status));
  const recent = state.orders.filter((order) => !['open', 'partiallyFilled'].includes(order.status)).slice(-120);
  state.orders = [...active, ...recent];
}

function updateFactors(state, rng) {
  state.marketFactor = state.marketFactor * 0.92 + rng.normal() * 0.0009;
  for (const sector of Object.keys(state.sectorFactors)) {
    state.sectorFactors[sector] = state.sectorFactors[sector] * 0.93 + rng.normal() * 0.0007;
  }
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
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

export function createExchangeEngine({ seed = 'sim-exchange-v1', cash = SIM_START_CASH } = {}) {
  const companies = {};
  for (const company of SIM_COMPANIES) companies[company.ticker] = createCompanyState(company);
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
    quotes: {},
    orders: [],
    trades: [],
    account: {
      cash,
      initialCash: cash,
      positions: {},
      realizedPnl: 0,
      fees: 0,
      trades: [],
    },
    stats: { tradeCount: 0, volume: 0, seconds: 0 },
  };
  for (const ticker of Object.keys(companies)) updateQuote(state, ticker);
  return state;
}

export function advanceSecond(state) {
  const rng = createRng(state.seed);
  rng.setState(state.rngState);
  state.second += 1;
  state.stats.seconds += 1;
  if (state.second >= SIM_SESSION_SECONDS) {
    const date = simDate(state.dayIndex);
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
    for (const ticker of Object.keys(state.companies)) updateQuote(state, ticker);
    state.rngState = rng.getState();
    return state;
  }
  if (state.second % 30 === 0) updateFactors(state, rng);
  for (const ticker of Object.keys(state.companies)) {
    const cs = state.companies[ticker];
    refreshLiquidity(state, ticker);
    updateQuote(state, ticker);
  }
  executeResting(state);
  runSimulatedTraders(state, rng);
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

export function getCandles(state, ticker, timeframe = '1m') {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  if (!cs) return [];
  return getSeriesCandles(cs.series, timeframe, simDate(state.dayIndex));
}

export function getBook(state, ticker, levels = 6) {
  const cs = state.companies[String(ticker || '').toUpperCase()];
  return cs ? cs.book.snapshot(levels) : { ticker, bids: [], asks: [] };
}

export function equity(state) {
  let value = state.account.cash;
  for (const [ticker, position] of Object.entries(state.account.positions)) {
    value += position.qty * (state.quotes[ticker]?.last || 0);
  }
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
  return state.orders.filter((order) => order.owner === owner
    && ['open', 'partiallyFilled'].includes(order.status));
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
  state.account = data.account || state.account;
  state.stats = data.stats || state.stats;
  for (const [ticker, saved] of Object.entries(data.companies)) {
    const cs = state.companies[ticker];
    if (!cs) continue;
    Object.assign(cs, saved);
    cs.book = new SimOrderBook(ticker);
    const half = Math.max(0.01, cs.last * cs.company.spread / 20_000);
    cs.book.setMarketMaker({ bid: cs.last - half, ask: cs.last + half, size: cs.mmSize });
    cs.series = saved.series || createMinuteSeries();
    updateQuote(state, ticker);
  }
  for (const order of state.orders) {
    if (order.owner === 'player' && ['open', 'partiallyFilled'].includes(order.status)) {
      const cs = state.companies[order.ticker];
      if (cs) cs.book.addResting({
        id: order.id,
        side: order.side,
        price: order.limitPrice,
        remaining: order.qty - (order.filledQty || 0),
        owner: order.owner,
      });
    }
  }
  return state;
}
