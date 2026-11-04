import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  SIM_SPEEDS, SIM_SESSION_SECONDS, SimulationClock,
} from '../js/sim/simulationClock.js';
import {
  SIM_SESSION_MINUTES, createMinuteSeries, applyTradeToSeries, finalizeDay,
  getSeriesCandles,
} from '../js/sim/minuteSeries.js';
import { SimOrderBook } from '../js/sim/orderBook.js';
import {
  createExchangeEngine, advanceSecond, advanceSeconds, advanceMinute,
  submitOrder, cancelOrder, getCandles, getBook, equity, positionRows,
  serializeExchange, deserializeExchange, simClock, simDate, SIM_START_CASH,
} from '../js/sim/exchangeEngine.js';

function tradeSeries(date = '2026-01-05') {
  const series = createMinuteSeries();
  for (let minute = 0; minute < SIM_SESSION_MINUTES; minute += 1) {
    applyTradeToSeries(series, {
      date,
      second: minute * 60 + 1,
      price: 100 + minute,
      qty: 10,
    });
  }
  return series;
}

test('simulation clock advances one second per step and has all speed presets', () => {
  let seconds = 0;
  let minutes = 0;
  const clock = new SimulationClock({
    onSecond: () => { seconds += 1; },
    onMinute: () => { minutes += 1; },
  });
  clock.stepSeconds(60);
  assertEqual(seconds, 60, 'sixty second callbacks');
  assertEqual(minutes, 1, 'one minute callback');
  assertEqual(clock.secondCounter, 60, 'counter');
  clock.stepMinute();
  assertEqual(seconds, 120, 'manual minute');
  assertEqual(minutes, 2, 'two minute callbacks');
  for (const speed of Object.keys(SIM_SPEEDS)) {
    assert(Number.isFinite(Number(speed)), 'speed numeric');
  }
  clock.pause();
  assert(!clock.running, 'paused');
  clock.destroy();
});

test('minute bars aggregate into all required intraday and longer periods', () => {
  const series = tradeSeries();
  assertEqual(getSeriesCandles(series, '1m', '2026-01-05').length, 390, '1m');
  assertEqual(getSeriesCandles(series, '5m', '2026-01-05').length, 78, '5m');
  assertEqual(getSeriesCandles(series, '15m', '2026-01-05').length, 26, '15m');
  assertEqual(getSeriesCandles(series, '30m', '2026-01-05').length, 13, '30m');
  assertEqual(getSeriesCandles(series, '1h', '2026-01-05').length, 7, '1h');
  assertEqual(getSeriesCandles(series, '4h', '2026-01-05').length, 2, '4h');
  assertEqual(getSeriesCandles(series, '1D', '2026-01-05').length, 1, '1D');
  const hourly = getSeriesCandles(series, '1h', '2026-01-05');
  assertEqual(hourly[0].o, 100, 'hourly open');
  assertEqual(hourly[0].c, 159, 'hourly close');
  assertEqual(hourly[0].v, 600, 'hourly volume');
  finalizeDay(series, '2026-01-05');
  assertEqual(getSeriesCandles(series, '1D', '2026-01-05').length, 1, 'closed daily');
  assertEqual(getSeriesCandles(series, '1W', '2026-01-05').length, 1, 'weekly');
  assertEqual(getSeriesCandles(series, '1M', '2026-01-05').length, 1, 'monthly');
});

test('a forming minute never exposes later trades', () => {
  const series = createMinuteSeries();
  applyTradeToSeries(series, { date: '2026-01-05', second: 10, price: 100, qty: 10 });
  applyTradeToSeries(series, { date: '2026-01-05', second: 20, price: 101, qty: 5 });
  const bars = getSeriesCandles(series, '1m', '2026-01-05');
  assertEqual(bars.length, 1, 'one forming bar');
  assertEqual(bars[0].c, 101, 'latest completed trade');
  assertEqual(bars[0].o, 100, 'open');
  assertEqual(bars[0].h, 101, 'high');
  assertEqual(bars[0].v, 15, 'volume');
  assert(bars[0].partial, 'forming flag');
});

test('missing minutes are gaps, not invented volume', () => {
  const series = createMinuteSeries();
  applyTradeToSeries(series, { date: '2026-01-05', second: 1, price: 100, qty: 10 });
  applyTradeToSeries(series, { date: '2026-01-05', second: 121, price: 102, qty: 10 });
  const bars = getSeriesCandles(series, '1m', '2026-01-05');
  assertEqual(bars.length, 2, 'only traded minutes');
  assertEqual(bars[0].time, '09:30', 'first minute');
  assertEqual(bars[1].time, '09:32', 'third minute');
});

test('order book matches across price levels and reports unfilled size', () => {
  const book = new SimOrderBook('TEST');
  book.setMarketMaker({ bid: 99.95, ask: 100.05, size: 100, levels: 6 });
  const result = book.match({ id: 'M1', side: 'buy', type: 'market', qty: 500 });
  assert(result.fills.length >= 2, 'multiple levels');
  assert(result.fills[0].price <= result.fills[1].price, 'ascending asks');
  assertEqual(result.fills.reduce((sum, fill) => sum + fill.qty, 0), 500, 'filled');
  const snapshot = book.snapshot();
  assert(snapshot.bids.length, 'bids');
  assert(snapshot.asks.length, 'asks');
  assert(snapshot.asks[0].price > snapshot.bids[0].price, 'uncrossed');
});

test('a large market order partially fills and a limit order rests', () => {
  const state = createExchangeEngine({ seed: 'partial-test' });
  const ticker = 'NGLB';
  const quote = state.quotes[ticker];
  const result = submitOrder(state, {
    ticker, side: 'buy', type: 'market', qty: 2900,
  });
  assert(result.ok, 'submitted');
  assert(result.order.filledQty > 0, 'some fill');
  assert(result.order.filledQty < 2900, 'partial fill');
  assertEqual(result.order.status, 'partiallyFilled', 'partial status');
  assertEqual(state.account.positions[ticker].qty, result.order.filledQty, 'ledger qty');
  const gross = result.order.fills.reduce((sum, fill) => sum + fill.price * fill.qty, 0);
  assertClose(state.account.cash,
    SIM_START_CASH - gross - state.account.fees,
    0.05, 'cash');

  const rest = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 50,
    limitPrice: state.quotes[ticker].bid - 0.02,
  });
  assert(rest.ok, 'limit accepted');
  assertEqual(rest.order.status, 'open', 'resting');
  assertEqual(getBook(state, ticker).bids.some((level) => level.price === rest.order.limitPrice), true, 'in book');
  cancelOrder(state, rest.order.id);
  assertEqual(rest.order.status, 'cancelled', 'cancelled');
});

test('player buy and sell update cash, position and realized PnL', () => {
  const state = createExchangeEngine({ seed: 'ledger-test' });
  const buy = submitOrder(state, {
    ticker: 'APLA', side: 'buy', type: 'market', qty: 100,
  });
  assert(buy.ok && buy.order.filledQty > 0, 'buy filled');
  const avg = buy.order.avgPrice;
  const qty = buy.order.filledQty;
  assertEqual(state.account.positions.APLA.qty, qty, 'position qty');
  assertClose(state.account.positions.APLA.avgCost, avg, 0.01, 'average cost');

  const sell = submitOrder(state, {
    ticker: 'APLA', side: 'sell', type: 'market', qty: Math.floor(qty / 2),
  });
  assert(sell.ok && sell.order.filledQty > 0, 'sell filled');
  assertEqual(state.account.positions.APLA.qty, qty - sell.order.filledQty, 'remaining qty');
  assert(state.account.realizedPnl !== 0, 'realized PnL recorded');
  assert(state.account.trades.length >= 2, 'ledger trades');
  assertClose(equity(state), state.account.cash + state.account.positions.APLA.qty
    * state.quotes.APLA.last, 0.02, 'equity');
});

test('simulated traders produce prints and daily candles without errors', () => {
  const state = createExchangeEngine({ seed: 'traders-test' });
  advanceMinute(state);
  assert(state.stats.volume > 0, 'simulated volume');
  assert(state.trades.length > 0, 'prints');
  assertEqual(state.second, 60, 'one minute of seconds');
  assert(state.quotes.APLA.last > 0, 'quote');
  assert(Number.isFinite(state.quotes.APLA.bid), 'bid');
  assert(Number.isFinite(state.quotes.APLA.ask), 'ask');
  assert(state.quotes.APLA.ask >= state.quotes.APLA.bid, 'spread');
  const minute = getCandles(state, 'APLA', '1m');
  assert(Array.isArray(minute), 'minute candles');
});

test('the exchange is deterministic for the same seed and actions', () => {
  const a = createExchangeEngine({ seed: 'deterministic' });
  const b = createExchangeEngine({ seed: 'deterministic' });
  advanceSeconds(a, 30);
  advanceSeconds(b, 30);
  assertEqual(a.quotes.APLA.last, b.quotes.APLA.last, 'same last');
  assertEqual(a.quotes.APLA.bid, b.quotes.APLA.bid, 'same bid');
  assertEqual(a.stats.volume, b.stats.volume, 'same volume');
  assertEqual(JSON.stringify(a.rngState), JSON.stringify(b.rngState), 'same RNG state');
});

test('save and restore keep account, quote and simulated time', () => {
  const state = createExchangeEngine({ seed: 'save-test' });
  advanceSeconds(state, 45);
  submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 50 });
  const saved = serializeExchange(state);
  const restored = deserializeExchange(saved);
  assertEqual(restored.dayIndex, state.dayIndex, 'day');
  assertEqual(restored.second, state.second, 'second');
  assertEqual(restored.account.cash, state.account.cash, 'cash');
  assertEqual(restored.account.positions.APLA.qty, state.account.positions.APLA.qty, 'position');
  assertEqual(restored.quotes.APLA.last, state.quotes.APLA.last, 'quote');
  assertEqual(simClock(restored.second), simClock(state.second), 'clock');
  assertEqual(simDate(restored.dayIndex), simDate(state.dayIndex), 'date');
});
