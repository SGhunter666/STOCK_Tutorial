/**
 * Fund portfolio optimiser: long-only, fully invested within a cash floor.
 * Supports inverse-volatility risk parity, minimum variance and mean-variance.
 * Everything is deterministic and reads only completed daily bars; the fund is
 * never mutated here.
 */
import { getCompany } from '../data/companies.js';
import { unlockedCompanies } from '../market/marketAccess.js';
import { fundMetrics } from './fundEngine.js';

export const FUND_OPTIMIZER_METHODS = [
  {
    id: 'minVariance',
    nameKey: 'fund.optimizer.minVariance',
    descKey: 'fund.optimizer.minVarianceDesc',
  },
  {
    id: 'riskParity',
    nameKey: 'fund.optimizer.riskParity',
    descKey: 'fund.optimizer.riskParityDesc',
  },
  {
    id: 'meanVariance',
    nameKey: 'fund.optimizer.meanVariance',
    descKey: 'fund.optimizer.meanVarianceDesc',
  },
];

const DEFAULT_LOOKBACK = 60;
const SHRINKAGE = 0.2;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function returnsOf(closes) {
  const out = [];
  for (let index = 1; index < closes.length; index += 1) {
    if (closes[index - 1] > 0) out.push(closes[index] / closes[index - 1] - 1);
    else out.push(0);
  }
  return out;
}

function covarianceMatrix(series) {
  const count = series.length;
  const bars = series[0].length;
  const means = series.map(mean);
  const matrix = Array.from({ length: count }, () => Array(count).fill(0));
  for (let left = 0; left < count; left += 1) {
    for (let right = left; right < count; right += 1) {
      let sum = 0;
      for (let index = 0; index < bars; index += 1) {
        sum += (series[left][index] - means[left]) * (series[right][index] - means[right]);
      }
      const value = bars > 1 ? (sum / (bars - 1)) * 252 : 0;
      matrix[left][right] = value;
      matrix[right][left] = value;
    }
  }
  // Shrink the sample covariance towards its diagonal so a short window does
  // not produce an ill-conditioned matrix for mean-variance.
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (row !== column) matrix[row][column] *= (1 - SHRINKAGE);
    }
    matrix[row][row] = Math.max(1e-8, matrix[row][row]);
  }
  return matrix;
}

function maxEigenvalue(matrix) {
  const size = matrix.length;
  let vector = Array(size).fill(1 / Math.sqrt(Math.max(1, size)));
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const next = matrix.map((row) => dot(row, vector));
    const norm = Math.sqrt(dot(next, next));
    if (norm < 1e-12) return 1e-8;
    vector = next.map((value) => value / norm);
  }
  const multiplied = matrix.map((row) => dot(row, vector));
  return Math.max(1e-8, dot(vector, multiplied));
}

function projectWeights(raw, cap, maxWeight) {
  let weights = raw.map((value) => Math.max(0, Math.min(maxWeight, value)));
  let sum = weights.reduce((total, value) => total + value, 0);
  if (sum > cap) {
    const scale = cap / sum;
    return weights.map((value) => value * scale);
  }
  for (let iteration = 0; iteration < 24 && sum < cap; iteration += 1) {
    const room = weights.map((value) => Math.max(0, maxWeight - value));
    const roomSum = room.reduce((total, value) => total + value, 0);
    if (roomSum <= 1e-12) break;
    const deficit = Math.min(cap - sum, roomSum);
    weights = weights.map((value, index) => value + deficit * room[index] / roomSum);
    sum = weights.reduce((total, value) => total + value, 0);
  }
  return weights;
}

function capWithRedistribution(raw, cap, maxWeight) {
  let weights = raw.map((value) => Math.max(0, value));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return projectWeights(Array(raw.length).fill(cap / Math.max(1, raw.length)), cap, maxWeight);
  weights = weights.map((value) => value / total * cap);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let excess = 0;
    let free = 0;
    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index] > maxWeight) {
        excess += weights[index] - maxWeight;
        weights[index] = maxWeight;
      } else if (weights[index] < maxWeight) {
        free += 1;
      }
    }
    if (excess <= 1e-12 || free === 0) break;
    const share = excess / free;
    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index] < maxWeight) {
        weights[index] = Math.min(maxWeight, weights[index] + share);
      }
    }
  }
  return weights;
}

function gradientWeights(covariance, expected, {
  cap, maxWeight, riskAversion, maximize,
}) {
  const size = covariance.length;
  const variance = (vector) => dot(vector, covariance.map((row) => dot(row, vector)));
  const score = (vector) => (
    maximize
      ? dot(expected, vector) - riskAversion * variance(vector)
      : variance(vector)
  );
  let weights = projectWeights(Array(size).fill(cap / Math.max(1, size)), cap, maxWeight);
  let currentScore = score(weights);
  const baseStep = 1 / Math.max(1e-8, maxEigenvalue(covariance) * 2 * (maximize ? riskAversion : 1));
  for (let iteration = 0; iteration < 260; iteration += 1) {
    const multiplied = covariance.map((row) => dot(row, weights));
    const gradient = weights.map((value, index) => (
      maximize
        ? expected[index] - 2 * riskAversion * multiplied[index]
        : 2 * multiplied[index]
    ));
    let step = baseStep;
    let accepted = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const direction = maximize ? 1 : -1;
      const candidate = projectWeights(
        weights.map((value, index) => value + direction * step * gradient[index]),
        cap,
        maxWeight,
      );
      const candidateScore = score(candidate);
      const improves = maximize
        ? candidateScore > currentScore + 1e-12
        : candidateScore < currentScore - 1e-12;
      if (improves) {
        const change = candidate.reduce((sum, value, index) => sum + Math.abs(value - weights[index]), 0);
        weights = candidate;
        currentScore = candidateScore;
        accepted = true;
        if (change < 1e-10) iteration = 260;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) break;
  }
  return weights;
}

function portfolioVolatility(weights, covariance) {
  const values = covariance.map((row) => dot(row, weights));
  return Math.max(0, dot(weights, values));
}

function buildPanel(state, lookback) {
  const companies = unlockedCompanies(state).filter((company) => !company.isEtf);
  const series = companies.map((company) => {
    const closes = (state.market?.history?.[company.ticker] || [])
      .filter((candle) => Number.isFinite(candle.c) && candle.c > 0)
      .map((candle) => candle.c);
    return { company, closes };
  }).filter((entry) => entry.closes.length >= lookback + 1);
  if (series.length < 3) return null;
  const shortest = Math.min(...series.map((entry) => entry.closes.length));
  const window = Math.min(lookback, shortest - 1);
  if (window < 20) return null;
  const aligned = series.map((entry) => ({
    ...entry,
    closes: entry.closes.slice(-(window + 1)),
    returns: returnsOf(entry.closes.slice(-(window + 1))),
    volatility: Math.sqrt(mean(returnsOf(entry.closes.slice(-(window + 1))).map((value) => value ** 2))) * Math.sqrt(252),
    expected: mean(returnsOf(entry.closes.slice(-(window + 1)))) * 252,
  }));
  return { window, series: aligned };
}

/**
 * Builds constrained long-only weights from completed daily closes.
 * `cashBuffer` is the share not invested; `maxWeight` caps each holding.
 */
export function optimizeFundPortfolio(state, {
  method = 'minVariance',
  lookback = DEFAULT_LOOKBACK,
  maxWeight = 0.25,
  cashBuffer = 0.1,
  riskAversion = 2,
} = {}) {
  const normalizedMethod = FUND_OPTIMIZER_METHODS.some((entry) => entry.id === method)
    ? method : 'minVariance';
  const window = Math.round(clamp(lookback, 20, 250, DEFAULT_LOOKBACK));
  const fund = state.fund && state.fund.status === 'active' ? state.fund : null;
  const fundCap = fund?.maxPosition || 0.5;
  const capWeight = Math.min(clamp(maxWeight, 0.05, 0.5, fundCap), fundCap);
  const cashFloor = Math.max(0.05, fund?.minCash || 0.05);
  const cash = Math.max(clamp(cashBuffer, 0.05, 0.5, Math.max(0.1, cashFloor)), cashFloor);
  const cap = Math.max(0.1, 1 - cash);
  const panel = buildPanel(state, window);
  if (!panel) return { ok: false, error: 'fund.errorOptimizerHistory' };
  const covariance = covarianceMatrix(panel.series.map((entry) => entry.returns));
  const expected = panel.series.map((entry) => entry.expected);
  const volatilities = panel.series.map((entry) => Math.max(1e-8, entry.volatility));
  let weights;
  if (normalizedMethod === 'riskParity') {
    weights = capWithRedistribution(volatilities.map((value) => 1 / value), cap, capWeight);
  } else {
    weights = gradientWeights(covariance, expected, {
      cap,
      maxWeight: capWeight,
      riskAversion: clamp(riskAversion, 0.5, 10, 2),
      maximize: normalizedMethod === 'meanVariance',
    });
  }
  const invested = weights.reduce((sum, value) => sum + value, 0);
  const variance = portfolioVolatility(weights, covariance);
  const equalWeights = projectWeights(
    Array(weights.length).fill(cap / Math.max(1, weights.length)),
    cap,
    capWeight,
  );
  const equalVariance = portfolioVolatility(equalWeights, covariance);
  const weightedVol = weights.reduce((sum, value, index) => sum + value * volatilities[index], 0);
  const rows = panel.series.map((entry, index) => {
    const company = entry.company;
    return {
      ticker: company.ticker,
      sector: company.sector,
      weight: Math.round(weights[index] * 1000000) / 1000000,
      weightPct: Math.round(weights[index] * 10000) / 100,
      expectedReturnPct: Math.round(expected[index] * 10000) / 100,
      volatilityPct: Math.round(volatilities[index] * 10000) / 100,
    };
  }).filter((row) => row.weight > 0.0005).sort((a, b) => b.weight - a.weight);
  return {
    ok: true,
    method: normalizedMethod,
    lookback: panel.window,
    universe: panel.series.length,
    cashBufferPct: Math.round(cash * 1000) / 10,
    cashWeightPct: Math.round(Math.max(0, 1 - invested) * 1000) / 10,
    maxWeightPct: Math.round(capWeight * 1000) / 10,
    expectedReturnPct: Math.round(expected.reduce((sum, value, index) => sum + value * weights[index], 0) * 10000) / 100,
    expectedVolatilityPct: Math.round(Math.sqrt(variance) * 10000) / 100,
    equalWeightVolatilityPct: Math.round(Math.sqrt(equalVariance) * 10000) / 100,
    diversificationRatio: Math.sqrt(variance) > 0
      ? Math.round((weightedVol / Math.sqrt(variance)) * 100) / 100 : 1,
    weights: rows,
  };
}

/**
 * Turns optimiser weights into the same advisory plan shape used by the fund
 * strategy page. Every leg is still validated by executeFundPlan.
 */
export function buildFundWeightPlan(fund, state, weights) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const quotes = state.market.quotes;
  const metrics = fundMetrics(fund, state);
  if (!metrics || metrics.nav <= 0) return { ok: false, error: 'fund.errorNoNav' };
  const clean = (Array.isArray(weights) ? weights : [])
    .map((entry) => ({
      ticker: entry.ticker,
      weight: Math.max(0, Math.min(1, Number(entry.weight) || 0)),
    }))
    .filter((entry) => entry.ticker && entry.weight > 0 && quotes[entry.ticker]);
  if (!clean.length) return { ok: false, error: 'fund.errorOptimizerEmpty' };
  const fee = fund.employees?.some((employee) => employee.id === 'trader') ? 0.5 : 1;
  const target = new Map(clean.map((entry) => [entry.ticker, entry.weight]));
  const rows = positionRowsForPlan(fund);
  const held = new Map(rows.map((row) => [row.ticker, row.qty]));
  let cash = fund.account.cash;
  const trades = [];
  for (const row of rows) {
    if (row.qty <= 0) continue;
    const quote = quotes[row.ticker];
    if (!quote) continue;
    const targetWeight = target.get(row.ticker);
    const desiredQty = targetWeight
      ? Math.floor(metrics.nav * targetWeight / quote.bid) : 0;
    const excess = row.qty - desiredQty;
    if (excess <= 0) continue;
    cash += excess * quote.bid - fee;
    held.set(row.ticker, row.qty - excess);
    trades.push({
      ticker: row.ticker,
      side: 'sell',
      qty: excess,
      price: quote.bid,
      reason: targetWeight ? 'rebalance' : 'optimizerExit',
    });
  }
  for (const entry of clean) {
    const quote = quotes[entry.ticker];
    const desiredQty = Math.floor(metrics.nav * entry.weight / quote.ask);
    const existing = held.get(entry.ticker) || 0;
    const delta = desiredQty - existing;
    if (delta <= 0) continue;
    const affordable = Math.floor((cash - fee) / quote.ask);
    const qty = Math.min(delta, Math.max(0, affordable));
    if (qty <= 0) continue;
    cash -= qty * quote.ask + fee;
    held.set(entry.ticker, existing + qty);
    trades.push({
      ticker: entry.ticker,
      side: 'buy',
      qty,
      price: quote.ask,
      reason: 'optimizer',
    });
  }
  const candidates = clean.map((entry) => {
    const company = getCompany(entry.ticker);
    return {
      ticker: entry.ticker,
      sector: company?.sector || '',
      targetWeight: Math.round(entry.weight * 10000) / 10000,
      reason: 'optimizer',
    };
  });
  return {
    ok: true,
    plan: {
      day: state.market.day,
      source: 'optimizer',
      strategyId: fund.quantPlan?.strategyId || 'smaCross',
      trades,
      candidates,
      cashBefore: Math.round(fund.account.cash * 100) / 100,
      expectedCash: Math.round(cash * 100) / 100,
      nav: Math.round(metrics.nav * 100) / 100,
    },
  };
}

function positionRowsForPlan(fund) {
  return Object.entries(fund.account.positions || {})
    .filter(([, position]) => position && position.qty > 0)
    .map(([ticker, position]) => ({ ticker, qty: position.qty }));
}
