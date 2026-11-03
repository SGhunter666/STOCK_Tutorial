/**
 * Real Alpaca data loader tests: CSV parsing, New York time bucketing and the
 * read-only loader contract. No network or credentials are used.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import {
  parseDailyCsv, parseMinuteCsv, aggregateMinuteBars, minuteBarsForDate,
  dailyWindow, intradayDates, loadRealDaily, loadRealMinute,
} from '../js/history/realData.js';

const DAILY_CSV = `timestamp,open,high,low,close,volume,trade_count,vwap
2020-01-02T05:00:00Z,158.78,160.73,158.33,160.62,25472631,100,159.5
2020-01-03T05:00:00Z,158.32,159.94,158.06,158.62,24389239,100,159.1
2020-01-06T05:00:00Z,158.92,159.55,157.6,158.7,20123456,100,158.6
`;

const MINUTE_CSV = `timestamp,open,high,low,close,volume,trade_count,vwap
2020-03-02T14:30:00Z,100,101,99,100.5,10,2,100.2
2020-03-02T14:31:00Z,100.5,102,100,101,20,3,100.9
2020-03-02T14:32:00Z,101,101.5,100.5,101,30,4,100.99
2020-03-02T14:33:00Z,101,102,100.8,101.5,40,5,101.2
2020-03-02T14:34:00Z,101.5,102,101,102,50,6,101.8
2020-03-02T14:35:00Z,102,103,101,102.5,60,7,102.2
2020-03-02T14:36:00Z,102.5,103,102,102.8,70,8,102.5
`;

suite('Real Alpaca data');

test('daily CSV parsing keeps dates and OHLCV', () => {
  const bars = parseDailyCsv(DAILY_CSV);
  assertEqual(bars.length, 3, 'three daily bars');
  assertEqual(bars[0].date, '2020-01-02', 'first date');
  assertClose(bars[0].open, 158.78, 0.001, 'open');
  assertClose(bars[0].close, 160.62, 0.001, 'close');
  assertEqual(bars[0].volume, 25472631, 'volume');
});

test('minute CSV parsing converts UTC to New York clock', () => {
  const bars = parseMinuteCsv(MINUTE_CSV);
  assertEqual(bars.length, 7, 'seven minute bars');
  assertEqual(bars[0].time, '09:30', '09:30 New York');
  assertEqual(bars[0].minutes, 570, 'session minute');
  assertEqual(bars[6].time, '09:36', '09:36 New York');
});

test('five-minute aggregation uses clock buckets and OHLCV', () => {
  const bars = parseMinuteCsv(MINUTE_CSV);
  const candles = aggregateMinuteBars(bars, '5m');
  assertEqual(candles.length, 2, 'two five-minute buckets');
  assertEqual(candles[0].time, '09:30', 'first bucket');
  assertEqual(candles[1].time, '09:35', 'second bucket');
  assertClose(candles[0].o, 100, 0.001, 'bucket open');
  assertClose(candles[0].h, 102, 0.001, 'bucket high');
  assertClose(candles[0].l, 99, 0.001, 'bucket low');
  assertClose(candles[0].c, 102, 0.001, 'bucket close');
  assertEqual(candles[0].v, 150, 'bucket volume');
});

test('one-minute mode returns every minute without aggregation', () => {
  const bars = parseMinuteCsv(MINUTE_CSV);
  const candles = aggregateMinuteBars(bars, '1m');
  assertEqual(candles.length, bars.length, 'one candle per minute');
  assertEqual(candles[0].time, '09:30', 'label preserved');
});

test('daily windows end at the selected date', () => {
  const bars = parseDailyCsv(DAILY_CSV);
  const window = dailyWindow(bars, '2020-01-03', 2);
  assertEqual(window.length, 2, 'two candles');
  assertEqual(window[1].date, '2020-01-03', 'ends at selected date');
  const fallback = dailyWindow(bars, '2020-02-01', 2);
  assertEqual(fallback[1].date, '2020-01-06', 'falls back to the last bar');
});

test('intraday dates are limited to the downloaded minute month', () => {
  const bars = parseDailyCsv(`${DAILY_CSV}2020-03-02T05:00:00Z,160,161,159,160.5,1000,1,160.2
2020-03-31T04:00:00Z,161,162,160,161.5,1000,1,161.2
`);
  const dates = intradayDates(bars);
  assertEqual(dates.length, 2, 'two March dates');
  assertEqual(dates[0], '2020-03-02', 'first March date');
  assertEqual(dates[1], '2020-03-31', 'last March date');
  assertEqual(minuteBarsForDate(parseMinuteCsv(MINUTE_CSV), '2020-03-02').length, 7, 'day filter');
});

test('daily loader builds the expected local URL', async () => {
  let requested = '';
  const result = await loadRealDaily('MSFT', {
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, status: 200, text: async () => DAILY_CSV };
    },
  });
  assertEqual(result.length, 3, 'three bars');
  assertEqual(requested, './data/real/alpaca/2020/sip/1Day/raw/MSFT/MSFT_2020.csv', 'daily path');
});

test('minute loader builds the expected gzip URL', async () => {
  let requested = '';
  const result = await loadRealMinute('MSFT', {
    fetchImpl: async (url) => {
      requested = url;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'gzip' },
        text: async () => MINUTE_CSV,
      };
    },
  });
  assertEqual(result.length, 7, 'seven minute bars');
  assertEqual(requested, './data/real/alpaca/2020/sip/1Min/raw/regular_session/MSFT/MSFT_2020-03.csv.gz', 'minute path');
});

test('missing files and invalid symbols return locale error keys', async () => {
  let error = null;
  try {
    await loadRealDaily('MSFT', { fetchImpl: async () => ({ ok: false, status: 404 }) });
  } catch (err) {
    error = err.message;
  }
  assertEqual(error, 'realdata.error.missing', '404 error key');

  let symbolError = null;
  try {
    await loadRealDaily('../etc/passwd', { fetchImpl: async () => ({ ok: true, text: async () => '' }) });
  } catch (err) {
    symbolError = err.message;
  }
  assertEqual(symbolError, 'realdata.error.symbol', 'symbol validation');

  let dotError = null;
  try {
    await loadRealDaily('..', { fetchImpl: async () => ({ ok: true, text: async () => '' }) });
  } catch (err) {
    dotError = err.message;
  }
  assertEqual(dotError, 'realdata.error.symbol', 'dot traversal rejected');
});
