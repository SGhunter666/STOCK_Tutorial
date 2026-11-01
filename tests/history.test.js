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
  barCount, currentDate,
} from '../js/history/replayEngine.js';
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
  assertEqual(run.dayIndex, 1, 'start at first full bar');
  assertEqual(run.account.initialCash, 10000);
  assertEqual(run.account.cash, 10000);
  assertEqual(Object.keys(run.account.positions).length, 0);
  assertEqual(barCount(data['2008-crisis']), 504, 'bar count');
  assertEqual(currentDate(data['2008-crisis'], 1), '2007-07-03', 'current date');
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
  assertEqual(advanced.dayIndex, 6, 'advance five days');
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
