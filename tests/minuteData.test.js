/**
 * Real-minute pilot tests: manifest routing, on-demand caches, time isolation,
 * modelled fills, data-source labels, split consistency and bounded memory.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import {
  MinuteDataStore, MINUTE_SOURCES, MINUTE_TICK_TIMES, minuteTickClock, minuteTickMinute,
  monthOf, nextMonth, isMinuteCompleted, completedMinuteBars, aggregateCompletedMinutes,
  minuteCandles,
} from '../js/history/minuteData.js';
import {
  quoteAtMinute, summaryAtMinute, tradeAtMinute, minuteCandlesFor, coverageAtMinute,
  modelBidAsk, MINUTE_SPREAD_BPS, MINUTE_SLIPPAGE_BPS,
} from '../js/history/minuteReplayEngine.js';
import { createHistoryRun, applySplitsThrough } from '../js/history/replayEngine.js';
import { getHistoryScenario } from '../js/data/historyScenarios.js';
import { TICKS_PER_DAY } from '../js/market/calendar.js';

const MANIFEST_PATH = 'data/real/alpaca/minute-test/minute-manifest.json';
const ROOT = 'data/real/alpaca/minute-test';

const TICK_MINUTE_STARTS = [570, 630, 690, 750, 810, 870, 930, 959];

function clockText(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function tickEntry(index, price) {
  return {
    t: MINUTE_TICK_TIMES[index],
    mt: clockText(TICK_MINUTE_STARTS[index]),
    p: price,
    v: 100 + index,
    lag: 0,
  };
}

function tickFile(symbol, month, days) {
  return { symbol, month, tickTimes: MINUTE_TICK_TIMES, days };
}

function manifestFor(symbol, months, { days = 22, bars = 8580 } = {}) {
  const records = {};
  for (const month of months) {
    records[month] = {
      file: `ticks/${symbol}/${symbol}_${month}.json`,
      minuteFile: `sip/1Min/raw/regular_session/${symbol}/${symbol}_${month}.csv.gz`,
      tickDays: days,
      fullDays: days,
      partialDays: 0,
      ticks: days * TICKS_PER_DAY,
      minuteBars: bars,
      tickBytes: 100,
      minuteBytes: 1000,
    };
  }
  return {
    version: 1,
    scenario: '2022-hikes-minutes',
    root: ROOT,
    tickTimes: MINUTE_TICK_TIMES,
    tickMinutes: [571, 631, 691, 751, 811, 871, 931, 960],
    calendar: { start: '2022-01-03', end: '2022-12-30', days: 251, months },
    symbols: {
      [symbol]: {
        months: records,
        minuteMonths: months.length,
        minuteDays: days * months.length,
        minuteBars: bars * months.length,
      },
    },
    summary: {
      symbols: 1, tradingDays: 251, minuteMonths: months.length,
      minuteBars: bars * months.length, tickEntries: days * months.length * TICKS_PER_DAY,
      symbolDays: days * months.length, fullSymbolDays: days * months.length,
      partialSymbolDays: 0, simulatedSymbolDays: 0,
    },
  };
}

function makeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((suffix) => url.endsWith(suffix));
    if (!key) return { ok: false, status: 404, text: async () => '' };
    const payload = routes[key];
    if (typeof payload === 'function') return payload(url);
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return {
      ok: true,
      status: 200,
      headers: { get: () => (url.endsWith('.csv.gz') ? 'gzip' : null) },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    };
  };
  impl.calls = calls;
  return impl;
}

function minuteCsv(date = '2022-01-03', count = 391) {
  const lines = ['timestamp,open,high,low,close,volume,trade_count,vwap'];
  const base = Date.UTC(2022, 0, 3, 14, 30, 0); // 09:30 New York in January
  for (let index = 0; index < count; index += 1) {
    const stamp = new Date(base + index * 60000).toISOString().replace('.000', '');
    const price = 100 + index * 0.1;
    lines.push(`${stamp},${price},${price + 0.2},${price - 0.2},${price + 0.05},${100 + index},2,${price}`);
  }
  return lines.join('\n');
}

const DATASET = {
  id: 'minute-test',
  adjusted: false,
  tickers: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      sector: 'technology',
      benchmark: false,
      bars: [
        ['2022-01-03', 100, 110, 95, 105, 1000],
        ['2022-01-04', 105, 115, 100, 110, 1000],
        ['2022-01-05', 110, 120, 105, 115, 1000],
      ],
      splits: [],
    },
    {
      symbol: 'QQQ',
      name: 'QQQ',
      sector: 'technology',
      benchmark: true,
      bars: [
        ['2022-01-03', 300, 305, 295, 302, 1000],
        ['2022-01-04', 302, 308, 298, 305, 1000],
        ['2022-01-05', 305, 310, 300, 308, 1000],
      ],
      splits: [],
    },
  ],
};

function realStore(options = {}) {
  const manifest = manifestFor('NVDA', ['2022-01']);
  const routes = {
    'minute-manifest.json': manifest,
    '/NVDA_2022-01.json': tickFile('NVDA', '2022-01', {
      '2022-01-03': Array.from({ length: 8 }, (_, index) => tickEntry(index, 100.5 + index)),
    }),
    '/NVDA_2022-01.csv.gz': minuteCsv(),
  };
  return new MinuteDataStore({
    manifestPath: MANIFEST_PATH,
    root: ROOT,
    fetchImpl: makeFetch(routes),
    ...options,
  });
}

suite('Minute data store');

test('manifest loads, validates and routes tick files', async () => {
  const store = realStore();
  const manifest = await store.loadManifest();
  assertEqual(manifest.symbols.NVDA.months['2022-01'].tickDays, 22, 'month metadata');
  assertEqual(manifest.tickTimes.length, 8, 'eight tick times');
  const days = await store.ensureTickMonth('NVDA', '2022-01');
  assert(days && days['2022-01-03'], 'tick day loaded');
  const entry = store.getTick('NVDA', '2022-01-03', 0);
  assertEqual(entry.p, 100.5, '09:31 tick price');
  assertEqual(entry.mt, '09:30', 'completed minute');
  assertEqual(store.tickState('NVDA', '2022-01'), 'ready', 'ready state');
});

test('tick-only loading never fetches the full minute CSV', async () => {
  const store = realStore();
  await store.ensureTickMonth('NVDA', '2022-01');
  const stats = store.cacheStats();
  assertEqual(stats.tickFetches, 1, 'one tick index');
  assertEqual(stats.minuteFetches, 0, 'no minute CSV');
});

test('missing tick months are marked and never fabricated', async () => {
  const store = realStore();
  await store.loadManifest();
  const result = await store.ensureTickMonth('NVDA', '2022-02');
  assertEqual(result, null, 'no record');
  assertEqual(store.tickState('NVDA', '2022-02'), 'missing', 'missing state');
});

test('minute month loads lazily and is cached with a bounded LRU', async () => {
  const store = realStore({ minuteCacheLimit: 1 });
  const bars = await store.ensureMinuteMonth('NVDA', '2022-01');
  assert(bars.length >= 390, 'minute bars parsed');
  assertEqual(store.getMinuteBars('NVDA', '2022-01-03').length, 391, 'day filter');
  await store.loadManifest();
  const before = store.cacheStats().minuteMonths;
  assertEqual(before, 1, 'one cached month');
  const missing = await store.ensureMinuteMonth('NVDA', '2022-02');
  assertEqual(missing, null, 'missing month returns null');
  assertEqual(store.minuteState('NVDA', '2022-02'), 'missing', 'missing state');
  assertEqual(store.cacheStats().minuteMonths, 1, 'cache stays bounded');
});

async function assertRejects(promise, label) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error(`${label}: expected rejection`);
}

test('invalid symbols, months and dates are rejected', async () => {
  const store = realStore();
  const symbolError = await assertRejects(store.ensureTickMonth('../etc/passwd', '2022-01'), 'symbol');
  assertEqual(symbolError.message, 'minute.error.symbol', 'symbol error');
  const monthError = await assertRejects(store.ensureTickMonth('NVDA', '2022-1'), 'month');
  assertEqual(monthError.message, 'minute.error.month', 'month error');
  await store.loadManifest();
  const dateError = await assertRejects(Promise.resolve().then(
    () => store.getTick('NVDA', '2022-1-3', 0),
  ), 'date');
  assertEqual(dateError.message, 'minute.error.date', 'date error');
});

test('getTick distinguishes not-loaded, absent and present days', async () => {
  const store = realStore();
  assertEqual(store.getTick('NVDA', '2022-01-03', 0), undefined, 'month not loaded');
  await store.ensureTickMonth('NVDA', '2022-01');
  assertEqual(store.getTick('NVDA', '2022-01-04', 0), null, 'loaded month but no day');
  assert(store.getTick('NVDA', '2022-01-03', 7), 'entry present');
});

test('prefetch loads the following month without minute files', async () => {
  const store = realStore();
  const manifest = await store.loadManifest();
  manifest.symbols.NVDA.months['2022-02'] = {
    ...manifest.symbols.NVDA.months['2022-01'],
    file: 'ticks/NVDA/NVDA_2022-02.json',
    minuteFile: 'sip/1Min/raw/regular_session/NVDA/NVDA_2022-02.csv.gz',
  };
  const routes = {
    '/NVDA_2022-02.json': tickFile('NVDA', '2022-02', {
      '2022-02-01': [tickEntry(0, 200)],
    }),
  };
  store.fetchImpl = makeFetch(routes);
  await store.prefetchAround(['NVDA'], '2022-01-03');
  assertEqual(store.tickState('NVDA', '2022-02'), 'ready', 'next month prefetched');
  assertEqual(store.cacheStats().minuteFetches, 0, 'no minute fetch');
});

test('dispose aborts in-flight loads and ignores late data', async () => {
  const store = realStore();
  await store.loadManifest();
  let resolveResponse = null;
  store.fetchImpl = async () => new Promise((resolve) => { resolveResponse = resolve; });
  const pending = store.ensureTickMonth('NVDA', '2022-01');
  store.dispose();
  resolveResponse({ ok: true, text: async () => JSON.stringify(tickFile('NVDA', '2022-01', {})) });
  const error = await assertRejects(pending, 'disposed');
  assertEqual(error.message, 'minute.error.disposed', 'disposed error');
  assertEqual(store.cacheStats().tickMonths, 0, 'cache cleared');
});

suite('Minute time isolation');

test('a minute bar is completed only at or after its close', () => {
  const bar = { minutes: 570 };
  assert(!isMinuteCompleted(bar, 570), '09:30 bar is not complete at 09:30');
  assert(isMinuteCompleted(bar, 571), 'complete at 09:31');
  assertEqual(minuteTickClock(0), '09:31', 'tick 0 clock');
  assertEqual(minuteTickClock(7), '16:00', 'tick 7 clock');
  assertEqual(minuteTickMinute(7), 960, 'last tick minute');
});

test('completed bars never include a future minute', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const bars = store.getMinuteBars('NVDA', '2022-01-03');
  const atTick0 = completedMinuteBars(bars, '2022-01-03', 0);
  assertEqual(atTick0.length, 1, 'only the 09:30 minute');
  assertEqual(atTick0[0].time, '09:30', '09:30');
  const atTick1 = completedMinuteBars(bars, '2022-01-03', 1);
  assertEqual(atTick1.length, 61, '09:30 through 10:30');
  assertEqual(atTick1[atTick1.length - 1].time, '10:30', 'last completed');
});

test('5m buckets use completed minutes and mark the in-progress candle partial', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const bars = store.getMinuteBars('NVDA', '2022-01-03');
  const candles = aggregateCompletedMinutes(bars, '5m', 1);
  assertEqual(candles.length, 13, '09:30 to 10:30 buckets');
  assertEqual(candles[0].time, '09:30', 'first bucket');
  assertEqual(candles[candles.length - 1].time, '10:30', 'last bucket');
  assert(candles[candles.length - 1].partial, '10:30 bucket is partial');
  assert(!candles[0].partial, '09:30 bucket complete');
});

test('15m and 1h buckets respect the current tick boundary', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const bars = store.getMinuteBars('NVDA', '2022-01-03');
  const fifteen = aggregateCompletedMinutes(bars, '15m', 1);
  assertEqual(fifteen.length, 5, '09:30..10:30');
  assert(fifteen[fifteen.length - 1].partial, 'last 15m partial');
  const hourly = aggregateCompletedMinutes(bars, '1h', 1);
  assertEqual(hourly.length, 2, '09:30 and 10:30 buckets');
  assert(!hourly[0].partial, '09:30-10:29 bucket completed at 10:30');
  assert(hourly[1].partial, '10:30 bucket partial');
});

test('1m candles only contain closed minutes', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const bars = store.getMinuteBars('NVDA', '2022-01-03');
  const candles = minuteCandles(bars, 2);
  assertEqual(candles.length, 121, '09:30 through 11:30');
  assertEqual(candles[candles.length - 1].time, '11:30', 'last closed');
});

test('chart never reads a wild future minute', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const bars = store.getMinuteBars('NVDA', '2022-01-03');
  const wild = { ...bars[0], minutes: 631, time: '10:31', high: 9999, close: 9999 };
  const poisoned = [...bars, wild];
  const info = minuteCandlesFor(
    DATASET, { ...store, getMinuteBars: () => poisoned }, 'NVDA', 0, 1, '1m',
  );
  assertEqual(info.candles.length, 61, '61 completed minutes');
  assert(info.candles.every((candle) => candle.h < 9000), 'future high not leaked');
  assertEqual(info.source, MINUTE_SOURCES.REAL_MINUTE, 'real source');
});

suite('Minute replay engine');

test('quotes come from real completed ticks with modelled spread', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureTickMonth('NVDA', '2022-01');
  const quote = quoteAtMinute(DATASET, store, 'NVDA', 0, 1);
  assertEqual(quote.source, MINUTE_SOURCES.REAL_MINUTE, 'real minute');
  assertEqual(quote.last, 101.5, 'tick close');
  assertEqual(quote.tickTime, '10:31', 'tick clock');
  assertEqual(quote.minuteTime, '10:30', 'completed minute');
  assertEqual(quote.lagMinutes, 0, 'no lag');
  const { bid, ask } = modelBidAsk(quote.last);
  assertEqual(quote.bid, bid, 'bid');
  assertEqual(quote.ask, ask, 'ask');
  assert(quote.ask > quote.bid, 'two-sided quote');
  assert(quote.fillBuy > quote.ask, 'buy pays slippage');
  assert(quote.fillSell < quote.bid, 'sell receives less');
});

test('a missing minute day falls back to SIMULATED and stays labelled', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureTickMonth('NVDA', '2022-01');
  const quote = quoteAtMinute(DATASET, store, 'NVDA', 1, 0);
  assertEqual(quote.source, MINUTE_SOURCES.SIMULATED, 'simulated fallback');
  assertEqual(quote.reason, 'noMinute', 'reason');
  assert(quote.simulated, 'flag');
});

test('an unloaded month is UNAVAILABLE instead of silently simulated', async () => {
  const store = realStore();
  await store.loadManifest();
  const quote = quoteAtMinute(DATASET, store, 'NVDA', 0, 0);
  assertEqual(quote.source, MINUTE_SOURCES.UNAVAILABLE, 'unavailable');
  assertEqual(quote.reason, 'loading', 'loading reason');
  const trade = tradeAtMinute(createHistoryRun('minute-test'), DATASET, store, {
    symbol: 'NVDA', side: 'buy', qty: 1, tick: 0,
  });
  assert(!trade.ok, 'trade blocked');
  assertEqual(trade.error, 'error.dataUnavailable', 'error key');
});

test('buy fills at the ask plus slippage with fee and source metadata', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureTickMonth('NVDA', '2022-01');
  const run = { ...createHistoryRun('minute-test'), dayIndex: 0 };
  const result = tradeAtMinute(run, DATASET, store, { symbol: 'NVDA', side: 'buy', qty: 10 });
  assert(result.ok, 'fill ok');
  assertEqual(result.trade.dataSource, MINUTE_SOURCES.REAL_MINUTE, 'trade source');
  assertEqual(result.trade.tickTime, '09:31', 'fill tick');
  assertEqual(result.trade.minuteTime, '09:30', 'quoted minute');
  assertEqual(result.trade.fillTime, '2022-01-03 09:31 ET', 'fill timestamp');
  assertEqual(result.trade.spreadBps, MINUTE_SPREAD_BPS, 'spread metadata');
  assertEqual(result.trade.slippageBps, MINUTE_SLIPPAGE_BPS, 'slippage metadata');
  assert(result.trade.price > result.trade.quotePrice, 'buy pays up');
  assertClose(result.run.account.cash, 10000 - (10 * result.trade.price) - 1, 0.001, 'cash');
});

test('sell fills at the bid minus slippage', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureTickMonth('NVDA', '2022-01');
  let run = { ...createHistoryRun('minute-test'), dayIndex: 0 };
  run = tradeAtMinute(run, DATASET, store, { symbol: 'NVDA', side: 'buy', qty: 10 }).run;
  const result = tradeAtMinute(run, DATASET, store, {
    symbol: 'NVDA', side: 'sell', qty: 5, tick: 0,
  });
  assert(result.ok, 'sell ok');
  assert(result.trade.price < result.trade.quotePrice, 'sell receives less');
  assert(result.trade.realized < 0, 'round trip loses spread and slippage');
  assertEqual(result.trade.dataSource, MINUTE_SOURCES.REAL_MINUTE, 'sell source');
});

test('summary reports real, simulated and unavailable counts', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureSymbolsMonth(['NVDA', 'QQQ'], '2022-01');
  const run = { ...createHistoryRun('minute-test'), dayIndex: 1, tick: 0 };
  const sum = summaryAtMinute(run, DATASET, store);
  assertEqual(sum.sourceCounts.REAL_MINUTE, 0, 'no real on missing day');
  assertEqual(sum.sourceCounts.SIMULATED, 2, 'both symbols simulated');
  assertEqual(sum.date, '2022-01-04', 'date');
  assertEqual(sum.tickTime, '09:31', 'minute tick clock');
  const coverage = coverageAtMinute(DATASET, store, 0, 0);
  assertEqual(coverage.counts.REAL_MINUTE, 1, 'NVDA real');
  assertEqual(coverage.symbols, 1, 'benchmark excluded');
});

test('raw split prices and minute prices stay consistent with cost basis', async () => {
  const splitDataset = {
    tickers: [
      {
        symbol: 'AMZN',
        name: 'Amazon',
        sector: 'discretionary',
        benchmark: false,
        bars: [
          ['2022-06-03', 2448, 2450, 2400, 2440, 1000],
          ['2022-06-06', 122.4, 125, 121, 124, 1000],
        ],
        splits: [{ date: '2022-06-06', ratio: 20, from: 1, to: 20 }],
        otherActions: [],
      },
    ],
  };
  const store = new MinuteDataStore({
    manifestPath: MANIFEST_PATH,
    root: ROOT,
    fetchImpl: makeFetch({
      'minute-manifest.json': {
        ...manifestFor('AMZN', ['2022-06']),
        symbols: {
          AMZN: manifestFor('AMZN', ['2022-06']).symbols.AMZN,
        },
      },
      '/AMZN_2022-06.json': tickFile('AMZN', '2022-06', {
        '2022-06-03': [tickEntry(0, 2440)],
        '2022-06-06': [tickEntry(0, 122.5)],
      }),
    }),
  });
  await store.loadManifest();
  await store.ensureTickMonth('AMZN', '2022-06');
  let run = createHistoryRun('split-minute');
  run = tradeAtMinute({ ...run, dayIndex: 0 }, splitDataset, store, {
    symbol: 'AMZN', side: 'buy', qty: 1,
  }).run;
  const cashBefore = run.account.cash;
  const adjusted = applySplitsThrough({ ...run, dayIndex: 1 }, splitDataset, 1);
  assertEqual(adjusted.account.positions.AMZN.qty, 20, 'twenty post-split shares');
  assertClose(adjusted.account.positions.AMZN.costBasis, run.account.positions.AMZN.costBasis, 0.001, 'cost basis unchanged');
  assertEqual(adjusted.account.cash, cashBefore, 'no duplicate cash adjustment');
  const quote = quoteAtMinute(splitDataset, store, 'AMZN', 1, 0);
  assertEqual(quote.source, MINUTE_SOURCES.REAL_MINUTE, 'post-split minute');
  assertClose(quote.last, 122.5, 0.001, 'post-split price');
  const again = applySplitsThrough(adjusted, splitDataset, 1);
  assertEqual(again.account.positions.AMZN.qty, 20, 'split applied once');
});

test('daily candles build the current session from completed minutes', async () => {
  const store = realStore();
  await store.loadManifest();
  await store.ensureMinuteMonth('NVDA', '2022-01');
  const info = minuteCandlesFor(DATASET, store, 'NVDA', 0, 0, '1d');
  assertEqual(info.candles.length, 1, 'current day only');
  assertEqual(info.source, MINUTE_SOURCES.REAL_MINUTE, 'real source');
  assertEqual(info.candles[0].o, 100, '09:30 open');
  assertEqual(info.candles[0].c, 100.05, '09:30 close');
});

suite('Minute performance');

test('rolling caches stay bounded across a full year of replay', async () => {
  const months = Array.from({ length: 12 }, (_, index) => `2022-${String(index + 1).padStart(2, '0')}`);
  const symbols = Array.from({ length: 20 }, (_, index) => `S${index}`);
  const manifest = {
    version: 1,
    root: ROOT,
    tickTimes: MINUTE_TICK_TIMES,
    symbols: {},
    summary: { symbols: 20, tradingDays: 251, minuteBars: 0 },
  };
  for (const symbol of symbols) {
    manifest.symbols[symbol] = {
      months: Object.fromEntries(months.map((month) => [month, {
        file: `ticks/${symbol}/${symbol}_${month}.json`,
        minuteFile: `sip/1Min/raw/regular_session/${symbol}/${symbol}_${month}.csv.gz`,
        tickDays: 21,
        minuteBars: 8190,
      }])),
      minuteMonths: 12,
    };
  }
  const fetchImpl = async (url) => {
    if (url.endsWith('minute-manifest.json')) {
      return { ok: true, text: async () => JSON.stringify(manifest), headers: { get: () => null } };
    }
    if (url.endsWith('.json')) {
      const match = url.match(/\/([A-Z0-9]+)\/([A-Z0-9]+)_(\d{4}-\d{2})\.json$/);
      return {
        ok: true,
        text: async () => JSON.stringify({
          symbol: match ? match[2] : 'S0',
          month: match ? match[3] : '2022-01',
          days: {},
        }),
        headers: { get: () => null },
      };
    }
    if (url.endsWith('.csv.gz')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'gzip' },
        text: async () => 'timestamp,open,high,low,close,volume,trade_count,vwap\n',
      };
    }
    return { ok: true, status: 404, text: async () => '' };
  };
  const store = new MinuteDataStore({
    manifestPath: MANIFEST_PATH,
    root: ROOT,
    fetchImpl,
    tickCacheLimit: 4,
    minuteCacheLimit: 2,
  });
  await store.loadManifest();
  for (const month of months) {
    await store.ensureSymbolsMonth(symbols, month);
    await store.ensureMinuteMonth('S0', month);
  }
  const stats = store.cacheStats();
  assert(stats.tickMonths <= 4, `tick cache bounded (${stats.tickMonths})`);
  assert(stats.minuteMonths <= 2, `minute cache bounded (${stats.minuteMonths})`);
  assertEqual(stats.tickFetches, 20 * 12, 'tick fetch count');
  assert(stats.bytesLoaded > 0, 'bytes tracked');
  assert(store.monthStates.size <= 20, 'ready state entries are not retained');
  store.dispose();
});

suite('2022 minute scenario metadata');

test('the pilot scenario reuses the 2022 events with 20 core names', () => {
  const scenario = getHistoryScenario('2022-hikes-minutes');
  assert(scenario, 'scenario exists');
  assertEqual(scenario.symbols.length, 21, '20 names plus QQQ');
  assertEqual(scenario.events.length, 11, '2022 events');
  assertEqual(scenario.approxDays, 251, 'trading days');
  assertEqual(scenario.minuteDataPath, 'data/real/alpaca/2022-pilot/minute-manifest.json', 'minute manifest');
  assertEqual(scenario.realDataPath, 'data/real/alpaca/2022-pilot/history.json', 'raw daily path');
  assertEqual(scenario.badgeKey, 'history.minuteBadge', 'badge');
  assertEqual(monthOf('2022-06-06'), '2022-06', 'month helper');
  assertEqual(nextMonth('2022-12'), '2023-01', 'next month');
});

test('the local 2022 pilot files agree when installed', async () => {
  const response = await fetch('../data/real/alpaca/2022-pilot/history.json');
  if (!response.ok) {
    console.warn('[minute] 2022 pilot data is not installed; skipping data assertions');
    return;
  }
  const dataset = await response.json();
  assertEqual(dataset.id, '2022-hikes-minutes', 'dataset id');
  assertEqual(dataset.adjusted, false, 'raw prices');
  assertEqual(dataset.tickers.length, 21, '21 tickers');
  assert(dataset.tickers.every((ticker) => ticker.bars.length === 251), 'aligned daily bars');
  const splits = {
    AMZN: 20, DXCM: 4, NDAQ: 3, TSLA: 3,
  };
  for (const [symbol, ratio] of Object.entries(splits)) {
    const ticker = dataset.tickers.find((entry) => entry.symbol === symbol);
    assert(ticker, `${symbol} present`);
    assert(ticker.splits.some((split) => split.ratio === ratio), `${symbol} ${ratio}:1 split`);
  }
  const manifestResponse = await fetch('../data/real/alpaca/2022-pilot/minute-manifest.json');
  assert(manifestResponse.ok, 'minute manifest installed');
  const manifest = await manifestResponse.json();
  assertEqual(manifest.summary.symbols, 20, '20 minute symbols');
  assertEqual(manifest.summary.tradingDays, 251, '251 sessions');
  assert(manifest.summary.minuteBars > 1000000, 'at least one million real minute bars');
  assertEqual(manifest.tickTimes.length, 8, 'eight ticks');
  for (const symbol of Object.keys(manifest.symbols)) {
    assert(manifest.symbols[symbol].minuteDays > 0, `${symbol} has real ticks`);
  }
});
