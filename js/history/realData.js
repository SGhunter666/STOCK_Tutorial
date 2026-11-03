/**
 * Read-only loader for the locally downloaded Alpaca SIP dataset.
 * The viewer never trades or mutates the account; it only reads CSV files under
 * data/real/alpaca/2020 and renders the actual, unadjusted historical prices.
 */
export const REAL_DATA_ROOT = './data/real/alpaca/2020';
export const REAL_DATA_MONTH = '2020-03';
export const REAL_DATA_YEAR = '2020';

const SYMBOL_PATTERN = /^[A-Z0-9.^-]{1,16}$/;
const MONTH_PATTERN = /^[0-9]{4}-[0-9]{2}$/;
const NY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function clockText(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function nyClock(timestamp) {
  const parts = NY_FORMAT.formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute, minutes: hour * 60 + minute, time: clockText(hour * 60 + minute) };
}

function validOhlc(open, high, low, close, volume) {
  return Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low)
    && Number.isFinite(close) && Number.isFinite(volume)
    && open > 0 && high > 0 && low > 0 && close > 0
    && volume >= 0
    && high >= Math.max(open, low, close)
    && low <= Math.min(open, high, close);
}

export function parseDailyCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const bars = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(',');
    if (cells.length < 6) continue;
    const timestamp = cells[0];
    const open = Number(cells[1]);
    const high = Number(cells[2]);
    const low = Number(cells[3]);
    const close = Number(cells[4]);
    const volume = Number(cells[5]);
    if (!timestamp || !validOhlc(open, high, low, close, volume)) continue;
    bars.push({
      date: timestamp.slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

export function parseMinuteCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const bars = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(',');
    if (cells.length < 6) continue;
    const timestamp = cells[0];
    const clock = nyClock(timestamp);
    const open = Number(cells[1]);
    const high = Number(cells[2]);
    const low = Number(cells[3]);
    const close = Number(cells[4]);
    const volume = Number(cells[5]);
    if (!clock || !validOhlc(open, high, low, close, volume)) continue;
    bars.push({
      timestamp,
      date: timestamp.slice(0, 10),
      time: clock.time,
      minutes: clock.minutes,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return bars;
}

/** One-minute bars for a single trading day. */
export function minuteBarsForDate(bars, date) {
  return (bars || []).filter((bar) => bar.date === date);
}

/**
 * Aggregates one-minute bars into 5m / 15m / 1h candles using New York clock
 * buckets, so missing minutes do not shift every later bucket.
 */
export function aggregateMinuteBars(bars, timeframe) {
  const size = { '5m': 5, '15m': 15, '1h': 60 }[timeframe];
  if (!size) return (bars || []).map((bar) => ({
    d: bar.date,
    time: bar.time,
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: bar.volume,
  }));

  const groups = new Map();
  for (const bar of bars || []) {
    const sessionMinute = bar.minutes - 570;
    if (sessionMinute < 0) continue;
    const bucket = Math.floor(sessionMinute / size) * size + 570;
    const key = `${bar.date}|${bucket}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        d: bar.date,
        time: clockText(bucket),
        bucket,
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume,
      });
    } else {
      group.h = Math.max(group.h, bar.high);
      group.l = Math.min(group.l, bar.low);
      group.c = bar.close;
      group.v += bar.volume;
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.bucket - b.bucket)
    .map(({ bucket, ...candle }) => candle);
}

/** Daily bars ending at `endDate`, limited to `count` candles for the chart. */
export function dailyWindow(bars, endDate, count = 120) {
  const list = bars || [];
  if (!list.length) return [];
  const endIndex = list.findIndex((bar) => bar.date === endDate);
  const end = endIndex >= 0 ? endIndex : list.length - 1;
  const start = Math.max(0, end - Math.max(1, count) + 1);
  return list.slice(start, end + 1);
}

export function intradayDates(dailyBars, month = REAL_DATA_MONTH) {
  return (dailyBars || [])
    .filter((bar) => bar.date.startsWith(month))
    .map((bar) => bar.date);
}

function safeSymbol(symbol) {
  const value = String(symbol || '').toUpperCase();
  if (!SYMBOL_PATTERN.test(value) || value.includes('..') || value.startsWith('.') || value.endsWith('.')) {
    throw new Error('realdata.error.symbol');
  }
  return value;
}

export async function loadRealDaily(symbol, { fetchImpl = fetch } = {}) {
  const ticker = safeSymbol(symbol);
  const url = `${REAL_DATA_ROOT}/sip/1Day/raw/${ticker}/${ticker}_${REAL_DATA_YEAR}.csv`;
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response || !response.ok) {
    throw new Error(response && response.status === 404 ? 'realdata.error.missing' : 'realdata.error.fetch');
  }
  return parseDailyCsv(await response.text());
}

async function readGzipText(response) {
  if (response.headers && response.headers.get('content-encoding') === 'gzip') {
    return response.text();
  }
  if (typeof DecompressionStream !== 'function') throw new Error('realdata.error.gzipUnsupported');
  const buffer = await response.arrayBuffer();
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function loadRealMinute(symbol, { fetchImpl = fetch, month = REAL_DATA_MONTH } = {}) {
  const ticker = safeSymbol(symbol);
  const period = String(month || REAL_DATA_MONTH);
  if (!MONTH_PATTERN.test(period)) throw new Error('realdata.error.month');
  const url = `${REAL_DATA_ROOT}/sip/1Min/raw/regular_session/${ticker}/${ticker}_${period}.csv.gz`;
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response || !response.ok) {
    throw new Error(response && response.status === 404 ? 'realdata.error.missing' : 'realdata.error.fetch');
  }
  return parseMinuteCsv(await readGzipText(response));
}
