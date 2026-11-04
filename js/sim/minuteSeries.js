/**
 * One-minute OHLCV series for the fictional exchange.
 * Bars are left-closed/right-open minute intervals and only contain real simulated
 * trades. Missing minutes are not filled with invented volume.
 */

export const SIM_SESSION_MINUTES = 390;
export const SIM_INTRADAY_TIMEFRAMES = Object.freeze(['1m', '5m', '15m', '30m', '1h', '4h']);
export const SIM_ALL_TIMEFRAMES = Object.freeze([
  '1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M',
]);

const TIMEFRAME_MINUTES = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };

function clockText(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function weekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function createMinuteSeries() {
  return { intraday: [], current: null, daily: [] };
}

export function minuteIndexForSecond(second) {
  return Math.max(0, Math.min(SIM_SESSION_MINUTES - 1, Math.floor(second / 60)));
}

/**
 * Adds a trade to the current minute. A new minute finalizes the previous bar.
 * `trade` is { date, second, price, qty }.
 */
export function applyTradeToSeries(series, trade) {
  const minute = minuteIndexForSecond(trade.second);
  if (series.current && series.current.minute !== minute) {
    finalizeMinute(series);
  }
  if (!series.current) {
    series.current = {
      date: trade.date,
      minute,
      time: clockText(9 * 60 + 30 + minute),
      o: trade.price,
      h: trade.price,
      l: trade.price,
      c: trade.price,
      v: trade.qty,
      trades: 1,
      finalized: false,
    };
    return series.current;
  }
  const bar = series.current;
  bar.h = Math.max(bar.h, trade.price);
  bar.l = Math.min(bar.l, trade.price);
  bar.c = trade.price;
  bar.v += trade.qty;
  bar.trades += 1;
  return bar;
}

export function finalizeMinute(series) {
  if (!series.current) return null;
  const bar = { ...series.current, finalized: true };
  series.intraday.push(bar);
  series.current = null;
  return bar;
}

/** Closes the day, builds its daily bar, and resets intraday state. */
export function finalizeDay(series, date) {
  finalizeMinute(series);
  if (!series.intraday.length) return null;
  const bars = series.intraday;
  const daily = {
    d: date,
    end: date,
    o: bars[0].o,
    h: Math.max(...bars.map((bar) => bar.h)),
    l: Math.min(...bars.map((bar) => bar.l)),
    c: bars[bars.length - 1].c,
    v: bars.reduce((sum, bar) => sum + bar.v, 0),
    trades: bars.reduce((sum, bar) => sum + bar.trades, 0),
    minutes: bars.length,
    finalized: true,
  };
  series.daily.push(daily);
  series.intraday = [];
  series.current = null;
  return daily;
}

function baseCandle(bar, extra = {}) {
  return {
    d: bar.date || bar.d,
    end: bar.date || bar.end || bar.d,
    time: bar.time,
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
    trades: bar.trades,
    partial: !bar.finalized,
    ...extra,
  };
}

function aggregateIntraday(bars, size) {
  const groups = new Map();
  for (const bar of bars) {
    const bucket = Math.floor(bar.minute / size) * size;
    const key = `${bar.date}|${bucket}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        ...baseCandle(bar),
        time: clockText(9 * 60 + 30 + bucket),
        bucket,
        partial: !bar.finalized,
      });
    } else {
      group.h = Math.max(group.h, bar.h);
      group.l = Math.min(group.l, bar.l);
      group.c = bar.c;
      group.v += bar.v;
      group.trades = (group.trades || 0) + (bar.trades || 0);
      group.partial = group.partial || !bar.finalized;
    }
  }
  return [...groups.values()].sort((a, b) => a.bucket - b.bucket);
}

function currentDayCandle(series, date) {
  const bars = series.current ? [...series.intraday, series.current] : series.intraday;
  if (!bars.length) return null;
  return {
    d: date,
    end: date,
    o: bars[0].o,
    h: Math.max(...bars.map((bar) => bar.h)),
    l: Math.min(...bars.map((bar) => bar.l)),
    c: bars[bars.length - 1].c,
    v: bars.reduce((sum, bar) => sum + bar.v, 0),
    trades: bars.reduce((sum, bar) => sum + (bar.trades || 0), 0),
    minutes: bars.length,
    partial: true,
  };
}

function aggregateDaily(daily, keyOf) {
  const groups = new Map();
  for (const bar of daily) {
    const key = keyOf(bar.d);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        d: bar.d, end: bar.d, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v,
        trades: bar.trades, partial: Boolean(bar.partial),
      });
    } else {
      group.end = bar.d;
      group.h = Math.max(group.h, bar.h);
      group.l = Math.min(group.l, bar.l);
      group.c = bar.c;
      group.v += bar.v;
      group.trades = (group.trades || 0) + (bar.trades || 0);
      group.partial = group.partial || Boolean(bar.partial);
    }
  }
  return [...groups.values()];
}

/**
 * Returns candles limited to what already happened. `date` is the current
 * trading date; `timeframe` accepts 1m..4h plus 1D/1W/1M.
 */
export function getSeriesCandles(series, timeframe, date) {
  if (timeframe === '1m') {
    const bars = series.current ? [...series.intraday, series.current] : [...series.intraday];
    return bars.map((bar) => baseCandle(bar));
  }
  if (SIM_INTRADAY_TIMEFRAMES.includes(timeframe)) {
    const size = TIMEFRAME_MINUTES[timeframe];
    const bars = series.current ? [...series.intraday, series.current] : [...series.intraday];
    return aggregateIntraday(bars, size);
  }
  const daily = [...series.daily];
  const current = currentDayCandle(series, date);
  if (current) {
    const existing = daily.findIndex((bar) => bar.d === date);
    if (existing >= 0) daily[existing] = current;
    else daily.push(current);
  }
  if (timeframe === '1D') return daily;
  if (timeframe === '1W') return aggregateDaily(daily, weekKey);
  if (timeframe === '1M') return aggregateDaily(daily, (day) => day.slice(0, 7));
  return [];
}
