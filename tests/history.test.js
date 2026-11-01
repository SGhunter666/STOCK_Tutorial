/**
 * Historical replay tests: real data integrity, no future leakage, fills at close,
 * benchmark rules and separation from the academy account.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { HISTORY_SCENARIOS, HISTORY_SECTOR_PACKS, getHistoryScenario, eventsUpTo } from '../js/data/historyScenarios.js';
import {
  createHistoryRun, ensureHistoryRun, quoteAt, advanceRun, tradeAtClose, summary,
  barCount, currentDate, HISTORY_WARMUP, intradayPath, intradayBar, quoteAtTick,
  tradeAtTick, advanceHistoryTick, summaryAtTick, historyCandles,
} from '../js/history/replayEngine.js';
import { TICKS_PER_DAY } from '../js/market/calendar.js';
import { createGameState, hydrateState, serializeState } from '../js/game/gameState.js';
import { equity } from '../js/trading/account.js';

suite('Historical data');

let datasets = null;

async function loadDatasets() {
  if (datasets) return datasets;
  datasets = {};
  for (const scenario of HISTORY_SCENARIOS) {
    const response = await fetch(`../data/history/${scenario.fileName}`);
    assert(response.ok, `dataset ${scenario.fileName} loads`);
    datasets[scenario.id] = await response.json();
  }
  return datasets;
}

test('all scenarios load and match their metadata', async () => {
  const data = await loadDatasets();
  for (const scenario of HISTORY_SCENARIOS) {
    const dataset = data[scenario.id];
    assertEqual(dataset.id, scenario.id, 'dataset id');
    assertEqual(dataset.adjusted, true, 'prices marked adjusted');
    assertEqual(dataset.tickers.length, scenario.symbols.length, 'ticker count');
    for (const symbol of scenario.symbols) {
      assert(dataset.tickers.some((ticker) => ticker.symbol === symbol), `${symbol} present`);
    }
    const benchmark = dataset.tickers.find((ticker) => ticker.benchmark);
    assert(benchmark && benchmark.symbol === 'QQQ', 'QQQ benchmark present');
    const first = dataset.tickers[0];
    assertEqual(first.bars.length, scenario.approxDays, `${scenario.id} bar count`);
    assert(first.bars.length >= 250, 'enough history for a scenario');
    for (const ticker of dataset.tickers) {
      assertEqual(ticker.bars.length, scenario.approxDays, `${scenario.id} ${ticker.symbol} aligned bars`);
    }
  }
});

test('sector packs contain at least ten real symbols each', async () => {
  const data = await loadDatasets();
  assertEqual(HISTORY_SECTOR_PACKS.length, 11, 'eleven sector packs');
  for (const pack of HISTORY_SECTOR_PACKS) {
    assert(pack.tickers.length >= 10, `${pack.id} has at least ten symbols`);
  }
  const union = HISTORY_SECTOR_PACKS.flatMap((pack) => pack.tickers);
  assertEqual(new Set(union).size, union.length, 'no duplicate tickers across packs');
  assertEqual(union.length, 114, 'eleven packs cover 114 stocks');
  for (const scenarioId of ['2020-covid', '2022-hikes']) {
    const dataset = data[scenarioId];
    for (const pack of HISTORY_SECTOR_PACKS) {
      for (const symbol of pack.tickers) {
        const ticker = dataset.tickers.find((entry) => entry.symbol === symbol);
        assert(ticker, `${scenarioId} includes ${symbol}`);
        assertEqual(ticker.pack, pack.id, `${symbol} carries pack ${pack.id}`);
        assert(ticker.bars.length >= 240, `${symbol} has enough bars`);
      }
    }
  }
});

test('bars are sorted, positive and internally consistent', async () => {
  const data = await loadDatasets();
  for (const dataset of Object.values(data)) {
    for (const ticker of dataset.tickers) {
      let previous = '';
      for (const [date, open, high, low, close] of ticker.bars) {
        assert(date > previous, `${ticker.symbol} dates sorted`);
        previous = date;
        assert(open > 0 && high > 0 && low > 0 && close > 0, `${ticker.symbol} positive prices`);
        assert(high >= Math.max(open, close), `${ticker.symbol} high bound`);
        assert(low <= Math.min(open, close), `${ticker.symbol} low bound`);
      }
    }
    const symbols = dataset.tickers.map((ticker) => ticker.symbol);
    assertEqual(new Set(symbols).size, symbols.length, 'unique symbols');
  }
});

test('dataset start and end dates match the recorded period', async () => {
  const data = await loadDatasets();
  const crisis = data['2008-crisis'];
  assertEqual(crisis.tickers[0].bars[0][0], '2007-07-02', 'crisis start');
  assertEqual(crisis.tickers[0].bars[crisis.tickers[0].bars.length - 1][0], '2009-06-30', 'crisis end');
  const long = data['2015-long'];
  assertEqual(long.tickers[0].bars[0][0], '2015-01-02', 'long start');
  assertEqual(long.tickers[0].bars[long.tickers[0].bars.length - 1][0], '2026-10-30', 'long end');
  assertEqual(long.tickers.length, 75, '2015 universe has 75 symbols');
  for (const symbol of ['GE', 'XOM', 'NEE', 'CMCSA', 'TRIP', 'QQQ']) {
    assert(long.tickers.some((ticker) => ticker.symbol === symbol), `2015 universe includes ${symbol}`);
  }
  const covid = data['2020-covid'];
  assertEqual(covid.tickers[0].bars[0][0], '2020-01-02', 'covid start');
  assertEqual(covid.tickers[0].bars[covid.tickers[0].bars.length - 1][0], '2020-12-31', 'covid end');
  const hikes = data['2022-hikes'];
  assertEqual(hikes.tickers[0].bars[0][0], '2022-01-03', 'hikes start');
  assertEqual(hikes.tickers[0].bars[hikes.tickers[0].bars.length - 1][0], '2022-12-30', 'hikes end');
});

suite('Historical replay engine');

test('new replay run starts with an independent $10,000 account', async () => {
  const data = await loadDatasets();
  const run = createHistoryRun('2008-crisis');
  assertEqual(run.dayIndex, HISTORY_WARMUP, 'start with a chart warm-up window');
  assertEqual(run.tick, 0, 'start at the opening tick');
  assertEqual(run.account.initialCash, 10000);
  assertEqual(run.account.cash, 10000);
  assertEqual(Object.keys(run.account.positions).length, 0);
  assertEqual(barCount(data['2008-crisis']), 504, 'bar count');
  assertEqual(
    currentDate(data['2008-crisis'], run.dayIndex),
    data['2008-crisis'].tickers[0].bars[HISTORY_WARMUP][0],
    'current date matches the warm-up index',
  );
});

test('intraday ticks start at open, touch high and low, and end at close', async () => {
  const data = await loadDatasets();
  const bar = data['2008-crisis'].tickers.find((ticker) => ticker.symbol === 'AAPL').bars[50];
  const path = intradayPath(bar, 'AAPL');
  assertEqual(path.length, TICKS_PER_DAY, 'one price per tick');
  assertClose(path[0], bar[1], 0.01, 'first tick is the open');
  assertClose(path[path.length - 1], bar[4], 0.01, 'last tick is the close');
  assertClose(Math.max(...path), bar[2], 0.01, 'path touches the daily high');
  assertClose(Math.min(...path), bar[3], 0.01, 'path touches the daily low');
  for (const price of path) {
    assert(price >= bar[3] - 0.01 && price <= bar[2] + 0.01, 'price stays inside the daily range');
  }
  assert(path.some((price, index) => index > 0 && price !== path[index - 1]), 'prices move during the day');
});

test('quoteAtTick changes every tick and respects the partial candle', async () => {
  const data = await loadDatasets();
  const dataset = data['2008-crisis'];
  const day = 60;
  const first = quoteAtTick(dataset, 'AAPL', day, 0);
  const middle = quoteAtTick(dataset, 'AAPL', day, 3);
  const close = quoteAtTick(dataset, 'AAPL', day, TICKS_PER_DAY - 1);
  assert(first && middle && close, 'quotes exist');
  assert(first.last !== middle.last || middle.last !== close.last, 'quote changes across ticks');
  assertClose(close.last, quoteAt(dataset, 'AAPL', day).last, 0.01, 'last tick equals daily close');
  const partial = intradayBar(dataset.tickers.find((ticker) => ticker.symbol === 'AAPL').bars[day], 'AAPL', 3);
  assert(partial.v > 0 && partial.v < dataset.tickers.find((ticker) => ticker.symbol === 'AAPL').bars[day][5], 'volume accumulates intraday');
});

test('advanceHistoryTick closes the day after eight ticks', async () => {
  const data = await loadDatasets();
  let run = createHistoryRun('2008-crisis');
  for (let tick = 0; tick < TICKS_PER_DAY - 1; tick += 1) {
    const step = advanceHistoryTick(run, data['2008-crisis']);
    assertEqual(step.dayClosed, false, 'day stays open');
    run = step.run;
  }
  assertEqual(run.tick, TICKS_PER_DAY - 1, 'last intraday tick');
  const closed = advanceHistoryTick(run, data['2008-crisis']);
  assertEqual(closed.dayClosed, true, 'day closes');
  assertEqual(closed.run.tick, 0, 'next day starts at the open');
  assertEqual(closed.run.dayIndex, run.dayIndex + 1, 'day index advances');
});

test('tradeAtTick fills at the current intraday price', async () => {
  const data = await loadDatasets();
  const dataset = data['2008-crisis'];
  const run = createHistoryRun('2008-crisis');
  const quote = quoteAtTick(dataset, 'AAPL', run.dayIndex, 4);
  const bought = tradeAtTick(run, dataset, { symbol: 'AAPL', side: 'buy', qty: 10, tick: 4 });
  assert(bought.ok, 'buy succeeds');
  assertClose(bought.run.account.cash, 10000 - quote.last * 10 - 1, 0.01, 'cash uses the tick price');
  assertEqual(bought.trade.tick, 4, 'trade records the tick');
  const sum = summaryAtTick(bought.run, dataset);
  assert(Number.isFinite(sum.total), 'equity at tick is finite');
});

test('history candles support 5m, 15m, 1h, daily, weekly, monthly and yearly views', async () => {
  const data = await loadDatasets();
  const dataset = data['2008-crisis'];
  const day = 80;
  const tick = TICKS_PER_DAY - 1;
  const quote = quoteAtTick(dataset, 'AAPL', day, tick);
  const five = historyCandles(dataset, 'AAPL', day, tick, '5m', quote.last);
  const fifteen = historyCandles(dataset, 'AAPL', day, tick, '15m', quote.last);
  const hour = historyCandles(dataset, 'AAPL', day, tick, '1h', quote.last);
  assertEqual(five.intraday, true, 'intraday flag');
  assert(five.candles.length > 60, '5m bars fill the session');
  assertEqual(fifteen.candles.length, Math.ceil(five.candles.length / 3), '15m aggregation');
  assertEqual(hour.candles.length, Math.ceil(five.candles.length / 12), '1h aggregation');
  assertClose(five.candles[0].o, dataset.tickers.find((t) => t.symbol === 'AAPL').bars[day][1], 0.01, '5m opens at daily open');
  assertClose(five.candles[five.candles.length - 1].c, quote.last, 0.01, '5m current close matches tick quote');
  for (const candle of five.candles) {
    assert(candle.h >= candle.l, 'valid candle range');
  }

  const daily = historyCandles(dataset, 'AAPL', day, tick, '1d', quote.last);
  const weekly = historyCandles(dataset, 'AAPL', day, tick, '1w', quote.last);
  const monthly = historyCandles(dataset, 'AAPL', day, tick, '1mo', quote.last);
  const yearly = historyCandles(dataset, 'AAPL', day, tick, '1y', quote.last);
  assertEqual(daily.candles.length, day + 1, 'daily bars up to the current day');
  assert(weekly.candles.length < daily.candles.length, 'weekly aggregation reduces bars');
  assert(monthly.candles.length < weekly.candles.length, 'monthly aggregation reduces bars');
  assert(yearly.candles.length < monthly.candles.length, 'yearly aggregation reduces bars');
  assertClose(daily.candles[daily.candles.length - 1].c, quote.last, 0.01, 'daily current close matches tick quote');
  assertClose(daily.candles[0].o, dataset.tickers.find((t) => t.symbol === 'AAPL').bars[0][1], 0.01, 'daily series starts at the first open');
});

test('quoteAt only uses current and previous bars', async () => {
  const data = await loadDatasets();
  const quote = quoteAt(data['2008-crisis'], 'AAPL', 10);
  assert(quote && quote.last > 0, 'quote exists');
  assert(quote.prevClose > 0, 'previous close exists');
  assert(quote.ask > quote.bid, 'ask above bid');
  assertClose(quote.changePct, ((quote.last - quote.prevClose) / quote.prevClose) * 100, 1e-9, 'change percent');
});

test('advancing days is clamped to the end of the dataset', async () => {
  const data = await loadDatasets();
  const run = createHistoryRun('2008-crisis');
  const advanced = advanceRun(run, data['2008-crisis'], 5);
  assertEqual(advanced.dayIndex, HISTORY_WARMUP + 5, 'advance five days');
  const end = advanceRun(run, data['2008-crisis'], 10000);
  assertEqual(end.dayIndex, 503, 'clamped to last bar');
  assert(end.reachedEnd, 'end flag');
});

test('buy and sell fill at the adjusted close and reconcile equity', async () => {
  const data = await loadDatasets();
  const dataset = data['2008-crisis'];
  const run = createHistoryRun('2008-crisis');
  const quote = quoteAt(dataset, 'AAPL', run.dayIndex);
  const bought = tradeAtClose(run, dataset, { symbol: 'AAPL', side: 'buy', qty: 100 });
  assert(bought.ok, 'buy succeeds');
  assertClose(bought.run.account.cash, 10000 - quote.last * 100 - 1, 0.01, 'cash after buy');
  const sum = summary(bought.run, dataset);
  assertClose(sum.total, bought.run.account.cash + bought.run.account.positions.AAPL.qty * quote.last, 0.01, 'equity reconciliation');
  const sold = tradeAtClose(bought.run, dataset, { symbol: 'AAPL', side: 'sell', qty: 100 });
  assert(sold.ok, 'sell succeeds');
  assertEqual(sold.run.account.positions.AAPL, undefined, 'position closed');
  assertClose(
    sold.run.account.cash - 10000,
    sold.run.account.realizedPnl,
    0.01,
    'realized P&L equals cash change',
  );
});

test('QQQ is a benchmark-only symbol in the replay', async () => {
  const data = await loadDatasets();
  const result = tradeAtClose(createHistoryRun('2008-crisis'), data['2008-crisis'], {
    symbol: 'QQQ', side: 'buy', qty: 1,
  });
  assert(!result.ok);
  assertEqual(result.error, 'error.benchmarkNotTradable');
});

test('insufficient cash and shares are rejected', async () => {
  const data = await loadDatasets();
  const dataset = data['2008-crisis'];
  const poor = tradeAtClose(createHistoryRun('2008-crisis'), dataset, { symbol: 'AAPL', side: 'buy', qty: 100000 });
  assert(!poor.ok);
  assertEqual(poor.error, 'error.insufficientCash');
  const noShares = tradeAtClose(createHistoryRun('2008-crisis'), dataset, { symbol: 'AMZN', side: 'sell', qty: 5 });
  assert(!noShares.ok);
  assertEqual(noShares.error, 'error.insufficientShares');
});

test('benchmark return and summary fields are finite', async () => {
  const data = await loadDatasets();
  const run = advanceRun(createHistoryRun('2015-long'), data['2015-long'], 30);
  const sum = summary(run, data['2015-long']);
  assert(Number.isFinite(sum.total), 'equity finite');
  assert(Number.isFinite(sum.returnPct), 'return finite');
  assert(Number.isFinite(sum.benchmarkReturn), 'benchmark finite');
  assertEqual(sum.totalDays, 2975, 'total days');
});

test('the replay account is separate from the academy account', async () => {
  const data = await loadDatasets();
  const state = createGameState({ seed: 'replay-separation' });
  const run = createHistoryRun('2008-crisis');
  const result = tradeAtClose(run, data['2008-crisis'], { symbol: 'AAPL', side: 'buy', qty: 10 });
  assert(result.ok);
  assertEqual(state.account.cash, 10000, 'academy cash untouched');
  assertEqual(result.run.account.cash < 10000, true, 'replay cash reduced');
  assert(equity(state.account, state.market.quotes) > 0, 'academy equity valid');
});

test('history runs are persisted and hydrated', async () => {
  const state = createGameState({ seed: 'history-save' });
  state.historyRuns['2008-crisis'] = createHistoryRun('2008-crisis');
  const saved = serializeState(state);
  const hydrated = hydrateState(saved);
  assert(hydrated.historyRuns['2008-crisis'], 'history run preserved');
  assertEqual(hydrated.historyRuns['2008-crisis'].account.cash, 10000);
});

suite('Historical events');

test('events only appear after their real date', () => {
  const scenario = getHistoryScenario('2008-crisis');
  assertEqual(eventsUpTo(scenario, '2007-07-03').length, 0, 'no events at start');
  assertEqual(eventsUpTo(scenario, '2008-09-16').length, 7, 'events up to AIG rescue');
  const long = getHistoryScenario('2015-long');
  assertEqual(eventsUpTo(long, '2020-02-20').length, 5, 'events up to pandemic');
  assertEqual(eventsUpTo(long, '2015-01-02').length, 0, 'long scenario starts empty');
});

test('scenario metadata has tips and event text keys', () => {
  for (const scenario of HISTORY_SCENARIOS) {
    assertEqual(scenario.tips.length, 3);
    assert(scenario.events.length >= 10);
    for (const event of scenario.events) {
      assert(event.titleKey && event.textKey, 'event keys');
      assert(/^\d{4}-\d{2}-\d{2}$/.test(event.date), 'event date format');
    }
  }
});
