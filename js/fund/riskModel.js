/**
 * Multi-factor risk model for fund holdings. Exposures cover market beta, size,
 * value, momentum and low volatility. Factor returns are long-short spreads
 * built from the current cross-section; the residual is specific risk. This is
 * a teaching model, not a production risk system.
 */
import { fundamentalsFor } from '../data/companies.js';
import { unlockedCompanies } from '../market/marketAccess.js';
import { annualizedVolatility } from '../market/indicators.js';

export const FUND_RISK_FACTORS = [
  { id: 'market', nameKey: 'fund.riskModel.market' },
  { id: 'size', nameKey: 'fund.riskModel.size' },
  { id: 'value', nameKey: 'fund.riskModel.value' },
  { id: 'momentum', nameKey: 'fund.riskModel.momentum' },
  { id: 'lowVol', nameKey: 'fund.riskModel.lowVol' },
];

const STYLE_FACTORS = ['size', 'value', 'momentum', 'lowVol'];
const SHRINKAGE = 0.2;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardize(values) {
  const average = mean(values);
  const variance = values.length
    ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length : 0;
  const deviation = Math.sqrt(variance);
  return deviation > 0 ? values.map((value) => (value - average) / deviation) : values.map(() => 0);
}

function returnsOf(closes) {
  const out = [];
  for (let index = 1; index < closes.length; index += 1) {
    out.push(closes[index - 1] > 0 ? closes[index] / closes[index - 1] - 1 : 0);
  }
  return out;
}

function buildPanel(state, lookback) {
  const companies = unlockedCompanies(state).filter((company) => !company.isEtf);
  const series = companies.map((company) => {
    const closes = (state.market?.history?.[company.ticker] || [])
      .filter((candle) => Number.isFinite(candle.c) && candle.c > 0)
      .map((candle) => candle.c);
    return { company, closes };
  }).filter((entry) => entry.closes.length >= lookback + 1);
  if (series.length < 4) return null;
  const shortest = Math.min(...series.map((entry) => entry.closes.length));
  const window = Math.min(lookback, shortest - 1);
  if (window < 20) return null;
  return {
    window,
    series: series.map((entry) => {
      const closes = entry.closes.slice(-(window + 1));
      const lastPrice = state.market?.quotes?.[entry.company.ticker]?.last || closes[closes.length - 1];
      const fundamentals = fundamentalsFor(entry.company, lastPrice);
      return {
        ticker: entry.company.ticker,
        company: entry.company,
        closes,
        returns: returnsOf(closes),
        marketCap: fundamentals.marketCap,
        earningsYield: fundamentals.pe && fundamentals.pe > 0 ? 1 / fundamentals.pe : 0,
        momentum: closes[0] > 0 ? closes[closes.length - 1] / closes[0] - 1 : 0,
        volatility: annualizedVolatility(closes) || 0,
      };
    }),
  };
}

function covariance(series) {
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
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (row !== column) matrix[row][column] *= (1 - SHRINKAGE);
    }
    matrix[row][row] = Math.max(1e-10, matrix[row][row]);
  }
  return matrix;
}

/**
 * Builds factor exposures, factor return covariance and specific variance.
 * The long-short factor returns use the current cross-section, so this is a
 * point-in-time teaching approximation rather than a historical factor model.
 */
export function buildFundRiskModel(state, { lookback = 60 } = {}) {
  const panel = buildPanel(state, Math.max(20, Math.min(250, Math.round(Number(lookback) || 60))));
  if (!panel) return { ok: false, error: 'fund.riskModel.history' };
  const count = panel.series.length;
  const bars = panel.window;
  const marketReturns = Array(bars).fill(0);
  for (let index = 0; index < bars; index += 1) {
    marketReturns[index] = mean(panel.series.map((entry) => entry.returns[index]));
  }
  const marketMean = mean(marketReturns);
  const marketVariance = marketReturns.reduce((sum, value) => sum + (value - marketMean) ** 2, 0) / Math.max(1, bars - 1);
  const exposures = panel.series.map((entry) => {
    let covarianceWithMarket = 0;
    const stockMean = mean(entry.returns);
    for (let index = 0; index < bars; index += 1) {
      covarianceWithMarket += (entry.returns[index] - stockMean) * (marketReturns[index] - marketMean);
    }
    covarianceWithMarket /= Math.max(1, bars - 1);
    return {
      ticker: entry.ticker,
      market: marketVariance > 0 ? covarianceWithMarket / marketVariance : 1,
    };
  });
  const sizeExposure = standardize(panel.series.map((entry) => Math.log(Math.max(1, entry.marketCap))));
  const valueExposure = standardize(panel.series.map((entry) => entry.earningsYield));
  const momentumExposure = standardize(panel.series.map((entry) => entry.momentum));
  const lowVolExposure = standardize(panel.series.map((entry) => -entry.volatility));
  exposures.forEach((entry, index) => {
    entry.size = sizeExposure[index];
    entry.value = valueExposure[index];
    entry.momentum = momentumExposure[index];
    entry.lowVol = lowVolExposure[index];
  });
  const factorReturns = {
    market: marketReturns,
    size: Array(bars).fill(0),
    value: Array(bars).fill(0),
    momentum: Array(bars).fill(0),
    lowVol: Array(bars).fill(0),
  };
  const bucket = Math.max(1, Math.floor(count / 3));
  for (const factor of STYLE_FACTORS) {
    for (let index = 0; index < bars; index += 1) {
      const ranked = panel.series
        .map((entry, position) => ({ position, value: exposures[position][factor] }))
        .sort((a, b) => a.value - b.value);
      const bottom = ranked.slice(0, bucket);
      const top = ranked.slice(-bucket);
      const topReturn = mean(top.map((row) => panel.series[row.position].returns[index]));
      const bottomReturn = mean(bottom.map((row) => panel.series[row.position].returns[index]));
      factorReturns[factor][index] = topReturn - bottomReturn;
    }
  }
  const factorSeries = FUND_RISK_FACTORS.map((factor) => factorReturns[factor.id]);
  const factorCovariance = covariance(factorSeries);
  const specificVariance = panel.series.map((entry, position) => {
    const residuals = [];
    for (let index = 0; index < bars; index += 1) {
      let fitted = exposures[position].market * factorReturns.market[index];
      for (const factor of STYLE_FACTORS) {
        fitted += exposures[position][factor] * factorReturns[factor][index];
      }
      residuals.push(entry.returns[index] - fitted);
    }
    return Math.max(1e-10, covariance([residuals])[0][0]);
  });
  return {
    ok: true,
    lookback: panel.window,
    universe: count,
    tickers: panel.series.map((entry) => entry.ticker),
    exposures,
    factorCovariance,
    specificVariance,
    factorVolatilityPct: FUND_RISK_FACTORS.map((factor, index) => (
      Math.round(Math.sqrt(factorCovariance[index][index]) * 10000) / 100
    )),
  };
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

/**
 * Aggregates a weight vector into factor exposure, factor / specific variance
 * contributions and simple factor stress scenarios.
 */
export function portfolioFactorRisk(state, weights, { lookback = 60 } = {}) {
  const model = buildFundRiskModel(state, { lookback });
  if (!model.ok) return model;
  const clean = (Array.isArray(weights) ? weights : [])
    .map((entry) => ({ ticker: entry.ticker, weight: Math.max(0, Number(entry.weight) || 0) }))
    .filter((entry) => model.tickers.includes(entry.ticker) && entry.weight > 0);
  if (!clean.length) return { ok: false, error: 'fund.riskModel.empty' };
  const byTicker = new Map(clean.map((entry) => [entry.ticker, entry.weight]));
  const vector = model.tickers.map((ticker) => byTicker.get(ticker) || 0);
  const factorExposure = FUND_RISK_FACTORS.map((factor, factorIndex) => (
    model.exposures.reduce((sum, exposure, position) => sum + vector[position] * exposure[factor.id], 0)
  ));
  const factorVariance = dot(
    factorExposure,
    model.factorCovariance.map((row) => dot(row, factorExposure)),
  );
  const specific = vector.reduce((sum, weight, index) => sum + weight ** 2 * model.specificVariance[index], 0);
  const totalVariance = Math.max(1e-10, factorVariance + specific);
  const contributions = FUND_RISK_FACTORS.map((factor, index) => {
    const marginal = dot(model.factorCovariance[index], factorExposure);
    const contribution = factorExposure[index] * marginal;
    return {
      id: factor.id,
      exposure: Math.round(factorExposure[index] * 1000) / 1000,
      contributionPct: Math.round(contribution / totalVariance * 1000) / 10,
    };
  });
  contributions.push({
    id: 'specific',
    exposure: 0,
    contributionPct: Math.round(specific / totalVariance * 1000) / 10,
  });
  const stress = [
    { id: 'marketDown', shockPct: -10, impactPct: factorExposure[0] * -10 },
    { id: 'momentumDown', shockPct: -5, impactPct: factorExposure[3] * -5 },
    { id: 'valueDown', shockPct: -5, impactPct: factorExposure[2] * -5 },
    { id: 'volSpike', shockPct: -5, impactPct: factorExposure[4] * -5 },
  ].map((row) => ({
    ...row,
    impactPct: Math.round(row.impactPct * 100) / 100,
  }));
  return {
    ok: true,
    lookback: model.lookback,
    investedPct: Math.round(vector.reduce((sum, value) => sum + value, 0) * 1000) / 10,
    holdings: clean.length,
    totalRiskPct: Math.round(Math.sqrt(totalVariance) * 10000) / 100,
    factorRiskPct: Math.round(Math.sqrt(Math.max(0, factorVariance)) * 10000) / 100,
    specificRiskPct: Math.round(Math.sqrt(Math.max(0, specific)) * 10000) / 100,
    contributions,
    stress,
  };
}
