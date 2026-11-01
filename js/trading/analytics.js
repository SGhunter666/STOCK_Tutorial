/**
 * Portfolio analytics computed from the player's own equity curve and current
 * holdings. All metrics are derived, never random scores.
 */
function returnsOf(values) {
  const result = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > 0) result.push((values[index] - values[index - 1]) / values[index - 1]);
  }
  return result;
}

export function annualizedVolatility(values, periodsPerYear = 252) {
  const returns = returnsOf(values);
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}

export function maxDrawdown(values) {
  if (!values || values.length < 2) return null;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, (value - peak) / peak);
  }
  return worst * 100;
}

export function portfolioAnalytics(account, quotes, currentTotal) {
  const history = (account.equityHistory || []).map((entry) => entry.equity);
  const values = [...history, currentTotal];
  const positions = Object.entries(account.positions || {}).filter(([, position]) => position && position.qty > 0);
  const holdingsValue = positions.reduce((sum, [ticker, position]) => {
    const quote = quotes[ticker];
    return sum + (quote ? quote.last * position.qty : 0);
  }, 0);
  const weights = positions.map(([ticker, position]) => {
    const quote = quotes[ticker];
    const value = quote ? quote.last * position.qty : 0;
    return { ticker, value, weight: currentTotal > 0 ? value / currentTotal : 0 };
  }).sort((a, b) => b.weight - a.weight);
  const hhi = weights.reduce((sum, row) => sum + (row.weight ** 2), 0);
  const topWeight = weights.length ? weights[0].weight : 0;
  return {
    volatility: annualizedVolatility(values),
    drawdown: maxDrawdown(values),
    exposure: currentTotal > 0 ? holdingsValue / currentTotal : 0,
    cashWeight: currentTotal > 0 ? account.cash / currentTotal : 0,
    hhi,
    topWeight,
    topTicker: weights.length ? weights[0].ticker : null,
    positions: weights,
    samples: values.length,
  };
}
