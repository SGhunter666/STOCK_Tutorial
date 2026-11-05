import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  createExchangeEngine, submitOrder, cancelOrder, advanceSecond, advanceDay,
  serializeExchange, deserializeExchange, equity, availableShortShares, checkMargin,
} from '../js/sim/exchangeEngine.js';
import {
  SIM_MARGIN_CONFIG, marginSnapshot, shortRows, evaluateMarginCall,
  accrueMarginCharges,
} from '../js/sim/margin.js';

function setMarket(state, ticker, price) {
  const cs = state.companies[ticker];
  cs.last = price;
  cs.fairValue = price;
  cs.open = price;
  cs.high = price;
  cs.low = price;
  cs.ema = price;
  cs.book.setMarketMaker({
    bid: price - 0.4, ask: price + 0.4, size: 100_000,
  });
  state.quotes[ticker] = {
    ...state.quotes[ticker],
    last: price,
    bid: price - 0.4,
    ask: price + 0.4,
    fairValue: price,
  };
}

test('short selling credits proceeds, records the borrow and covers with PnL', () => {
  const state = createExchangeEngine({ seed: 'short-cover', cash: 100_000 });
  const ticker = 'NCRT';
  const cashBefore = state.account.cash;
  const opened = submitOrder(state, {
    ticker, side: 'short', type: 'market', qty: 200,
  });
  assert(opened.ok, 'short order accepted');
  assert(opened.order.filledQty === 200, 'short filled');
  const short = state.account.shorts[ticker];
  assert(short, 'short position recorded');
  assertEqual(short.qty, 200, 'short quantity');
  assertClose(short.avgPrice, opened.order.avgPrice, 0.0001, 'short basis');
  const openFee = state.account.trades[state.account.trades.length - 1].fee;
  assertClose(state.account.cash, cashBefore + 200 * opened.order.avgPrice - openFee, 0.02,
    'proceeds credited after fee');
  assertClose(equity(state), cashBefore - openFee
    + (opened.order.avgPrice - state.quotes[ticker].last) * 200, 0.02, 'equity nets the liability');

  const covered = submitOrder(state, {
    ticker, side: 'cover', type: 'market', qty: 100,
  });
  assert(covered.ok && covered.order.filledQty === 100, 'cover filled');
  assert(state.account.shorts[ticker].qty === 100, 'half remains short');
  assertClose(state.account.realizedPnl, (short.avgPrice - covered.order.avgPrice) * 100,
    0.02, 'cover realizes PnL against the borrow basis');
  const cashAfterCover = state.account.cash;
  const coverFee = state.account.trades[state.account.trades.length - 1].fee;
  assertClose(cashAfterCover, cashBefore + 200 * short.avgPrice - openFee
    - 100 * covered.order.avgPrice - coverFee, 0.02, 'cover debits cash');

  const closed = submitOrder(state, {
    ticker, side: 'cover', type: 'market', qty: 100,
  });
  assert(closed.ok, 'remaining cover filled');
  assertEqual(state.account.shorts[ticker], undefined, 'short closed');
  assertEqual(shortRows(state).length, 0, 'no short rows');
});

test('covering without a short and shorting against a long are rejected', () => {
  const state = createExchangeEngine({ seed: 'short-guards' });
  const noShort = submitOrder(state, { ticker: 'APLA', side: 'cover', type: 'market', qty: 10 });
  assertEqual(noShort.error, 'order.noShortPosition', 'no short to cover');

  const bought = submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 10 });
  assert(bought.ok, 'long opened');
  const conflict = submitOrder(state, { ticker: 'APLA', side: 'short', type: 'market', qty: 10 });
  assertEqual(conflict.error, 'order.longPosition', 'cannot short while long');

  const state2 = createExchangeEngine({ seed: 'short-guards-2' });
  const shorted = submitOrder(state2, { ticker: 'NCRT', side: 'short', type: 'market', qty: 10 });
  assert(shorted.ok, 'short opened');
  const longConflict = submitOrder(state2, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 10 });
  assertEqual(longConflict.error, 'order.shortPosition', 'cannot buy while short');

  const oversized = submitOrder(state2, { ticker: 'APLA', side: 'short', type: 'market', qty: 100_000 });
  assertEqual(oversized.error, 'order.insufficientMargin', 'short needs initial margin');
});

test('margin snapshot reports initial, maintenance and buying power consistently', () => {
  const state = createExchangeEngine({ seed: 'margin-snapshot', cash: 100_000 });
  const long = submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 100 });
  const short = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 100 });
  assert(long.ok && short.ok, 'both positions opened');
  const snapshot = marginSnapshot(state);
  const longValue = state.account.positions.APLA.qty * state.quotes.APLA.last;
  const shortValue = state.account.shorts.NCRT.qty * state.quotes.NCRT.last;
  assertClose(snapshot.longMarketValue, longValue, 0.02, 'long value');
  assertClose(snapshot.shortMarketValue, shortValue, 0.02, 'short value');
  assertClose(snapshot.equity, state.account.cash + longValue - shortValue, 0.02, 'equity');
  assertClose(snapshot.initialRequirement,
    SIM_MARGIN_CONFIG.initialLong * longValue + SIM_MARGIN_CONFIG.initialShort * shortValue,
    0.02, 'initial requirement');
  assertClose(snapshot.maintenanceRequirement,
    SIM_MARGIN_CONFIG.maintenanceLong * longValue
    + SIM_MARGIN_CONFIG.maintenanceShort * shortValue,
    0.02, 'maintenance requirement');
  assert(snapshot.maintenanceExcess > 0, 'healthy margin');
  assert(snapshot.buyingPower > 0, 'buying power available');
  assert(snapshot.status === 'ok', 'status healthy');
});

test('margin interest and borrow fees accrue once per trading day', () => {
  const state = createExchangeEngine({ seed: 'margin-charges', cash: 100_000 });
  const bought = submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 800 });
  assert(bought.ok, 'leveraged purchase filled');
  const shorted = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 500 });
  assert(shorted.ok, 'short opened');
  assert(state.account.cash < 0, 'margin debit created');
  assert(state.account.shorts.NCRT.qty === 500, 'short on the book');
  const cashBefore = state.account.cash;
  advanceDay(state);
  const margin = state.account.margin;
  assert(margin.accruedInterest > 0, 'interest accrued');
  assert(margin.accruedBorrowFees > 0, 'borrow fee accrued');
  assert(margin.lastAccrualDay === state.dayIndex, 'accrual day marked');
  assert(state.account.cash < cashBefore, 'charges debited from cash');
  const next = accrueMarginCharges(state, 0);
  assertEqual(next.total, 0, 'zero elapsed days adds no charge');
});

test('a maintenance breach raises a call and the due day forces liquidation', () => {
  const state = createExchangeEngine({ seed: 'margin-call', cash: 100_000 });
  const shorted = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 1_100 });
  assert(shorted.ok, 'large short opened inside initial margin');
  setMarket(state, 'NCRT', 150);
  const call = evaluateMarginCall(state);
  assertEqual(call.status, 'call', 'margin call raised');
  assert(call.call && call.call.status === 'open', 'call is open');
  assert(call.call.dueDay === state.dayIndex + SIM_MARGIN_CONFIG.callGraceDays, 'grace day');
  assertEqual(call.liquidate, false, 'not liquidated before the due day');

  state.dayIndex = call.call.dueDay;
  const liquidated = checkMargin(state);
  assert(liquidated.liquidated, 'forced liquidation ran');
  assertEqual(state.account.shorts.NCRT, undefined, 'short was covered');
  assertEqual(state.account.margin.forcedLiquidations.length, 1, 'liquidation recorded');
  assertEqual(state.account.margin.forcedLiquidations[0].ticker, 'NCRT', 'ticker recorded');
  assertEqual(state.account.margin.call, null, 'call closed');
  assertEqual(state.account.margin.calls[0].status, 'liquidated', 'history updated');
  const after = marginSnapshot(state);
  assert(after.maintenanceExcess >= 0, 'maintenance restored');
});

test('a negative-equity breach liquidates immediately', () => {
  const state = createExchangeEngine({ seed: 'margin-negative', cash: 100_000 });
  const shorted = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 1_100 });
  assert(shorted.ok, 'short opened');
  setMarket(state, 'NCRT', 260);
  const snapshot = marginSnapshot(state);
  assert(snapshot.equity < 0, 'equity wiped out');
  const result = evaluateMarginCall(state);
  assertEqual(result.status, 'liquidation', 'immediate liquidation');
  assertEqual(result.call.dueDay, state.dayIndex, 'no grace period');
  checkMargin(state);
  assertEqual(state.account.shorts.NCRT, undefined, 'position closed');
  assert(state.account.margin.forcedLiquidations.length === 1, 'liquidation logged');
});

test('short borrow is reserved by working covers and released on cancel', () => {
  const state = createExchangeEngine({ seed: 'short-reserve' });
  const shorted = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 50 });
  assert(shorted.ok, 'short opened');
  assertEqual(availableShortShares(state, 'NCRT'), 50, 'all shares available');
  const resting = submitOrder(state, {
    ticker: 'NCRT', side: 'cover', type: 'limit', qty: 50,
    limitPrice: state.quotes.NCRT.bid - 1,
  });
  assert(resting.ok, 'cover limit accepted');
  assertEqual(availableShortShares(state, 'NCRT'), 0, 'cover reserves the borrow');
  const oversell = submitOrder(state, {
    ticker: 'NCRT', side: 'cover', type: 'market', qty: 50,
  });
  assertEqual(oversell.error, 'order.insufficientShortShares', 'cannot cover reserved shares');
  cancelOrder(state, resting.order.id);
  assertEqual(availableShortShares(state, 'NCRT'), 50, 'cancel releases the borrow');
});

test('shorts owe dividends and split with the same ratio as longs', () => {
  const dividendState = createExchangeEngine({ seed: 'short-dividend' });
  const dividendTicker = 'APLA';
  const shorted = submitOrder(dividendState, {
    ticker: dividendTicker, side: 'short', type: 'market', qty: 100,
  });
  assert(shorted.ok, 'short opened');
  const dps = dividendState.companies[dividendTicker].company.financials.dividendPerShare
    / 4 / dividendState.companies[dividendTicker].splitFactor;
  dividendState.lastNewsDay = 126;
  dividendState.dayIndex = 125;
  dividendState.second = 23_399;
  advanceSecond(dividendState);
  const charge = dividendState.account.dividends.find(
    (item) => item.ticker === dividendTicker && item.side === 'short',
  );
  assert(charge, 'short dividend charge recorded');
  assertClose(charge.amount, -100 * dps, 0.02, 'charge equals dividend owed');

  const splitState = createExchangeEngine({ seed: 'short-split' });
  const splitTicker = 'NCRT';
  const splitShort = submitOrder(splitState, {
    ticker: splitTicker, side: 'short', type: 'market', qty: 100,
  });
  assert(splitShort.ok, 'short opened');
  const qtyBefore = splitState.account.shorts[splitTicker].qty;
  const basisBefore = splitState.account.shorts[splitTicker].avgPrice;
  for (const companyState of Object.values(splitState.companies)) {
    companyState.lastReportQuarter = 0;
  }
  splitState.lastNewsDay = 126;
  splitState.lastMacroDay = 126;
  splitState.dayIndex = 125;
  splitState.second = 23_399;
  advanceSecond(splitState);
  assertEqual(splitState.companies[splitTicker].splitFactor, 2, 'split applied');
  assertEqual(splitState.account.shorts[splitTicker].qty, qtyBefore * 2, 'short doubles');
  assertClose(splitState.account.shorts[splitTicker].avgPrice, basisBefore / 2, 0.0001,
    'short basis halves');
});

test('bankruptcy buys back short borrow at the written-down price', () => {
  const state = createExchangeEngine({ seed: 'short-bankruptcy' });
  const ticker = 'TDFU';
  const shorted = submitOrder(state, { ticker, side: 'short', type: 'market', qty: 100 });
  assert(shorted.ok, 'short opened');
  const basis = state.account.shorts[ticker].avgPrice;
  const realizedBefore = state.account.realizedPnl;
  for (const companyState of Object.values(state.companies)) {
    companyState.lastReportQuarter = 0;
  }
  state.lastNewsDay = 307;
  state.lastMacroDay = 307;
  state.dayIndex = 306;
  state.second = 23_399;
  advanceSecond(state);
  assert(state.companies[ticker].delisted, 'company delisted');
  assertEqual(state.account.shorts[ticker], undefined, 'short closed at delisting');
  assertClose(state.account.realizedPnl, realizedBefore + (basis - 0.01) * 100, 0.02,
    'short gain realized');
  const event = state.corporateActions.find(
    (item) => item.ticker === ticker && item.type === 'bankruptcy',
  );
  assertEqual(event.shortQty, 100, 'bankruptcy records the short');
});

test('save and restore keep shorts, margin calls and liquidation history', () => {
  const state = createExchangeEngine({ seed: 'margin-save', cash: 100_000 });
  submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 1_100 });
  setMarket(state, 'NCRT', 150);
  evaluateMarginCall(state);
  const snapshotBefore = marginSnapshot(state);
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.account.shorts.NCRT.qty, 1_100, 'short restored');
  assert(restored.account.margin, 'margin state restored');
  assert(restored.account.margin.call, 'margin call restored');
  assertEqual(restored.account.margin.call.status, 'open', 'call status restored');
  const snapshotAfter = marginSnapshot(restored);
  assertClose(snapshotAfter.equity, snapshotBefore.equity, 0.02, 'equity restored');
  assertClose(snapshotAfter.maintenanceExcess, snapshotBefore.maintenanceExcess, 0.02,
    'maintenance restored');

  const empty = createExchangeEngine({ seed: 'margin-legacy' });
  const legacy = JSON.parse(serializeExchange(empty));
  delete legacy.account.shorts;
  delete legacy.account.margin;
  const restoredLegacy = deserializeExchange(legacy);
  assert(restoredLegacy.account.shorts && restoredLegacy.account.margin,
    'older saves gain the new fields');
  assertEqual(restoredLegacy.account.shorts.NCRT, undefined, 'no phantom shorts');
});

test('restored legacy orders infer their action and book side', () => {
  const state = createExchangeEngine({ seed: 'margin-order-restore' });
  const shorted = submitOrder(state, { ticker: 'NCRT', side: 'short', type: 'market', qty: 20 });
  assert(shorted.ok, 'short opened for the cover reserve');
  const buyLimit = submitOrder(state, {
    ticker: 'APLA', side: 'buy', type: 'limit', qty: 10,
    limitPrice: state.quotes.APLA.bid - 1,
  });
  assert(buyLimit.ok && buyLimit.order.status === 'open', 'buy limit rests');
  const coverLimit = submitOrder(state, {
    ticker: 'NCRT', side: 'cover', type: 'limit', qty: 20,
    limitPrice: state.quotes.NCRT.bid - 1,
  });
  assert(coverLimit.ok && coverLimit.order.status === 'open', 'cover limit rests');
  const data = JSON.parse(serializeExchange(state));
  for (const order of data.orders) {
    delete order.action;
    delete order.bookSide;
  }
  const restored = deserializeExchange(data);
  const buy = restored.orders.find((order) => order.id === buyLimit.order.id);
  assertEqual(buy.action, 'openLong', 'buy action inferred');
  assertEqual(buy.bookSide, 'buy', 'buy book side inferred');
  assert(buy.status === 'open', 'buy order still live');
  const cover = restored.orders.find((order) => order.id === coverLimit.order.id);
  assertEqual(cover.action, 'closeShort', 'cover action inferred');
  assertEqual(cover.bookSide, 'buy', 'cover uses the buy book');
  assertEqual(availableShortShares(restored, 'NCRT'), 0, 'restored cover reserves the borrow');
});
