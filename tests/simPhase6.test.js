import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  createExchangeEngine, advanceSecond, advanceDay, submitOrder, submitOco,
  submitOptionOrder, exerciseOptionPosition, startExchangeChallenge,
  abandonExchangeChallenge, exchangeChallengeSnapshot, exchangeTimelineRows,
  rewindToDay, serializeExchange, deserializeExchange, equity,
} from '../js/sim/exchangeEngine.js';
import { updateChallenge } from '../js/sim/challenges.js';
import { buildOptionChain } from '../js/sim/options.js';

function setMarket(state, ticker, price) {
  const cs = state.companies[ticker];
  cs.last = price;
  cs.fairValue = price;
  cs.open = price;
  cs.high = price;
  cs.low = price;
  cs.ema = price;
  cs.book.setMarketMaker({
    bid: price - 0.2, ask: price + 0.2, size: 200_000,
  });
  state.quotes[ticker] = {
    ...state.quotes[ticker],
    last: price,
    bid: price - 0.2,
    ask: price + 0.2,
    fairValue: price,
  };
}

function step(state) {
  state.lastNewsDay = Math.max(state.lastNewsDay, state.dayIndex);
  state.lastMacroDay = Math.max(state.lastMacroDay, state.dayIndex);
  state.second = Math.max(1, state.second);
  advanceSecond(state);
}

test('challenge rules block disallowed assets, shorts, margin and oversized positions', () => {
  const state = createExchangeEngine({ seed: 'challenge-rules', cash: 100_000 });
  const started = startExchangeChallenge(state, 'sprint');
  assert(started.ok, 'sprint started');
  assert(startExchangeChallenge(state, 'hedge').error === 'challenge.active',
    'only one challenge at a time');

  const optionChain = buildOptionChain(state, 'APLA', 30, 2);
  const call = optionChain.contracts.find((item) => item.type === 'call');
  const optionOrder = submitOptionOrder(state, {
    side: 'buy', ticker: 'APLA', type: 'call',
    strike: call.strike, expiryDay: call.expiryDay, qty: 1,
  });
  assertEqual(optionOrder.error, 'challenge.assetBlocked.option', 'options blocked');

  const shortOrder = submitOrder(state, {
    ticker: 'NCRT', side: 'short', type: 'market', qty: 100,
  });
  assertEqual(shortOrder.error, 'challenge.shortBlocked', 'shorting blocked');

  const marginOrder = submitOrder(state, {
    ticker: 'APLA', side: 'buy', type: 'market', qty: 800,
  });
  assertEqual(marginOrder.error, 'challenge.marginBlocked', 'margin blocked');

  const oversized = submitOrder(state, {
    ticker: 'APLA', side: 'buy', type: 'market', qty: 300,
  });
  assertEqual(oversized.error, 'challenge.positionLimit', 'position cap enforced');

  const tiny = submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 10 });
  assert(tiny.ok, 'small cash purchase allowed');

  const abandoned = abandonExchangeChallenge(state);
  assert(abandoned.ok && abandoned.challenge.status === 'abandoned', 'challenge abandoned');
  assert(exchangeChallengeSnapshot(state).active === false, 'no active challenge');
});

test('challenge scores a passed run and fails a drawdown breach', () => {
  const passing = createExchangeEngine({ seed: 'challenge-pass', cash: 100_000 });
  startExchangeChallenge(passing, 'sprint');
  const startEquity = passing.challenge.active.startEquity;
  passing.dayIndex = passing.challenge.active.endDay;
  updateChallenge(passing, startEquity * 1.05);
  assertEqual(passing.challenge.active, null, 'run closed');
  const passed = passing.challenge.history[0];
  assertEqual(passed.status, 'passed', 'target met');
  assert(passed.score >= 60, 'score recorded');
  assert(passed.grade, 'grade recorded');

  const failing = createExchangeEngine({ seed: 'challenge-drawdown', cash: 100_000 });
  startExchangeChallenge(failing, 'sprint');
  const failingEquity = failing.challenge.active.startEquity;
  updateChallenge(failing, failingEquity * 0.9);
  assertEqual(failing.challenge.history[0].status, 'failed', 'drawdown breach fails');
  assertEqual(failing.challenge.history[0].reason, 'drawdown', 'drawdown reason');

  const snapshot = exchangeChallengeSnapshot(passing);
  assert(snapshot.history.length === 1, 'history exposed');
});

test('stop and stop-limit orders only execute after the trigger', () => {
  const state = createExchangeEngine({ seed: 'stop-order', cash: 100_000 });
  const bought = submitOrder(state, {
    ticker: 'NCRT', side: 'buy', type: 'market', qty: 100,
  });
  assert(bought.ok && bought.order.filledQty === 100, 'position opened');
  const quote = state.quotes.NCRT;
  const stop = submitOrder(state, {
    ticker: 'NCRT', side: 'sell', type: 'stop', qty: 100,
    stopPrice: quote.last - 5,
  });
  assert(stop.ok, 'stop accepted');
  assertEqual(stop.order.status, 'open', 'stop waits');
  assert(state.account.positions.NCRT, 'position exists before trigger');
  assertEqual(state.account.positions.NCRT.qty, 100, 'no fill before trigger');

  setMarket(state, 'NCRT', quote.last - 8);
  step(state);
  assertEqual(state.account.positions.NCRT, undefined, 'stop sold the position');
  assertEqual(stop.order.triggeredFrom, 'stop', 'trigger recorded');

  const limitState = createExchangeEngine({ seed: 'stop-limit-order', cash: 100_000 });
  submitOrder(limitState, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 100 });
  const limitQuote = limitState.quotes.NCRT;
  const stopLimit = submitOrder(limitState, {
    ticker: 'NCRT', side: 'sell', type: 'stopLimit', qty: 100,
    stopPrice: limitQuote.last - 5,
    stopLimitPrice: limitQuote.last - 6,
  });
  assert(stopLimit.ok, 'stop-limit accepted');
  setMarket(limitState, 'NCRT', limitQuote.last - 8);
  step(limitState);
  assertEqual(limitState.orders.find((order) => order.id === stopLimit.order.id).type,
    'limit', 'converted to limit');
  assertEqual(limitState.orders.find((order) => order.id === stopLimit.order.id).limitPrice,
    stopLimit.order.stopLimitPrice, 'limit price applied after the trigger');
});

test('trailing stops follow the high and exit after a pullback', () => {
  const state = createExchangeEngine({ seed: 'trailing-order', cash: 100_000 });
  submitOrder(state, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 100 });
  const start = state.quotes.NCRT.last;
  const trailing = submitOrder(state, {
    ticker: 'NCRT', side: 'sell', type: 'trailing', qty: 100, trailPct: 0.05,
  });
  assert(trailing.ok, 'trailing accepted');
  assert(trailing.order.stopPrice < start, 'initial stop below price');

  setMarket(state, 'NCRT', start + 20);
  step(state);
  const raised = state.orders.find((order) => order.id === trailing.order.id);
  assert(raised.stopPrice > start, 'stop ratcheted up with the high');
  assertEqual(state.account.positions.NCRT.qty, 100, 'still holding above the stop');

  setMarket(state, 'NCRT', raised.stopPrice - 1);
  step(state);
  assertEqual(state.account.positions.NCRT, undefined, 'trailing stop exited');
});

test('an OCO pair cancels its sibling when the take-profit fills', () => {
  const state = createExchangeEngine({ seed: 'oco-order', cash: 100_000 });
  submitOrder(state, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 100 });
  const quote = state.quotes.NCRT;
  const result = submitOco(state, {
    ticker: 'NCRT',
    action: 'closeLong',
    qty: 100,
    takeProfitPrice: quote.last + 10,
    stopPrice: quote.last - 10,
  });
  assert(result.ok && result.orders.length === 2, 'two legs created');
  assertEqual(result.orders[0].status, 'open', 'take-profit rests');
  assertEqual(result.orders[1].type, 'stop', 'stop leg waits');

  setMarket(state, 'NCRT', quote.last + 20);
  step(state);
  const takeProfit = state.orders.find((order) => order.id === result.orders[0].id);
  const stopLeg = state.orders.find((order) => order.id === result.orders[1].id);
  assertEqual(takeProfit.status, 'filled', 'take-profit filled');
  assertEqual(stopLeg.status, 'cancelled', 'stop leg cancelled');
  assertEqual(stopLeg.reason, 'ocoTriggered', 'OCO reason');
  assertEqual(state.account.positions.NCRT, undefined, 'position closed once');
});

test('time travel restores the day-open account and records a branch', () => {
  const state = createExchangeEngine({ seed: 'timeline-rewind', cash: 100_000 });
  assertEqual(exchangeTimelineRows(state).length, 1, 'day zero snapshot');
  submitOrder(state, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 100 });
  const cashAfterBuy = state.account.cash;
  advanceDay(state);
  submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 10 });
  assertEqual(exchangeTimelineRows(state).length, 2, 'two day snapshots');
  assert(state.account.positions.APLA, 'later position exists');

  const rewound = rewindToDay(state, 1);
  assert(rewound.ok, 'rewind accepted');
  assertEqual(state.dayIndex, 1, 'back to day one open');
  assertEqual(state.account.positions.APLA, undefined, 'later trade removed');
  assertEqual(state.account.positions.NCRT.qty, 100, 'earlier position kept');
  assertClose(state.account.cash, cashAfterBuy, 0.05, 'cash restored');
  assertEqual(exchangeTimelineRows(state).length, 2, 'later snapshots dropped');
  assertEqual(state.timeline.branches.length, 1, 'branch recorded');
  assertEqual(state.timeline.branches[0].fromDay, 1, 'branch origin');
  assert(rewindToDay(state, 999).error === 'timeline.notFound', 'missing snapshot');
});

test('expiry-day option exercise delivers shares and is rejected earlier', () => {
  const state = createExchangeEngine({ seed: 'option-exercise', cash: 100_000 });
  const chain = buildOptionChain(state, 'APLA', 30, 2);
  const call = chain.contracts.find((item) => item.type === 'call'
    && item.strike === chain.strikes[2]);
  const opened = submitOptionOrder(state, {
    side: 'buy', ticker: 'APLA', type: 'call',
    strike: call.strike, expiryDay: call.expiryDay, qty: 1,
  });
  assert(opened.ok, 'call bought');
  const early = exerciseOptionPosition(state, state.account.options[0].key, 1);
  assertEqual(early.error, 'option.notExpiryDay', 'cannot exercise before expiry');

  state.dayIndex = call.expiryDay;
  setMarket(state, 'APLA', call.strike + 10);
  const cashBefore = state.account.cash;
  const exercised = exerciseOptionPosition(state, state.account.options[0].key, 1);
  assert(exercised.ok, 'exercise accepted');
  assertEqual(exercised.shares, 100, '100 shares delivered');
  assertEqual(state.account.options.length, 0, 'contract removed');
  assertEqual(state.account.positions.APLA.qty, 100, 'shares credited');
  assertClose(state.account.cash, cashBefore - call.strike * 100, 0.02, 'strike paid');
});

test('a challenge settles automatically at its deadline', () => {
  const state = createExchangeEngine({ seed: 'challenge-deadline', cash: 100_000 });
  startExchangeChallenge(state, 'sprint');
  const endDay = state.challenge.active.endDay;
  state.lastNewsDay = endDay;
  state.lastMacroDay = endDay;
  state.dayIndex = endDay - 1;
  state.second = 23_399;
  advanceSecond(state);
  assertEqual(state.dayIndex, endDay, 'deadline reached');
  assertEqual(state.challenge.active, null, 'run closed automatically');
  assertEqual(state.challenge.history[0].status, 'failed', 'flat run misses the target');
  assertEqual(state.challenge.history[0].reason, 'targetMissed', 'target reason');
});

test('timeline snapshots keep the save file compact', () => {
  const state = createExchangeEngine({ seed: 'timeline-size', cash: 100_000 });
  for (let index = 0; index < 3; index += 1) {
    advanceDay(state);
  }
  const raw = serializeExchange(state);
  assert(raw.length < 4_000_000, `save size ${raw.length} bytes`);
  assert(exchangeTimelineRows(state).length <= 20, 'snapshot cap');
});

test('save and restore keep challenge and timeline state', () => {
  const state = createExchangeEngine({ seed: 'phase6-save', cash: 100_000 });
  startExchangeChallenge(state, 'hedge');
  submitOrder(state, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 50 });
  advanceDay(state);
  const restored = deserializeExchange(serializeExchange(state));
  assert(restored.challenge.active, 'active challenge restored');
  assertEqual(restored.challenge.active.id, 'hedge', 'challenge id restored');
  assert(exchangeTimelineRows(restored).length >= 2, 'timeline restored');
  assertEqual(restored.account.positions.NCRT.qty, 50, 'position restored');
  assertClose(equity(restored), equity(state), 0.3, 'equity restored');
});
