/**
 * On-demand loader for the local real-minute pilot dataset.
 *
 * Only tick indexes (eight completed prices per day) are prefetched per month.
 * Full one-minute CSVs are fetched only for the selected symbol and month, kept
 * in a small LRU cache, and never loaded in bulk. Every visible tick is checked
 * against the simulated clock so a bar that ends after the tick cannot leak in.
 */
import { parseMinuteCsv } from './realData.js';

export const MINUTE_SOURCES = Object.freeze({
  REAL_MINUTE: 'REAL_MINUTE',
  SIMULATED: 'SIMULATED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const MINUTE_TICK_TIMES = Object.freeze([
  '09:31', '10:31', '11:31', '12:31', '13:31', '14:31', '15:31', '16:00',
]);
export const MINUTE_TICK_MINUTES = Object.freeze([
  571, 631, 691, 751, 811, 871, 931, 960,
]);

const SYMBOL_PATTERN = /^[A-Z0-9.^-]{1,16}$/;
const MONTH_PATTERN = /^[0-9]{4}-[0-9]{2}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function minuteTickClock(tick) {
  return MINUTE_TICK_TIMES[Math.max(0, Math.min(MINUTE_TICK_TIMES.length - 1, Number(tick) || 0))];
}

export function minuteTickMinute(tick) {
  return MINUTE_TICK_MINUTES[Math.max(0, Math.min(MINUTE_TICK_MINUTES.length - 1, Number(tick) || 0))];
}

export function monthOf(date) {
  return String(date || '').slice(0, 7);
}

export function nextMonth(month) {
  const [year, index] = String(month || '').split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(index)) return '';
  return index >= 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}

/** A minute bar is only usable when its close time is at or before the tick. */
export function isMinuteCompleted(bar, tickMinute) {
  return Boolean(bar) && Number.isFinite(bar.minutes) && bar.minutes + 1 <= tickMinute;
}

export function completedMinuteBars(bars, date, tick) {
  const cutoff = minuteTickMinute(tick);
  return (bars || []).filter((bar) => bar.date === date && isMinuteCompleted(bar, cutoff));
}

function clockText(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Aggregates completed minutes into New York clock buckets anchored at 09:30.
 * The bucket containing the current tick is returned as a partial candle built
 * only from minutes that have already finished.
 */
export function aggregateCompletedMinutes(bars, timeframe, tick) {
  const size = { '5m': 5, '15m': 15, '1h': 60 }[timeframe];
  if (!size) {
    return (bars || []).map((bar) => ({
      d: bar.date,
      time: bar.time,
      bucket: bar.minutes,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
      partial: false,
    }));
  }
  const cutoff = minuteTickMinute(tick);
  const groups = new Map();
  for (const bar of bars || []) {
    if (!isMinuteCompleted(bar, cutoff)) continue;
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
        partial: bucket + size > cutoff,
      });
    } else {
      group.h = Math.max(group.h, bar.high);
      group.l = Math.min(group.l, bar.low);
      group.c = bar.close;
      group.v += bar.volume;
    }
  }
  return [...groups.values()].sort((a, b) => a.bucket - b.bucket);
}

/** One-minutes bars that finished at or before the current tick. */
export function minuteCandles(bars, tick) {
  const cutoff = minuteTickMinute(tick);
  return (bars || [])
    .filter((bar) => isMinuteCompleted(bar, cutoff))
    .map((bar) => ({
      d: bar.date,
      time: bar.time,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    }));
}

function safeSymbol(symbol) {
  const value = String(symbol || '').toUpperCase();
  if (!SYMBOL_PATTERN.test(value) || value.includes('..') || value.startsWith('.') || value.endsWith('.')) {
    throw new Error('minute.error.symbol');
  }
  return value;
}

function safeMonth(month) {
  const value = String(month || '');
  if (!MONTH_PATTERN.test(value)) throw new Error('minute.error.month');
  return value;
}

function safeRelativePath(path) {
  const value = String(path || '');
  if (!value || value.startsWith('/') || value.includes('..') || value.includes('\\')) {
    throw new Error('minute.error.path');
  }
  return value;
}

function safeDate(date) {
  const value = String(date || '');
  if (!DATE_PATTERN.test(value)) throw new Error('minute.error.date');
  return value;
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

function createLru(limit) {
  const entries = new Map();
  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
      }
    },
    has(key) {
      return entries.has(key);
    },
    size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

export class MinuteDataStore {
  constructor({
    manifestPath, root = '', fetchImpl = null, tickCacheLimit = 4, minuteCacheLimit = 2,
  } = {}) {
    this.manifestPath = safeRelativePath(manifestPath);
    this.root = String(root || '').replace(/^\.?\//, '').replace(/\/$/, '');
    this.fetchImpl = fetchImpl || ((url, options) => fetch(url, options));
    this.manifest = null;
    this.manifestPromise = null;
    this.tickCache = createLru(tickCacheLimit);
    this.minuteCache = createLru(minuteCacheLimit);
    this.monthStates = new Map();
    this.minuteStates = new Map();
    this.controllers = new Set();
    this.disposed = false;
    this.stats = {
      manifestFetches: 0, tickFetches: 0, minuteFetches: 0,
      tickCacheHits: 0, minuteCacheHits: 0, failures: 0, aborted: 0,
      bytesLoaded: 0, minuteBars: 0,
    };
  }

  async loadManifest() {
    if (this.manifest) return this.manifest;
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = (async () => {
      const response = await this.fetchImpl(`./${this.manifestPath}`, { cache: 'no-cache' });
      if (!response || !response.ok) throw new Error('minute.error.manifest');
      const text = await response.text();
      this.stats.manifestFetches += 1;
      this.stats.bytesLoaded += text.length;
      const manifest = JSON.parse(text);
      if (!manifest || Number(manifest.version) < 1 || !manifest.symbols) {
        throw new Error('minute.error.manifest');
      }
      if (!Array.isArray(manifest.tickTimes) || manifest.tickTimes.length !== MINUTE_TICK_TIMES.length) {
        throw new Error('minute.error.manifest');
      }
      this.manifest = manifest;
      if (!this.root) this.root = String(manifest.root || '').replace(/^\.?\//, '').replace(/\/$/, '');
      return manifest;
    })();
    try {
      return await this.manifestPromise;
    } catch (error) {
      this.manifestPromise = null;
      this.stats.failures += 1;
      throw error;
    }
  }

  symbolInfo(symbol) {
    const ticker = safeSymbol(symbol);
    return this.manifest?.symbols?.[ticker] || null;
  }

  monthRecord(symbol, month) {
    return this.symbolInfo(symbol)?.months?.[safeMonth(month)] || null;
  }

  tickState(symbol, month) {
    const key = `${safeSymbol(symbol)}|${safeMonth(month)}`;
    if (this.tickCache.has(key)) return 'ready';
    return this.monthStates.get(key) || 'idle';
  }

  minuteState(symbol, month) {
    const key = `${safeSymbol(symbol)}|${safeMonth(month)}`;
    if (this.minuteCache.has(key)) return 'ready';
    return this.minuteStates.get(key) || 'idle';
  }

  urlFor(relativePath) {
    return `./${this.root ? `${this.root}/` : ''}${safeRelativePath(relativePath)}`;
  }

  async ensureTickMonth(symbol, month, { signal } = {}) {
    if (this.disposed) throw new Error('minute.error.disposed');
    const ticker = safeSymbol(symbol);
    const period = safeMonth(month);
    const key = `${ticker}|${period}`;
    if (this.tickCache.has(key)) {
      this.stats.tickCacheHits += 1;
      return this.tickCache.get(key);
    }
    if (!this.manifest) await this.loadManifest();
    const record = this.monthRecord(ticker, period);
    if (!record) {
      this.monthStates.set(key, 'missing');
      return null;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    this.monthStates.set(key, 'loading');
    try {
      const response = await this.fetchImpl(this.urlFor(record.file), {
        cache: 'no-cache',
        signal: signal || controller.signal,
      });
      if (!response || !response.ok) {
        this.monthStates.set(key, 'missing');
        this.stats.failures += 1;
        throw new Error('minute.error.ticks');
      }
      const text = await response.text();
      const payload = JSON.parse(text);
      if (!payload || payload.symbol !== ticker || payload.month !== period || !payload.days) {
        throw new Error('minute.error.ticks');
      }
      if (this.disposed) throw new Error('minute.error.disposed');
      this.stats.tickFetches += 1;
      this.stats.bytesLoaded += text.length;
      this.tickCache.set(key, payload.days);
      this.monthStates.delete(key);
      return payload.days;
    } catch (error) {
      if (this.disposed) {
        this.stats.aborted += 1;
        throw new Error('minute.error.disposed');
      }
      if (!this.tickCache.has(key) && this.monthStates.get(key) === 'loading') {
        this.monthStates.set(key, 'missing');
      }
      throw error;
    } finally {
      this.controllers.delete(controller);
    }
  }

  async ensureSymbolsMonth(symbols, month, { signal } = {}) {
    const period = safeMonth(month);
    const unique = [...new Set((symbols || []).map((symbol) => safeSymbol(symbol)))];
    const results = await Promise.allSettled(unique.map(
      (symbol) => this.ensureTickMonth(symbol, period, { signal }),
    ));
    return results;
  }

  async prefetchMonth(symbols, month, options = {}) {
    return this.ensureSymbolsMonth(symbols, month, options);
  }

  /** Returns the real tick entry, or null when the month/day has no usable minute. */
  getTick(symbol, date, tick) {
    const ticker = safeSymbol(symbol);
    const day = safeDate(date);
    const index = Math.max(0, Math.min(MINUTE_TICK_TIMES.length - 1, Number(tick) || 0));
    const period = monthOf(day);
    if (!this.tickCache.has(`${ticker}|${period}`)) return undefined;
    const days = this.tickCache.get(`${ticker}|${period}`);
    const entries = days?.[day];
    if (!entries || !entries.length) return null;
    const entry = entries.find((item) => item.t === MINUTE_TICK_TIMES[index]);
    if (!entry) return null;
    this.stats.tickCacheHits += 1;
    return entry;
  }

  async ensureMinuteMonth(symbol, month, { signal } = {}) {
    if (this.disposed) throw new Error('minute.error.disposed');
    const ticker = safeSymbol(symbol);
    const period = safeMonth(month);
    const key = `${ticker}|${period}`;
    if (this.minuteCache.has(key)) {
      this.stats.minuteCacheHits += 1;
      return this.minuteCache.get(key);
    }
    if (!this.manifest) await this.loadManifest();
    const record = this.monthRecord(ticker, period);
    if (!record?.minuteFile) {
      this.minuteStates.set(key, 'missing');
      return null;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    this.minuteStates.set(key, 'loading');
    try {
      const response = await this.fetchImpl(this.urlFor(record.minuteFile), {
        cache: 'no-cache',
        signal: signal || controller.signal,
      });
      if (!response || !response.ok) {
        this.minuteStates.set(key, 'missing');
        this.stats.failures += 1;
        throw new Error('minute.error.minutes');
      }
      const text = await readGzipText(response);
      const bars = parseMinuteCsv(text);
      if (this.disposed) throw new Error('minute.error.disposed');
      this.stats.minuteFetches += 1;
      this.stats.bytesLoaded += text.length;
      this.stats.minuteBars += bars.length;
      this.minuteCache.set(key, bars);
      this.minuteStates.delete(key);
      return bars;
    } catch (error) {
      if (this.disposed) {
        this.stats.aborted += 1;
        throw new Error('minute.error.disposed');
      }
      if (!this.minuteCache.has(key) && this.minuteStates.get(key) === 'loading') {
        this.minuteStates.set(key, 'missing');
      }
      throw error;
    } finally {
      this.controllers.delete(controller);
    }
  }

  /** Bars for one symbol/date, or null when that month is not loaded yet. */
  getMinuteBars(symbol, date) {
    const ticker = safeSymbol(symbol);
    const period = monthOf(safeDate(date));
    const bars = this.minuteCache.get(`${ticker}|${period}`);
    if (!bars) return null;
    this.stats.minuteCacheHits += 1;
    return bars.filter((bar) => bar.date === date);
  }

  async ensureDayMinutes(symbol, date) {
    const bars = await this.ensureMinuteMonth(symbol, monthOf(date));
    return (bars || []).filter((bar) => bar.date === date);
  }

  /** Prefetch the following month's tick indexes while the current one is used. */
  async prefetchAround(symbols, date) {
    const month = monthOf(date);
    const upcoming = nextMonth(month);
    if (upcoming) return this.prefetchMonth(symbols, upcoming);
    return [];
  }

  coverage(symbol) {
    const info = this.symbolInfo(symbol);
    if (!info) return { months: [], minuteMonths: 0, minuteDays: 0, minuteBars: 0 };
    return {
      months: Object.keys(info.months || {}).sort(),
      minuteMonths: info.minuteMonths || 0,
      minuteDays: info.minuteDays || 0,
      minuteBars: info.minuteBars || 0,
    };
  }

  cacheStats() {
    return {
      ...this.stats,
      tickMonths: this.tickCache.size(),
      minuteMonths: this.minuteCache.size(),
    };
  }

  dispose() {
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.tickCache.clear();
    this.minuteCache.clear();
    this.monthStates.clear();
    this.minuteStates.clear();
    this.manifest = null;
    this.manifestPromise = null;
  }
}
