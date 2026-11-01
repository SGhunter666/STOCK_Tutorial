/**
 * Deterministic technical indicators. Every function receives price history up
 * to the current session and never looks ahead, so lessons and the trading view
 * cannot leak future data.
 */
export function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let index = period; index < values.length; index += 1) {
    value = (values[index] - value) * multiplier + value;
  }
  return value;
}

export function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  const recent = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const change = recent[index] - recent[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (gains + losses === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

export function annualizedVolatility(values, periodsPerYear = 252) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const returns = [];
  for (let index = 1; index < values.length; index += 1) {
    returns.push((values[index] - values[index - 1]) / values[index - 1]);
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}

export function maxDrawdown(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, (value - peak) / peak);
  }
  return worst * 100;
}

/** Snapshot used by the trading view and the indicator lesson demo. */
export function indicatorSnapshot(history, currentPrice) {
  const closes = (history || []).map((candle) => candle.c);
  if (currentPrice) closes.push(currentPrice);
  if (closes.length < 2) return null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const volatility = annualizedVolatility(closes.slice(-61));
  const drawdown = maxDrawdown(closes.slice(-90));
  const trend = sma20 && sma50
    ? (sma20 > sma50 ? 'up' : sma20 < sma50 ? 'down' : 'flat')
    : 'unknown';
  return {
    sma20,
    sma50,
    rsi14,
    volatility,
    drawdown,
    trend,
    last: closes[closes.length - 1],
  };
}
