import { test, assert, assertEqual, assertClose } from './harness.js';
import { SIM_COMPANIES, SIM_COMPANY_BY_TICKER } from '../js/sim/companies50.js';
import {
  SIM_FIRST_REPORT_QUARTER, SIM_QUARTER_DAYS, getQuarterReport,
  latestReportForDay, reportHistoryForDay, reportDayForQuarter,
  reportQuarterForDay, splitFactorThrough, plannedSplitsForQuarter,
  quarterLabel, expectedEps,
} from '../js/sim/fundamentals.js';
import {
  createExchangeEngine, advanceSecond, submitOrder, serializeExchange,
  deserializeExchange, latestReport, reportHistory, dividendPerShare,
} from '../js/sim/exchangeEngine.js';

test('quarter reports are deterministic and never visible before release', () => {
  const company = SIM_COMPANY_BY_TICKER.APLA;
  const report = getQuarterReport(company, -2);
  assert(report, 'report generated');
  assertEqual(report.periodLabel, quarterLabel(-2), 'label');
  assertEqual(report.reportDay, reportDayForQuarter(-2), 'release day');
  assertEqual(reportQuarterForDay(0), -2, 'latest released at start');
  const atStart = latestReportForDay(company, 0);
  assertEqual(atStart.quarter, -2, 'start report');
  const beforeRelease = latestReportForDay(company, 13);
  assertEqual(beforeRelease.quarter, -2, 'future report hidden');
  const onRelease = latestReportForDay(company, 14);
  assertEqual(onRelease.quarter, -1, 'release day visible');
  assertEqual(onRelease.reportDate, '2026-01-23', 'release date');
  const again = getQuarterReport(company, -2);
  assertEqual(again.income.revenue, report.income.revenue, 'deterministic');
});

test('every quarter keeps the balance sheet identity and cash-flow tie', () => {
  for (const company of SIM_COMPANIES) {
    for (let quarter = -2; quarter <= 2; quarter += 1) {
      const report = getQuarterReport(company, quarter);
      assert(report, `${company.ticker} Q${quarter} report`);
      const { balance, income, cashFlow } = report;
      assertClose(balance.totalAssets, balance.cash + balance.receivables
        + balance.inventory + balance.ppe, 0.05, `${company.ticker} assets components`);
      assertClose(balance.totalAssets, balance.totalLiabilities + balance.equity, 0.05,
        `${company.ticker} balance identity`);
      assertClose(balance.totalLiabilities, balance.debt + balance.otherLiabilities, 0.05,
        `${company.ticker} liability components`);
      assertClose(income.grossProfit, income.revenue - income.cogs, 0.05,
        `${company.ticker} gross profit`);
      assertClose(income.netIncome, income.pretaxIncome - income.taxExpense, 0.05,
        `${company.ticker} net income`);
      assertClose(income.eps, income.netIncome / income.sharesOutstanding, 0.001,
        `${company.ticker} EPS`);
      assertClose(cashFlow.netChange,
        cashFlow.operatingCashFlow + cashFlow.investingCashFlow + cashFlow.financingCashFlow,
        0.05, `${company.ticker} cash flow tie`);
    }
  }
});

test('reports after a split adjust per-share values but not totals', () => {
  const company = SIM_COMPANY_BY_TICKER.NCRT;
  const plan = plannedSplitsForQuarter(2).find((split) => split.ticker === 'NCRT');
  assertEqual(plan.ratio, 2, 'planned split');
  assertEqual(splitFactorThrough('NCRT', 125), 1, 'before split');
  assertEqual(splitFactorThrough('NCRT', 126), 2, 'on split day');
  const after = getQuarterReport(company, 1);
  assertEqual(after.splitFactor, 2, 'report factor');
  assertClose(after.income.sharesOutstanding, company.shares * 2, 1, 'shares doubled');
  assertClose(after.income.eps, after.income.netIncome / after.income.sharesOutstanding, 0.001,
    'EPS uses adjusted shares');
  assertClose(after.ratios.quarterlyDividendPerShare,
    after.ratios.annualDividendPerShare / 4, 0.0001, 'DPS consistency');
  const prior = getQuarterReport(company, 0);
  assertClose(expectedEps(company, 1), prior.income.eps / 2, 0.001,
    'expected EPS adjusted to post-split basis');
});

test('dividends pay holders and reduce the quoted price on the ex-date', () => {
  const state = createExchangeEngine({ seed: 'dividend-test' });
  const ticker = 'APLA';
  const bought = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 100 });
  assert(bought.ok && bought.order.filledQty === 100, 'position opened');
  const cashBefore = state.account.cash;
  const priceBefore = state.quotes[ticker].last;
  const dps = dividendPerShare(state, ticker) / 4;
  state.lastNewsDay = SIM_QUARTER_DAYS;
  state.dayIndex = SIM_QUARTER_DAYS - 1;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, SIM_QUARTER_DAYS, 'next quarter');
  assertEqual(state.account.dividends.length, 1, 'dividend recorded');
  const dividend = state.account.dividends[0];
  assertEqual(dividend.ticker, ticker, 'ticker');
  assertClose(dividend.amount, 100 * dps, 0.02, 'amount');
  assertClose(state.account.cash, cashBefore + dividend.amount, 0.02, 'cash credited');
  assert(state.quotes[ticker].last < priceBefore, 'ex-date price reduction');
});

test('splits adjust positions, cancel orders and preserve equity', () => {
  const state = createExchangeEngine({ seed: 'split-test' });
  const ticker = 'NCRT';
  const bought = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 100 });
  assert(bought.ok, 'position opened');
  const resting = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 10,
    limitPrice: state.quotes[ticker].bid - 0.02,
  });
  assert(resting.ok && resting.order.status === 'open', 'limit rests');
  const before = state.account.positions[ticker].qty;
  const costBefore = state.account.positions[ticker].avgCost;
  const equityBefore = state.account.cash + before * state.quotes[ticker].last;
  for (const companyState of Object.values(state.companies)) {
    companyState.lastReportQuarter = 0;
  }
  state.lastNewsDay = 126;
  state.dayIndex = 126 - 1;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, 126, 'split day');
  assertEqual(state.companies[ticker].splitFactor, 2, 'split factor');
  assertEqual(state.account.positions[ticker].qty, before * 2, 'double shares');
  assertClose(state.account.positions[ticker].avgCost, costBefore / 2, 0.0001, 'halve cost');
  assertEqual(resting.order.status, 'cancelled', 'order cancelled');
  assertEqual(resting.order.reason, 'corporateAction', 'corporate action reason');
  assertClose(state.quotes[ticker].last, state.companies[ticker].last, 0.05, 'quote follows split price');
  assertClose(state.account.cash + state.account.positions[ticker].qty
    * state.quotes[ticker].last, equityBefore, 2, 'equity preserved');
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.companies[ticker].splitFactor, 2, 'split factor restored');
  assertEqual(restored.account.positions[ticker].qty, before * 2, 'position restored');
});

test('earnings releases update the quote and expose the latest report', () => {
  const state = createExchangeEngine({ seed: 'earnings-test' });
  const ticker = 'APLA';
  const lastBefore = state.quotes[ticker].last;
  state.dayIndex = 14 - 1;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, 14, 'release day');
  assert(state.reports.length >= 1, 'release recorded');
  const event = state.reports.find((entry) => entry.ticker === ticker);
  assert(event, 'company event');
  assertEqual(event.quarter, -1, 'quarter');
  assert(Number.isFinite(event.eps), 'EPS');
  assert(Number.isFinite(event.impact), 'impact');
  const report = latestReport(state, ticker);
  assertEqual(report.quarter, -1, 'latest report');
  assertEqual(reportHistory(state, ticker, 3).length, 3, 'history');
  assert(state.quotes[ticker].last !== lastBefore || event.impact === 0, 'quote changed when impact is non-zero');
  assertEqual(deserializeExchange(serializeExchange(state)).reports.length, state.reports.length, 'reports saved');
});
