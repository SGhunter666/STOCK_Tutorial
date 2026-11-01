/**
 * Historical replay engine: real daily bars expanded into eight intraday ticks,
 * with trading at the current tick price. All prices are adjusted for splits and
 * dividends, so returns are continuous.
 */
import {
  buy, sell, equity, marketValue, unrealizedPnl, positionRows, returnPct, createAccount,
} from '../trading/account.js';
import { TICKS_PER_DAY } from '../market/calendar.js';

export const HISTORY_START_CASH = 10000;
export const HISTORY_FEE = 1;
/** Days loaded before the player starts so the chart has real context. */
export const HISTORY_WARMUP = 20;

const VOLUME_WEIGHTS = [0.18, 0.12, 0.10, 0.08, 0.09, 0.11, 0.14, 0.18];

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noise(hash, salt) {
  const mixed = Math.imul(hash ^ (salt * 2654435761), 2654435761) >>> 0;
  return (mixed / 4294967295) * 2 - 1;
}

/**
 * Builds a deterministic intraday path from a daily OHLC bar. The eight ticks
 * start at the open, touch the high and low in a seed-dependent order, and end
 * at the close, so every tick moves while respecting the real daily range.
 */
export function intradayPath(bar, symbol) {
  const [, open, high, low, close] = bar;
  const ticks = TICKS_PER_DAY;
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) {
    return Array.from({ length: ticks }, () => round(open));
  }
  const hash = hashString(`${symbol}|${bar[0]}`);
  const highFirst = (hash & 1) === 0;
  const anchors = [
    { tick: 0, price: open },
    { tick: 2, price: highFirst ? high : low },
    { tick: 5, price: highFirst ? low : high },
    { tick: ticks - 1, price: close },
  ];
  const path = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const nextIndex = anchors.findIndex((anchor) => anchor.tick >= tick);
    const right = anchors[nextIndex] || anchors[anchors.length - 1];
    const left = anchors.reduce((best, anchor) => (anchor.tick <= tick ? anchor : best), anchors[0]);
    const span = right.tick - left.tick;
    const ratio = span > 0 ? (tick - left.tick) / span : 0;
    let price = left.price + (right.price - left.price) * ratio;
    if (tick !== left.tick) {
      price += noise(hash, tick + 11) * (high - low) * 0.06;
    }
    path.push(round(Math.min(high, Math.max(low, price)), 4));
  }
  path[0] = round(open, 4);
  path[2] = round(anchors[1].price, 4);
  path[5] = round(anchors[2].price, 4);
  path[ticks - 1] = round(close, 4);
  return path;
}

export function intradayBar(bar, symbol, tick = 0) {
  const path = intradayPath(bar, symbol);
  const index = Math.max(0, Math.min(TICKS_PER_DAY - 1, Number(tick) || 0));
  const prices = path.slice(0, index + 1);
  const share = VOLUME_WEIGHTS.slice(0, index + 1).reduce((sum, weight) => sum + weight, 0);
  return {
    d: bar[0],
    o: path[0],
    h: Math.max(...prices),
    l: Math.min(...prices),
    c: path[index],
    v: Math.round((bar[5] || 0) * share),
    tick: index,
  };
}

export function createHistoryRun(scenarioId, startCash = HISTORY_START_CASH) {
  return {
    scenarioId,
    dayIndex: HISTORY_WARMUP,
    startIndex: HISTORY_WARMUP,
    tick: 0,
    account: createAccount(startCash),
    selectedTicker: null,
    createdAt: Date.now(),
  };
}

export function ensureHistoryRun(existing, scenarioId, dataset) {
  if (!existing || existing.scenarioId !== scenarioId || !existing.account) {
    return createHistoryRun(scenarioId);
  }
  const maxIndex = barCount(dataset) - 1;
  const trades = Array.isArray(existing.account.trades) ? existing.account.trades : [];
  // Old runs that never traded get the same warm-up window as new runs.
  const minimum = trades.length ? 1 : Math.min(HISTORY_WARMUP, maxIndex);
  const raw = Number(existing.dayIndex);
  const dayIndex = Math.max(minimum, Math.min(Number.isFinite(raw) ? raw : minimum, maxIndex));
  const startIndex = Math.max(1, Math.min(
    Number(existing.startIndex) || (trades.length ? 1 : minimum),
    dayIndex,
  ));
  const tick = Math.max(0, Math.min(TICKS_PER_DAY - 1, Number(existing.tick) || 0));
  return { ...existing, dayIndex, startIndex, tick };
}

export function barCount(dataset) {
  if (!dataset || !dataset.tickers || !dataset.tickers.length) return 0;
  return dataset.tickers[0].bars.length;
}

export function tickerData(dataset, symbol) {
  return dataset?.tickers?.find((ticker) => ticker.symbol === symbol) || null;
}

export function currentDate(dataset, dayIndex) {
  const bars = dataset?.tickers?.[0]?.bars;
  return bars && bars[dayIndex] ? bars[dayIndex][0] : '';
}

export function barsFor(dataset, symbol) {
  const ticker = tickerData(dataset, symbol);
  return ticker ? ticker.bars : [];
}

export function quoteAt(dataset, symbol, dayIndex) {
  const bars = barsFor(dataset, symbol);
  const bar = bars[dayIndex];
  if (!bar) return null;
  const prev = bars[dayIndex - 1] || bar;
  const [date, open, high, low, close, volume] = bar;
  const prevClose = prev[4];
  return {
    symbol,
    date,
    open,
    high,
    low,
    last: close,
    prevClose,
    volume,
    changePct: prevClose ? ((close - prevClose) / prevClose) * 100 : 0,
    bid: Math.max(0.01, Math.round((close - 0.01) * 100) / 100),
    ask: Math.round((close + 0.01) * 100) / 100,
  };
}

export function quotesAt(dataset, dayIndex) {
  const map = {};
  for (const ticker of dataset.tickers) {
    map[ticker.symbol] = quoteAt(dataset, ticker.symbol, dayIndex);
  }
  return map;
}

export function quoteAtTick(dataset, symbol, dayIndex, tick = 0) {
  const bars = barsFor(dataset, symbol);
  const bar = bars[dayIndex];
  if (!bar) return null;
  const intraday = intradayBar(bar, symbol, tick);
  const prev = bars[dayIndex - 1] || bar;
  const prevClose = prev[4];
  return {
    symbol,
    date: bar[0],
    open: intraday.o,
    high: intraday.h,
    low: intraday.l,
    last: intraday.c,
    prevClose,
    volume: intraday.v,
    changePct: prevClose ? ((intraday.c - prevClose) / prevClose) * 100 : 0,
    bid: Math.max(0.01, Math.round((intraday.c - 0.01) * 100) / 100),
    ask: Math.round((intraday.c + 0.01) * 100) / 100,
    tick: intraday.tick,
  };
}

export function quotesAtTick(dataset, dayIndex, tick = 0) {
  const map = {};
  for (const ticker of dataset.tickers) {
    map[ticker.symbol] = quoteAtTick(dataset, ticker.symbol, dayIndex, tick);
  }
  return map;
}

export function advanceRun(run, dataset, days = 1) {
  const maxIndex = barCount(dataset) - 1;
  const nextIndex = Math.min(maxIndex, run.dayIndex + days);
  return {
    ...run,
    dayIndex: nextIndex,
    tick: 0,
    reachedEnd: nextIndex >= maxIndex,
  };
}

export function advanceToNextEvent(run, dataset, scenario) {
  const date = currentDate(dataset, run.dayIndex);
  const bars = dataset.tickers[0].bars;
  const next = scenario.events.find((event) => event.date > date);
  if (!next) return { ...run, tick: 0, reachedEnd: run.dayIndex >= barCount(dataset) - 1 };
  let index = bars.findIndex((bar) => bar[0] >= next.date);
  if (index < 0) index = barCount(dataset) - 1;
  return {
    ...run,
    dayIndex: Math.max(run.dayIndex, index),
    tick: 0,
    reachedEnd: index >= barCount(dataset) - 1,
  };
}

/** Advances one intraday tick and closes the day after the last tick. */
export function advanceHistoryTick(run, dataset) {
  const maxIndex = barCount(dataset) - 1;
  const tick = Math.max(0, Math.min(TICKS_PER_DAY - 1, Number(run.tick) || 0));
  if (run.dayIndex >= maxIndex && tick >= TICKS_PER_DAY - 1) {
    return {
      run: { ...run, tick: TICKS_PER_DAY - 1, reachedEnd: true },
      dayClosed: false,
      reachedEnd: true,
    };
  }
  if (tick + 1 >= TICKS_PER_DAY) {
    const nextDay = Math.min(maxIndex, run.dayIndex + 1);
    return {
      run: { ...run, dayIndex: nextDay, tick: 0, reachedEnd: false },
      dayClosed: true,
      reachedEnd: false,
    };
  }
  return {
    run: { ...run, tick: tick + 1, reachedEnd: false },
    dayClosed: false,
    reachedEnd: false,
  };
}

export function tradeAtClose(run, dataset, { symbol, side, qty }) {
  const quote = quoteAt(dataset, symbol, run.dayIndex);
  const ticker = tickerData(dataset, symbol);
  if (!quote || !ticker) return { ok: false, error: 'error.unknownTicker' };
  if (ticker.benchmark) return { ok: false, error: 'error.benchmarkNotTradable' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };

  const result = side === 'buy'
    ? buy(run.account, { ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick: 0 })
    : sell(run.account, { ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick: 0 });

  if (!result.ok) return result;
  return {
    ok: true,
    run: { ...run, account: result.account },
    trade: result.trade,
  };
}

export function tradeAtTick(run, dataset, { symbol, side, qty, tick = run.tick || 0 }) {
  const quote = quoteAtTick(dataset, symbol, run.dayIndex, tick);
  const ticker = tickerData(dataset, symbol);
  if (!quote || !ticker) return { ok: false, error: 'error.unknownTicker' };
  if (ticker.benchmark) return { ok: false, error: 'error.benchmarkNotTradable' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };

  const result = side === 'buy'
    ? buy(run.account, {
      ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick,
    })
    : sell(run.account, {
      ticker: symbol, qty: quantity, price: quote.last, fee: HISTORY_FEE, day: run.dayIndex, tick,
    });

  if (!result.ok) return result;
  return {
    ok: true,
    run: { ...run, account: result.account },
    trade: result.trade,
    quote,
  };
}

export function summary(run, dataset) {
  const quotes = quotesAt(dataset, run.dayIndex);
  const total = equity(run.account, quotes);
  const pnl = total - run.account.initialCash;
  const unrealized = unrealizedPnl(run.account, quotes);
  const rows = positionRows(run.account, quotes).map((row) => ({
    ...row,
    name: tickerData(dataset, row.ticker)?.name || row.ticker,
  }));
  const benchmark = dataset.tickers.find((ticker) => ticker.benchmark);
  const startIndex = Math.max(1, Number(run.startIndex) || 1);
  const startBar = benchmark?.bars?.[startIndex] || benchmark?.bars?.[0];
  const currentBar = benchmark?.bars?.[run.dayIndex];
  const benchmarkReturn = startBar && currentBar ? ((currentBar[4] - startBar[4]) / startBar[4]) * 100 : 0;
  return {
    total,
    cash: run.account.cash,
    holdings: marketValue(run.account, quotes),
    unrealized,
    realized: run.account.realizedPnl,
    fees: run.account.feesPaid,
    rows,
    pnl,
    returnPct: returnPct(run.account, quotes),
    benchmarkReturn,
    dayIndex: run.dayIndex,
    startIndex,
    date: currentDate(dataset, run.dayIndex),
    totalDays: barCount(dataset),
    reachedEnd: run.dayIndex >= barCount(dataset) - 1,
  };
}

export function summaryAtTick(run, dataset) {
  const tick = Math.max(0, Math.min(TICKS_PER_DAY - 1, Number(run.tick) || 0));
  const quotes = quotesAtTick(dataset, run.dayIndex, tick);
  const total = equity(run.account, quotes);
  const pnl = total - run.account.initialCash;
  const unrealized = unrealizedPnl(run.account, quotes);
  const rows = positionRows(run.account, quotes).map((row) => ({
    ...row,
    name: tickerData(dataset, row.ticker)?.name || row.ticker,
  }));
  const benchmark = dataset.tickers.find((ticker) => ticker.benchmark);
  const startIndex = Math.max(1, Number(run.startIndex) || 1);
  const startBar = benchmark?.bars?.[startIndex] || benchmark?.bars?.[0];
  const currentTickQuote = benchmark
    ? quoteAtTick(dataset, benchmark.symbol, run.dayIndex, tick)
    : null;
  const benchmarkReturn = startBar && currentTickQuote
    ? ((currentTickQuote.last - startBar[4]) / startBar[4]) * 100
    : 0;
  const totalDays = barCount(dataset);
  return {
    total,
    cash: run.account.cash,
    holdings: marketValue(run.account, quotes),
    unrealized,
    realized: run.account.realizedPnl,
    fees: run.account.feesPaid,
    rows,
    pnl,
    returnPct: returnPct(run.account, quotes),
    benchmarkReturn,
    dayIndex: run.dayIndex,
    startIndex,
    tick,
    date: currentDate(dataset, run.dayIndex),
    totalDays,
    reachedEnd: run.dayIndex >= totalDays - 1 && tick >= TICKS_PER_DAY - 1,
  };
}

export function localeDateText(dateText, locale) {
  if (!dateText) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${dateText}T00:00:00Z`));
  } catch {
    return dateText;
  }
}
