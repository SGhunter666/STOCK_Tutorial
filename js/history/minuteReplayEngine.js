/**
 * Real-minute replay engine for the 2022 pilot.
 *
 * Prices come from a real one-minute bar that finished at or before the current
 * tick. When the minute file for a day is absent the engine falls back to the
 * deterministic daily path, but every quote, trade and chart carries an explicit
 * REAL_MINUTE / SIMULATED / UNAVAILABLE source. Trades use a modelled spread and
 * slippage because OHLCV cannot reconstruct the actual order book or prints.
 */
import {
  buy, sell, equity, marketValue, unrealizedPnl, positionRows, returnPct,
} from '../trading/account.js';
import {
  HISTORY_FEE, barsFor, barCount, tickerData, currentDate, intradayPath,
  aggregateByPeriod,
} from './replayEngine.js';
import {
  MINUTE_SOURCES, MINUTE_TICK_TIMES, MINUTES_PER_SESSION, minuteStepClock, minuteStepMinute,
  hourTickNumber, monthOf, aggregateCompletedMinutes, minuteCandles, isMinuteCompleted,
} from './minuteData.js';

export const MINUTE_SPREAD_BPS = 2;
export const MINUTE_SLIPPAGE_BPS = 5;

const SOURCE = MINUTE_SOURCES;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clockText(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function halfSpread(price) {
  return Math.max(0.01, round(Math.max(0, price) * (MINUTE_SPREAD_BPS / 2) / 10000, 2));
}

export function modelBidAsk(price) {
  const half = halfSpread(price);
  return {
    bid: Math.max(0.01, round(price - half)),
    ask: round(price + half),
  };
}

function applySlippage(price, side) {
  const slip = Math.max(0.01, round(price * MINUTE_SLIPPAGE_BPS / 10000, 2));
  return {
    slip,
    price: side === 'buy' ? round(price + slip) : Math.max(0.01, round(price - slip)),
  };
}

function prevCloseAt(dataset, symbol, dayIndex) {
  const bars = barsFor(dataset, symbol);
  for (let index = dayIndex - 1; index >= 0; index -= 1) {
    const bar = bars[index];
    if (bar && Number.isFinite(bar[4])) return bar[4];
  }
  return null;
}

function fallbackPrice(bars, dayIndex) {
  if (bars[dayIndex] && Number.isFinite(bars[dayIndex][1])) return bars[dayIndex][1];
  for (let index = dayIndex - 1; index >= 0; index -= 1) {
    if (bars[index] && Number.isFinite(bars[index][4])) return bars[index][4];
  }
  return 0;
}

/**
 * Smooth deterministic 390-step path from the real daily OHLC. Used only when a
 * session has no real minute, always labelled SIMULATED.
 */
function simulatedStepPath(bar, symbol) {
  const anchors = intradayPath(bar, symbol);
  const path = [];
  for (let step = 0; step < MINUTES_PER_SESSION; step += 1) {
    const position = (step / (MINUTES_PER_SESSION - 1)) * (anchors.length - 1);
    const left = Math.floor(position);
    const right = Math.min(anchors.length - 1, left + 1);
    const ratio = position - left;
    path.push(anchors[left] + (anchors[right] - anchors[left]) * ratio);
  }
  return path;
}

/**
 * Quote for one symbol at one minute step (0 = 09:30, 389 = 15:59).
 * `source` is never hidden: if the month index has not loaded the quote is
 * UNAVAILABLE rather than silently simulated.
 */
export function quoteAtMinute(dataset, store, symbol, dayIndex, step = 0) {
  const ticker = tickerData(dataset, symbol);
  const bars = barsFor(dataset, symbol);
  if (!ticker || !bars.length) return null;
  const bar = bars[dayIndex];
  const date = bar ? bar[0] : currentDate(dataset, dayIndex);
  const index = Math.max(0, Math.min(MINUTES_PER_SESSION - 1, Number(step) || 0));
  const tickTime = minuteStepClock(index);
  const prevClose = prevCloseAt(dataset, symbol, dayIndex);
  const fallback = fallbackPrice(bars, dayIndex);
  const state = date ? store.minuteIndexState(symbol, monthOf(date)) : 'idle';
  const entry = date ? store.getMinutePrice(symbol, date, index) : null;

  let last = fallback;
  let source = SOURCE.UNAVAILABLE;
  let reason = '';
  let minuteTime = '';
  let lagMinutes = 0;

  if (entry) {
    last = entry.p;
    source = SOURCE.REAL_MINUTE;
    minuteTime = entry.minuteTime || '';
    lagMinutes = Number(entry.lag) || 0;
  } else if (!bar) {
    reason = 'missingBar';
  } else if (state === 'missing' || state === 'ready') {
    last = simulatedStepPath(bar, symbol)[index];
    source = SOURCE.SIMULATED;
    reason = 'noMinute';
    minuteTime = tickTime;
  } else {
    reason = 'loading';
  }

  const { bid, ask } = modelBidAsk(last);
  const changePct = prevClose ? ((last - prevClose) / prevClose) * 100 : 0;
  return {
    symbol,
    date,
    tick: index,
    step: index,
    tickTime,
    minuteTime,
    lagMinutes,
    volume: 0,
    last: round(last, 4),
    prevClose,
    changePct,
    bid,
    ask,
    source,
    reason,
    simulated: source === SOURCE.SIMULATED,
    fillBuy: applySlippage(ask, 'buy').price,
    fillSell: applySlippage(bid, 'sell').price,
    slippage: applySlippage(ask, 'buy').slip,
    loading: state === 'loading',
  };
}

export function quotesAtMinute(dataset, store, dayIndex, tick = 0) {
  const map = {};
  for (const ticker of dataset.tickers) {
    map[ticker.symbol] = quoteAtMinute(dataset, store, ticker.symbol, dayIndex, tick);
  }
  return map;
}

export function sourceCounts(quotes) {
  const counts = { REAL_MINUTE: 0, SIMULATED: 0, UNAVAILABLE: 0 };
  for (const quote of Object.values(quotes || {})) {
    if (!quote) continue;
    counts[quote.source] = (counts[quote.source] || 0) + 1;
  }
  return counts;
}

function benchmarkReturnAt(dataset, store, run) {
  const benchmark = dataset.tickers.find((ticker) => ticker.benchmark);
  if (!benchmark) return 0;
  const startIndex = Math.max(1, Number(run.startIndex) || 1);
  const startBar = benchmark.bars[startIndex] || benchmark.bars[0];
  const quote = quoteAtMinute(dataset, store, benchmark.symbol, run.dayIndex, run.tick || 0);
  return startBar && quote && Number.isFinite(startBar[4])
    ? ((quote.last - startBar[4]) / startBar[4]) * 100
    : 0;
}

export function summaryAtMinute(run, dataset, store) {
  const tick = Math.max(0, Math.min(MINUTES_PER_SESSION - 1, Number(run.tick) || 0));
  const quotes = quotesAtMinute(dataset, store, run.dayIndex, tick);
  const total = equity(run.account, quotes);
  const rows = positionRows(run.account, quotes).map((row) => ({
    ...row,
    name: tickerData(dataset, row.ticker)?.name || row.ticker,
    source: quotes[row.ticker]?.source || SOURCE.UNAVAILABLE,
  }));
  const tradableQuotes = Object.fromEntries(Object.entries(quotes).filter(
    ([symbol]) => !tickerData(dataset, symbol)?.benchmark,
  ));
  const totalDays = barCount(dataset);
  return {
    total,
    cash: run.account.cash,
    holdings: marketValue(run.account, quotes),
    unrealized: unrealizedPnl(run.account, quotes),
    realized: run.account.realizedPnl,
    fees: run.account.feesPaid,
    rows,
    pnl: total - run.account.initialCash,
    returnPct: returnPct(run.account, quotes),
    benchmarkReturn: benchmarkReturnAt(dataset, store, run),
    dayIndex: run.dayIndex,
    startIndex: Math.max(1, Number(run.startIndex) || 1),
    tick,
    step: tick,
    tickTime: minuteStepClock(tick),
    totalSteps: MINUTES_PER_SESSION,
    hourTick: hourTickNumber(tick),
    date: currentDate(dataset, run.dayIndex),
    totalDays,
    sourceCounts: sourceCounts(tradableQuotes),
    splitEvents: run.lastSplitEvents || [],
    reachedEnd: run.dayIndex >= totalDays - 1 && tick >= MINUTES_PER_SESSION - 1,
  };
}

export function tradeAtMinute(run, dataset, store, { symbol, side, qty, tick = run.tick || 0 }) {
  const index = Math.max(0, Math.min(MINUTES_PER_SESSION - 1, Number(tick) || 0));
  const quote = quoteAtMinute(dataset, store, symbol, run.dayIndex, index);
  const ticker = tickerData(dataset, symbol);
  if (!quote || !ticker) return { ok: false, error: 'error.unknownTicker' };
  if (quote.source === SOURCE.UNAVAILABLE) {
    return { ok: false, error: 'error.dataUnavailable', quote };
  }
  if (ticker.benchmark) return { ok: false, error: 'error.benchmarkNotTradable' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (side !== 'buy' && side !== 'sell') return { ok: false, error: 'error.sideInvalid' };

  const price = side === 'buy' ? quote.fillBuy : quote.fillSell;
  const meta = {
    dataSource: quote.source,
    tickTime: quote.tickTime,
    fillTime: `${quote.date} ${quote.tickTime} ET`,
    quotePrice: quote.last,
    bid: quote.bid,
    ask: quote.ask,
    spreadBps: MINUTE_SPREAD_BPS,
    slippageBps: MINUTE_SLIPPAGE_BPS,
    quoteLagMinutes: quote.lagMinutes,
    minuteTime: quote.minuteTime,
    simulated: quote.source === SOURCE.SIMULATED,
  };
  const result = side === 'buy'
    ? buy(run.account, {
      ticker: symbol, qty: quantity, price, fee: HISTORY_FEE, day: run.dayIndex, tick: index, meta,
    })
    : sell(run.account, {
      ticker: symbol, qty: quantity, price, fee: HISTORY_FEE, day: run.dayIndex, tick: index, meta,
    });
  if (!result.ok) return result;
  return {
    ok: true,
    run: { ...run, account: result.account },
    trade: result.trade,
    quote,
  };
}

function simulatedStepCandles(bar, symbol, step, timeframe) {
  const path = simulatedStepPath(bar, symbol);
  const size = { '5m': 5, '15m': 15, '1h': 60 }[timeframe] || 5;
  const five = [];
  for (let start = 0; start <= step; start += 5) {
    const group = path.slice(start, Math.min(start + 5, step + 1));
    five.push({
      d: bar[0],
      time: clockText(570 + start),
      bucket: 570 + start,
      o: group[0],
      h: Math.max(...group),
      l: Math.min(...group),
      c: group[group.length - 1],
      v: Math.round(((bar[5] || 0) / 78) * (group.length / 5)),
      partial: group.length < 5,
      count: group.length,
    });
  }
  if (timeframe === '5m') return five.map(({ bucket, count, ...candle }) => candle);
  const factor = size / 5;
  const out = [];
  for (let index = 0; index < five.length; index += factor) {
    const group = five.slice(index, index + factor);
    const partial = group.some((candle) => candle.partial);
    out.push({
      d: bar[0],
      time: group[0].time,
      o: group[0].o,
      h: Math.max(...group.map((candle) => candle.h)),
      l: Math.min(...group.map((candle) => candle.l)),
      c: group[group.length - 1].c,
      v: group.reduce((sum, candle) => sum + candle.v, 0),
      partial,
    });
  }
  return out;
}

function currentDayCandle(dataset, store, symbol, dayIndex, step) {
  const bar = barsFor(dataset, symbol)[dayIndex];
  if (!bar) return { candle: null, source: SOURCE.UNAVAILABLE, reason: 'missingBar' };
  const date = bar[0];
  const state = store.minuteIndexState(symbol, monthOf(date));
  const bars = store.getMinuteBars(symbol, date);
  const completed = (bars || []).filter((item) => isMinuteCompleted(item, minuteStepMinute(step)));
  if (completed.length) {
    return {
      candle: {
        d: date,
        end: date,
        o: completed[0].open,
        h: Math.max(...completed.map((item) => item.high)),
        l: Math.min(...completed.map((item) => item.low)),
        c: completed[completed.length - 1].close,
        v: completed.reduce((sum, item) => sum + (item.volume || 0), 0),
      },
      source: SOURCE.REAL_MINUTE,
    };
  }
  if (state === 'missing' || state === 'ready') {
    const path = simulatedStepPath(bar, symbol);
    const visible = path.slice(0, step + 1);
    return {
      candle: {
        d: date,
        end: date,
        o: path[0],
        h: Math.max(...visible),
        l: Math.min(...visible),
        c: path[step],
        v: Math.round(((bar[5] || 0) * (step + 1)) / MINUTES_PER_SESSION),
      },
      source: SOURCE.SIMULATED,
      reason: 'noMinute',
    };
  }
  return { candle: null, source: SOURCE.UNAVAILABLE, reason: 'loading' };
}

/**
 * Candles limited to data that has already finished at the current minute step.
 * 1m returns only completed real minutes. 5m/15m/1h aggregate completed minutes
 * and mark the in-progress bucket partial. Daily and longer reuse real raw bars
 * plus a current-day candle built from completed minutes.
 */
export function minuteCandlesFor(dataset, store, symbol, dayIndex, step, timeframe, currentPrice) {
  const index = Math.max(0, Math.min(MINUTES_PER_SESSION - 1, Number(step) || 0));
  const bars = barsFor(dataset, symbol);
  if (!bars.length) return { candles: [], labels: [], intraday: false, source: SOURCE.UNAVAILABLE };
  const bar = bars[dayIndex];
  const date = bar ? bar[0] : '';

  if (timeframe === '1m' || timeframe === '5m' || timeframe === '15m' || timeframe === '1h') {
    const minuteBars = store.getMinuteBars(symbol, date);
    if (minuteBars && minuteBars.length) {
      const candles = timeframe === '1m'
        ? minuteCandles(minuteBars, index)
        : aggregateCompletedMinutes(minuteBars, timeframe, index);
      const labels = candles.length
        ? [candles[0].time, candles[candles.length - 1].time]
        : ['09:30', minuteStepClock(index)];
      return {
        candles,
        labels,
        intraday: true,
        source: SOURCE.REAL_MINUTE,
        partial: Boolean(candles[candles.length - 1]?.partial),
      };
    }
    const state = date ? store.minuteIndexState(symbol, monthOf(date)) : 'idle';
    if (timeframe !== '1m' && bar && (state === 'missing' || state === 'ready')) {
      const candles = simulatedStepCandles(bar, symbol, index, timeframe);
      return {
        candles,
        labels: [candles[0]?.time || '09:30', minuteStepClock(index)],
        intraday: true,
        source: SOURCE.SIMULATED,
        partial: true,
        reason: 'noMinute',
      };
    }
    return {
      candles: [],
      labels: ['09:30', minuteStepClock(index)],
      intraday: true,
      source: state === 'missing' || state === 'ready' ? SOURCE.SIMULATED : SOURCE.UNAVAILABLE,
      reason: 'noMinute',
    };
  }

  const completed = bars.slice(0, dayIndex).map(([day, open, high, low, close, volume]) => ({
    d: day, end: day, o: open, h: high, l: low, c: close, v: volume,
  }));
  const current = currentDayCandle(dataset, store, symbol, dayIndex, index);
  if (current.candle) completed.push(current.candle);
  const candles = timeframe === '1d' ? completed : aggregateByPeriod(completed, timeframe);
  return {
    candles,
    labels: [candles[0]?.d || '', candles[candles.length - 1]?.end || candles[candles.length - 1]?.d || ''],
    intraday: false,
    source: current.source,
  };
}

export function coverageAtMinute(dataset, store, dayIndex, step = 0) {
  const index = Math.max(0, Math.min(MINUTES_PER_SESSION - 1, Number(step) || 0));
  const quotes = quotesAtMinute(dataset, store, dayIndex, index);
  const date = currentDate(dataset, dayIndex);
  const symbols = Object.keys(quotes).filter((symbol) => {
    const ticker = tickerData(dataset, symbol);
    return ticker && !ticker.benchmark;
  });
  const tradableQuotes = Object.fromEntries(symbols.map((symbol) => [symbol, quotes[symbol]]));
  return {
    date,
    tick: index,
    tickTime: minuteStepClock(index),
    hourTick: hourTickNumber(index),
    counts: sourceCounts(tradableQuotes),
    symbols: symbols.length,
    realSymbols: symbols.filter((symbol) => quotes[symbol]?.source === SOURCE.REAL_MINUTE),
    simulatedSymbols: symbols.filter((symbol) => quotes[symbol]?.source === SOURCE.SIMULATED),
    loadingSymbols: symbols.filter((symbol) => quotes[symbol]?.source === SOURCE.UNAVAILABLE),
    tickTimes: MINUTE_TICK_TIMES,
  };
}
