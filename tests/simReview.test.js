import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  createExchangeEngine, submitOrder, equity,
} from '../js/sim/exchangeEngine.js';
import { reviewSummary, reviewAttribution } from '../js/sim/review.js';

function setMarket(state, ticker, price) {
  const cs = state.companies[ticker];
  cs.last = price;
  cs.fairValue = price;
  cs.open = price;
  cs.high = price;
  cs.low = price;
  cs.ema = price;
  cs.book.setMarketMaker({ bid: price - 0.4, ask: price + 0.4, size: 100_000 });
  state.quotes[ticker] = {
    ...state.quotes[ticker],
    last: price,
    bid: price - 0.4,
    ask: price + 0.4,
    fairValue: price,
  };
}

test('closed stock trades record realized P&L and feed the review', () => {
  const state = createExchangeEngine({ seed: 'review-win', cash: 100_000 });
  setMarket(state, 'NCRT', 50);
  const bought = submitOrder(state, {
    ticker: 'NCRT', side: 'buy', type: 'market', qty: 100,
  });
  assertEqual(bought.order.fills[0].qty, 100, 'filled');
  assertEqual(state.account.trades[0].realized, 0, 'opening fill has no realized result');
  setMarket(state, 'NCRT', 60);
  submitOrder(state, {
    ticker: 'NCRT', side: 'sell', type: 'market', qty: 100,
  });
  const sale = state.account.trades[state.account.trades.length - 1];
  assert(sale.realized > 0, `closing fill records a profit (${sale.realized})`);

  const summary = reviewSummary(state, equity(state));
  assertEqual(summary.closedCount, 1, 'one closed trade');
  assertEqual(summary.winRate, 1, 'winner');
  assertEqual(summary.profitFactor, null, 'profit factor needs a loss');
  assertClose(summary.realized, state.account.realizedPnl, 0.01, 'realized total');
  const row = summary.rows.find((item) => item.ticker === 'NCRT');
  assert(row, 'attribution row');
  assertClose(row.realized, sale.realized, 0.01, 'attribution realizes the sale');
  assertEqual(reviewAttribution(state)[0].ticker, 'NCRT', 'largest contributor first');
});

test('the review separates wins, losses and open positions', () => {
  const state = createExchangeEngine({ seed: 'review-mixed', cash: 100_000 });
  setMarket(state, 'NCRT', 50);
  submitOrder(state, { ticker: 'NCRT', side: 'buy', type: 'market', qty: 100 });
  setMarket(state, 'NCRT', 60);
  submitOrder(state, { ticker: 'NCRT', side: 'sell', type: 'market', qty: 100 });

  setMarket(state, 'APLA', 100);
  submitOrder(state, { ticker: 'APLA', side: 'buy', type: 'market', qty: 100 });
  setMarket(state, 'APLA', 80);
  submitOrder(state, { ticker: 'APLA', side: 'sell', type: 'market', qty: 100 });

  setMarket(state, 'QVAL', 30);
  submitOrder(state, { ticker: 'QVAL', side: 'buy', type: 'market', qty: 50 });
  setMarket(state, 'QVAL', 34);

  const summary = reviewSummary(state, equity(state));
  assertEqual(summary.closedCount, 2, 'two closed trades');
  assertEqual(summary.winRate, 0.5, 'one win and one loss');
  assert(summary.profitFactor > 0, 'profit factor is positive');
  const open = summary.rows.find((item) => item.ticker === 'QVAL');
  assert(open, 'open position appears');
  assert(open.unrealized > 0, 'open position marked to market');
  assertEqual(open.realized, 0, 'open position has no realized result');
});

test('session statistics roll up costs, income and drawdown', () => {
  const state = createExchangeEngine({ seed: 'review-costs', cash: 100_000 });
  state.account.fees = 12.5;
  state.account.dividends = [{ amount: 20 }, { amount: 5 }];
  state.account.coupons = [{ amount: 30 }];
  state.account.margin.accruedInterest = 10;
  state.account.margin.accruedBorrowFees = 2.5;
  state.timeline.snapshots = [
    { day: 0, equity: 100_000 },
    { day: 1, equity: 120_000 },
    { day: 2, equity: 90_000 },
  ];
  const summary = reviewSummary(state, 100_000);
  assertEqual(summary.fees, 12.5, 'fees');
  assertEqual(summary.dividends, 25, 'dividends');
  assertEqual(summary.coupons, 30, 'coupons');
  assertEqual(summary.financing, 12.5, 'interest and borrow fees');
  assertClose(summary.maxDrawdown, 0.25, 1e-9, 'peak-to-trough drawdown');
  assertClose(summary.returnPct, 0, 1e-9, 'flat return');
});
