/**
 * Core logic tests: account math, order matching, market determinism,
 * quiz grading, progress gating and save validation.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState, validateSave, hydrateState, serializeState } from '../js/game/gameState.js';
import { MarketEngine } from '../js/market/marketEngine.js';
import { TICKS_PER_DAY } from '../js/market/calendar.js';
import {
  buy, sell, short, cover, equity, unrealizedPnl, positionOf, availableCash, availableShares,
  reservedCash, buyingPower, shortCapacity, availableShortShares, optionValue,
} from '../js/trading/account.js';
import {
  placeMarketOrder, placeLimitOrder, placeConditionalOrder, placeOcoOrder,
  processOpenOrders, cancelOrder, estimateOrder, ORDER_STATUS,
} from '../js/trading/orderEngine.js';
import { financingCharge, applyFinancing, marginStatus, forceLiquidation } from '../js/trading/margin.js';
import { buildOrderBook, estimateMarketFill } from '../js/market/orderBook.js';
import {
  blackScholes, normCdf, payoffAtExpiry, CONTRACT_SIZE,
} from '../js/options/pricing.js';
import { buildOptionChain, strikeGrid, findContract } from '../js/options/chains.js';
import {
  buyOption, sellOption, markOptions, closeOption, settleOptions, optionPositionRows,
  optionCollateral, availableOptionCash, availableCoveredShares, executeOptionLegs,
  assignEarlyOptions,
} from '../js/options/optionsEngine.js';
import { buildStrategy, strategyPayoff, STRATEGY_DEFS } from '../js/options/strategies.js';
import {
  buildFuturesChain, futuresPrice, openFuture, closeFuture, markFutures,
  applyFuturesVariation, settleFutures, futuresMargin, availableFuturesCash,
  futuresPositionRows, FUTURES_MULTIPLIER,
} from '../js/futures/futuresEngine.js';
import { portfolioSummary } from '../js/trading/portfolio.js';
import { buildQuizSession, gradeQuiz, TEST_OUT_SCORE, questionXp } from '../js/education/quizEngine.js';
import {
  markSectionRead, recordQuizResult, isUnitComplete, isUnitUnlocked, unitProgress,
  overallProgress,
} from '../js/education/lessonEngine.js';
import { recordInspection, evaluatePractice } from '../js/education/practiceEngine.js';
import { isToolUnlocked, lockReason } from '../js/education/unlockManager.js';
import {
  STAGE_1_UNITS, STAGE_2_UNITS, STAGE_3_UNITS, STAGE_4_UNITS, STAGE_5_UNITS,
  STAGE_6_UNITS, STAGE_7_UNITS, STAGE_8_UNITS, getUnit,
  BRANCHES, BRANCH_UNITS, CORE_UNITS,
} from '../js/education/curriculum.js';
import { COMPANIES } from '../js/data/companies.js';
import { styleOf, STOCK_STYLES } from '../js/data/stockTypes.js';
import {
  payableDividends, applyDividends, dividendPerShare, isDividendDay,
} from '../js/market/dividends.js';
import { sma, rsi, indicatorSnapshot } from '../js/market/indicators.js';
import { dcf } from '../js/education/valuation.js';
import { macroSnapshot } from '../js/market/macro.js';
import { portfolioAnalytics } from '../js/trading/analytics.js';
import {
  MARKET_SEGMENTS, isCompanyUnlocked, isSegmentUnlocked, unlockedCompanies,
} from '../js/market/marketAccess.js';
import { createStore } from '../js/core/store.js';
import {
  CHALLENGES, startChallenge, abandonChallenge, checkChallenge, challengeProgress,
} from '../js/education/challenges.js';
import {
  CAREER_RANKS, CAREER_SALARY_INTERVAL, CAREER_EVAL_INTERVAL, normalizeCareer, careerProgress,
  promoteCareer, applyCareerSalary, refreshResearchTasks, acceptResearchTask,
  submitInvestmentReport, evaluateCareerPerformance, syncCareerCertificates,
  careerCertificates,
} from '../js/education/career.js';
import { createBus } from '../js/core/bus.js';
import { money, pct, compactNumber, clamp } from '../js/core/format.js';

suite('Account mathematics');

test('buy includes commission in cost basis and cash', () => {
  const account = createGameState({ seed: 'test' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const result = buy(account, { ticker: 'AURA', qty: 10, price: 100, fee: 1, day: 0, tick: 0 });
  assert(result.ok, 'buy should succeed');
  assertClose(result.account.cash, 8999, 0.001, 'cash after buy');
  const pos = positionOf(result.account, 'AURA');
  assertEqual(pos.qty, 10, 'quantity');
  assertClose(pos.costBasis, 1001, 0.001, 'cost basis includes fee');
  assertClose(pos.avgCost, 100.1, 0.001, 'average cost');
  assertEqual(result.trade.fee, 1, 'fee recorded');
});

test('sell locks in realized P&L and clears position', () => {
  let account = createGameState({ seed: 'test' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const bought = buy(account, { ticker: 'AURA', qty: 10, price: 100, fee: 1 });
  const sold = sell(bought.account, { ticker: 'AURA', qty: 10, price: 110, fee: 1 });
  assert(sold.ok, 'sell should succeed');
  assertClose(sold.account.cash, 10098, 0.001, 'cash after round trip');
  assertClose(sold.account.realizedPnl, 98, 0.001, 'realized P&L');
  assertEqual(positionOf(sold.account, 'AURA').qty, 0, 'position closed');
});

test('partial sell keeps remaining cost basis proportional', () => {
  let account = createGameState({ seed: 'test' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const bought = buy(account, { ticker: 'AURA', qty: 10, price: 100, fee: 1 });
  const sold = sell(bought.account, { ticker: 'AURA', qty: 4, price: 120, fee: 1 });
  assert(sold.ok);
  const pos = positionOf(sold.account, 'AURA');
  assertEqual(pos.qty, 6, 'remaining quantity');
  assertClose(pos.costBasis, 600.6, 0.001, 'remaining cost basis');
  assertClose(sold.account.realizedPnl, 78.6, 0.001, 'realized P&L after partial sale');
});

test('equity reconciles with realized plus unrealized P&L', () => {
  const state = createGameState({ seed: 'test' });
  const quotes = state.market.quotes;
  state.account.cash = 10000;
  state.account.initialCash = 10000;
  const bought = buy(state.account, { ticker: 'AURA', qty: 10, price: 100, fee: 1 });
  const sold = sell(bought.account, { ticker: 'AURA', qty: 4, price: 130, fee: 1 });
  const account = sold.account;
  const total = equity(account, quotes);
  const unrealized = unrealizedPnl(account, quotes);
  assertClose(
    total - account.initialCash,
    account.realizedPnl + unrealized,
    1e-6,
    'equity - initial equals realized + unrealized',
  );
});

test('rejects purchases without cash and sales without shares', () => {
  const account = createGameState({ seed: 'test' }).account;
  const poor = buy(account, { ticker: 'AURA', qty: 1000, price: 50, fee: 1 });
  assert(!poor.ok);
  assertEqual(poor.error, 'error.insufficientCash');
  const noShares = sell(account, { ticker: 'AURA', qty: 1, price: 50 });
  assert(!noShares.ok);
  assertEqual(noShares.error, 'error.insufficientShares');
});

suite('Short selling and margin');

test('short sale adds proceeds, cover realizes profit and clears the position', () => {
  let account = createGameState({ seed: 'short' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const opened = short(account, { ticker: 'AURA', qty: 10, price: 100, fee: 1, day: 1, tick: 0 });
  assert(opened.ok, 'short should open');
  assertClose(opened.account.cash, 10999, 0.001, 'net proceeds increase cash');
  const pos = positionOf(opened.account, 'AURA');
  assertEqual(pos.qty, -10, 'position is negative');
  assertEqual(pos.side, 'short', 'side is short');
  assertClose(pos.costBasis, 999, 0.001, 'proceeds basis excludes fee');
  assertClose(pos.avgCost, 99.9, 0.001, 'average short entry');

  const quoted = { AURA: { last: 90 } };
  assertClose(unrealizedPnl(opened.account, quoted), 99, 0.001, 'short profits when price falls');
  account = opened.account;
  const closed = cover(account, { ticker: 'AURA', qty: 10, price: 90, fee: 1, day: 2, tick: 0 });
  assert(closed.ok, 'cover should succeed');
  assertClose(closed.account.cash, 10098, 0.001, 'cash after covering');
  assertClose(closed.account.realizedPnl, 98, 0.001, 'realized profit = 999 − 901');
  assertEqual(positionOf(closed.account, 'AURA').qty, 0, 'position cleared');
});

test('partial cover keeps the remaining short basis proportional', () => {
  let account = createGameState({ seed: 'short-partial' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const opened = short(account, { ticker: 'AURA', qty: 20, price: 50, fee: 0 });
  const covered = cover(opened.account, { ticker: 'AURA', qty: 8, price: 40, fee: 0 });
  assert(covered.ok, 'partial cover should succeed');
  const pos = positionOf(covered.account, 'AURA');
  assertEqual(pos.qty, -12, 'remaining short quantity');
  assertClose(pos.costBasis, 600, 0.001, 'remaining basis is proportional');
  assertClose(covered.account.realizedPnl, 80, 0.001, 'realized on 8 shares');
});

test('buy refuses to flip a short and cover refuses to flip a long', () => {
  let account = createGameState({ seed: 'flip' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const opened = short(account, { ticker: 'AURA', qty: 5, price: 100, fee: 0 });
  const flipped = buy(opened.account, { ticker: 'AURA', qty: 5, price: 90, fee: 0 });
  assertEqual(flipped.ok, false, 'buy cannot cover a short');
  assertEqual(flipped.error, 'error.positionIsShort', 'clear error code');

  const longAccount = buy(account, { ticker: 'AURA', qty: 5, price: 100, fee: 0 }).account;
  const badCover = cover(longAccount, { ticker: 'AURA', qty: 5, price: 90, fee: 0 });
  assertEqual(badCover.ok, false, 'cover cannot sell a long');
  assertEqual(badCover.error, 'error.noShortPosition', 'clear error code');
});

test('margin financing charges daily interest only on a debit balance', () => {
  const account = createGameState({ seed: 'financing' }).account;
  account.cash = -5000;
  const charge = financingCharge(account);
  assertClose(charge, 1.59, 0.01, '5000 × 8% / 252');
  const applied = applyFinancing(account, 3);
  assertClose(applied.account.cash, -5001.59, 0.01, 'interest is deducted');
  assertClose(applied.account.financingPaid, 1.59, 0.01, 'interest is recorded');
  const positive = applyFinancing({ ...account, cash: 1000 }, 3);
  assertEqual(positive.charge, 0, 'no interest when cash is positive');
});

test('margin status flags a breach and forced liquidation closes positions', () => {
  let account = createGameState({ seed: 'margin-call' }).account;
  account.cash = -5000;
  account.positions = { AURA: { qty: 100, costBasis: 10000 } };
  const calm = marginStatus(account, { AURA: { last: 100 } });
  assertClose(calm.equity, 5000, 0.001, 'equity at 100');
  assertClose(calm.requirement, 2500, 0.001, '25% maintenance');
  assertEqual(calm.breached, false, 'no breach at 50% equity');

  const crashed = { AURA: { last: 40, bid: 39.99, ask: 40.01 } };
  const status = marginStatus(account, crashed);
  assertClose(status.equity, -1000, 0.001, 'equity goes negative');
  assertEqual(status.breached, true, 'maintenance breached');
  const liquidation = forceLiquidation(account, crashed, { fee: 1, day: 5 });
  assertEqual(positionOf(liquidation.account, 'AURA').qty, 0, 'all positions closed');
  assertEqual(liquidation.record.closed, 1, 'liquidation recorded');
  assertEqual(liquidation.account.marginCalls.length, 1, 'margin call ledger');
  assertClose(liquidation.account.cash, -1002, 1e-9, 'cash after selling at the bid and paying the fee');
});

test('margin buying power and short capacity respect collateral', () => {
  const account = createGameState({ seed: 'power' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const quotes = { AURA: { last: 50, bid: 49.99, ask: 50.01 } };
  assertClose(buyingPower(account, quotes, { marginEnabled: false }), 10000, 0.001, 'cash only without margin');
  assertClose(buyingPower(account, quotes, { marginEnabled: true }), 15000, 0.001, '1.5:1 leverage with margin');
  assertEqual(shortCapacity(account, quotes, 50), 400, 'short capacity = 2 × equity / price');
});

suite('Conditional orders and order book');

test('sell stop rests, then fills at the bid when the price crosses', () => {
  const seedState = createGameState({ seed: 'stop' });
  let account = buy(seedState.account, {
    ticker: 'AURA', qty: 10, price: 50, fee: 1, day: 0, tick: 0,
  }).account;
  const quote = { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 };
  const placed = placeConditionalOrder({
    account,
    orders: [],
    input: { ticker: 'AURA', side: 'sell', type: 'stop', qty: 10, stopPrice: 45 },
    quote,
    fee: 1,
    seq: 1,
  });
  assert(placed.ok, 'stop order placed');
  assertEqual(placed.order.status, ORDER_STATUS.open, 'stop rests');
  assertEqual(placed.order.stopPrice, 45, 'stop price kept');

  const processed = processOpenOrders({
    account,
    orders: [placed.order],
    quotes: { AURA: { last: 44, bid: 43.99, ask: 44.01 } },
    fee: 1,
    day: 1,
    tick: 0,
  });
  assertEqual(processed.fills.length, 1, 'stop filled after crossing');
  assertEqual(processed.fills[0].order.status, ORDER_STATUS.filled, 'filled status');
  assertEqual(processed.fills[0].order.reason, 'order.stopTriggered', 'trigger reason');
  assertClose(processed.fills[0].order.fillPrice, 43.99, 1e-9, 'fills at the bid');
});

test('trailing stop ratchets in the favourable direction before firing', () => {
  const seedState = createGameState({ seed: 'trail' });
  let account = buy(seedState.account, {
    ticker: 'AURA', qty: 10, price: 100, fee: 1, day: 0, tick: 0,
  }).account;
  const placed = placeConditionalOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'sell', type: 'trailing', qty: 10, trailAmount: 5,
    },
    quote: { ticker: 'AURA', last: 100, bid: 99.99, ask: 100.01 },
    fee: 1,
    seq: 1,
  });
  assert(placed.ok, 'trailing stop placed');
  assertClose(placed.order.stopPrice, 95, 0.001, 'initial trail below last');

  const higher = processOpenOrders({
    account,
    orders: [placed.order],
    quotes: { AURA: { last: 110, bid: 109.99, ask: 110.01 } },
    fee: 1,
    day: 1,
    tick: 0,
  });
  assertEqual(higher.fills.length, 0, 'rising price does not trigger');
  assertClose(higher.orders[0].stopPrice, 105, 0.001, 'stop ratchets up');

  const retreat = processOpenOrders({
    account: higher.account,
    orders: higher.orders,
    quotes: { AURA: { last: 104, bid: 103.99, ask: 104.01 } },
    fee: 1,
    day: 1,
    tick: 1,
  });
  assertEqual(retreat.fills.length, 1, 'trailing stop fires on the pullback');
  assertClose(retreat.fills[0].order.fillPrice, 103.99, 1e-9, 'fills at the bid');
});

test('conditional orders reject a stop on the wrong side of the market', () => {
  const account = createGameState({ seed: 'stop-direction' }).account;
  const quote = { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 };
  const bad = placeConditionalOrder({
    account,
    orders: [],
    input: { ticker: 'AURA', side: 'sell', type: 'stop', qty: 1, stopPrice: 55 },
    quote,
    fee: 1,
    seq: 1,
  });
  assertEqual(bad.ok, false, 'sell stop above market rejected');
  assertEqual(bad.error, 'error.stopDirection', 'direction error');
});

test('stop-limit waits for the trigger, then only fills inside the limit', () => {
  const seedState = createGameState({ seed: 'stop-limit' });
  const account = buy(seedState.account, {
    ticker: 'AURA', qty: 10, price: 50, fee: 1, day: 0, tick: 0,
  }).account;
  const placed = placeConditionalOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'sell', type: 'stop-limit', qty: 10, stopPrice: 45, limitPrice: 44.5,
    },
    quote: { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 },
    fee: 1,
    seq: 1,
  });
  assert(placed.ok, 'stop-limit placed');
  assertEqual(placed.order.status, ORDER_STATUS.open, 'stop-limit rests');
  assertEqual(placed.order.armed, false, 'not armed before trigger');

  const triggered = processOpenOrders({
    account,
    orders: [placed.order],
    quotes: { AURA: { last: 44.2, bid: 44.19, ask: 44.21 } },
    fee: 1,
    day: 1,
    tick: 0,
  });
  assertEqual(triggered.fills.length, 0, 'bid below the limit does not fill');
  assertEqual(triggered.orders[0].armed, true, 'order arms on the trigger');
  assertEqual(triggered.orders[0].status, ORDER_STATUS.open, 'still resting');

  const filled = processOpenOrders({
    account: triggered.account,
    orders: triggered.orders,
    quotes: { AURA: { last: 44.4, bid: 44.6, ask: 44.8 } },
    fee: 1,
    day: 1,
    tick: 1,
  });
  assertEqual(filled.fills.length, 1, 'fills once the bid reaches the limit');
  assertClose(filled.fills[0].order.fillPrice, 44.6, 1e-9, 'fills at the bid');
});

test('stop-limit rejects a limit on the wrong side of the trigger', () => {
  const account = createGameState({ seed: 'stop-limit-range' }).account;
  const bad = placeConditionalOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'buy', type: 'stop-limit', qty: 1, stopPrice: 52, limitPrice: 51,
    },
    quote: { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 },
    fee: 1,
    seq: 1,
  });
  assertEqual(bad.ok, false, 'buy stop-limit with limit below the trigger rejected');
  assertEqual(bad.error, 'error.stopLimitRange', 'range error');
});

test('OCO take-profit fill cancels the protective stop leg', () => {
  const seedState = createGameState({ seed: 'oco' });
  const account = buy(seedState.account, {
    ticker: 'AURA', qty: 10, price: 50, fee: 1, day: 0, tick: 0,
  }).account;
  const placed = placeOcoOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'sell', type: 'oco', qty: 10, limitPrice: 55, stopPrice: 45,
    },
    quote: { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 },
    fee: 1,
    seq: 1,
  });
  assert(placed.ok, 'OCO placed');
  assertEqual(placed.orders.length, 2, 'two legs created');
  assertEqual(placed.orders[0].ocoGroup, placed.orders[1].ocoGroup, 'legs share a group');
  assertEqual(placed.orders[0].ocoRole, 'takeProfit', 'first leg is take-profit');
  assertEqual(placed.orders[1].ocoRole, 'stopLoss', 'second leg is stop-loss');

  const processed = processOpenOrders({
    account,
    orders: placed.orders,
    quotes: { AURA: { last: 56, bid: 55.99, ask: 56.01 } },
    fee: 1,
    day: 1,
    tick: 0,
  });
  assertEqual(processed.fills.length, 1, 'only one leg fills');
  assertEqual(processed.fills[0].order.ocoRole, 'takeProfit', 'take-profit fills first');
  const open = processed.orders.filter((order) => order.status === ORDER_STATUS.open);
  assertEqual(open.length, 0, 'no leg remains open');
  const cancelled = processed.orders.filter((order) => order.status === ORDER_STATUS.cancelled);
  assertEqual(cancelled.length, 1, 'the sibling is cancelled');
  assertEqual(cancelled[0].reason, 'order.ocoCancelled', 'cancellation reason');
});

test('OCO shares are reserved once across both legs', () => {
  const seedState = createGameState({ seed: 'oco-reserve' });
  const account = buy(seedState.account, {
    ticker: 'AURA', qty: 10, price: 50, fee: 1, day: 0, tick: 0,
  }).account;
  const placed = placeOcoOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'sell', type: 'oco', qty: 10, limitPrice: 55, stopPrice: 45,
    },
    quote: { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 },
    fee: 1,
    seq: 1,
  });
  assert(placed.ok);
  assertEqual(reservedCash(placed.orders, 1), 0, 'no cash reserved for sells');
  assertEqual(availableShares(account, placed.orders, 'AURA'), 0, 'all shares reserved by OCO');
});

test('OCO rejects opening sides', () => {
  const account = createGameState({ seed: 'oco-side' }).account;
  const bad = placeOcoOrder({
    account,
    orders: [],
    input: {
      ticker: 'AURA', side: 'buy', type: 'oco', qty: 1, limitPrice: 55, stopPrice: 45,
    },
    quote: { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01 },
    fee: 1,
    seq: 1,
  });
  assertEqual(bad.ok, false, 'buy OCO rejected');
  assertEqual(bad.error, 'error.ocoSide', 'OCO side error');
});

test('order book is monotonic and reports slippage for large orders', () => {
  const quote = { ticker: 'AURA', last: 50, bid: 49.99, ask: 50.01, volume: 120000 };
  const book = buildOrderBook(quote, { levels: 5 });
  assertEqual(book.bids.length, 5, 'bid levels');
  assertEqual(book.asks.length, 5, 'ask levels');
  for (let index = 1; index < book.bids.length; index += 1) {
    assert(book.bids[index].price < book.bids[index - 1].price, 'bids descend');
  }
  for (let index = 1; index < book.asks.length; index += 1) {
    assert(book.asks[index].price > book.asks[index - 1].price, 'asks ascend');
  }
  assert(book.bids.every((level) => level.size > 0), 'sizes positive');
  const small = estimateMarketFill(book, 'buy', 100);
  assertEqual(small.complete, true, 'small order fully filled');
  assertClose(small.avgPrice, book.asks[0].price, 0.011, 'small order near best ask');
  const large = estimateMarketFill(book, 'buy', 5000);
  assert(large.slippagePct > 0, 'large order slips');
  const huge = estimateMarketFill(book, 'buy', 100000);
  assertEqual(huge.complete, false, 'visible book cannot absorb an enormous order');
});

suite('Order engine');

const marketState = () => {
  const state = createGameState({ seed: 'orders' });
  const quote = state.market.quotes.AURA;
  return { state, quote, fee: 1 };
};

test('market buy fills at ask and sell fills at bid', () => {
  const { state, quote, fee } = marketState();
  const args = {
    account: state.account,
    orders: [],
    input: { ticker: 'AURA', side: 'buy', type: 'market', qty: 5 },
    quote,
    fee,
    day: 0,
    tick: 0,
    seq: 1,
  };
  const bought = placeMarketOrder(args);
  assert(bought.ok);
  assertClose(bought.order.fillPrice, quote.ask, 0.001, 'buy fill at ask');
  const sold = placeMarketOrder({
    ...args,
    account: bought.account,
    input: { ticker: 'AURA', side: 'sell', type: 'market', qty: 5 },
    seq: 2,
  });
  assert(sold.ok);
  assertClose(sold.order.fillPrice, quote.bid, 0.001, 'sell fill at bid');
  assertEqual(state.account.cash, state.account.initialCash, 'original account untouched');
});

test('limit buy below market rests, then fills when ask crosses', () => {
  const { state, quote, fee } = marketState();
  const limit = Math.round((quote.last * 0.95) * 100) / 100;
  const placed = placeLimitOrder({
    account: state.account,
    orders: [],
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 10, limitPrice: limit },
    quote,
    fee,
    day: 0,
    tick: 0,
    seq: 1,
  });
  assert(placed.ok);
  assertEqual(placed.order.status, ORDER_STATUS.open, 'order rests');
  const fillQuote = { ...quote, ask: limit - 0.01, last: limit - 0.01 };
  const processed = processOpenOrders({
    account: placed.account,
    orders: [placed.order],
    quotes: { AURA: fillQuote },
    fee,
    day: 0,
    tick: 1,
  });
  assertEqual(processed.fills.length, 1, 'one fill');
  assertEqual(processed.orders[0].status, ORDER_STATUS.filled, 'status filled');
  assertClose(processed.orders[0].fillPrice, limit - 0.01, 0.001, 'fills at best available');
});

test('limit buy above market fills immediately at the ask', () => {
  const { state, quote, fee } = marketState();
  const input = { ticker: 'AURA', side: 'buy', type: 'limit', qty: 5, limitPrice: quote.last + 5 };
  const result = placeLimitOrder({ account: state.account, orders: [], input, quote, fee, day: 0, tick: 0, seq: 1 });
  assert(result.ok);
  assertEqual(result.order.status, ORDER_STATUS.filled);
  assertClose(result.order.fillPrice, quote.ask, 0.001, 'immediate fill at ask');
});

test('open orders only fill once', () => {
  const { state, quote, fee } = marketState();
  const limit = Math.round(quote.last * 0.9 * 100) / 100;
  const placed = placeLimitOrder({
    account: state.account, orders: [], quote, fee, day: 0, tick: 0, seq: 1,
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 5, limitPrice: limit },
  });
  const fillQuote = { ...quote, ask: limit - 1 };
  const first = processOpenOrders({ account: placed.account, orders: [placed.order], quotes: { AURA: fillQuote }, fee, day: 0, tick: 1 });
  const second = processOpenOrders({ account: first.account, orders: first.orders, quotes: { AURA: fillQuote }, fee, day: 0, tick: 2 });
  assertEqual(first.fills.length, 1);
  assertEqual(second.fills.length, 0, 'filled order cannot fill twice');
});

test('cash and share reservations block conflicting orders', () => {
  const { state, quote, fee } = marketState();
  const account = { ...state.account, cash: 1000, initialCash: 1000, positions: {} };
  const price = 9.5;
  const first = placeLimitOrder({
    account, orders: [], quote, fee, day: 0, tick: 0, seq: 1,
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 100, limitPrice: price },
  });
  assert(first.ok, 'first reserved order accepted');
  const second = placeLimitOrder({
    account: first.account, orders: [first.order], quote, fee, day: 0, tick: 0, seq: 2,
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 10, limitPrice: price },
  });
  assert(!second.ok, 'second order exceeds unreserved cash');
  assertClose(availableCash(account, [first.order], fee), 1000 - 950 - fee, 1e-6, 'cash reservation');
});

test('cancelling a resting order releases its reservation', () => {
  const { state, quote, fee } = marketState();
  const account = { ...state.account, cash: 1000, initialCash: 1000, positions: {} };
  const placed = placeLimitOrder({
    account, orders: [], quote, fee, day: 0, tick: 0, seq: 1,
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 50, limitPrice: 10 },
  });
  const cancelled = cancelOrder([placed.order], placed.order.id);
  assert(cancelled.ok);
  assertEqual(cancelled.order.status, ORDER_STATUS.cancelled);
  assertClose(reservedCash(cancelled.orders, fee), 0, 1e-6, 'reservation released');
});

test('sell limit cannot exceed available shares after reservations', () => {
  const { state, quote, fee } = marketState();
  const bought = buy(state.account, { ticker: 'AURA', qty: 10, price: quote.last, fee });
  const resting = placeLimitOrder({
    account: bought.account, orders: [], quote, fee, day: 0, tick: 0, seq: 1,
    input: { ticker: 'AURA', side: 'sell', type: 'limit', qty: 6, limitPrice: quote.last + 2 },
  });
  assert(resting.ok);
  const extra = placeLimitOrder({
    account: resting.account, orders: [resting.order], quote, fee, day: 0, tick: 0, seq: 2,
    input: { ticker: 'AURA', side: 'sell', type: 'limit', qty: 5, limitPrice: quote.last + 3 },
  });
  assert(!extra.ok, 'reserved shares cannot be sold twice');
  assertEqual(availableShares(resting.account, [resting.order], 'AURA'), 4, 'available shares');
});

test('order estimate reports total cost and fees', () => {
  const { quote, fee } = marketState();
  const estimate = estimateOrder({ input: { side: 'buy', type: 'market', qty: 10 }, quote, fee });
  assertClose(estimate.execPrice, quote.ask, 0.001);
  assertClose(estimate.total, quote.ask * 10 + fee, 0.001);
});

test('orders record the session day and tick they were placed', () => {
  const { state, quote, fee } = marketState();
  const placed = placeLimitOrder({
    account: state.account,
    orders: [],
    input: { ticker: 'AURA', side: 'buy', type: 'limit', qty: 1, limitPrice: quote.last * 0.9 },
    quote,
    fee,
    day: 7,
    tick: 3,
    seq: 1,
  });
  assert(placed.ok);
  assertEqual(placed.order.createdAt.day, 7, 'created day');
  assertEqual(placed.order.createdAt.tick, 3, 'created tick');
});

suite('Market simulation');

test('same seed produces identical prices', () => {
  const a = MarketEngine.create('deterministic-seed');
  const b = MarketEngine.create('deterministic-seed');
  for (let i = 0; i < 12; i += 1) {
    a.tick();
    b.tick();
  }
  for (const ticker of Object.keys(a.state.quotes)) {
    assertClose(a.state.quotes[ticker].last, b.state.quotes[ticker].last, 0.0001, ticker);
  }
});

test('prices stay positive and quotes stay consistent', () => {
  const engine = MarketEngine.create('positive-seed');
  for (let i = 0; i < 40; i += 1) {
    engine.tick();
    for (const quote of Object.values(engine.state.quotes)) {
      assert(quote.last > 0, 'price positive');
      assert(quote.bid > 0, 'bid positive');
      assert(quote.ask > quote.bid, 'ask above bid');
      assert(Number.isFinite(quote.marketCap), 'market cap finite');
    }
  }
});

test('a trading day closes after eight ticks and appends one session', () => {
  const engine = MarketEngine.create('day-seed');
  const historyBefore = engine.state.history.AURA.length;
  for (let i = 0; i < TICKS_PER_DAY; i += 1) engine.tick();
  assertEqual(engine.state.tick, 0, 'tick resets');
  assertEqual(engine.state.day, 1, 'day advances');
  assertEqual(engine.state.history.AURA.length, historyBefore + 1, 'one candle appended');
});

test('fast forward advances exactly one trading day', () => {
  const engine = MarketEngine.create('ff-seed');
  const startDay = engine.state.day;
  engine.fastForwardDay();
  assertEqual(engine.state.day, startDay + 1);
  assertEqual(engine.state.tick, 0);
});

test('serialized market restores identical continuation', () => {
  const original = MarketEngine.create('restore-seed');
  for (let i = 0; i < 5; i += 1) original.tick();
  const snapshot = JSON.parse(JSON.stringify(original.serialize()));
  const restored = new MarketEngine(snapshot);
  for (let i = 0; i < 3; i += 1) {
    original.tick();
    restored.tick();
  }
  assertClose(
    original.state.quotes.AURA.last,
    restored.state.quotes.AURA.last,
    1e-9,
    'restored engine matches',
  );
});

suite('Market universe and segments');

test('forty unique companies plus five ETFs are assigned to six segments', () => {
  const stocks = COMPANIES.filter((company) => !company.isEtf);
  const etfs = COMPANIES.filter((company) => company.isEtf);
  assertEqual(stocks.length, 40, 'stock count');
  assertEqual(etfs.length, 5, 'ETF count');
  const tickers = new Set(COMPANIES.map((company) => company.ticker));
  assertEqual(tickers.size, 45, 'unique tickers');
  assertEqual(MARKET_SEGMENTS.length, 6, 'segment count');
  for (const segment of MARKET_SEGMENTS) {
    const expected = segment.id === 'etf' ? 5 : 8;
    assertEqual(segment.tickers.length, expected, `${segment.id} company count`);
    for (const ticker of segment.tickers) {
      assert(tickers.has(ticker), `${ticker} exists`);
    }
  }
});

test('only the core segment is tradable at the start', () => {
  const state = createGameState({ seed: 'segments' });
  assert(isSegmentUnlocked(state, 'core'), 'core unlocked');
  for (const id of ['growth', 'consumer', 'industry', 'frontier', 'etf']) {
    assert(!isSegmentUnlocked(state, id), `${id} locked`);
  }
  assert(!isCompanyUnlocked(state, 'VELT'), 'growth ticker locked');
  assert(isCompanyUnlocked(state, 'AURA'), 'core ticker unlocked');
  assertEqual(unlockedCompanies(state).length, 8, 'eight tradable companies');
});

test('completing Unit 1 unlocks the growth segment', () => {
  const bus = createBus();
  const state = createGameState({ seed: 'segment-unlock' });
  const store = createStore({ bus, initialState: state });
  const session = buildQuizSession('u1', 1);
  recordQuizResult(store, bus, 'u1', gradeQuiz(session, answerAll(session)), { placement: true });
  assert(isUnitComplete(store.get(), 'u1'), 'unit complete');
  assert(isSegmentUnlocked(store.get(), 'growth'), 'growth unlocked');
  assert(isCompanyUnlocked(store.get(), 'QYRA'), 'growth ticker unlocked');
  assertEqual(unlockedCompanies(store.get()).length, 16, 'sixteen tradable companies');
});

test('ensureUniverse migrates an eight-company save without losing prices', () => {
  const state = createGameState({ seed: 'migration' });
  const coreTickers = COMPANIES.filter((company) => company.segmentId === 'core').map((company) => company.ticker);
  const auraPrice = state.market.quotes.AURA.last;
  for (const ticker of Object.keys(state.market.quotes)) {
    if (!coreTickers.includes(ticker)) delete state.market.quotes[ticker];
  }
  for (const ticker of Object.keys(state.market.history)) {
    if (!coreTickers.includes(ticker)) delete state.market.history[ticker];
  }
  state.version = 1;
  const engine = new MarketEngine(state.market);
  const changed = engine.ensureUniverse();
  assert(changed, 'migration ran');
  assertEqual(Object.keys(state.market.quotes).length, 45, 'all quotes generated');
  assertEqual(Object.keys(state.market.history).length, 45, 'all histories generated');
  assertClose(state.market.quotes.AURA.last, auraPrice, 1e-9, 'existing quote untouched');
  assert(Number.isFinite(state.market.index.value), 'index recalculated');
});

test('version 1 saves remain valid', () => {
  const state = createGameState({ seed: 'migration-save' });
  const legacy = serializeState(state);
  legacy.version = 1;
  const validation = validateSave(legacy);
  assert(validation.ok, 'legacy save accepted');
});

suite('Portfolio');

test('portfolio summary weights sum to 100 including cash', () => {
  const state = createGameState({ seed: 'portfolio' });
  const bought = buy(state.account, { ticker: 'AURA', qty: 10, price: state.market.quotes.AURA.ask, fee: 1 });
  state.account = bought.account;
  const summary = portfolioSummary(state.account, state.market.quotes);
  const totalWeight = summary.rows.reduce((sum, row) => sum + row.weight, 0) + summary.cashWeight;
  assertClose(totalWeight, 100, 1e-6, 'weights sum to 100');
  assertEqual(summary.positionsCount, 1);
});

suite('Quiz engine');

test('builds six questions per unit with unique ids', () => {
  for (const unit of STAGE_1_UNITS) {
    const session = buildQuizSession(unit.id, 1);
    assert(session, `session for ${unit.id}`);
    assertEqual(session.questions.length, 6, `${unit.id} question count`);
    const ids = new Set(session.questions.map((q) => q.id));
    assertEqual(ids.size, 6, `${unit.id} unique ids`);
    for (const question of session.questions) {
      assert(question.promptKey, 'prompt key');
      assert(question.explainKey, 'explanation key');
      if (question.type !== 'numeric') {
        assert(question.options.length >= 2, 'options exist');
        assert(question.correctIds.length >= 1, 'correct options');
      } else {
        assert(Number.isFinite(question.answer), 'numeric answer');
        assert(Number.isFinite(question.tolerance), 'tolerance');
        assert(question.workKey, 'worked solution key');
      }
    }
  }
});

function answerAll(session) {
  const answers = {};
  for (const question of session.questions) {
    if (question.type === 'numeric') answers[question.id] = String(question.answer);
    else if (question.type === 'multi') answers[question.id] = [...question.correctIds];
    else answers[question.id] = question.correctIds[0];
  }
  return answers;
}

test('all-correct answers score 100', () => {
  for (const unit of STAGE_1_UNITS) {
    const session = buildQuizSession(unit.id, 2);
    const result = gradeQuiz(session, answerAll(session));
    assertEqual(result.score, 100, `${unit.id} perfect score`);
    assert(result.passed);
    assert(result.testOutPassed);
  }
});

test('empty answers score zero and fail', () => {
  const session = buildQuizSession('u1', 3);
  const result = gradeQuiz(session, {});
  assertEqual(result.score, 0);
  assert(!result.passed);
  assert(!result.testOutPassed);
});

test('numeric tolerance accepts rounding but rejects wrong values', () => {
  const session = buildQuizSession('u2', 4);
  const numeric = session.questions.find((q) => q.type === 'numeric');
  const answers = answerAll(session);
  answers[numeric.id] = String(numeric.answer + numeric.tolerance + 0.01);
  const result = gradeQuiz(session, answers);
  assertEqual(result.score, 83, 'one wrong answer out of six');
  answers[numeric.id] = String(numeric.answer + numeric.tolerance * 0.5);
  const accepted = gradeQuiz(session, answers);
  assertEqual(accepted.score, 100, 'within tolerance accepted');
});

test('partial multi-select is graded as wrong', () => {
  const session = buildQuizSession('u1', 5);
  const multi = session.questions.find((q) => q.type === 'multi');
  const answers = answerAll(session);
  answers[multi.id] = [multi.correctIds[0]];
  const result = gradeQuiz(session, answers);
  assertEqual(result.score, 83);
  assert(!result.details.find((d) => d.id === multi.id).correct);
});

test('attempt variants change numeric parameters', () => {
  const first = buildQuizSession('u3', 1);
  const second = buildQuizSession('u3', 2);
  const q1 = first.questions.find((q) => q.type === 'numeric');
  const q2 = second.questions.find((q) => q.type === 'numeric');
  assert(q1.answer !== q2.answer, 'numeric answers vary between attempts');
});

suite('Learning progress and unlocks');

test('unit 2 is locked until unit 1 is fully completed', () => {
  const state = createGameState({ seed: 'progress' });
  assertEqual(isUnitUnlocked(state, getUnit('u1')), true, 'unit 1 open');
  assertEqual(isUnitUnlocked(state, getUnit('u2')), false, 'unit 2 locked');
});

test('reading, practice and quiz complete a unit and unlock the next', () => {
  const bus = createBus();
  const state = createGameState({ seed: 'progress' });
  const store = createStore({ bus, initialState: state });
  const unit = getUnit('u1');

  // Practice first would not be enough: the quiz and readings are still required.
  recordInspection(store, bus, 'AURA');
  recordInspection(store, bus, 'VRDN');
  assert(evaluatePractice(store.get(), unit).done, 'inspection practice done');

  for (const section of unit.sections) {
    markSectionRead(store, bus, unit.id, section.id);
  }
  const session = buildQuizSession('u1', 1);
  const result = gradeQuiz(session, answerAll(session));
  recordQuizResult(store, bus, 'u1', result, { placement: false });

  assert(isUnitComplete(store.get(), 'u1'), 'unit 1 completed');
  assert(isUnitUnlocked(store.get(), getUnit('u2')), 'unit 2 unlocked');
  assert(store.get().education.xp > 0, 'xp awarded');
});

test('unit does not complete without the practice task', () => {
  const bus = createBus();
  const state = createGameState({ seed: 'progress2' });
  const store = createStore({ bus, initialState: state });
  const unit = getUnit('u1');
  for (const section of unit.sections) markSectionRead(store, bus, 'u1', section.id);
  const session = buildQuizSession('u1', 1);
  recordQuizResult(store, bus, 'u1', gradeQuiz(session, answerAll(session)));
  assert(!isUnitComplete(store.get(), 'u1'), 'practice still required');
});

test('marking a section twice does not award XP twice', () => {
  const bus = createBus();
  const state = createGameState({ seed: 'xp' });
  const store = createStore({ bus, initialState: state });
  const first = markSectionRead(store, bus, 'u1', 's1');
  const xpAfterFirst = store.get().education.xp;
  const second = markSectionRead(store, bus, 'u1', 's1');
  assertEqual(second.xpGained, 0, 'no duplicate XP');
  assertEqual(store.get().education.xp, xpAfterFirst);
  assertEqual(first.xpGained, 5);
});

test('placement test completes a unit without lessons or practice', () => {
  const bus = createBus();
  const state = createGameState({ seed: 'placement' });
  const store = createStore({ bus, initialState: state });
  const session = buildQuizSession('u1', 1);
  const result = gradeQuiz(session, answerAll(session));
  assert(result.score >= TEST_OUT_SCORE, 'perfect score meets placement bar');
  recordQuizResult(store, bus, 'u1', result, { placement: true });
  assert(isUnitComplete(store.get(), 'u1'), 'placed out unit complete');
  assertEqual(unitProgress(store.get(), getUnit('u1')).placedOut, true);
  assertEqual(unitProgress(store.get(), getUnit('u1')).read, 0, 'no sections marked read');
});

test('limit orders unlock only after Unit 4 Section 3 is read', () => {
  const state = createGameState({ seed: 'unlock' });
  assert(!isToolUnlocked(state, 'order.limit'), 'locked initially');
  markSectionRead(createStore({ bus: createBus(), initialState: state }), createBus(), 'u4', 's3');
  // markSectionRead uses the store's state object; re-check that same state object.
  assert(isToolUnlocked(state, 'order.limit'), 'unlocked after section read');
});

test('trading tools are rule-gated now that all stages are implemented', () => {
  const state = createGameState({ seed: 'unlock2' });
  assert(!isToolUnlocked(state, 'trade.futures'));
  const reason = lockReason(state, 'trade.futures');
  assertEqual(reason.type, 'section');
});

suite('Practice verification');

test('unit 2 practice needs a buy of $1,000 or less', () => {
  const state = createGameState({ seed: 'practice' });
  const unit = getUnit('u2');
  assert(!evaluatePractice(state, unit).done, 'not done initially');
  state.account.trades = [{ side: 'buy', gross: 2500 }];
  assert(!evaluatePractice(state, unit).done, 'large buy does not count');
  state.account.trades = [{ side: 'buy', gross: 999 }];
  assert(evaluatePractice(state, unit).done, 'small buy counts');
});

test('unit 4 practice needs a filled limit buy placed below market', () => {
  const state = createGameState({ seed: 'practice4' });
  const unit = getUnit('u4');
  state.orders = [{ status: 'filled', type: 'limit', side: 'buy', refPrice: 50, limitPrice: 52 }];
  assert(!evaluatePractice(state, unit).done, 'limit above market does not count');
  state.orders = [{ status: 'filled', type: 'limit', side: 'buy', refPrice: 50, limitPrice: 47 }];
  assert(evaluatePractice(state, unit).done, 'limit below market counts');
  state.orders = [{ status: 'cancelled', type: 'limit', side: 'buy', refPrice: 50, limitPrice: 47 }];
  assert(!evaluatePractice(state, unit).done, 'cancelled orders do not count');
});

test('unit 1 practice needs two distinct inspected tickers', () => {
  const state = createGameState({ seed: 'practice1' });
  const unit = getUnit('u1');
  recordInspection(createStore({ bus: createBus(), initialState: state }), createBus(), 'AURA');
  assert(!evaluatePractice(state, unit).done);
  recordInspection(createStore({ bus: createBus(), initialState: state }), createBus(), 'AURA');
  assert(!evaluatePractice(state, unit).done, 'duplicate ticker does not count');
  recordInspection(createStore({ bus: createBus(), initialState: state }), createBus(), 'VRDN');
  assert(evaluatePractice(state, unit).done);
});

suite('Save and restore');

test('valid save passes validation', () => {
  const state = createGameState({ seed: 'save' });
  const result = validateSave(serializeState(state));
  assert(result.ok);
});

test('corrupted or incompatible saves are rejected', () => {
  const state = createGameState({ seed: 'save' });
  const badCash = serializeState(state);
  badCash.account.cash = -2e6;
  assert(!validateSave(badCash).ok, 'unbounded negative cash rejected');
  const marginCash = serializeState(state);
  marginCash.account.cash = -500;
  assert(validateSave(marginCash).ok, 'margin debit inside the limit is accepted');
  const badVersion = serializeState(state);
  badVersion.version = 99;
  assert(!validateSave(badVersion).ok, 'version mismatch rejected');
  const badQuote = serializeState(state);
  badQuote.market.quotes.AURA.last = 0;
  assert(!validateSave(badQuote).ok, 'zero price rejected');
});

test('hydrate preserves progress, orders and positions', () => {
  const state = createGameState({ seed: 'hydrate' });
  const bus = createBus();
  const store = createStore({ bus, initialState: state });
  markSectionRead(store, bus, 'u1', 's1');
  state.orders.push({ id: 1, ticker: 'AURA', side: 'buy', type: 'limit', qty: 1, limitPrice: 10, status: 'open', createdAt: { day: 0, tick: 0 } });
  const saved = JSON.parse(JSON.stringify(state));
  const hydrated = hydrateState(saved);
  assert(hydrated.education.units.u1.sectionsRead.s1, 'section progress preserved');
  assertEqual(hydrated.orders.length, 1, 'order preserved');
  assertEqual(hydrated.education.units.u1.quizAttempts, 0, 'quiz attempts default');
});

test('theme defaults to dark and survives save hydration', () => {
  const state = createGameState({ seed: 'theme' });
  assertEqual(state.settings.theme, 'dark', 'new games start dark');
  state.settings.theme = 'light';
  const hydrated = hydrateState(JSON.parse(JSON.stringify(state)));
  assertEqual(hydrated.settings.theme, 'light', 'light theme preserved');
  const legacy = createGameState({ seed: 'theme-legacy' });
  delete legacy.settings.theme;
  assertEqual(hydrateState(legacy).settings.theme, 'dark', 'missing theme falls back to dark');
});

suite('Dividends and Stage 2');

test('cash dividends pay shares × dividend per share exactly once', () => {
  const state = createGameState({ seed: 'dividend' });
  const company = COMPANIES.find((entry) => entry.dividendYield > 0);
  assert(company, 'a dividend-paying company exists');
  let exDay = null;
  for (let day = 0; day < 100; day += 1) {
    if (isDividendDay(company, day)) { exDay = day; break; }
  }
  assert(exDay !== null, 'the company has an ex-dividend date');
  const account = {
    ...state.account,
    positions: { [company.ticker]: { qty: 100, costBasis: 1000 } },
  };
  const rows = payableDividends(account, exDay);
  assertEqual(rows.length, 1, 'one dividend row for the held stock');
  assertClose(rows[0].amount, 100 * dividendPerShare(company), 0.011);
  const first = applyDividends(account, rows);
  assertClose(first.account.cash, account.cash + rows[0].amount, 0.011);
  assertEqual(first.dividends.length, 1, 'dividend recorded in the ledger');
  const again = applyDividends(first.account, payableDividends(first.account, exDay));
  assertEqual(again.dividends.length, 0, 'same ex-date cannot pay twice');
  assertClose(again.account.cash, first.account.cash, 0.001);
});

test('dividends are not paid on ordinary days or without a position', () => {
  const state = createGameState({ seed: 'dividend-empty' });
  const company = COMPANIES.find((entry) => entry.dividendYield > 0);
  const noPosition = payableDividends(state.account, 0);
  assertEqual(noPosition.length, 0, 'no position means no dividend');
  const ordinary = payableDividends({
    ...state.account,
    positions: { [company.ticker]: { qty: 10, costBasis: 100 } },
  }, 0);
  assert(isDividendDay(company, 0) ? ordinary.length === 1 : ordinary.length === 0, 'only ex-dates pay');
});

test('Stage 2 exposes the dividend unit and keeps it gated', () => {
  const state = createGameState({ seed: 'stage2' });
  assertEqual(STAGE_2_UNITS[0].id, 'u5', 'Stage 2 starts with the dividend unit');
  const unit = getUnit('u5');
  assert(unit && unit.implemented, 'unit 5 is implemented');
  assertEqual(unit.prerequisites[0], 'u4', 'unit 5 follows unit 4');
  assert(!isUnitUnlocked(state, unit), 'unit 5 stays locked until unit 4 is complete');
  state.education.inspectedTickers = COMPANIES.filter((entry) => entry.dividendYield > 0)
    .slice(0, 2).map((entry) => entry.ticker);
  assertEqual(evaluatePractice(state, unit).done, true, 'inspecting two dividend stocks completes practice');
});

test('every stock has exactly one stock style and ETFs are excluded', () => {
  const stocks = COMPANIES.filter((company) => !company.isEtf);
  const styled = stocks.filter((company) => styleOf(company.ticker));
  assertEqual(styled.length, stocks.length, 'every stock is classified');
  const ids = new Set(stocks.map((company) => styleOf(company.ticker)));
  assertEqual(ids.size, 4, 'four styles are represented');
  const mapped = Object.values(STOCK_STYLES).flat();
  assertEqual(mapped.length, stocks.length, 'no duplicate style assignments');
  assertEqual(new Set(mapped).size, stocks.length, 'no ticker appears in two styles');
  for (const etf of COMPANIES.filter((company) => company.isEtf)) {
    assert(!styleOf(etf.ticker), `${etf.ticker} is not classified as a stock style`);
  }
});

test('ETF quotes are derived from their weighted component basket', () => {
  const engine = MarketEngine.create('etf-basket');
  const state = engine.state;
  assert(state.etfDivisors && Object.keys(state.etfDivisors).length === 5, 'five ETF divisors');
  for (const etf of COMPANIES.filter((company) => company.isEtf)) {
    const quote = state.quotes[etf.ticker];
    assert(quote, `${etf.ticker} quote exists`);
    const basket = etf.components.reduce((sum, component) => (
      sum + component.weight * state.quotes[component.ticker].last
    ), 0);
    assertClose(quote.last, basket * state.etfDivisors[etf.ticker], 0.02, `${etf.ticker} tracks the basket`);
    const totalWeight = etf.components.reduce((sum, component) => sum + component.weight, 0);
    assertClose(totalWeight, 1, 1e-9, `${etf.ticker} weights sum to 100%`);
    assertEqual(state.history[etf.ticker].length, 90, `${etf.ticker} has history`);
  }
});

suite('Professional branches');

test('six optional branches sit after the 32-unit core path', () => {
  assertEqual(BRANCHES.length, 6, 'six professional branches');
  assertEqual(BRANCH_UNITS.length, 6, 'one focused unit per branch');
  assertEqual(CORE_UNITS.length, 32, 'core path remains 32 units');
  const ids = new Set(BRANCH_UNITS.map((unit) => unit.id));
  assertEqual(ids.size, 6, 'unique branch unit ids');
  for (const branch of BRANCHES) {
    const unit = getUnit(branch.unitId);
    assert(unit, `${branch.id} unit exists`);
    assertEqual(unit.optional, true, `${branch.id} is optional`);
    assertEqual(unit.prerequisites[0], 'u32', `${branch.id} follows Unit 32`);
    assertEqual(unit.sections.length, 4, `${branch.id} has four lessons`);
    assertEqual(unit.quiz.passScore, 80, `${branch.id} pass score`);
    const questions = buildQuizSession(unit.id, 1);
    assertEqual(questions.questions.length, 6, `${branch.id} has six quiz questions`);
  }
});

test('branches stay locked until Unit 32 and do not dilute core progress', () => {
  const state = createGameState({ seed: 'branches' });
  assert(!isUnitUnlocked(state, getUnit('b1')), 'branch locked before core completion');
  assertEqual(overallProgress(state).total, 32, 'core progress has 32 units');
  for (const unit of CORE_UNITS) {
    const progress = state.education.units[unit.id];
    progress.completedAt = Date.now();
    progress.practiceDone = true;
    progress.quizBest = 100;
    for (const section of unit.sections) progress.sectionsRead[section.id] = true;
  }
  assert(isUnitComplete(state, 'u32'), 'core complete');
  assert(isUnitUnlocked(state, getUnit('b1')), 'branches unlock after u32');
  assertEqual(overallProgress(state).completed, 32, 'core completed count');
  assertEqual(overallProgress(state).pct, 100, 'core completion is 100%');
  assert(!isUnitComplete(state, 'b1'), 'branch still needs its own work');
});

test('deep in-the-money short calls can be assigned early and deliver stock', () => {
  let account = createGameState({ seed: 'early-assignment' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const sold = sellOption(account, {
    contract: {
      ticker: 'AURA', type: 'call', strike: 100, expiryDay: 8, premium: 12, vol: 0.3,
    },
    qty: 1,
    fee: 0,
    day: 0,
    tick: 0,
  });
  assert(sold.ok, 'short call opens');
  const bought = buy(sold.account, {
    ticker: 'AURA', qty: 100, price: 90, fee: 0, day: 0, tick: 0,
  });
  assert(bought.ok, 'covering shares bought');
  const assigned = assignEarlyOptions(bought.account, { AURA: { last: 112 } }, 1);
  assertEqual(assigned.assignments.length, 1, 'one assignment');
  assertEqual(assigned.account.options.length, 0, 'short call removed');
  assertEqual(positionOf(assigned.account, 'AURA').qty, 0, 'shares delivered');
  assertClose(assigned.account.cash, 12200, 0.01, 'premium and strike proceeds credited');
  assertClose(assigned.account.realizedPnl, 1000, 0.01, 'stock delivery realizes gain');
  assertEqual(assigned.account.optionTrades[0].side, 'assignedEarly', 'assignment logged');
  assertEqual(assigned.account.trades[0].assignment, true, 'stock delivery logged');
});

test('early assignment can open a short stock position for an uncovered call', () => {
  const account = createGameState({ seed: 'early-assignment-short' }).account;
  const sold = sellOption(account, {
    contract: {
      ticker: 'AURA', type: 'call', strike: 100, expiryDay: 9, premium: 10, vol: 0.3,
    },
    qty: 2,
    fee: 0,
    day: 0,
    tick: 0,
  });
  const assigned = assignEarlyOptions(sold.account, { AURA: { last: 114 } }, 2);
  assertEqual(assigned.assignments.length, 1, 'one assignment');
  const position = positionOf(assigned.account, 'AURA');
  assertEqual(position.qty, -200, 'uncovered call creates a short stock position');
  assertClose(position.costBasis, 20000, 0.01, 'short basis is the strike');
});

test('challenges start from recorded equity and complete on real activity', () => {
  const state = createGameState({ seed: 'challenge' });
  state.education.units.u3.completedAt = Date.now();
  const store = createStore({ bus: createBus(), initialState: state });
  const locked = startChallenge(store, null, 'hedger');
  assertEqual(locked.ok, false, 'locked challenge cannot start');
  const started = startChallenge(store, null, 'firstProfit');
  assert(started.ok, 'first challenge starts');
  assertEqual(state.challenges.active.id, 'firstProfit', 'active challenge recorded');
  state.account.cash += 400;
  state.account.trades = [
    { id: state.account.tradeSeq, side: 'buy', ticker: 'AURA', qty: 1, price: 10, day: 1 },
    { id: state.account.tradeSeq + 1, side: 'sell', ticker: 'AURA', qty: 1, price: 11, day: 2 },
  ];
  const completed = checkChallenge(store, null);
  assertEqual(completed.status, 'completed', 'challenge completes');
  assert(state.challenges.completed.includes('firstProfit'), 'completion recorded');
  assertEqual(state.challenges.active, null, 'active challenge cleared');
  assert(state.education.xp >= 120, 'challenge XP awarded');
});

test('challenge progress reports the active checks', () => {
  const state = createGameState({ seed: 'challenge-progress' });
  state.education.units.u15.completedAt = Date.now();
  const store = createStore({ bus: createBus(), initialState: state });
  startChallenge(store, null, 'riskManager');
  const challenge = CHALLENGES.find((entry) => entry.id === 'riskManager');
  const progress = challengeProgress(state, challenge);
  assert(progress, 'progress exists while active');
  assertEqual(progress.checks.length, 3, 'three checks');
  assert(progress.checks.some((check) => check.kind === 'drawdownMax'), 'drawdown tracked');
  assertEqual(progress.remaining, 30, 'full deadline remains');
  abandonChallenge(store, null);
  assertEqual(state.challenges.active, null, 'abandon clears active challenge');
});

suite('Career mode');

test('career starts at rank 1 and promotes when its real requirements are met', () => {
  const state = createGameState({ seed: 'career' });
  const store = createStore({ bus: createBus(), initialState: state });
  assertEqual(normalizeCareer(null, 0).rank, 1, 'new career starts at rank 1');
  assertEqual(CAREER_RANKS.length, 8, 'eight career ranks');
  let progress = careerProgress(state);
  assertEqual(progress.ready, false, 'rank 1 not ready at start');
  state.education.units.u4.completedAt = Date.now();
  state.account.trades = [{ id: 1, side: 'buy', ticker: 'AURA', qty: 1, price: 10, day: 1 }];
  state.education.inspectedTickers = ['AURA', 'HLIX', 'VRDN'];
  progress = careerProgress(state);
  assertEqual(progress.ready, true, 'requirements complete');
  const promoted = promoteCareer(store, null);
  assert(promoted.ok, 'promotion succeeds');
  assertEqual(state.career.rank, 2, 'rank 2 reached');
  assert(state.education.xp >= 100, 'promotion XP awarded');
  assertEqual(careerProgress(state).salary, 200, 'rank 2 salary');
});

test('career salary is paid once per 21 trading days', () => {
  const account = { cash: 10000, careerIncome: 0 };
  const career = normalizeCareer({ rank: 2, salaryPaidDay: 0 }, 0);
  const early = applyCareerSalary(account, career, 20);
  assertEqual(early.amount, 0, 'not paid before the interval');
  const paid = applyCareerSalary(early.account, early.career, CAREER_SALARY_INTERVAL);
  assertEqual(paid.amount, 200, 'salary paid');
  assertEqual(paid.account.cash, 10200, 'cash credited');
  assertEqual(paid.account.careerIncome, 200, 'career income recorded');
  assertEqual(paid.career.salaryPaidDay, CAREER_SALARY_INTERVAL, 'next salary day advanced');
  const repeated = applyCareerSalary(paid.account, paid.career, CAREER_SALARY_INTERVAL);
  assertEqual(repeated.amount, 0, 'same day is not paid twice');
});

test('research tasks generate, accept and grade into a passing report', () => {
  const state = createGameState({ seed: 'career-research' });
  state.career.rank = 2;
  const store = createStore({ bus: createBus(), initialState: state });
  state.career = refreshResearchTasks(state, 0);
  assert(state.career.tasks.length >= 2, 'tasks are generated for a trader');
  assertEqual(state.career.tasks[0].status, 'available', 'first task is available');

  const accepted = acceptResearchTask(store, null, state.career.tasks[0].id);
  assert(accepted.ok, 'task accepted');
  assertEqual(accepted.task.status, 'active', 'task becomes active');

  const task = accepted.task;
  const quote = state.market.quotes[task.ticker];
  state.education.inspectedTickers = [task.ticker];
  state.education.units.u12.completedAt = Date.now();
  const summary = `Thesis for ${task.ticker}: revenue growth of 12% and a 4% free-cash-flow yield support the valuation. `
    + 'Key risks include a 200 bps margin compression and a 15% drawdown if demand slows. '
    + 'I model three scenarios and size the position at 3% of the portfolio.';
  const submitted = submitInvestmentReport(store, null, {
    taskId: task.id,
    thesis: 'neutral',
    conviction: 3,
    targetPrice: quote.last,
    summary,
  });
  assert(submitted.ok, 'report submitted');
  assert(submitted.report.score >= 60, 'report passes');
  assertEqual(submitted.task.status, 'completed', 'task completed');
  assertEqual(state.career.reports.length, 1, 'report recorded');
  assert(submitted.xpGained > 0, 'XP awarded');
  assert(submitted.cash > 0, 'cash bonus awarded');
  assertEqual(careerProgress(state).passedReports, 1, 'passing report counted');
});

test('a short or invalid report is rejected before grading', () => {
  const state = createGameState({ seed: 'career-report-errors' });
  state.career.rank = 2;
  const store = createStore({ bus: createBus(), initialState: state });
  state.career = refreshResearchTasks(state, 0);
  const task = state.career.tasks[0];
  const accepted = acceptResearchTask(store, null, task.id);
  assert(accepted.ok);
  const short = submitInvestmentReport(store, null, {
    taskId: task.id,
    thesis: 'bull',
    conviction: 4,
    targetPrice: 10,
    summary: 'too short',
  });
  assertEqual(short.ok, false, 'short summary rejected');
  assertEqual(short.error, 'career.report.errorSummary', 'summary error');
  const badTarget = submitInvestmentReport(store, null, {
    taskId: task.id,
    thesis: 'bull',
    conviction: 4,
    targetPrice: -1,
    summary: 'A sufficiently long report with numbers and a clear risk section.',
  });
  assertEqual(badTarget.ok, false, 'negative target rejected');
  assertEqual(badTarget.error, 'career.report.errorTarget', 'target error');
});

test('performance review runs every 21 trading days from real equity history', () => {
  const state = createGameState({ seed: 'career-eval' });
  state.career = normalizeCareer({ rank: 2, lastEvalDay: 0 }, 0);
  state.market.day = CAREER_EVAL_INTERVAL;
  state.account.equityHistory = [];
  for (let day = 0; day <= CAREER_EVAL_INTERVAL; day += 1) {
    state.account.equityHistory.push({
      day,
      equity: 10000 + day * 100,
    });
  }
  const result = evaluateCareerPerformance(state, CAREER_EVAL_INTERVAL);
  assert(result.due, 'review is due');
  assertEqual(result.evaluation.reports, 0, 'no reports in the period');
  assert(result.evaluation.score >= 55, 'positive returns lift the score');
  assertEqual(result.evaluation.grade, result.evaluation.grade.toUpperCase(), 'grade is set');
  assertEqual(result.career.evaluations.length, 1, 'review stored');
  assertEqual(result.career.lastEvalDay, CAREER_EVAL_INTERVAL, 'review day advanced');
  assert(result.xpGained > 0, 'review awards XP');
  const early = evaluateCareerPerformance({ ...state, career: result.career }, CAREER_EVAL_INTERVAL);
  assertEqual(early.due, false, 'not due again on the same day');
});

test('certificates are awarded from completed units and stored once', () => {
  const state = createGameState({ seed: 'career-certs' });
  for (const unitId of ['u1', 'u2', 'u3', 'u4']) {
    state.education.units[unitId].completedAt = Date.now();
  }
  const first = syncCareerCertificates(state, 0);
  assert(first.newlyEarned.some((entry) => entry.id === 'foundation'), 'foundation certificate earned');
  assertEqual(first.career.certificates.length, 1, 'certificate persisted');
  state.career = first.career;
  const second = syncCareerCertificates(state, 0);
  assertEqual(second.newlyEarned.length, 0, 'certificate is not awarded twice');
  const certificates = careerCertificates(state, second.career);
  assertEqual(certificates.find((entry) => entry.id === 'foundation').earned, true, 'earned flag set');
});

test('the top career rank cannot be promoted further', () => {
  const state = createGameState({ seed: 'career-max' });
  state.career.rank = CAREER_RANKS.length;
  const store = createStore({ bus: createBus(), initialState: state });
  const result = promoteCareer(store, null);
  assertEqual(result.ok, false, 'top rank is capped');
  assertEqual(result.error, 'career.errorMaxRank', 'clear error');
});

test('Stage 2 units 6-8 are implemented in order', () => {
  const ids = STAGE_2_UNITS.map((unit) => unit.id);
  assertEqual(ids.join(','), 'u5,u6,u7,u8', 'all four units exist');
  assert(STAGE_2_UNITS.every((unit) => unit.implemented), 'all Stage 2 units are playable');
  STAGE_2_UNITS.forEach((unit, index) => {
    const expected = index === 0 ? 'u4' : STAGE_2_UNITS[index - 1].id;
    assertEqual(unit.prerequisites[0], expected, `${unit.id} follows ${expected}`);
  });
});

test('style, diversification and holding practice checks verify real state', () => {
  const state = createGameState({ seed: 'stage2-practice' });
  const styles = ['growth', 'value', 'dividend'];
  state.education.inspectedTickers = styles.map((style) => STOCK_STYLES[style][0]);
  assertEqual(evaluatePractice(state, getUnit('u6')).done, true, 'three styles complete u6');

  const sectorPicks = ['AURA', 'VRDN', 'ORBT'];
  state.account.positions = sectorPicks.reduce((acc, ticker) => {
    acc[ticker] = { qty: 5, costBasis: 50 };
    return acc;
  }, {});
  assertEqual(evaluatePractice(state, getUnit('u7')).done, true, 'three sectors complete u7');

  state.account.positions = { AURA: { qty: 3, costBasis: 30 } };
  state.account.trades = [{ side: 'buy', ticker: 'AURA', day: state.market.day - 20, qty: 3, price: 10 }];
  assertEqual(evaluatePractice(state, getUnit('u8')).done, true, '15 held sessions complete u8');
});

suite('Stage 3 analytics');

test('SMA, RSI and indicator snapshots are deterministic', () => {
  assertClose(sma([1, 2, 3, 4, 5], 3), 4, 0.0001);
  assertEqual(sma([1, 2], 3), null, 'insufficient data returns null');
  assertEqual(rsi([1, 2, 3, 4, 5], 3), 100, 'rising series has RSI 100');
  const state = createGameState({ seed: 'indicators' });
  const snapshot = indicatorSnapshot(state.market.history.AURA, state.market.quotes.AURA.last);
  assert(snapshot, 'snapshot exists');
  assert(snapshot.sma20 > 0 && snapshot.sma50 > 0, 'moving averages computed');
  assert(snapshot.rsi14 >= 0 && snapshot.rsi14 <= 100, 'RSI stays in range');
  assert(snapshot.trend === 'up' || snapshot.trend === 'down' || snapshot.trend === 'flat', 'trend classified');
});

test('DCF discounts cash flow and responds to assumptions', () => {
  const base = dcf({ fcf: 100, growthRate: 0, years: 1, discountRate: 10, terminalGrowth: 0, shares: 100, netDebt: 0 });
  assertClose(base.enterpriseValue, 1000, 0.5);
  assertClose(base.perShare, 10, 0.01);
  const higherRate = dcf({ fcf: 100, growthRate: 0, years: 1, discountRate: 15, terminalGrowth: 0, shares: 100, netDebt: 0 });
  assert(higherRate.perShare < base.perShare, 'higher discount rate lowers value');
  const netDebt = dcf({ fcf: 100, growthRate: 0, years: 1, discountRate: 10, terminalGrowth: 0, shares: 100, netDebt: 200 });
  assertClose(netDebt.perShare, 8, 0.01);
  assertEqual(dcf({ fcf: 100, years: 1, discountRate: 5, terminalGrowth: 6, shares: 100 }), null, 'r <= g is invalid');
});

test('Stage 3 units and demo-based practice are wired', () => {
  assertEqual(STAGE_3_UNITS.map((unit) => unit.id).join(','), 'u9,u10,u11,u12', 'four Stage 3 units');
  assert(STAGE_3_UNITS.every((unit) => unit.implemented), 'all Stage 3 units are playable');
  const state = createGameState({ seed: 'stage3-practice' });
  state.education.demoRuns = ['candle'];
  assertEqual(evaluatePractice(state, getUnit('u9')).done, true, 'candle demo completes u9');
  state.education.demoRuns.push('indicators');
  assertEqual(evaluatePractice(state, getUnit('u10')).done, true, 'indicators demo completes u10');
  state.education.demoRuns.push('dcf');
  assertEqual(evaluatePractice(state, getUnit('u12')).done, true, 'dcf demo completes u12');
  state.settings.layout = 'basic';
  state.education.inspectedTickers = ['AURA', 'VRDN'];
  assertEqual(evaluatePractice(state, getUnit('u11')).done, false, 'u11 needs advanced layout');
  state.settings.layout = 'advanced';
  assertEqual(evaluatePractice(state, getUnit('u11')).done, true, 'advanced inspections complete u11');
});

suite('Stage 4 analytics and completion');

test('macro snapshot is deterministic and internally consistent', () => {
  const first = macroSnapshot(42, 'macro-seed');
  const again = macroSnapshot(42, 'macro-seed');
  assertEqual(JSON.stringify(first), JSON.stringify(again), 'same day and seed give the same macro picture');
  assertClose(first.realRate, first.policyRate - first.inflation, 0.11);
  assert(['expansion', 'slowdown', 'inflation', 'neutral'].includes(first.regime), 'regime is classified');
  assert(Number.isFinite(first.growth) && Number.isFinite(first.unemployment), 'indicators are finite');
});

test('portfolio analytics derives risk from equity and weights', () => {
  const state = createGameState({ seed: 'analytics' });
  const account = {
    ...state.account,
    cash: 5000,
    equityHistory: [{ day: 0, equity: 10000 }, { day: 1, equity: 11000 }, { day: 2, equity: 10500 }],
    positions: {
      AURA: { qty: 60, costBasis: 3000 },
      VRDN: { qty: 20, costBasis: 600 },
    },
  };
  const total = 5000 + state.market.quotes.AURA.last * 60 + state.market.quotes.VRDN.last * 20;
  const analytics = portfolioAnalytics(account, state.market.quotes, total);
  assert(analytics.volatility > 0, 'volatility computed');
  assert(analytics.drawdown < 0, 'drawdown is negative');
  assert(analytics.hhi > 0 && analytics.hhi <= 1, 'HHI in range');
  assert(analytics.topTicker === 'AURA', 'largest position identified');
  assertClose(analytics.exposure, 1 - 5000 / total, 0.01);
});

test('Stage 4 units are implemented and practice checks are demo-based', () => {
  assertEqual(STAGE_4_UNITS.map((unit) => unit.id).join(','), 'u13,u14,u15,u16', 'four Stage 4 units');
  assert(STAGE_4_UNITS.every((unit) => unit.implemented), 'all Stage 4 units are playable');
  const state = createGameState({ seed: 'stage4-practice' });
  state.education.demoRuns = ['macro', 'allocation', 'risk', 'strategies'];
  STAGE_4_UNITS.forEach((unit) => {
    assertEqual(evaluatePractice(state, unit).done, true, `${unit.id} demo completes practice`);
  });
});

suite('Stage 5 advanced trading');

test('Stage 5 units are implemented and practice checks use real activity', () => {
  assertEqual(STAGE_5_UNITS.map((unit) => unit.id).join(','), 'u17,u18,u19,u20', 'four Stage 5 units');
  assert(STAGE_5_UNITS.every((unit) => unit.implemented), 'all Stage 5 units are playable');

  const state = createGameState({ seed: 'stage5-practice' });
  state.education.demoRuns = ['margin', 'orderBook'];
  assertEqual(evaluatePractice(state, getUnit('u18')).done, true, 'margin demo completes Unit 18');
  assertEqual(evaluatePractice(state, getUnit('u20')).done, true, 'order book demo completes Unit 20');

  state.account.trades = [
    { side: 'short', ticker: 'AURA', qty: 5 },
    { side: 'cover', ticker: 'AURA', qty: 5 },
  ];
  assertEqual(evaluatePractice(state, getUnit('u17')).done, true, 'short + cover completes Unit 17');

  state.orders = [{ status: 'filled', type: 'stop', ticker: 'AURA' }];
  assertEqual(evaluatePractice(state, getUnit('u19')).done, true, 'a filled stop completes Unit 19');
});

test('advanced trading tools unlock from the first section of their unit', () => {
  const state = createGameState({ seed: 'stage5-unlocks' });
  const mark = (unitId, sectionId) => {
    state.education.units[unitId].sectionsRead[sectionId] = true;
  };
  assertEqual(isToolUnlocked(state, 'trade.short'), false, 'short starts locked');
  mark('u17', 's1');
  assertEqual(isToolUnlocked(state, 'trade.short'), true, 'short unlocks after u17 s1');
  assertEqual(isToolUnlocked(state, 'trade.margin'), false, 'margin still locked');
  mark('u18', 's1');
  assertEqual(isToolUnlocked(state, 'trade.margin'), true, 'margin unlocks after u18 s1');
  assertEqual(isToolUnlocked(state, 'order.stop'), false, 'stop orders still locked');
  mark('u19', 's1');
  assertEqual(isToolUnlocked(state, 'order.stop'), true, 'stop orders unlock after u19 s1');
});

suite('Options pricing and positions');

test('normal CDF and Black-Scholes satisfy put-call parity', () => {
  assertClose(normCdf(0), 0.5, 1e-9, 'N(0) = 0.5');
  assertClose(normCdf(1.96), 0.975, 0.001, 'N(1.96) ≈ 97.5%');
  const base = { spot: 100, strike: 100, years: 1, vol: 0.2, rate: 0.04 };
  const call = blackScholes({ ...base, type: 'call' });
  const put = blackScholes({ ...base, type: 'put' });
  assertClose(call.price - put.price, 100 - 100 * Math.exp(-0.04), 0.03, 'put-call parity');
  assert(call.price > 0 && put.price > 0, 'premiums positive');
  assert(call.delta > 0 && call.delta < 1, 'call delta in (0,1)');
  assert(put.delta < 0 && put.delta > -1, 'put delta in (-1,0)');
  assert(call.gamma > 0 && call.vega > 0, 'gamma and vega positive');
  assert(call.theta < 0, 'long call theta negative');
});

test('expired options are worth intrinsic value only', () => {
  const call = blackScholes({ type: 'call', spot: 60, strike: 50, years: 0, vol: 0.3 });
  assertClose(call.price, 10, 0.01, 'call intrinsic');
  assertEqual(call.timeValue, 0, 'no time value at expiry');
  const put = blackScholes({ type: 'put', spot: 40, strike: 50, years: 0, vol: 0.3 });
  assertClose(put.price, 10, 0.01, 'put intrinsic');
  const worthless = blackScholes({ type: 'call', spot: 45, strike: 50, years: 0, vol: 0.3 });
  assertClose(worthless.price, 0, 0.01, 'OTM call worthless');
  const payoff = payoffAtExpiry({ type: 'call', spot: 60, strike: 50, premium: 2, qty: 2 });
  assertClose(payoff.pnl, 1600, 0.01, 'payoff includes two contracts');
  assertClose(payoff.breakeven, 52, 0.01, 'call breakeven');
});

test('option chains have ordered strikes and both rights at every expiry', () => {
  const state = createGameState({ seed: 'chain' });
  const company = COMPANIES[0];
  const quote = state.market.quotes[company.ticker];
  const chain = buildOptionChain(company, quote, 5);
  assertEqual(chain.strikes.length, 7, 'seven strikes around spot');
  assert(chain.strikes.every((strike, index) => index === 0 || strike > chain.strikes[index - 1]), 'strikes ascend');
  assertEqual(chain.expiries.length, 3, 'three expiries');
  assertEqual(chain.contracts.length, 3 * 7 * 2, 'calls and puts for every strike');
  assert(chain.contracts.every((contract) => contract.premium > 0), 'every premium positive');
  const atmStrike = chain.strikes.reduce((best, strike) => (
    Math.abs(strike - chain.spot) < Math.abs(best - chain.spot) ? strike : best
  ), chain.strikes[0]);
  const atmCall = findContract(chain, { type: 'call', strike: atmStrike, expiryDay: chain.expiries[0].expiryDay });
  const deepCall = findContract(chain, {
    type: 'call',
    strike: chain.strikes[chain.strikes.length - 1],
    expiryDay: chain.expiries[0].expiryDay,
  });
  assert(atmCall.premium > deepCall.premium, 'ATM call worth more than far OTM call');
  assert(strikeGrid(50).length >= 5, 'strike grid usable');
});

test('buying an option moves cash into a marked position', () => {
  let account = createGameState({ seed: 'option-buy' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'call', strike: 50, expiryDay: 60, premium: 2.5,
    vol: 0.3, delta: 0.5, theta: -0.01,
  };
  const bought = buyOption(account, { contract, qty: 2, fee: 1, day: 0 });
  assert(bought.ok, 'buy succeeds');
  assertClose(bought.account.cash, 9499, 0.001, 'premium × 100 × 2 plus fee');
  assertClose(optionValue(bought.account), 500, 0.001, 'position value at entry');
  const quote = { AURA: { last: 50 } };
  assertClose(equity(bought.account, quote), 9999, 0.001, 'equity only loses the fee');
  assertEqual(bought.account.optionTrades[0].side, 'buy', 'option ledger records the buy');
  assertEqual(bought.account.optionTrades[0].optionType, 'call', 'ledger records the right');

  const marked = markOptions(bought.account, { AURA: { last: 60 } }, 1);
  assert(optionValue(marked) > 500, 'ITM call gains value');
  const rows = optionPositionRows(marked, 1);
  assertEqual(rows.length, 1, 'one position row');
  assert(rows[0].value > 500, 'row value marked up');
});

test('closing a long option realises P&L and releases the position', () => {
  let account = createGameState({ seed: 'option-close' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'call', strike: 50, expiryDay: 60, premium: 2.5,
    vol: 0.3, delta: 0.5, theta: -0.01,
  };
  const bought = buyOption(account, { contract, qty: 1, fee: 1, day: 0 });
  const marked = markOptions(bought.account, { AURA: { last: 58 } }, 1);
  const position = marked.options[0];
  const closed = closeOption(marked, { key: position.key, qty: 1, fee: 1, day: 2 });
  assert(closed.ok, 'close succeeds');
  assertEqual(closed.account.options.length, 0, 'position removed');
  assert(closed.account.cash > 9499, 'sale proceeds return to cash');
  assert(closed.account.optionRealized > 0, 'realised profit recorded');
  assertEqual(closed.account.optionTrades[0].side, 'close', 'ledger records the close');
});

test('expiry settles in cash and records realised P&L', () => {
  let account = createGameState({ seed: 'option-expiry' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'call', strike: 50, expiryDay: 5, premium: 2,
    vol: 0.3, delta: 0.5, theta: -0.01,
  };
  const bought = buyOption(account, { contract, qty: 1, fee: 1, day: 0 });
  const settled = settleOptions(bought.account, { AURA: { last: 60 } }, 5);
  assertEqual(settled.settlements.length, 1, 'one settlement');
  assertClose(settled.settlements[0].intrinsic, 10, 0.001, 'call intrinsic at expiry');
  assertEqual(settled.account.options.length, 0, 'contract removed');
  assertClose(settled.account.cash, 10799, 0.001, 'proceeds of $1,000 added');
  assertClose(settled.account.optionRealized, 799, 0.001, 'realised P&L after the $201 cost');
});

test('an out-of-the-money option expires worthless', () => {
  let account = createGameState({ seed: 'option-worthless' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'put', strike: 50, expiryDay: 5, premium: 1.5,
    vol: 0.3, delta: -0.4, theta: -0.01,
  };
  const bought = buyOption(account, { contract, qty: 1, fee: 1, day: 0 });
  const settled = settleOptions(bought.account, { AURA: { last: 55 } }, 5);
  assertClose(settled.settlements[0].proceeds, 0, 0.001, 'no cash settlement');
  assertClose(settled.account.optionRealized, -151, 0.001, 'full cost lost');
  assertClose(settled.account.cash, 9849, 0.001, 'cash keeps the premium paid');
});

suite('Stage 6 options curriculum');

test('Stage 6 units are implemented and practice checks accept option activity', () => {
  assertEqual(STAGE_6_UNITS.map((unit) => unit.id).join(','), 'u21,u22,u23,u24', 'four Stage 6 units');
  assert(STAGE_6_UNITS.every((unit) => unit.implemented), 'all Stage 6 units are playable');

  const state = createGameState({ seed: 'stage6-practice' });
  state.education.demoRuns = ['greeks'];
  state.account.optionTrades = [
    { side: 'buy', optionType: 'call' },
    { side: 'buy', optionType: 'put' },
  ];
  assertEqual(evaluatePractice(state, getUnit('u21')).done, true, 'any option buy completes Unit 21');
  assertEqual(evaluatePractice(state, getUnit('u22')).done, true, 'a call completes Unit 22');
  assertEqual(evaluatePractice(state, getUnit('u23')).done, true, 'a put completes Unit 23');
  assertEqual(evaluatePractice(state, getUnit('u24')).done, true, 'Greeks demo completes Unit 24');

  const onlyCall = createGameState({ seed: 'stage6-call' });
  onlyCall.account.optionTrades = [{ side: 'buy', optionType: 'call' }];
  assertEqual(evaluatePractice(onlyCall, getUnit('u23')).done, false, 'a call does not complete the put task');
});

test('options trading unlocks after the first section of Unit 21', () => {
  const state = createGameState({ seed: 'stage6-unlock' });
  assertEqual(isToolUnlocked(state, 'options.trade'), false, 'options start locked');
  state.education.units.u21.sectionsRead.s1 = true;
  assertEqual(isToolUnlocked(state, 'options.trade'), true, 'options unlock after u21 s1');
  assertEqual(isToolUnlocked(state, 'options.sell'), false, 'selling still locked');
  state.education.units.u25.sectionsRead.s1 = true;
  assertEqual(isToolUnlocked(state, 'options.sell'), true, 'selling unlocks after u25 s1');
});

suite('Stage 7 option selling and strategies');

test('selling an option collects premium and creates a short position', () => {
  const account = createGameState({ seed: 'sell-option' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'put', strike: 50, expiryDay: 60, premium: 2,
    vol: 0.3, delta: -0.4, theta: -0.01,
  };
  const sold = sellOption(account, { contract, qty: 2, fee: 1, day: 0 });
  assert(sold.ok, 'sell succeeds');
  assertClose(sold.account.cash, 10399, 0.001, 'net premium credited');
  const position = sold.account.options[0];
  assertEqual(position.qty, -2, 'position is short');
  assertClose(optionValue(sold.account), -400, 0.001, 'short liability at entry');
  const quotes = { AURA: { last: 50 } };
  assertClose(optionCollateral(sold.account, quotes), 10000, 0.001, 'put collateral is strike × 100');
  assertClose(availableOptionCash(sold.account, quotes), 399, 0.001, 'collateral reduces free cash');
});

test('a covered call needs shares and releases them from cover', () => {
  let account = createGameState({ seed: 'covered' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  account.positions = { AURA: { qty: 100, costBasis: 5000 } };
  const contract = {
    ticker: 'AURA', type: 'call', strike: 55, expiryDay: 60, premium: 1,
    vol: 0.3, delta: 0.3, theta: -0.01,
  };
  assertEqual(availableCoveredShares(account, 'AURA'), 100, '100 shares cover one call');
  const sold = sellOption(account, { contract, qty: 1, fee: 1, day: 0 });
  assert(sold.ok, 'covered call opens');
  const quotes = { AURA: { last: 50 } };
  assertClose(optionCollateral(sold.account, quotes), 0, 0.001, 'covered call needs no cash collateral');
  assertEqual(availableCoveredShares(sold.account, 'AURA'), 0, 'shares fully committed');
});

test('closing a short option buys it back and realises the premium difference', () => {
  const account = createGameState({ seed: 'short-close' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'call', strike: 50, expiryDay: 60, premium: 3,
    vol: 0.3, delta: 0.5, theta: -0.01,
  };
  const sold = sellOption(account, { contract, qty: 1, fee: 1, day: 0 });
  const marked = markOptions(sold.account, { AURA: { last: 45 } }, 1);
  const position = marked.options[0];
  const closed = closeOption(marked, { key: position.key, qty: 1, fee: 1, day: 2 });
  assert(closed.ok, 'buy-to-close succeeds');
  assertEqual(closed.account.options.length, 0, 'short position removed');
  assert(closed.account.optionRealized > 0, 'premium captured as realised profit');
  assertEqual(closed.account.optionTrades[0].side, 'buyToClose', 'ledger records buy-to-close');
});

test('an assigned short option pays intrinsic at expiry', () => {
  const account = createGameState({ seed: 'assigned' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = {
    ticker: 'AURA', type: 'put', strike: 50, expiryDay: 5, premium: 2,
    vol: 0.3, delta: -0.4, theta: -0.01,
  };
  const sold = sellOption(account, { contract, qty: 1, fee: 1, day: 0 });
  const settled = settleOptions(sold.account, { AURA: { last: 40 } }, 5);
  assertEqual(settled.settlements.length, 1, 'one assignment');
  assertClose(settled.account.cash, 9199, 0.001, 'intrinsic paid out after the premium fee');
  assertClose(settled.account.optionRealized, -801, 0.001, 'premium minus intrinsic and fee');
  assertEqual(settled.account.optionTrades[0].side, 'assigned', 'ledger records assignment');
});

test('vertical spreads have defined economics and payoff', () => {
  const state = createGameState({ seed: 'spread' });
  const company = COMPANIES[0];
  const quote = state.market.quotes[company.ticker];
  const chain = buildOptionChain(company, quote, state.market.day);
  const strategy = buildStrategy('bullCallSpread', chain, 30, 1);
  assert(strategy, 'spread builds');
  assert(strategy.netCost > 0, 'bull call spread is a debit');
  const lower = strategy.legs[0].contract;
  const upper = strategy.legs[1].contract;
  const width = upper.strike - lower.strike;
  assertClose(strategy.maxProfit, width * 100 - strategy.netCost, 0.05, 'max profit = width minus debit');
  const atMax = strategyPayoff(strategy, upper.strike + 10);
  assertClose(atMax, strategy.maxProfit, 0.02, 'payoff caps at max profit');
  const atLow = strategyPayoff(strategy, lower.strike - 10);
  assertClose(atLow, -strategy.netCost, 0.02, 'payoff floors at the debit');
  assert(strategy.maxProfit >= 0, 'capped profit positive');
});

test('multi-leg execution is atomic and rolls positions together', () => {
  const state = createGameState({ seed: 'legs' });
  const company = COMPANIES[0];
  const chain = buildOptionChain(company, state.market.quotes[company.ticker], state.market.day);
  const strategy = buildStrategy('longStraddle', chain, 30, 1);
  assert(strategy, 'straddle builds');
  const account = createGameState({ seed: 'legs-account' }).account;
  account.cash = 50000;
  account.initialCash = 50000;
  const result = executeOptionLegs(account, strategy.legs, { fee: 1, day: 0 });
  assert(result.ok, 'both legs execute');
  assertEqual(result.account.options.length, 2, 'two option positions');
  assertEqual(result.account.optionTrades.length, 2, 'two ledger entries');
});

suite('Stage 7 curriculum');

test('Stage 7 units complete with real option structures', () => {
  assertEqual(STAGE_7_UNITS.map((unit) => unit.id).join(','), 'u25,u26,u27,u28', 'four Stage 7 units');
  assert(STAGE_7_UNITS.every((unit) => unit.implemented), 'all Stage 7 units playable');

  const state = createGameState({ seed: 'stage7-practice' });
  state.account.optionTrades = [{ side: 'sell', optionType: 'call' }];
  assertEqual(evaluatePractice(state, getUnit('u25')).done, true, 'selling any option completes Unit 25');

  state.account.positions = { AURA: { qty: 100, costBasis: 5000 } };
  state.account.options = [{
    key: 'AURA:call:55:30', ticker: 'AURA', type: 'call', strike: 55, expiryDay: 30, qty: -1,
  }];
  assertEqual(evaluatePractice(state, getUnit('u26')).done, true, 'covered call completes Unit 26');

  state.account.options = [
    {
      key: 'AURA:call:50:30', ticker: 'AURA', type: 'call', strike: 50, expiryDay: 30, qty: 1,
    },
    {
      key: 'AURA:call:55:30', ticker: 'AURA', type: 'call', strike: 55, expiryDay: 30, qty: -1,
    },
  ];
  assertEqual(evaluatePractice(state, getUnit('u27')).done, true, 'vertical spread completes Unit 27');

  state.account.options = [
    {
      key: 'AURA:call:50:30', ticker: 'AURA', type: 'call', strike: 50, expiryDay: 30, qty: 1,
    },
    {
      key: 'AURA:put:50:30', ticker: 'AURA', type: 'put', strike: 50, expiryDay: 30, qty: 1,
    },
  ];
  assertEqual(evaluatePractice(state, getUnit('u28')).done, true, 'straddle completes Unit 28');
});

suite('Futures and Stage 8');

test('futures chains price carry and 15% margin', () => {
  const state = createGameState({ seed: 'futures-chain' });
  const quote = state.market.quotes.AURA;
  assertClose(futuresPrice(quote.last, 0), quote.last, 0.01, 'zero-day future equals spot');
  const chain = buildFuturesChain(quote, 5);
  assertEqual(chain.expiries.length, 3, 'three expiries');
  chain.expiries.forEach((entry) => {
    assert(entry.price > quote.last, 'contango above spot');
    assertClose(entry.margin, entry.price * FUTURES_MULTIPLIER * 0.15, 0.02, 'margin is 15% of notional');
  });
});

test('a long future marks to market and settles variation into cash', () => {
  const account = createGameState({ seed: 'futures-long' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = { ticker: 'AURA', expiryDay: 60, price: 50, margin: 750 };
  const opened = openFuture(account, { contract, side: 'long', qty: 1, fee: 1, day: 0 });
  assert(opened.ok, 'open succeeds');
  assertClose(opened.account.cash, 9999, 0.001, 'only the fee leaves cash');
  assertClose(futuresMargin(opened.account), 750, 0.001, 'margin is reserved');
  assertClose(availableFuturesCash(opened.account), 9249, 0.001, 'free futures cash');

  const marked = markFutures(opened.account, { AURA: { last: 60 } }, 1);
  assert(marked.futuresPnl > 0, 'long gains when spot rises');
  const varied = applyFuturesVariation(marked);
  assertClose(varied.account.futuresPnl, 0, 0.001, 'variation resets');
  assert(varied.account.cash > 9999, 'variation credited to cash');
  assertClose(varied.account.futures[0].settlementPrice, marked.futures[0].currentPrice, 0.001);

  const before = varied.account.futures[0];
  const closed = closeFuture(varied.account, { key: before.key, qty: 1, fee: 1, day: 2 });
  assert(closed.ok, 'close succeeds');
  assertEqual(closed.account.futures.length, 0, 'position removed');
  assert(closed.account.futuresRealized > 0, 'realised profit recorded');
});

test('a short future profits when the spot falls and settles at expiry', () => {
  const account = createGameState({ seed: 'futures-short' }).account;
  account.cash = 10000;
  account.initialCash = 10000;
  const contract = { ticker: 'AURA', expiryDay: 5, price: 50, margin: 750 };
  const opened = openFuture(account, { contract, side: 'short', qty: 1, fee: 1, day: 0 });
  const marked = markFutures(opened.account, { AURA: { last: 40 } }, 5);
  const varied = applyFuturesVariation(marked);
  const settled = settleFutures(varied.account, { AURA: { last: 40 } }, 5);
  assertEqual(settled.settlements.length, 1, 'one settlement');
  assertEqual(settled.account.futures.length, 0, 'contract removed');
  assertClose(settled.account.cash, 10999, 0.001, 'profit and fee');
  assertClose(settled.account.futuresRealized, 999, 0.001, 'short gain less fee');
});

test('futures margin limits new positions', () => {
  const account = createGameState({ seed: 'futures-margin' }).account;
  account.cash = 1000;
  const contract = { ticker: 'AURA', expiryDay: 60, price: 50, margin: 750 };
  const one = openFuture(account, { contract, side: 'long', qty: 1, fee: 1 });
  assert(one.ok, 'one contract fits');
  const two = openFuture(one.account, { contract, side: 'long', qty: 2, fee: 1 });
  assertEqual(two.ok, false, 'two more contracts exceed free margin');
  assertEqual(two.error, 'error.insufficientFuturesMargin');
});

test('Stage 8 units complete with futures, hedging and graduation activity', () => {
  assertEqual(STAGE_8_UNITS.map((unit) => unit.id).join(','), 'u29,u30,u31,u32', 'four Stage 8 units');
  assert(STAGE_8_UNITS.every((unit) => unit.implemented), 'all Stage 8 units playable');

  const state = createGameState({ seed: 'stage8-practice' });
  state.account.futuresTrades = [{ action: 'open', side: 'long' }];
  assertEqual(evaluatePractice(state, getUnit('u29')).done, true, 'opening a future completes Unit 29');

  state.account.positions = { AURA: { qty: 100, costBasis: 5000 } };
  state.account.futures = [{ key: 'AURA:30:short', side: 'short', qty: 1, ticker: 'AURA' }];
  assertEqual(evaluatePractice(state, getUnit('u30')).done, true, 'stock plus short future completes Unit 30');

  state.education.demoRuns = ['stressTest'];
  assertEqual(evaluatePractice(state, getUnit('u31')).done, true, 'stress test completes Unit 31');

  state.account.trades = [{ side: 'buy', ticker: 'AURA' }];
  state.account.optionTrades = [{ side: 'buy', optionType: 'call' }];
  assertEqual(evaluatePractice(state, getUnit('u32')).done, true, 'stock + option + future completes Unit 32');
});

test('futures unlock after the first section of Unit 29', () => {
  const state = createGameState({ seed: 'stage8-unlock' });
  assertEqual(isToolUnlocked(state, 'trade.futures'), false, 'futures start locked');
  state.education.units.u29.sectionsRead.s1 = true;
  assertEqual(isToolUnlocked(state, 'trade.futures'), true, 'futures unlock after u29 s1');
});

suite('Formatting');

test('money and percentage formatting are stable', () => {
  assertEqual(money(1234.5, 'en'), '$1,234.50');
  assertEqual(money(-1234.5, 'en'), '-$1,234.50');
  assertEqual(pct(12.5, 'en', 2), '+12.50%');
  assertEqual(pct(-3.2, 'en', 2), '-3.20%');
  assertEqual(compactNumber(1_250_000, 'en'), '1.3M');
  assertEqual(clamp(5, 0, 3), 3);
});

test('quiz xp helper is consistent with rules', () => {
  assertEqual(questionXp(100, true, true), 55);
  assertEqual(questionXp(80, true, false), 40);
  assertEqual(questionXp(50, false, false), 0);
});
