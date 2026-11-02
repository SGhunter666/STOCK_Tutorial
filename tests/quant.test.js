/**
 * Quant Lab tests: deterministic backtests, no-look-ahead execution, metrics,
 * configuration clamping and factor ranking.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState, marketEngineFromState } from '../js/game/gameState.js';
import { TICKS_PER_DAY } from '../js/market/calendar.js';
import {
  QUANT_STRATEGIES, QUANT_FACTOR_OPTIONS, QUANT_MIN_BARS, QUANT_MODES, QUANT_OBJECTIVES,
  ML_MODELS, ML_FACTORS,
  normalizeQuantConfig, runBacktest, factorResearch, factorRegression, parameterGrid, optimizeStrategy,
  buildMlPanel, trainLogisticModel, trainMlpModel, trainDeepMlpModel, mlStockSelection,
  tuneMlpHyperparameters, tuneDeepMlpHyperparameters,
} from '../js/quant/backtestEngine.js';

function candlesFromCloses(closes) {
  return closes.map((close, index) => ({
    d: index - closes.length,
    o: close,
    h: Math.round(close * 101) / 100,
    l: Math.round(close * 99) / 100,
    c: close,
    v: 1000 + index,
  }));
}

function trendingCloses(length = 120) {
  const closes = [];
  let price = 100;
  for (let index = 0; index < length; index += 1) {
    if (index < 40) price *= 0.995;
    else if (index < 80) price *= 1.012;
    else price *= 1.004;
    closes.push(Math.round(price * 100) / 100);
  }
  return closes;
}

suite('Quant: backtest engine');

test('buy-and-hold buys at the next open and marks to the final close', () => {
  const closes = trendingCloses(120);
  const result = runBacktest({
    candles: candlesFromCloses(closes),
    strategy: 'buyHold',
    initialCash: 100000,
    commission: 1,
  });
  assert(result.ok, 'buy-and-hold backtest runs');
  assertEqual(result.trades.length, 1, 'one open position');
  assert(result.trades[0].open, 'position remains open at the end');
  assertClose(result.trades[0].entryPrice, closes[1], 0.0001, 'fills at the second bar open');
  assert(result.metrics.totalReturnPct > 0, 'trending sample earns a positive return');
  assertClose(result.metrics.benchmarkReturnPct, (closes[closes.length - 1] / closes[0] - 1) * 100, 0.1, 'benchmark uses the close series');
  assert(result.metrics.sharpe > 0, 'positive drift gives a positive Sharpe');
});

test('SMA crossover signals fill at the next open and never look ahead', () => {
  const closes = trendingCloses(180);
  const result = runBacktest({
    candles: candlesFromCloses(closes),
    strategy: 'smaCross',
    params: { fast: 10, slow: 30 },
    initialCash: 100000,
    commission: 1,
  });
  assert(result.ok, 'SMA backtest runs');
  assert(result.trades.length >= 1, 'the sample produces at least one round trip');
  for (const trade of result.trades) {
    assert(trade.entryIndex >= 1, 'entry never happens on the first signal bar');
    assertClose(trade.entryPrice, closes[trade.entryIndex], 0.0001, 'entry fills at that bar open');
  }
  assertEqual(result.params.fast, 10, 'fast parameter preserved');
  assertEqual(result.params.slow, 30, 'slow parameter preserved');
});

test('RSI and breakout strategies run with bounded parameters', () => {
  const closes = [];
  let price = 100;
  for (let index = 0; index < 160; index += 1) {
    price *= 1 + Math.sin(index / 6) * 0.018;
    closes.push(Math.round(price * 100) / 100);
  }
  const candles = candlesFromCloses(closes);
  const rsi = runBacktest({
    candles,
    strategy: 'rsiReversion',
    params: { rsiPeriod: 8, rsiEntry: 25, rsiExit: 75 },
    initialCash: 100000,
  });
  assert(rsi.ok, 'RSI backtest runs');
  assertEqual(rsi.params.rsiPeriod, 8, 'RSI period kept');
  const breakout = runBacktest({
    candles,
    strategy: 'breakout',
    params: { lookback: 15 },
    initialCash: 100000,
  });
  assert(breakout.ok, 'breakout backtest runs');
  assert(breakout.metrics.maxDrawdownPct >= 0, 'drawdown is reported as a positive percentage');
  assert(Number.isFinite(breakout.metrics.sharpe), 'Sharpe is finite');
});

test('backtests reject short history and unknown strategies', () => {
  const short = runBacktest({
    candles: candlesFromCloses(Array.from({ length: QUANT_MIN_BARS - 1 }, (_, index) => 100 + index)),
    strategy: 'buyHold',
    initialCash: 100000,
  });
  assertEqual(short.ok, false);
  assertEqual(short.error, 'quant.error.history');
  const unknown = runBacktest({
    candles: candlesFromCloses(trendingCloses(80)),
    strategy: 'grid',
    initialCash: 100000,
  });
  assertEqual(unknown.ok, false);
  assertEqual(unknown.error, 'quant.error.strategy');
});

test('quant configuration clamps invalid values and keeps a valid strategy', () => {
  const config = normalizeQuantConfig({
    ticker: 'AURA',
    strategy: 'smaCross',
    params: { fast: 80, slow: 20 },
    initialCash: 12345,
    commission: 20,
    factor: 'moon',
    factorLookback: 999,
  });
  assertEqual(config.ticker, 'AURA');
  assertEqual(config.strategy, 'smaCross');
  assert(config.params.fast < config.params.slow, 'fast period stays below slow');
  assertEqual(config.initialCash, 100000, 'invalid cash falls back to the default');
  assertEqual(config.commission, 10, 'commission clamps to its ceiling');
  assertEqual(config.factor, 'momentum', 'unknown factor falls back');
  assertEqual(config.factorLookback, 250, 'lookback clamps to its ceiling');
  const defaulted = normalizeQuantConfig({ strategy: 'unknown' });
  assertEqual(defaulted.strategy, 'smaCross', 'unknown strategy falls back');
  const advanced = normalizeQuantConfig({
    mode: 'moon', objective: 'vibes', splitPct: 99,
    mlLookback: 500, mlHorizon: 1, mlTopN: 20, mlTestPct: 90,
  });
  assertEqual(advanced.mode, 'backtest', 'unknown mode falls back');
  assertEqual(advanced.objective, 'sharpe', 'unknown objective falls back');
  assertEqual(advanced.splitPct, 90, 'split clamps');
  assertEqual(advanced.mlLookback, 50, 'ML lookback clamps');
  assertEqual(advanced.mlHorizon, 5, 'ML horizon clamps');
  assertEqual(advanced.mlTopN, 10, 'ML top-N clamps');
  assertEqual(advanced.mlTestPct, 50, 'ML test share clamps');
  assertEqual(advanced.mlModel, 'mlp', 'unknown ML model falls back');
});

test('optimisation searches a valid grid and checks out of sample', () => {
  const grid = parameterGrid('smaCross');
  assert(grid.length > 0 && grid.length <= 64, 'grid is bounded');
  assert(grid.every((combo) => combo.fast < combo.slow), 'SMA grid keeps fast below slow');
  const rsiGrid = parameterGrid('rsiReversion');
  assert(rsiGrid.every((combo) => combo.rsiEntry + 5 <= combo.rsiExit), 'RSI grid keeps entry below exit');

  const candles = candlesFromCloses(trendingCloses(260));
  const first = optimizeStrategy({
    candles,
    strategy: 'smaCross',
    initialCash: 100000,
    splitPct: 70,
    objective: 'sharpe',
  });
  assert(first.ok, 'optimisation runs');
  assert(first.best.params.fast < first.best.params.slow, 'best parameters remain valid');
  assert(first.outSample, 'out-of-sample run exists');
  assertEqual(typeof first.overfitRisk, 'boolean', 'overfit flag is boolean');
  assert(first.comboCount > 1, 'more than one candidate searched');
  const second = optimizeStrategy({
    candles,
    strategy: 'smaCross',
    initialCash: 100000,
    splitPct: 70,
    objective: 'sharpe',
  });
  assertEqual(JSON.stringify(first.best.params), JSON.stringify(second.best.params), 'optimisation is deterministic');
  const tooShort = optimizeStrategy({
    candles: candles.slice(0, 50),
    strategy: 'smaCross',
  });
  assertEqual(tooShort.ok, false);
  assertEqual(tooShort.error, 'quant.error.optimizeHistory');
});

test('ML panel, logistic model and out-of-sample selection are deterministic', () => {
  const state = createGameState({ seed: 'quant-ml' });
  // Advance far enough that some panel dates overlap the simulated news ledger.
  const engine = marketEngineFromState(state);
  for (let tick = 0; tick < TICKS_PER_DAY * 23; tick += 1) engine.tick();
  const panel = buildMlPanel(state, { lookback: 30, horizon: 10 });
  assert(panel.ok, 'ML panel builds');
  assert(panel.samples.length >= 120, 'enough labelled samples');
  assert(panel.samples.every((sample) => sample.label === 0 || sample.label === 1), 'labels are binary');
  assertEqual(ML_FACTORS.length, 8, 'price, news, analyst, volume and flow factors');
  const newsFeature = ML_FACTORS.indexOf('news');
  assert(panel.samples.some((sample) => sample.features[newsFeature] !== 0), 'news sentiment reaches the ML samples');
  const subset = panel.samples.slice(0, 300);
  const model = trainLogisticModel(subset);
  assertEqual(model.weights.length, 9, 'eight factors plus intercept');
  assert(model.accuracy >= 0 && model.accuracy <= 1, 'training accuracy is a ratio');
  const mlp = trainMlpModel(subset, { hidden: 5, epochs: 80 });
  assertEqual(mlp.type, 'mlp', 'neural model type');
  assertEqual(mlp.hidden, 5, 'hidden units kept');
  assert(mlp.accuracy >= 0 && mlp.accuracy <= 1, 'MLP accuracy is a ratio');
  assert(Object.keys(mlp.featureImportance).length === 8, 'feature importance covers every factor');
  const deep = trainDeepMlpModel(subset, { hidden1: 5, hidden2: 3, epochs: 80 });
  assertEqual(deep.type, 'deep', 'deep model type');
  assertEqual(deep.hidden1, 5, 'first hidden layer kept');
  assertEqual(deep.hidden2, 3, 'second hidden layer kept');
  assert(deep.accuracy >= 0 && deep.accuracy <= 1, 'deep accuracy is a ratio');
  assert(Object.keys(deep.featureImportance).length === 8, 'deep importance covers every factor');

  const result = mlStockSelection(state, {
    lookback: 30, horizon: 10, topN: 5, testPct: 30, modelType: 'logistic',
  });
  assertEqual(result.model.type, 'logistic', 'logistic model selected');
  assert(result.ok, 'ML selection runs');
  assert(result.picks.length >= 1, 'at least one out-of-sample rebalance');
  assert(result.picks.every((pick) => pick.tickers.length <= 5), 'top-N respected');
  assert(result.picks.every((pick) => pick.date <= state.market.day), 'pick labels use market days, not array indices');
  assert(result.splitDate <= state.market.day, 'OOS start is a market day');
  assert(result.portfolio.totalReturnPct >= -100, 'portfolio return is bounded');
  assertEqual(typeof result.overfitRisk, 'boolean', 'ML overfit flag is boolean');
  const second = mlStockSelection(state, {
    lookback: 30, horizon: 10, topN: 5, testPct: 30, modelType: 'logistic',
  });
  assertEqual(JSON.stringify(result.model.coefficients), JSON.stringify(second.model.coefficients), 'model is deterministic');
  const mlpResult = mlStockSelection(state, {
    lookback: 30, horizon: 10, topN: 5, testPct: 30, modelType: 'mlp',
  });
  assert(mlpResult.ok, 'MLP selection runs');
  assertEqual(mlpResult.model.type, 'mlp', 'MLP selection uses the neural model');
  assert(mlpResult.model.featureImportance.news >= 0, 'news sentiment contributes to importance');
  const deepResult = mlStockSelection(state, {
    lookback: 30, horizon: 10, topN: 5, testPct: 30, modelType: 'deep',
  });
  assert(deepResult.ok, 'deep selection runs');
  assertEqual(deepResult.model.type, 'deep', 'deep selection uses the two-layer model');
  assertEqual(deepResult.model.hidden2, 4, 'default second layer kept');
});

test('alternative-data factors, regression and model options are exposed', () => {
  assertEqual(QUANT_FACTOR_OPTIONS.length, 9, 'nine factors including flow and analyst revisions');
  assertEqual(ML_MODELS.length, 3, 'logistic, MLP and deep models');
  const state = createGameState({ seed: 'quant-news-factor' });
  const news = factorResearch(state, { factor: 'news', lookback: 20 });
  assert(news.rows.length > 0, 'news factor has a cross-section');
  assert(news.rows.every((row) => Number.isFinite(row.metric)), 'news metrics are numeric');
  const trend = factorResearch(state, { factor: 'newsTrend', lookback: 20 });
  assert(trend.rows.every((row) => Number.isFinite(row.metric)), 'news trend metrics are numeric');
  const boundaryState = createGameState({ seed: 'quant-news-boundary' });
  boundaryState.market.day = 0;
  boundaryState.market.news = [{
    id: 1, day: -10, tick: 0, kind: 'company', template: 'upgrade', ticker: 'HLIX', pct: 5,
  }];
  const boundaryTrend = factorResearch(boundaryState, { factor: 'newsTrend', lookback: 20 });
  const boundaryRow = boundaryTrend.rows.find((row) => row.ticker === 'HLIX');
  assertEqual(boundaryRow.metric, -5, 'boundary news is counted once in the prior window');
  const volume = factorResearch(state, { factor: 'volume', lookback: 60 });
  assert(volume.rows.length > 0, 'volume factor has a cross-section');
  assert(volume.rows.every((row) => Number.isFinite(row.metric)), 'volume metrics are numeric');
  const flow = factorResearch(state, { factor: 'flow', lookback: 60 });
  assert(flow.rows.length > 0, 'money-flow factor has a cross-section');
  assert(flow.rows.every((row) => Number.isFinite(row.metric)), 'flow metrics are numeric');
  assert(flow.rows.every((row) => row.metric >= -100 && row.metric <= 100), 'net buying pressure is a percentage');

  const analystState = createGameState({ seed: 'quant-analyst-factor' });
  analystState.market.news = [
    { id: 1, day: 0, tick: 0, ticker: 'HLIX', template: 'upgrade', pct: 5, kind: 'company' },
    { id: 2, day: -2, tick: 0, ticker: 'HLIX', template: 'downgrade', pct: -2, kind: 'company' },
  ];
  const analyst = factorResearch(analystState, { factor: 'analyst', lookback: 20 });
  assert(analyst.rows.length > 0, 'analyst revision factor has a cross-section');
  const analystRow = analyst.rows.find((row) => row.ticker === 'HLIX');
  assert(analystRow, 'upgraded company appears in the ranking');
  assertEqual(analystRow.metric, 3, 'net analyst revision accumulates upgrades and downgrades');

  const liveState = createGameState({ seed: 'quant-intraday-flow' });
  const liveEngine = marketEngineFromState(liveState);
  liveEngine.tick();
  liveEngine.tick();
  const liveFlow = factorResearch(liveState, { factor: 'flow', lookback: 20 });
  assert(liveState.market.intraday.AURA.length >= 2, 'intraday tick bars are recorded');
  assert(liveFlow.rows.every((row) => Number.isFinite(row.metric)), 'intraday flow metrics are numeric');
  assert(liveFlow.rows.every((row) => row.metric >= -100 && row.metric <= 100), 'intraday flow stays a percentage');
});

test('factor regression estimates premia, rank IC and explanatory power', () => {
  const state = createGameState({ seed: 'quant-regression' });
  const result = factorRegression(state, { lookback: 30, horizon: 10 });
  assert(result.ok, 'regression runs on the seeded panel');
  assert(result.samples >= 120, 'enough pooled samples');
  assert(result.dates >= 8, 'enough cross-sections');
  assertEqual(result.factors.length, ML_FACTORS.length, 'one row per factor');
  assert(result.factors.every((factor) => Number.isFinite(factor.coefficient)), 'coefficients are numeric');
  assert(result.factors.every((factor) => Number.isFinite(factor.ic)), 'rank IC is numeric');
  assert(result.factors.every((factor) => factor.ic >= -1 && factor.ic <= 1), 'rank IC stays a correlation');
  assert(Number.isFinite(result.intercept), 'intercept is numeric');
  assert(result.r2 >= -0.5 && result.r2 <= 1, 'R² is bounded');
  assert(ML_FACTORS.includes('flow'), 'regression includes the money-flow factor');
  const again = factorRegression(state, { lookback: 30, horizon: 10 });
  assertEqual(JSON.stringify(result), JSON.stringify(again), 'regression is deterministic');
  assertEqual(normalizeQuantConfig({ mode: 'regression' }).mode, 'regression', 'regression mode normalises');
});

test('automatic MLP tuning searches architectures without touching the test set', () => {
  const state = createGameState({ seed: 'quant-ml-tune' });
  const panel = buildMlPanel(state, { lookback: 30, horizon: 10 });
  assert(panel.ok, 'panel builds for tuning');
  const dates = [...new Set(panel.samples.map((sample) => sample.date))].sort((a, b) => a - b);
  const split = dates[Math.floor(dates.length * 0.7)];
  const fit = panel.samples.filter((sample) => sample.date < split);
  const validation = panel.samples.filter((sample) => sample.date >= split);
  const tuning = tuneMlpHyperparameters(fit, validation);
  assert(tuning, 'tuning returns candidates');
  assert(tuning.gridSize >= 4, 'several architectures searched');
  assert(typeof tuning.best.hidden === 'number' && typeof tuning.best.epochs === 'number', 'best config is concrete');
  assert(tuning.best.validationAccuracy >= 0 && tuning.best.validationAccuracy <= 1, 'validation accuracy is a ratio');
  const result = mlStockSelection(state, {
    lookback: 30, horizon: 10, topN: 5, testPct: 30, modelType: 'mlp', autoTune: true,
  });
  assert(result.ok, 'auto-tuned selection runs');
  assert(result.tuning, 'result exposes the tuning search');
  assertEqual(result.model.hidden, result.tuning.best.hidden, 'chosen hidden units are retrained');
  assertEqual(result.model.epochs, result.tuning.best.epochs, 'chosen epochs are retrained');
  assertEqual(normalizeQuantConfig({ mlAutoTune: true }).mlAutoTune, true, 'auto tuning flag normalises');
});

test('deep network tuning searches two hidden layers inside the training window', () => {
  const state = createGameState({ seed: 'quant-deep-tune' });
  const panel = buildMlPanel(state, { lookback: 20, horizon: 5 });
  assert(panel.ok, 'panel builds for deep tuning');
  const dates = [...new Set(panel.samples.map((sample) => sample.date))].sort((a, b) => a - b);
  const split = dates[Math.floor(dates.length * 0.7)];
  const fit = panel.samples.filter((sample) => sample.date < split);
  const validation = panel.samples.filter((sample) => sample.date >= split);
  const tuning = tuneDeepMlpHyperparameters(fit, validation, [
    { hidden1: 4, hidden2: 3, epochs: 40 },
    { hidden1: 6, hidden2: 4, epochs: 40 },
  ]);
  assert(tuning, 'deep tuning returns candidates');
  assertEqual(tuning.gridSize, 2, 'custom grid size is respected');
  assert(typeof tuning.best.hidden1 === 'number' && typeof tuning.best.hidden2 === 'number', 'best layers are concrete');
  const result = mlStockSelection(state, {
    lookback: 20, horizon: 5, topN: 5, testPct: 30, modelType: 'deep', autoTune: true,
  });
  assert(result.ok, 'auto-tuned deep selection runs');
  assert(result.tuning, 'deep result exposes the tuning search');
  assertEqual(result.model.hidden1, result.tuning.best.hidden1, 'chosen first layer is retrained');
  assertEqual(result.model.hidden2, result.tuning.best.hidden2, 'chosen second layer is retrained');
  assertEqual(result.model.epochs, result.tuning.best.epochs, 'chosen epochs are retrained');
});

test('new quant modes and objectives are exposed', () => {
  assertEqual(QUANT_MODES.length, 4, 'four research modes');
  assertEqual(QUANT_OBJECTIVES.length, 4, 'four optimisation objectives');
  assertEqual(QUANT_FACTOR_OPTIONS.length, 9, 'nine factors including news, volume, flow and analyst revisions');
  assert(QUANT_MODES.every((mode) => mode.nameKey && mode.descKey), 'mode keys exist');
});

test('backtesting never mutates the simulated account', () => {
  const state = createGameState({ seed: 'quant-purity' });
  const cash = state.account.cash;
  const trades = state.account.trades.length;
  const result = runBacktest({
    candles: state.market.history.AURA,
    strategy: 'momentum',
    params: { lookback: 40, threshold: 1 },
    initialCash: 100000,
  });
  assert(result.ok, 'backtest runs against game history');
  assertEqual(state.account.cash, cash, 'cash unchanged');
  assertEqual(state.account.trades.length, trades, 'trade ledger unchanged');
});

suite('Quant: factor research');

test('factor research is deterministic and ranks in the expected direction', () => {
  const state = createGameState({ seed: 'quant-factors' });
  const first = factorResearch(state, { factor: 'momentum', lookback: 60 });
  const second = factorResearch(state, { factor: 'momentum', lookback: 60 });
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'same inputs produce the same ranking');
  assert(first.rows.length >= 20, 'most companies have enough history');
  for (let index = 1; index < first.rows.length; index += 1) {
    assert(first.rows[index - 1].score >= first.rows[index].score, 'momentum is sorted strongest first');
  }
  const lowVol = factorResearch(state, { factor: 'lowVol', lookback: 60 });
  assert(lowVol.rows.length > 0, 'low-vol factor has rows');
  assert(lowVol.rows[0].metric < lowVol.rows[lowVol.rows.length - 1].metric, 'low-vol lists calmer names first');
  const value = factorResearch(state, { factor: 'value', lookback: 60 });
  assert(value.rows.every((row) => row.metric > 0), 'valuation only includes positive P/E');
  assertEqual(value.factor, 'value');
  assertEqual(QUANT_FACTOR_OPTIONS.length, 9, 'nine factors including news sentiment, flow and analyst revisions');
  assertEqual(Object.keys(QUANT_STRATEGIES).length, 5, 'five strategies are available');
});
