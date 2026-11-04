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
  openOrderRows, serializeExchange, deserializeExchange, simClock, simDate, SIM_START_CASH,
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
  assert(getSeriesCandles(series, '1W', '2026-01-05')[0].partial, 'weekly bucket is partial');
  assert(getSeriesCandles(series, '1M', '2026-01-05')[0].partial, 'monthly bucket is partial');
  const hourly = getSeriesCandles(series, '1h', '2026-01-05');
  assertEqual(hourly[0].o, 100, 'hourly open');
  assertEqual(hourly[0].c, 159, 'hourly close');
  assertEqual(hourly[0].v, 600, 'hourly volume');
  finalizeDay(series, '2026-01-05');
  assertEqual(getSeriesCandles(series, '1D', '2026-01-05').length, 1, 'closed daily');
  const weeklyClosed = getSeriesCandles(series, '1W', '2026-01-05');
  assertEqual(weeklyClosed.length, 1, 'weekly');
  assert(!weeklyClosed[0].partial, 'closed weekly is final');
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

test('a partially filled resting order never fills beyond its remaining size', () => {
  const book = new SimOrderBook('TEST');
  book.setMarketMaker({ bid: 99.9, ask: 99.95, size: 100, levels: 6 });
  book.addResting({
    id: 'R1', side: 'buy', type: 'limit', price: 100, qty: 100, remaining: 50,
  });
  const results = book.matchResting();
  const result = results.find((entry) => entry.order.id === 'R1');
  assert(result, 'resting order matched');
  assertEqual(result.fills.reduce((sum, fill) => sum + fill.qty, 0), 50, 'only remaining size fills');
});

test('a depleted book reports no best ask instead of a zero-size level', () => {
  const book = new SimOrderBook('TEST');
  book.setMarketMaker({ bid: 99.95, ask: 100.05, size: 10, levels: 2 });
  book.match({ id: 'M1', side: 'buy', type: 'market', qty: 25 });
  assertEqual(book.bestAsk(), null, 'no remaining ask');
});

test('simulated orders are cancelled at the session close', () => {
  const state = createExchangeEngine({ seed: 'rollover-test' });
  const ticker = 'APLA';
  state.second = SIM_SESSION_SECONDS - 1;
  const order = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 10,
    limitPrice: state.quotes[ticker].bid - 0.02, owner: 'sim:noise',
  });
  assert(order.ok && order.order.status === 'open', 'simulated order rests');
  advanceSecond(state);
  assertEqual(state.dayIndex, 1, 'next session');
  assertEqual(order.order.status, 'cancelled', 'cancelled at close');
  assertEqual(order.order.reason, 'sessionEnd', 'reason recorded');
  assert(!getBook(state, ticker).bids.some((level) => level.price === order.order.limitPrice), 'removed from book');
});

test('save and restore keep player and simulated resting orders', () => {
  const state = createExchangeEngine({ seed: 'save-resting-test' });
  const ticker = 'APLA';
  const bid = state.quotes[ticker].bid;
  const player = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 20, limitPrice: bid - 0.01,
  });
  const simulated = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 30, limitPrice: bid - 0.02, owner: 'sim:noise',
  });
  assert(player.ok && player.order.status === 'open', 'player resting');
  assert(simulated.ok && simulated.order.status === 'open', 'simulated resting');
  const restored = deserializeExchange(serializeExchange(state));
  const bids = getBook(restored, ticker).bids.map((level) => level.price);
  assert(bids.includes(player.order.limitPrice), 'player order restored in book');
  assert(bids.includes(simulated.order.limitPrice), 'simulated order restored in book');
  assertEqual(restored.orders.filter((order) => ['open', 'partiallyFilled'].includes(order.status)).length, 2, 'both open');
});

test('market maker inventory grows after fills and skews the next quote', () => {
  const state = createExchangeEngine({ seed: 'inventory-test' });
  const ticker = 'QVAL';
  const before = state.quotes[ticker];
  const result = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 2000 });
  assert(result.ok && result.order.filledQty > 0, 'player buy filled');
  assert(state.companies[ticker].inventory < 0, 'market maker sold inventory');
  advanceSecond(state);
  const after = state.quotes[ticker];
  assert(after.bid > before.bid, `inventory lifts bid (${before.bid} -> ${after.bid})`);
});

test('a partly filled limit order only completes its remaining size', () => {
  const state = createExchangeEngine({ seed: 'limit-remainder-test' });
  const order = submitOrder(state, {
    ticker: 'NGLB', side: 'buy', type: 'limit', qty: 2850, limitPrice: 35,
  });
  assert(order.ok, 'limit accepted');
  assertEqual(order.order.status, 'partiallyFilled', 'partly filled');
  assert(order.order.remaining > 0, 'remainder rests');
  advanceSecond(state);
  assert(order.order.filledQty <= 2850, 'never fills more than the order size');
  assertEqual(order.order.status, 'filled', 'remainder completes');
  assert(state.account.cash >= 0, 'cash never goes negative');
});

test('a pending order waits for the next active second', () => {
  const state = createExchangeEngine({ seed: 'pending-test' });
  const order = submitOrder(state, {
    ticker: 'NCRT', side: 'buy', type: 'market', qty: 100, pending: true,
  });
  assert(order.ok, 'pending accepted');
  assertEqual(order.order.status, 'pending', 'pending status');
  assertEqual(openOrderRows(state).length, 1, 'shown as an open order');
  assertEqual(state.account.positions.NCRT, undefined, 'no position yet');
  assertEqual(state.account.trades.length, 0, 'no trade yet');
  const cash = state.account.cash;
  advanceSecond(state);
  assertEqual(order.order.status, 'filled', 'activated and filled');
  assertEqual(state.account.positions.NCRT.qty, order.order.filledQty, 'position recorded');
  assertEqual(state.account.trades[0].orderId, order.order.id, 'trade links to the order');
  assert(state.account.cash < cash, 'cash settled');
});

test('a partially filled market order is not treated as an open order or cash reservation', () => {
  const state = createExchangeEngine({ seed: 'market-remainder-test' });
  const first = submitOrder(state, {
    ticker: 'NGLB', side: 'buy', type: 'market', qty: 2900,
  });
  assert(first.ok && first.order.filledQty > 0, 'market order partly fills');
  assertEqual(first.order.status, 'partiallyFilled', 'partial market status');
  assertEqual(openOrderRows(state).length, 0, 'market remainder is not open');
  const cash = state.account.cash;
  const price = state.quotes.INTL.ask;
  const qty = Math.floor((cash - 500) / price);
  assert(qty > 0, 'second order size positive');
  const second = submitOrder(state, { ticker: 'INTL', side: 'buy', type: 'market', qty });
  assert(second.ok, `cash from cancelled market remainder is reusable: ${second.error || ''}`);
  assert(second.order.filledQty > 0, 'second order fills');
});

test('a resting limit order stays live after a partial fill', () => {
  const state = createExchangeEngine({ seed: 'resting-partial-test' });
  const order = submitOrder(state, {
    ticker: 'NGLB', side: 'buy', type: 'limit', qty: 2900, limitPrice: 34,
  });
  assert(order.ok, 'limit accepted');
  assertEqual(order.order.status, 'open', 'order rests above the ask');
  state.companies.NGLB.fairValue = 33.5;
  advanceSecond(state);
  assert(order.order.filledQty > 0, 'some shares fill');
  assert(order.order.filledQty < 2900, 'scenario leaves a remainder');
  assertEqual(order.order.status, 'partiallyFilled', 'partial status');
  assert(openOrderRows(state).some((entry) => entry.id === order.order.id), 'remainder stays open');
  assert(getBook(state, 'NGLB').bids.some((level) => level.price === 34), 'remainder stays in the book');
  const restored = deserializeExchange(serializeExchange(state));
  assert(openOrderRows(restored).some((entry) => entry.id === order.order.id), 'restored remainder stays open');
  assert(getBook(restored, 'NGLB').bids.some((level) => level.price === 34), 'restored remainder stays in the book');
});

test('a pending player buy charges the configured fee once', () => {
  const state = createExchangeEngine({ seed: 'fee-test' });
  const order = submitOrder(state, {
    ticker: 'NCRT', side: 'buy', type: 'market', qty: 100, pending: true,
  });
  assert(order.ok, 'pending order accepted');
  advanceSecond(state);
  const gross = order.order.fills.reduce((sum, fill) => sum + fill.price * fill.qty, 0);
  assertClose(state.account.fees, gross * 0.0001, 0.02, 'one fee at one basis point');
  assertEqual(state.account.positions.NCRT.qty, 100, 'position qty');
  assertEqual(state.account.trades.length, 1, 'one ledger trade');
});

test('ten simulated minutes stay finite, liquid and solvent', () => {
  const state = createExchangeEngine({ seed: 'stress-test' });
  const order = submitOrder(state, {
    ticker: 'NCRT', side: 'buy', type: 'market', qty: 100, pending: true,
  });
  assert(order.ok, 'pending order accepted');
  advanceSeconds(state, 600);
  assert(state.account.cash >= 0, 'cash non-negative');
  for (const [ticker, quote] of Object.entries(state.quotes)) {
    assert(Number.isFinite(quote.last) && quote.last > 0, `${ticker} last finite`);
    assert(Number.isFinite(quote.fairValue) && quote.fairValue > 0, `${ticker} fair value finite`);
    assert(quote.bid === null || (Number.isFinite(quote.bid) && quote.bid > 0), `${ticker} bid valid`);
    assert(quote.ask === null || (Number.isFinite(quote.ask) && quote.ask > 0), `${ticker} ask valid`);
  }
  assert(getCandles(state, 'APLA', '1m').length > 0, 'minute candles recorded');
  assert(getCandles(state, 'APLA', '5m').length > 0, 'five-minute candles recorded');
  assert(openOrderRows(state).length <= state.orders.length, 'open orders bounded by order log');
});

test('order pruning keeps every player trade traceable to its order', () => {
  const state = createExchangeEngine({ seed: 'trace-test' });
  for (let index = 0; index < 600; index += 1) {
    submitOrder(state, { ticker: 'INTL', side: 'buy', type: 'market', qty: 1 });
  }
  assertEqual(state.account.trades.length, 500, 'ledger capped');
  advanceSecond(state);
  const orderIds = new Set(state.orders.map((order) => order.id));
  for (const trade of state.account.trades) {
    assert(orderIds.has(trade.orderId), `order ${trade.orderId} retained for ${trade.ticker}`);
  }
});

test('cancelled orders cannot push a filled trade out of the order log', () => {
  const state = createExchangeEngine({ seed: 'trace-cancel-test' });
  submitOrder(state, { ticker: 'INTL', side: 'buy', type: 'market', qty: 1 });
  for (let index = 0; index < 520; index += 1) {
    const order = submitOrder(state, {
      ticker: 'INTL', side: 'buy', type: 'limit', qty: 1,
      limitPrice: state.quotes.INTL.bid - 1,
    });
    assert(order.ok, 'limit accepted');
    cancelOrder(state, order.order.id);
  }
  advanceSecond(state);
  const orderIds = new Set(state.orders.map((order) => order.id));
  for (const trade of state.account.trades) {
    assert(orderIds.has(trade.orderId), 'filled order survives cancellation churn');
  }
});

test('restored state continues with the same deterministic path', () => {
  const a = createExchangeEngine({ seed: 'restore-determinism' });
  advanceSeconds(a, 45);
  submitOrder(a, { ticker: 'APLA', side: 'buy', type: 'market', qty: 50 });
  const b = deserializeExchange(serializeExchange(a));
  advanceSeconds(a, 10);
  advanceSeconds(b, 10);
  assertEqual(a.quotes.APLA.last, b.quotes.APLA.last, 'same last after restore');
  assertEqual(a.quotes.APLA.bid, b.quotes.APLA.bid, 'same bid after restore');
  assertEqual(a.stats.volume, b.stats.volume, 'same volume after restore');
  assertEqual(a.account.cash, b.account.cash, 'same cash after restore');
  assertEqual(a.account.trades.length, b.account.trades.length, 'same ledger length');
  assertEqual(JSON.stringify(a.rngState), JSON.stringify(b.rngState), 'same RNG after restore');
});
