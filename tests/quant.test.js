/**
 * Quant Lab tests: deterministic backtests, no-look-ahead execution, metrics,
 * configuration clamping and factor ranking.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import {
  QUANT_STRATEGIES, QUANT_FACTOR_OPTIONS, QUANT_MIN_BARS,
  normalizeQuantConfig, runBacktest, factorResearch,
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
  assertEqual(QUANT_FACTOR_OPTIONS.length, 4, 'four factors are available');
  assertEqual(Object.keys(QUANT_STRATEGIES).length, 5, 'five strategies are available');
});
