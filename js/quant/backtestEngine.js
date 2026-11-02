/**
 * Quantitative research engine: deterministic long-only backtests and factor
 * ranking. Signals are computed from completed bars and executed at the next
 * open, so the backtest cannot look ahead within its own data.
 */
import { COMPANIES, fundamentalsFor } from '../data/companies.js';
import { annualizedVolatility, sma } from '../market/indicators.js';

export const QUANT_MIN_BARS = 30;
export const QUANT_CASH_OPTIONS = [10000, 100000, 1000000];
export const QUANT_FACTOR_OPTIONS = [
  { id: 'momentum', nameKey: 'quant.factor.momentum', descKey: 'quant.factor.momentumDesc' },
  { id: 'lowVol', nameKey: 'quant.factor.lowVol', descKey: 'quant.factor.lowVolDesc' },
  { id: 'trend', nameKey: 'quant.factor.trend', descKey: 'quant.factor.trendDesc' },
  { id: 'value', nameKey: 'quant.factor.value', descKey: 'quant.factor.valueDesc' },
  { id: 'news', nameKey: 'quant.factor.news', descKey: 'quant.factor.newsDesc' },
  { id: 'newsTrend', nameKey: 'quant.factor.newsTrend', descKey: 'quant.factor.newsTrendDesc' },
  { id: 'volume', nameKey: 'quant.factor.volume', descKey: 'quant.factor.volumeDesc' },
];

export const QUANT_MODES = [
  { id: 'backtest', nameKey: 'quant.mode.backtest', descKey: 'quant.mode.backtestDesc' },
  { id: 'optimize', nameKey: 'quant.mode.optimize', descKey: 'quant.mode.optimizeDesc' },
  { id: 'ml', nameKey: 'quant.mode.ml', descKey: 'quant.mode.mlDesc' },
];

export const QUANT_OBJECTIVES = [
  { id: 'sharpe', nameKey: 'quant.objective.sharpe' },
  { id: 'totalReturn', nameKey: 'quant.objective.totalReturn' },
  { id: 'cagr', nameKey: 'quant.objective.cagr' },
  { id: 'calmar', nameKey: 'quant.objective.calmar' },
];

export const ML_FACTORS = ['momentum', 'lowVol', 'trend', 'news', 'newsTrend', 'volume'];
export const ML_MODELS = [
  { id: 'logistic', nameKey: 'quant.ml.modelLogistic' },
  { id: 'mlp', nameKey: 'quant.ml.modelMlp' },
];
export const ML_NEWS_WINDOW = 20;
export const ML_MIN_SAMPLES = 120;
export const ML_TUNING_GRID = [
  { hidden: 4, epochs: 80 },
  { hidden: 4, epochs: 120 },
  { hidden: 6, epochs: 80 },
  { hidden: 6, epochs: 120 },
  { hidden: 8, epochs: 80 },
  { hidden: 8, epochs: 120 },
];

const param = (id, labelKey, def, min, max, step = 1) => ({
  id, labelKey, default: def, min, max, step,
});

export const QUANT_STRATEGIES = {
  buyHold: {
    id: 'buyHold',
    nameKey: 'quant.strategy.buyHold.name',
    descKey: 'quant.strategy.buyHold.desc',
    params: [],
  },
  smaCross: {
    id: 'smaCross',
    nameKey: 'quant.strategy.smaCross.name',
    descKey: 'quant.strategy.smaCross.desc',
    params: [
      param('fast', 'quant.param.fast', 20, 2, 120),
      param('slow', 'quant.param.slow', 50, 5, 250),
    ],
  },
  rsiReversion: {
    id: 'rsiReversion',
    nameKey: 'quant.strategy.rsiReversion.name',
    descKey: 'quant.strategy.rsiReversion.desc',
    params: [
      param('rsiPeriod', 'quant.param.rsiPeriod', 14, 5, 40),
      param('rsiEntry', 'quant.param.rsiEntry', 30, 10, 45),
      param('rsiExit', 'quant.param.rsiExit', 70, 55, 90),
    ],
  },
  momentum: {
    id: 'momentum',
    nameKey: 'quant.strategy.momentum.name',
    descKey: 'quant.strategy.momentum.desc',
    params: [
      param('lookback', 'quant.param.lookback', 60, 10, 250),
      param('threshold', 'quant.param.threshold', 2, 0, 20, 0.5),
    ],
  },
  breakout: {
    id: 'breakout',
    nameKey: 'quant.strategy.breakout.name',
    descKey: 'quant.strategy.breakout.desc',
    params: [
      param('lookback', 'quant.param.breakoutLookback', 20, 5, 120),
    ],
  },
};

export const DEFAULT_QUANT_CONFIG = {
  ticker: '',
  strategy: 'smaCross',
  mode: 'backtest',
  params: {
    fast: 20,
    slow: 50,
    rsiPeriod: 14,
    rsiEntry: 30,
    rsiExit: 70,
    lookback: 60,
    threshold: 2,
  },
  initialCash: QUANT_CASH_OPTIONS[1],
  commission: 1,
  factor: 'momentum',
  factorLookback: 60,
  objective: 'sharpe',
  splitPct: 70,
  mlLookback: 30,
  mlHorizon: 10,
  mlTopN: 5,
  mlTestPct: 30,
  mlModel: 'mlp',
  mlAutoTune: false,
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function quantStrategy(id) {
  return QUANT_STRATEGIES[id] || QUANT_STRATEGIES.smaCross;
}

function normalizeParams(strategyId, params = {}) {
  const strategy = quantStrategy(strategyId);
  const out = {};
  for (const definition of strategy.params) {
    out[definition.id] = clamp(
      params[definition.id],
      definition.min,
      definition.max,
      definition.default,
    );
  }
  if (strategyId === 'smaCross' && out.fast >= out.slow) {
    out.fast = Math.max(2, Math.min(out.slow - 1, out.fast));
  }
  if (strategyId === 'rsiReversion' && out.rsiEntry >= out.rsiExit - 5) {
    out.rsiExit = Math.min(90, out.rsiEntry + 5);
  }
  return out;
}

export function normalizeQuantConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const strategyId = QUANT_STRATEGIES[source.strategy] ? source.strategy : DEFAULT_QUANT_CONFIG.strategy;
  const factor = QUANT_FACTOR_OPTIONS.some((entry) => entry.id === source.factor)
    ? source.factor
    : DEFAULT_QUANT_CONFIG.factor;
  const mode = QUANT_MODES.some((entry) => entry.id === source.mode)
    ? source.mode : DEFAULT_QUANT_CONFIG.mode;
  const objective = QUANT_OBJECTIVES.some((entry) => entry.id === source.objective)
    ? source.objective : DEFAULT_QUANT_CONFIG.objective;
  const mlModel = ML_MODELS.some((entry) => entry.id === source.mlModel)
    ? source.mlModel : DEFAULT_QUANT_CONFIG.mlModel;
  return {
    ticker: typeof source.ticker === 'string' ? source.ticker.slice(0, 8) : '',
    strategy: strategyId,
    mode,
    params: normalizeParams(strategyId, source.params),
    initialCash: QUANT_CASH_OPTIONS.includes(Number(source.initialCash))
      ? Number(source.initialCash) : DEFAULT_QUANT_CONFIG.initialCash,
    commission: clamp(source.commission, 0, 10, DEFAULT_QUANT_CONFIG.commission),
    factor,
    factorLookback: Math.round(clamp(source.factorLookback, 20, 250, DEFAULT_QUANT_CONFIG.factorLookback)),
    objective,
    splitPct: Math.round(clamp(source.splitPct, 50, 90, DEFAULT_QUANT_CONFIG.splitPct)),
    mlLookback: Math.round(clamp(source.mlLookback, 20, 50, DEFAULT_QUANT_CONFIG.mlLookback)),
    mlHorizon: Math.round(clamp(source.mlHorizon, 5, 30, DEFAULT_QUANT_CONFIG.mlHorizon)),
    mlTopN: Math.round(clamp(source.mlTopN, 3, 10, DEFAULT_QUANT_CONFIG.mlTopN)),
    mlTestPct: Math.round(clamp(source.mlTestPct, 20, 50, DEFAULT_QUANT_CONFIG.mlTestPct)),
    mlModel,
    mlAutoTune: Boolean(source.mlAutoTune),
  };
}

function rsiAt(closes, index, period) {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const change = closes[cursor] - closes[cursor - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (gains + losses === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function signalAt(strategyId, params, candles, index) {
  const closes = candles.map((candle) => candle.c);
  if (strategyId === 'buyHold') return 'buy';
  if (strategyId === 'smaCross') {
    const fast = sma(closes.slice(0, index + 1), params.fast);
    const slow = sma(closes.slice(0, index + 1), params.slow);
    const prevFast = sma(closes.slice(0, index), params.fast);
    const prevSlow = sma(closes.slice(0, index), params.slow);
    if (fast == null || slow == null || prevFast == null || prevSlow == null) return null;
    if (fast > slow && prevFast <= prevSlow) return 'buy';
    if (fast < slow && prevFast >= prevSlow) return 'sell';
    return null;
  }
  if (strategyId === 'rsiReversion') {
    const value = rsiAt(closes, index, Math.round(params.rsiPeriod));
    if (value == null) return null;
    if (value < params.rsiEntry) return 'buy';
    if (value > params.rsiExit) return 'sell';
    return null;
  }
  if (strategyId === 'momentum') {
    const lookback = Math.round(params.lookback);
    if (index < lookback) return null;
    const base = closes[index - lookback];
    if (!base) return null;
    const move = (closes[index] / base - 1) * 100;
    if (move > params.threshold) return 'buy';
    if (move < -params.threshold) return 'sell';
    return null;
  }
  if (strategyId === 'breakout') {
    const lookback = Math.round(params.lookback);
    if (index < lookback) return null;
    const prior = candles.slice(index - lookback, index);
    const high = Math.max(...prior.map((candle) => candle.h));
    const low = Math.min(...prior.map((candle) => candle.l));
    if (candles[index].c > high) return 'buy';
    if (candles[index].c < low) return 'sell';
    return null;
  }
  return null;
}

/** Latest crossover / threshold signal on the final bar, for plan previews. */
export function latestStrategySignal(strategyId, params, candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  return signalAt(strategyId, normalizeParams(strategyId, params || {}), candles, candles.length - 1);
}

/**
 * Current regime rather than a one-bar crossover: useful for portfolio
 * construction, where the fund needs a sustained bias.
 */
export function strategyRegime(strategyId, params, candles) {
  if (!Array.isArray(candles) || candles.length < 2) return 'hold';
  const normalized = normalizeParams(strategyId, params || {});
  const closes = candles.map((candle) => candle.c);
  const last = closes.length - 1;
  if (strategyId === 'buyHold') return 'buy';
  if (strategyId === 'smaCross') {
    const fast = sma(closes, normalized.fast);
    const slow = sma(closes, normalized.slow);
    if (fast == null || slow == null) return 'hold';
    return fast > slow ? 'buy' : fast < slow ? 'sell' : 'hold';
  }
  if (strategyId === 'rsiReversion') {
    const value = rsiAt(closes, last, Math.round(normalized.rsiPeriod));
    if (value == null) return 'hold';
    if (value < normalized.rsiEntry) return 'buy';
    if (value > normalized.rsiExit) return 'sell';
    return 'hold';
  }
  if (strategyId === 'momentum') {
    const lookback = Math.round(normalized.lookback);
    if (last < lookback || !closes[last - lookback]) return 'hold';
    const move = (closes[last] / closes[last - lookback] - 1) * 100;
    if (move > normalized.threshold) return 'buy';
    if (move < -normalized.threshold) return 'sell';
    return 'hold';
  }
  if (strategyId === 'breakout') {
    const lookback = Math.round(normalized.lookback);
    if (last < lookback) return 'hold';
    const prior = candles.slice(last - lookback, last);
    const high = Math.max(...prior.map((candle) => candle.h));
    const low = Math.min(...prior.map((candle) => candle.l));
    if (closes[last] > high) return 'buy';
    if (closes[last] < low) return 'sell';
    return 'hold';
  }
  return 'hold';
}

function equityMetrics(curve, initialCash, trades, bars) {
  const values = curve.length ? curve : [initialCash];
  const finalEquity = values[values.length - 1];
  const totalReturnPct = initialCash > 0 ? (finalEquity / initialCash - 1) * 100 : 0;
  const years = Math.max(1 / 252, bars / 252);
  const cagrPct = initialCash > 0 && finalEquity > 0
    ? ((Math.pow(finalEquity / initialCash, 1 / years) - 1) * 100)
    : -100;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, (value - peak) / peak);
  }
  const dailyReturns = [];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > 0) {
      dailyReturns.push((values[index] - values[index - 1]) / values[index - 1]);
    }
  }
  const mean = dailyReturns.length
    ? dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / dailyReturns.length
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    initialCash,
    finalEquity,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: Math.abs(worst * 100),
    volatilityPct: std * Math.sqrt(252) * 100,
    sharpe,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    trades: trades.length,
    exposurePct: 0,
    bars,
  };
}

export function runBacktest({
  candles, strategy = 'smaCross', params = {}, initialCash = 100000, commission = 1,
}) {
  if (!Array.isArray(candles) || candles.length < QUANT_MIN_BARS) {
    return { ok: false, error: 'quant.error.history' };
  }
  const strategyDef = QUANT_STRATEGIES[strategy];
  if (!strategyDef) return { ok: false, error: 'quant.error.strategy' };
  const normalizedParams = normalizeParams(strategy, params);
  const cashStart = QUANT_CASH_OPTIONS.includes(Number(initialCash))
    ? Number(initialCash) : DEFAULT_QUANT_CONFIG.initialCash;
  const fee = Math.max(0, Number(commission) || 0);
  const closes = candles.map((candle) => candle.c);
  let cash = cashStart;
  let qty = 0;
  let entry = null;
  let exposureBars = 0;
  const trades = [];
  const curve = [cashStart];

  for (let index = 1; index < candles.length; index += 1) {
    const signal = signalAt(strategy, normalizedParams, candles.slice(0, index), index - 1);
    const open = candles[index].o;
    if (signal === 'buy' && qty === 0) {
      const quantity = Math.floor((cash - fee) / open);
      if (quantity > 0) {
        cash -= quantity * open + fee;
        qty = quantity;
        entry = {
          entryIndex: index,
          entryPrice: open,
          qty: quantity,
          fee,
        };
      }
    } else if (signal === 'sell' && qty > 0 && entry) {
      const proceeds = qty * open - fee;
      cash += proceeds;
      const pnl = qty * (open - entry.entryPrice) - fee * 2;
      trades.push({
        entryIndex: entry.entryIndex,
        exitIndex: index,
        entryPrice: entry.entryPrice,
        exitPrice: open,
        qty,
        pnl,
        returnPct: entry.entryPrice > 0
          ? ((open - entry.entryPrice) / entry.entryPrice) * 100 : 0,
        barsHeld: index - entry.entryIndex,
        fee: entry.fee + fee,
      });
      qty = 0;
      entry = null;
    }
    if (qty > 0) exposureBars += 1;
    curve.push(cash + qty * closes[index]);
  }

  const finalClose = closes[closes.length - 1];
  if (qty > 0) {
    const pnl = qty * (finalClose - entry.entryPrice) - entry.fee;
    trades.push({
      entryIndex: entry.entryIndex,
      exitIndex: candles.length - 1,
      entryPrice: entry.entryPrice,
      exitPrice: null,
      qty,
      pnl,
      returnPct: entry.entryPrice > 0 ? ((finalClose - entry.entryPrice) / entry.entryPrice) * 100 : 0,
      barsHeld: candles.length - 1 - entry.entryIndex,
      fee: entry.fee,
      open: true,
    });
    cash += qty * finalClose;
  }

  const metrics = equityMetrics(curve, cashStart, trades, candles.length - 1);
  metrics.exposurePct = (exposureBars / Math.max(1, candles.length - 1)) * 100;
  metrics.finalEquity = cash;
  const benchmarkReturnPct = closes[0] > 0 ? (finalClose / closes[0] - 1) * 100 : 0;
  return {
    ok: true,
    strategy,
    params: normalizedParams,
    metrics: {
      ...metrics,
      benchmarkReturnPct,
      excessReturnPct: metrics.totalReturnPct - benchmarkReturnPct,
      openPosition: qty > 0,
    },
    trades,
    equityCurve: curve.map((value, index) => ({
      index,
      day: candles[Math.min(index, candles.length - 1)]?.d,
      equity: Math.round(value * 100) / 100,
    })),
    lastPrice: finalClose,
  };
}

function factorMetric(state, company, lookback, factor) {
  const history = state.market?.history?.[company.ticker] || [];
  const quote = state.market?.quotes?.[company.ticker];
  const closes = history.map((candle) => candle.c).filter((value) => Number.isFinite(value));
  const price = quote && Number.isFinite(quote.last) ? quote.last : closes[closes.length - 1];
  if (!price || closes.length < 2) return null;
  if (factor === 'momentum') {
    const window = closes.slice(-(lookback + 1));
    if (window.length < 2 || !window[0]) return null;
    return { metric: (price / window[0] - 1) * 100, score: (price / window[0] - 1) * 100 };
  }
  if (factor === 'lowVol') {
    const volatility = annualizedVolatility(closes.slice(-(lookback + 1)));
    if (!Number.isFinite(volatility)) return null;
    return { metric: volatility, score: -volatility };
  }
  if (factor === 'trend') {
    const window = closes.slice(-Math.max(lookback, 50));
    const short = sma(window, 20);
    const long = sma(window, 50);
    if (short == null || long == null || long <= 0) return null;
    const gap = ((short / long) - 1) * 100;
    return { metric: gap, score: gap };
  }
  if (factor === 'value') {
    const fundamentals = fundamentalsFor(company, price);
    if (!Number.isFinite(fundamentals.pe) || fundamentals.pe <= 0) return null;
    return { metric: fundamentals.pe, score: -fundamentals.pe };
  }
  if (factor === 'news') {
    const sentiment = newsSentiment(state, company.ticker, state.market?.day ?? 0, lookback);
    return { metric: sentiment, score: sentiment };
  }
  if (factor === 'newsTrend') {
    const trend = newsSentimentTrend(state, company.ticker, state.market?.day ?? 0, lookback);
    return { metric: trend, score: trend };
  }
  if (factor === 'volume') {
    const volumes = history.map((candle) => Number(candle.v) || 0);
    if (volumes.length < 10) return null;
    const recent = volumes.slice(-5);
    const baseline = volumes.slice(-(lookback + 1), -5);
    if (!baseline.length) return null;
    const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const baseAverage = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
    if (!baseAverage || !recentAverage) return null;
    const change = (recentAverage / baseAverage - 1) * 100;
    return { metric: change, score: change };
  }
  return null;
}

function newsSentiment(state, ticker, day, lookback = ML_NEWS_WINDOW) {
  const news = state.market?.news || [];
  const value = news
    .filter((entry) => entry.ticker === ticker && Number.isFinite(entry.day)
      && entry.day <= day && entry.day >= day - lookback)
    .reduce((sum, entry) => sum + (Number(entry.pct) || 0), 0);
  return Math.round(value * 100) / 100;
}

/** Compares recent news sentiment with the prior window to capture attention shifts. */
function newsSentimentTrend(state, ticker, day, lookback = ML_NEWS_WINDOW) {
  const half = Math.max(5, Math.round(lookback / 2));
  const recent = newsSentiment(state, ticker, day, half);
  const prior = newsSentiment(state, ticker, day - half, half);
  return Math.round((recent - prior) * 100) / 100;
}

export function factorResearch(state, { factor = 'momentum', lookback = 60 } = {}) {
  const normalizedFactor = QUANT_FACTOR_OPTIONS.some((entry) => entry.id === factor)
    ? factor : 'momentum';
  const window = Math.round(clamp(lookback, 20, 250, 60));
  const rows = COMPANIES.filter((company) => !company.isEtf)
    .map((company) => {
      const result = factorMetric(state, company, window, normalizedFactor);
      if (!result) return null;
      return {
        ticker: company.ticker,
        nameKey: `company.${company.ticker}.name`,
        sector: company.sector,
        metric: Math.round(result.metric * 100) / 100,
        score: result.score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    factor: normalizedFactor,
    lookback: window,
    rows,
    count: rows.length,
  };
}

const OPTIMIZATION_GRIDS = {
  buyHold: [{}],
  smaCross: {
    fast: [5, 10, 20, 30, 40],
    slow: [30, 50, 80, 120, 160],
  },
  rsiReversion: {
    rsiPeriod: [7, 14, 21],
    rsiEntry: [20, 30, 40],
    rsiExit: [60, 70, 80],
  },
  momentum: {
    lookback: [20, 40, 60, 120],
    threshold: [1, 2, 3, 5],
  },
  breakout: {
    lookback: [10, 20, 40, 60],
  },
};

/** Cartesian product of the built-in parameter grid, filtered to valid combos. */
export function parameterGrid(strategyId) {
  const grid = OPTIMIZATION_GRIDS[strategyId] || [{}];
  if (Array.isArray(grid)) return grid.map((params) => ({ ...params }));
  let combos = [{}];
  for (const [key, values] of Object.entries(grid)) {
    combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value })));
  }
  const valid = combos.filter((combo) => {
    if (strategyId === 'smaCross') return combo.fast < combo.slow;
    if (strategyId === 'rsiReversion') return combo.rsiEntry + 5 <= combo.rsiExit;
    return true;
  });
  return valid.slice(0, 64).map((params) => normalizeParams(strategyId, params));
}

function objectiveScore(metrics, objective) {
  if (!metrics) return -Infinity;
  if (objective === 'totalReturn') return metrics.totalReturnPct;
  if (objective === 'cagr') return metrics.cagrPct;
  if (objective === 'calmar') return metrics.totalReturnPct / Math.max(1, metrics.maxDrawdownPct);
  return metrics.sharpe;
}

export function optimizeStrategy({
  candles,
  strategy = 'smaCross',
  baseParams = {},
  initialCash = 100000,
  commission = 1,
  splitPct = 70,
  objective = 'sharpe',
}) {
  if (!Array.isArray(candles) || candles.length < QUANT_MIN_BARS * 2) {
    return { ok: false, error: 'quant.error.optimizeHistory' };
  }
  const split = Math.round(clamp(splitPct, 50, 90, 70));
  let splitIndex = Math.floor(candles.length * split / 100);
  splitIndex = Math.max(QUANT_MIN_BARS, Math.min(candles.length - QUANT_MIN_BARS, splitIndex));
  const inCandles = candles.slice(0, splitIndex);
  const outCandles = candles.slice(splitIndex);
  const combos = parameterGrid(strategy);
  const candidates = [];
  for (const params of combos) {
    const run = runBacktest({
      candles: inCandles,
      strategy,
      params,
      initialCash,
      commission,
    });
    if (!run.ok) continue;
    candidates.push({
      params,
      inSample: run.metrics,
      score: objectiveScore(run.metrics, objective),
    });
  }
  if (!candidates.length) return { ok: false, error: 'quant.error.optimizeHistory' };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const outSample = runBacktest({
    candles: outCandles,
    strategy,
    params: best.params,
    initialCash,
    commission,
  });
  const baselineOut = runBacktest({
    candles: outCandles,
    strategy,
    params: baseParams,
    initialCash,
    commission,
  });
  const inMetrics = best.inSample;
  const outMetrics = outSample.ok ? outSample.metrics : null;
  const overfitRisk = Boolean(outMetrics && (
    outMetrics.totalReturnPct < 0
    || outMetrics.sharpe < inMetrics.sharpe * 0.3
    || (inMetrics.totalReturnPct > 5 && outMetrics.totalReturnPct < inMetrics.totalReturnPct * 0.3)
  ));
  return {
    ok: true,
    strategy,
    objective,
    splitPct: Math.round(splitIndex / candles.length * 100),
    splitIndex,
    comboCount: combos.length,
    candidates: candidates.slice(0, 8),
    best,
    outSample: outSample.ok ? outSample : null,
    baselineOut: baselineOut.ok ? baselineOut : null,
    overfitRisk,
  };
}

function mlFactorValue(closes, index, factor, lookback, volumes = []) {
  if (index < lookback || index >= closes.length) return null;
  if (factor === 'momentum') {
    const base = closes[index - lookback];
    if (!base) return null;
    return (closes[index] / base - 1) * 100;
  }
  if (factor === 'lowVol') {
    const volatility = annualizedVolatility(closes.slice(index - lookback, index + 1));
    return Number.isFinite(volatility) ? -volatility : null;
  }
  if (factor === 'trend') {
    const short = sma(closes.slice(0, index + 1), 20);
    const long = sma(closes.slice(0, index + 1), 50);
    if (short == null || long == null || long <= 0) return null;
    return ((short / long) - 1) * 100;
  }
  if (factor === 'volume') {
    if (volumes.length <= index) return null;
    const recent = volumes.slice(index - 4, index + 1);
    const baseline = volumes.slice(index - lookback, index - 4);
    if (!recent.length || !baseline.length) return null;
    const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const baseAverage = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
    if (!recentAverage || !baseAverage) return null;
    return (recentAverage / baseAverage - 1) * 100;
  }
  return null;
}

function zScoreRows(rows, featureCount) {
  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(0);
  for (const row of rows) {
    for (let index = 0; index < featureCount; index += 1) means[index] += row.features[index];
  }
  for (let index = 0; index < featureCount; index += 1) means[index] /= Math.max(1, rows.length);
  for (const row of rows) {
    for (let index = 0; index < featureCount; index += 1) {
      stds[index] += (row.features[index] - means[index]) ** 2;
    }
  }
  for (let index = 0; index < featureCount; index += 1) {
    stds[index] = Math.sqrt(stds[index] / Math.max(1, rows.length)) || 1;
  }
  return rows.map((row) => ({
    ...row,
    features: row.features.map((value, index) => (value - means[index]) / stds[index]),
  }));
}

export function buildMlPanel(state, { lookback = 30, horizon = 10 } = {}) {
  const window = Math.round(clamp(lookback, 20, 50, 30));
  const forward = Math.round(clamp(horizon, 5, 30, 10));
  const companies = COMPANIES.filter((company) => !company.isEtf);
  const series = companies.map((company) => {
    const candles = state.market?.history?.[company.ticker] || [];
    return {
      company,
      closes: candles.map((candle) => candle.c).filter((value) => Number.isFinite(value)),
      volumes: candles.map((candle) => Number(candle.v) || 0),
    };
  }).filter((entry) => entry.closes.length >= window + forward + 1);
  if (!series.length) return { ok: false, error: 'quant.error.mlData' };
  const maxLength = Math.min(...series.map((entry) => entry.closes.length));
  const dates = [];
  for (let index = window; index < maxLength - forward; index += 3) dates.push(index);
  if (!dates.length) return { ok: false, error: 'quant.error.mlData' };
  const groups = [];
  const samples = [];
  for (const date of dates) {
    const rows = [];
    for (const entry of series) {
      const features = ML_FACTORS.map((factor) => {
        if (factor === 'news') return newsSentiment(state, entry.company.ticker, date, window);
        if (factor === 'newsTrend') return newsSentimentTrend(state, entry.company.ticker, date, window);
        return mlFactorValue(entry.closes, date, factor, window, entry.volumes);
      });
      if (features.some((value) => value == null || !Number.isFinite(value))) continue;
      const forwardReturn = (entry.closes[date + forward] / entry.closes[date] - 1) * 100;
      rows.push({
        date,
        ticker: entry.company.ticker,
        sector: entry.company.sector,
        features,
        forwardReturn,
      });
    }
    if (rows.length < 8) continue;
    const sorted = [...rows].sort((a, b) => a.forwardReturn - b.forwardReturn);
    const median = sorted[Math.floor(sorted.length / 2)].forwardReturn;
    const labeled = rows.map((row) => ({ ...row, label: row.forwardReturn >= median ? 1 : 0 }));
    groups.push({ date, rows: zScoreRows(labeled, ML_FACTORS.length) });
    samples.push(...groups[groups.length - 1].rows);
  }
  return {
    ok: true,
    lookback: window,
    horizon: forward,
    dates: groups.map((group) => group.date),
    groups,
    samples,
  };
}

function sigmoid(value) {
  if (value > 30) return 1;
  if (value < -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function predictProbability(weights, features) {
  let sum = weights[0];
  for (let index = 0; index < features.length; index += 1) {
    sum += weights[index + 1] * features[index];
  }
  return sigmoid(sum);
}

export function trainMlpModel(samples, {
  hidden = 6, epochs = 120, learningRate = 0.05, l2 = 0.001,
} = {}) {
  const featureCount = ML_FACTORS.length;
  const hiddenUnits = Math.max(2, Math.min(12, Math.round(hidden)));
  const w1 = Array.from({ length: hiddenUnits }, (_, unit) => (
    Array.from({ length: featureCount }, (_, feature) => (
      Math.sin((unit + 1) * (feature + 2) * 0.7) * 0.4
    ))
  ));
  const b1 = Array.from({ length: hiddenUnits }, (_, unit) => Math.sin(unit + 1) * 0.1);
  const w2 = Array.from({ length: hiddenUnits }, (_, unit) => Math.sin(unit + 2) * 0.35);
  let b2 = 0;
  const train = (features) => {
    const activations = w1.map((row, unit) => Math.tanh(
      row.reduce((sum, weight, index) => sum + weight * features[index], b1[unit]),
    ));
    const output = activations.reduce((sum, activation, unit) => sum + activation * w2[unit], b2);
    return { activations, probability: sigmoid(output) };
  };
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gw1 = Array.from({ length: hiddenUnits }, () => Array(featureCount).fill(0));
    const gb1 = Array(hiddenUnits).fill(0);
    const gw2 = Array(hiddenUnits).fill(0);
    let gb2 = 0;
    for (const sample of samples) {
      const { activations, probability } = train(sample.features);
      const delta = probability - sample.label;
      for (let unit = 0; unit < hiddenUnits; unit += 1) {
        gw2[unit] += delta * activations[unit];
        const hiddenDelta = delta * w2[unit] * (1 - activations[unit] ** 2);
        gb1[unit] += hiddenDelta;
        for (let feature = 0; feature < featureCount; feature += 1) {
          gw1[unit][feature] += hiddenDelta * sample.features[feature];
        }
      }
      gb2 += delta;
    }
    const scale = 1 / Math.max(1, samples.length);
    b2 -= learningRate * gb2 * scale;
    for (let unit = 0; unit < hiddenUnits; unit += 1) {
      w2[unit] -= learningRate * (gw2[unit] * scale + l2 * w2[unit]);
      b1[unit] -= learningRate * gb1[unit] * scale;
      for (let feature = 0; feature < featureCount; feature += 1) {
        w1[unit][feature] -= learningRate * (gw1[unit][feature] * scale + l2 * w1[unit][feature]);
      }
    }
  }
  let correct = 0;
  for (const sample of samples) {
    if ((train(sample.features).probability >= 0.5) === (sample.label === 1)) correct += 1;
  }
  const featureImportance = Object.fromEntries(ML_FACTORS.map((factor, feature) => [
    factor,
    Math.round(w1.reduce((sum, row) => sum + Math.abs(row[feature]), 0) * 1000) / 1000,
  ]));
  return {
    type: 'mlp',
    hidden: hiddenUnits,
    epochs,
    w1,
    b1,
    w2,
    b2,
    featureImportance,
    accuracy: samples.length ? correct / samples.length : 0,
    samples: samples.length,
  };
}

function predictMlp(model, features) {
  const activations = model.w1.map((row, unit) => Math.tanh(
    row.reduce((sum, weight, index) => sum + weight * features[index], model.b1[unit]),
  ));
  return sigmoid(activations.reduce((sum, activation, unit) => sum + activation * model.w2[unit], model.b2));
}

/**
 * Searches a small architecture grid on an internal validation slice. The test
 * set is never used for model selection, so the final out-of-sample check stays
 * honest.
 */
export function tuneMlpHyperparameters(fitSamples, validationSamples, grid = ML_TUNING_GRID) {
  if (!fitSamples?.length || !validationSamples?.length) return null;
  const candidates = grid.map((config) => {
    const model = trainMlpModel(fitSamples, config);
    let correct = 0;
    for (const sample of validationSamples) {
      if ((predictMlp(model, sample.features) >= 0.5) === (sample.label === 1)) correct += 1;
    }
    return {
      hidden: config.hidden,
      epochs: config.epochs,
      accuracy: model.accuracy,
      validationAccuracy: correct / validationSamples.length,
    };
  });
  candidates.sort((a, b) => (
    b.validationAccuracy - a.validationAccuracy
    || b.accuracy - a.accuracy
    || a.hidden - b.hidden
    || a.epochs - b.epochs
  ));
  return {
    gridSize: grid.length,
    best: candidates[0],
    candidates,
  };
}

export function trainLogisticModel(samples, { iterations = 160, learningRate = 0.08, l2 = 0.02 } = {}) {
  const featureCount = ML_FACTORS.length;
  const weights = Array(featureCount + 1).fill(0);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(featureCount + 1).fill(0);
    for (const sample of samples) {
      const probability = predictProbability(weights, sample.features);
      const error = probability - sample.label;
      gradient[0] += error;
      for (let index = 0; index < featureCount; index += 1) {
        gradient[index + 1] += error * sample.features[index];
      }
    }
    const scale = 1 / Math.max(1, samples.length);
    weights[0] -= learningRate * gradient[0] * scale;
    for (let index = 0; index < featureCount; index += 1) {
      weights[index + 1] -= learningRate * (gradient[index + 1] * scale + l2 * weights[index + 1]);
    }
  }
  let correct = 0;
  for (const sample of samples) {
    if ((predictProbability(weights, sample.features) >= 0.5) === (sample.label === 1)) correct += 1;
  }
  return {
    type: 'logistic',
    weights,
    coefficients: Object.fromEntries(ML_FACTORS.map((factor, index) => [factor, Math.round(weights[index + 1] * 1000) / 1000])),
    intercept: Math.round(weights[0] * 1000) / 1000,
    accuracy: samples.length ? correct / samples.length : 0,
    samples: samples.length,
  };
}

export function mlStockSelection(state, {
  lookback = 30,
  horizon = 10,
  topN = 5,
  testPct = 30,
  modelType = 'mlp',
  autoTune = false,
} = {}) {
  const panel = buildMlPanel(state, { lookback, horizon });
  if (!panel.ok) return panel;
  const sortedDates = [...new Set(panel.samples.map((sample) => sample.date))].sort((a, b) => a - b);
  if (sortedDates.length < 8 || panel.samples.length < ML_MIN_SAMPLES) {
    return { ok: false, error: 'quant.error.mlData' };
  }
  const testCount = Math.max(2, Math.round(sortedDates.length * clamp(testPct, 20, 50, 30) / 100));
  const splitDate = sortedDates[sortedDates.length - testCount];
  const trainSamples = panel.samples.filter((sample) => sample.date < splitDate);
  const testSamples = panel.samples.filter((sample) => sample.date >= splitDate);
  if (!trainSamples.length || !testSamples.length) return { ok: false, error: 'quant.error.mlData' };
  const normalizedModel = ML_MODELS.some((entry) => entry.id === modelType) ? modelType : 'mlp';
  let model = null;
  let tuning = null;
  if (normalizedModel === 'mlp' && autoTune) {
    const trainDates = [...new Set(trainSamples.map((sample) => sample.date))].sort((a, b) => a - b);
    const validationDates = new Set(trainDates.slice(Math.floor(trainDates.length * 0.7)));
    const fitSamples = trainSamples.filter((sample) => !validationDates.has(sample.date));
    const validationSamples = trainSamples.filter((sample) => validationDates.has(sample.date));
    tuning = tuneMlpHyperparameters(fitSamples, validationSamples);
    if (tuning) {
      model = trainMlpModel(trainSamples, {
        hidden: tuning.best.hidden,
        epochs: tuning.best.epochs,
      });
    }
  }
  if (!model) {
    model = normalizedModel === 'mlp'
      ? trainMlpModel(trainSamples)
      : trainLogisticModel(trainSamples);
  }
  const predict = normalizedModel === 'mlp'
    ? (features) => predictMlp(model, features)
    : (features) => predictProbability(model.weights, features);
  let testCorrect = 0;
  for (const sample of testSamples) {
    if ((predict(sample.features) >= 0.5) === (sample.label === 1)) testCorrect += 1;
  }
  const testAccuracy = testSamples.length ? testCorrect / testSamples.length : 0;
  const top = Math.round(clamp(topN, 3, 10, 5));
  const rebalanceDates = [];
  let nextDate = splitDate;
  for (const date of sortedDates) {
    if (date < splitDate) continue;
    if (date >= nextDate) {
      rebalanceDates.push(date);
      nextDate = date + Math.max(5, Math.round(clamp(horizon, 5, 30, 10)));
    }
  }
  const picks = [];
  let topCurve = 1;
  let benchmarkCurve = 1;
  const curve = [{ index: 0, top: topCurve, benchmark: benchmarkCurve }];
  let wins = 0;
  let excessSum = 0;
  for (const date of rebalanceDates) {
    const group = panel.groups.find((entry) => entry.date === date);
    if (!group) continue;
    const ranked = group.rows
      .map((row) => ({
        ticker: row.ticker,
        sector: row.sector,
        probability: predict(row.features),
        forwardReturn: row.forwardReturn,
      }))
      .sort((a, b) => b.probability - a.probability);
    const selected = ranked.slice(0, top);
    const topReturn = selected.reduce((sum, row) => sum + row.forwardReturn, 0) / Math.max(1, selected.length);
    const universeReturn = ranked.reduce((sum, row) => sum + row.forwardReturn, 0) / Math.max(1, ranked.length);
    topCurve *= 1 + topReturn / 100;
    benchmarkCurve *= 1 + universeReturn / 100;
    if (topReturn > universeReturn) wins += 1;
    excessSum += topReturn - universeReturn;
    picks.push({
      date,
      tickers: selected.map((row) => row.ticker),
      topReturn: Math.round(topReturn * 100) / 100,
      universeReturn: Math.round(universeReturn * 100) / 100,
      excess: Math.round((topReturn - universeReturn) * 100) / 100,
    });
    curve.push({
      index: curve.length,
      top: Math.round(topCurve * 10000) / 10000,
      benchmark: Math.round(benchmarkCurve * 10000) / 10000,
    });
  }
  if (!picks.length) return { ok: false, error: 'quant.error.mlData' };
  const overfitRisk = testAccuracy < 0.5
    || model.accuracy - testAccuracy > 0.15
    || (topCurve - 1) * 100 < 0;
  return {
    ok: true,
    lookback: panel.lookback,
    horizon: panel.horizon,
    topN: top,
    testPct: Math.round(clamp(testPct, 20, 50, 30)),
    splitDate,
    trainSamples: trainSamples.length,
    testSamples: testSamples.length,
    model: {
      ...model,
      testAccuracy,
    },
    tuning,
    portfolio: {
      totalReturnPct: (topCurve - 1) * 100,
      benchmarkReturnPct: (benchmarkCurve - 1) * 100,
      excessReturnPct: (topCurve - benchmarkCurve) * 100,
      hitRatePct: picks.length ? (wins / picks.length) * 100 : 0,
      avgExcessPct: picks.length ? excessSum / picks.length : 0,
      rebalances: picks.length,
    },
    picks,
    curve,
    overfitRisk,
  };
}
