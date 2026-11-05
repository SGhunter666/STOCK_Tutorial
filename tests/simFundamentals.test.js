import { test, assert, assertEqual, assertClose } from './harness.js';
import { SIM_COMPANIES, SIM_COMPANY_BY_TICKER } from '../js/sim/companies50.js';
import {
  SIM_FIRST_REPORT_QUARTER, SIM_QUARTER_DAYS, getQuarterReport,
  latestReportForDay, reportHistoryForDay, reportDayForQuarter,
  reportQuarterForDay, splitFactorThrough, plannedSplitsForQuarter,
  quarterLabel, expectedEps, isCapitalActionDay, capitalQuarterForDay,
  plannedCapitalActionsForQuarter, adjustReportForCapitalActions,
  isStructuralActionDay, structuralQuarterForDay,
  plannedStructuralActionsForQuarter, adjustReportForStructuralActions,
  isHaltDay, haltQuarterForDay, plannedHaltsForQuarter,
  isRightsDay, rightsQuarterForDay, plannedRightsForQuarter,
  isBankruptcyDay, bankruptcyQuarterForDay, plannedBankruptciesForQuarter,
} from '../js/sim/fundamentals.js';
import {
  createExchangeEngine, advanceSecond, advanceSeconds, submitOrder, serializeExchange,
  deserializeExchange, latestReport, reportHistory, dividendPerShare, isTradingHalted, equity,
  subscribeRights, declineRights,
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

test('reverse splits convert fractional shares to cash without losing equity', () => {
  const state = createExchangeEngine({ seed: 'reverse-split-test' });
  const ticker = 'QVAL';
  const bought = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 101 });
  assert(bought.ok && bought.order.filledQty === 101, '101 shares filled');
  const qtyBefore = state.account.positions[ticker].qty;
  const cashBefore = state.account.cash;
  const priceBefore = state.quotes[ticker].last;
  const equityBefore = cashBefore + qtyBefore * priceBefore;
  for (const companyState of Object.values(state.companies)) {
    companyState.lastReportQuarter = reportQuarterForDay(315);
  }
  state.lastNewsDay = 315;
  state.lastMacroDay = 315;
  state.dayIndex = 315 - 1;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, 315, 'reverse split day');
  const event = state.corporateActions.find(
    (entry) => entry.ticker === ticker && entry.type === 'split',
  );
  assert(event && event.reverse, 'reverse split recorded');
  assertEqual(state.companies[ticker].splitFactor, 0.5, 'split factor');
  assertEqual(state.account.positions[ticker].qty, Math.floor(qtyBefore * 0.5), 'whole shares');
  assert(event.cashInLieu > 0, 'fractional share paid in cash');
  assertClose(state.account.cash, cashBefore + event.cashInLieu, 0.05, 'cash-in-lieu credited');
  assertClose(equity(state), equityBefore, 2, 'equity preserved');
  assertClose(state.quotes[ticker].last, priceBefore / 0.5, 0.05, 'price doubled');

  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.companies[ticker].splitFactor, 0.5, 'reverse split saved');
  assertEqual(restored.account.positions[ticker].qty,
    Math.floor(qtyBefore * 0.5), 'share count saved');
});

test('rights issues can be subscribed, declined or allowed to lapse', () => {
  assert(!isRightsDay(150), 'day before rights issue');
  assert(isRightsDay(151), 'rights issue day');
  assertEqual(rightsQuarterForDay(151), 2, 'rights quarter');
  const planned = plannedRightsForQuarter(2);
  assert(planned.some((offer) => offer.ticker === 'NGLB' && offer.ratio === 0.20),
    'NGLB rights issue planned');

  const state = createExchangeEngine({ seed: 'rights-test' });
  const bought = submitOrder(state, { ticker: 'NGLB', side: 'buy', type: 'market', qty: 100 });
  assert(bought.ok && bought.order.filledQty === 100, 'position opened');
  const cashBefore = state.account.cash;
  for (const companyState of Object.values(state.companies)) {
    companyState.lastReportQuarter = reportQuarterForDay(151);
  }
  state.lastNewsDay = 151;
  state.lastMacroDay = 151;
  state.dayIndex = 150;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, 151, 'rights issue opens');
  const offer = state.rightsOfferings.find((item) => item.ticker === 'NGLB');
  assert(offer && offer.status === 'open', 'rights offering open');
  assertEqual(offer.entitled, 20, 'pro-rata entitlement');
  assertClose(state.companies.NGLB.capitalFactor, 1.2, 0.0001, 'company shares increased');
  const subscribed = subscribeRights(state, offer.id);
  assert(subscribed.ok, 'subscription accepted');
  assertEqual(state.account.positions.NGLB.qty, 120, 'rights shares added');
  assertEqual(offer.status, 'subscribed', 'offering marked subscribed');
  assertClose(state.account.cash, cashBefore - subscribed.cost, 0.05, 'cash paid for rights');
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.rightsOfferings[0].status, 'subscribed', 'rights status saved');

  const declinedState = createExchangeEngine({ seed: 'rights-decline-test' });
  submitOrder(declinedState, { ticker: 'NGLB', side: 'buy', type: 'market', qty: 100 });
  const declinedCash = declinedState.account.cash;
  for (const companyState of Object.values(declinedState.companies)) {
    companyState.lastReportQuarter = reportQuarterForDay(151);
  }
  declinedState.lastNewsDay = 151;
  declinedState.lastMacroDay = 151;
  declinedState.dayIndex = 150;
  declinedState.second = 23400 - 1;
  advanceSecond(declinedState);
  const declinedOffer = declinedState.rightsOfferings.find((item) => item.ticker === 'NGLB');
  assert(declineRights(declinedState, declinedOffer.id).ok, 'decline accepted');
  assertEqual(declinedOffer.status, 'declined', 'offering declined');
  assertEqual(declinedState.account.positions.NGLB.qty, 100, 'shares unchanged');
  assertClose(declinedState.account.cash, declinedCash, 0.05, 'cash unchanged');
  assert(declinedState.account.trades.every((trade) => trade.source !== 'rights'),
    'no rights trade on decline');

  const lapsedState = createExchangeEngine({ seed: 'rights-lapse-test' });
  for (const companyState of Object.values(lapsedState.companies)) {
    companyState.lastReportQuarter = reportQuarterForDay(156);
  }
  lapsedState.lastNewsDay = 156;
  lapsedState.lastMacroDay = 156;
  lapsedState.dayIndex = 150;
  lapsedState.second = 23400 - 1;
  advanceSecond(lapsedState);
  const lapsedOffer = lapsedState.rightsOfferings.find((item) => item.ticker === 'NGLB');
  assert(lapsedOffer && lapsedOffer.status === 'open', 'offering open before deadline');
  lapsedState.dayIndex = 155;
  lapsedState.second = 23400 - 1;
  advanceSecond(lapsedState);
  assertEqual(lapsedState.dayIndex, 156, 'deadline day');
  assertEqual(lapsedOffer.status, 'lapsed', 'unused rights lapse');
});

test('bankruptcies write off positions and block trading', () => {
  assert(!isBankruptcyDay(306), 'day before bankruptcy');
  assert(isBankruptcyDay(307), 'bankruptcy day');
  assertEqual(bankruptcyQuarterForDay(307), 4, 'bankruptcy quarter');
  const planned = plannedBankruptciesForQuarter(4);
  assert(planned.some((event) => event.ticker === 'TDFU'), 'TDFU bankruptcy planned');

  const state = createExchangeEngine({ seed: 'bankruptcy-test' });
  const bought = submitOrder(state, { ticker: 'TDFU', side: 'buy', type: 'market', qty: 100 });
  assert(bought.ok && bought.order.filledQty === 100, 'position opened');
  const cashBefore = state.account.cash;
  const costBasis = roundForTest(state.account.positions.TDFU.qty
    * state.account.positions.TDFU.avgCost);
  const realizedBefore = state.account.realizedPnl;
  for (const companyState of Object.values(state.companies)) {
    companyState.lastReportQuarter = reportQuarterForDay(307);
  }
  state.lastNewsDay = 307;
  state.lastMacroDay = 307;
  state.dayIndex = 306;
  state.second = 23400 - 1;
  advanceSecond(state);
  assertEqual(state.dayIndex, 307, 'bankruptcy day');
  const event = state.corporateActions.find((item) => item.ticker === 'TDFU' && item.type === 'bankruptcy');
  assert(event, 'bankruptcy recorded');
  assert(state.companies.TDFU.delisted, 'company delisted');
  assertEqual(state.account.positions.TDFU, undefined, 'position removed');
  assertClose(state.account.cash, cashBefore, 0.05, 'no cash recovery');
  assertClose(state.account.realizedPnl, realizedBefore - costBasis, 0.05, 'loss realized');
  assertClose(state.quotes.TDFU.last, 0.01, 0.001, 'quote written down');
  assert(isTradingHalted(state, 'TDFU'), 'delisted company is not tradable');
  const blocked = submitOrder(state, { ticker: 'TDFU', side: 'buy', type: 'market', qty: 10 });
  assert(!blocked.ok, 'order rejected');
  assertEqual(blocked.error, 'order.delisted', 'delisted error');

  const restored = deserializeExchange(serializeExchange(state));
  assert(restored.companies.TDFU.delisted, 'delisting saved');
  assertEqual(restored.account.positions.TDFU, undefined, 'written-off position saved');
});

function roundForTest(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

test('buyback and offering adjustments keep statements internally consistent', () => {
  const company = SIM_COMPANY_BY_TICKER.APLA;
  const report = getQuarterReport(company, 1);
  const buyback = { quarter: 1, shareFactor: 0.98, cashDelta: -420_000 };
  const adjusted = adjustReportForCapitalActions(report, [buyback]);
  assert(adjusted.capitalAdjustment, 'adjustment recorded');
  assert(adjusted.income.sharesOutstanding < report.income.sharesOutstanding, 'shares reduced');
  assertClose(adjusted.income.eps, report.income.netIncome / adjusted.income.sharesOutstanding,
    0.001, 'EPS uses reduced shares');
  assertClose(adjusted.balance.cash, report.balance.cash + buyback.cashDelta, 0.05,
    'cash reduced by the buyback');
  assertClose(adjusted.balance.totalAssets,
    adjusted.balance.cash + adjusted.balance.receivables
    + adjusted.balance.inventory + adjusted.balance.ppe,
    0.05, 'asset components still tie');
  assertClose(adjusted.balance.totalAssets,
    adjusted.balance.totalLiabilities + adjusted.balance.equity,
    0.05, 'balance identity after buyback');
  assertClose(adjusted.cashFlow.financingCashFlow,
    report.cashFlow.financingCashFlow + buyback.cashDelta,
    0.05, 'financing cash flow includes buyback');
  assertClose(adjusted.cashFlow.netChange,
    adjusted.cashFlow.operatingCashFlow + adjusted.cashFlow.investingCashFlow
    + adjusted.cashFlow.financingCashFlow,
    0.05, 'cash-flow tie after buyback');

  const offering = { quarter: 1, shareFactor: 1.15, cashDelta: 900_000 };
  const issued = adjustReportForCapitalActions(report, [offering]);
  assert(issued.income.sharesOutstanding > report.income.sharesOutstanding, 'shares issued');
  assertClose(issued.income.eps, report.income.netIncome / issued.income.sharesOutstanding,
    0.001, 'EPS diluted by the offering');
  assertClose(issued.balance.totalAssets,
    issued.balance.totalLiabilities + issued.balance.equity,
    0.05, 'balance identity after offering');

  const laterBase = getQuarterReport(company, 2);
  const later = adjustReportForCapitalActions(laterBase, [buyback]);
  assertClose(later.cashFlow.financingCashFlow, laterBase.cashFlow.financingCashFlow,
    0.05, 'prior-quarter buyback is not repeated in current-period financing flow');
  assertClose(later.balance.cash, laterBase.balance.cash + buyback.cashDelta,
    0.05, 'balance sheet still carries the cumulative cash effect');
});

test('capital actions are scheduled inside quarters and planned deterministically', () => {
  assert(!isCapitalActionDay(82), 'day before the window');
  assert(isCapitalActionDay(83), 'first buyback / offering window');
  assert(isCapitalActionDay(146), 'second quarter window');
  assertEqual(capitalQuarterForDay(83), 1, 'first action quarter');
  assertEqual(capitalQuarterForDay(146), 2, 'second action quarter');
  const first = plannedCapitalActionsForQuarter(1);
  assert(first.some((action) => action.ticker === 'APLA' && action.type === 'buyback'),
    'APLA buyback planned');
  assert(first.some((action) => action.ticker === 'QVAL' && action.type === 'offering'),
    'QVAL offering planned');
  assert(first.some((action) => action.ticker === 'NGLB' && action.type === 'offering'),
    'NGLB offering planned');
});

test('engine executes buybacks and offerings and adjusts later reports', () => {
  const state = createExchangeEngine({ seed: 'capital-engine-test' });
  state.dayIndex = 82;
  state.second = 23400 - 1;
  state.lastNewsDay = 83;
  state.lastMacroDay = 83;
  advanceSecond(state);
  assertEqual(state.dayIndex, 83, 'capital-action day');
  const buyback = state.capitalActions.find((item) => item.ticker === 'APLA');
  const offering = state.capitalActions.find((item) => item.ticker === 'QVAL');
  assert(buyback && buyback.type === 'buyback', 'APLA buyback executed');
  assert(offering && offering.type === 'offering', 'QVAL offering executed');
  assert(buyback.cashDelta < 0, 'buyback uses company cash');
  assert(offering.cashDelta > 0, 'offering raises cash');
  assertClose(state.companies.APLA.capitalFactor, 0.98, 0.0001, 'buyback share factor');
  assertClose(state.companies.QVAL.capitalFactor, 1.15, 0.0001, 'offering share factor');

  state.dayIndex = 139;
  state.second = 23400 - 1;
  state.lastNewsDay = 140;
  state.lastMacroDay = 140;
  advanceSecond(state);
  assertEqual(state.dayIndex, 140, 'report day');
  const base = getQuarterReport(SIM_COMPANY_BY_TICKER.APLA, 1);
  const adjusted = reportHistory(state, 'APLA', 3).find((report) => report.quarter === 1);
  assert(adjusted, 'Q1 report adjusted');
  assertEqual(adjusted.capitalAdjustment.shareFactor, 0.98, 'report uses buyback factor');
  assertClose(adjusted.income.sharesOutstanding,
    base.income.sharesOutstanding * 0.98, 1, 'report share count');
  assertClose(adjusted.balance.cash,
    base.balance.cash + buyback.cashDelta, 0.05, 'report cash reduced');
  assertClose(adjusted.balance.totalAssets,
    adjusted.balance.totalLiabilities + adjusted.balance.equity,
    0.05, 'adjusted report keeps the balance identity');

  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.capitalActions.length, state.capitalActions.length, 'capital actions saved');
  assertClose(restored.companies.APLA.capitalFactor, 0.98, 0.0001, 'share factor saved');
});

test('structural actions are scheduled and adjust income, balance and cash flow', () => {
  assert(!isStructuralActionDay(170), 'day before the structural window');
  assert(isStructuralActionDay(171), 'first merger window');
  assertEqual(structuralQuarterForDay(171), 2, 'first structural quarter');
  const planned = plannedStructuralActionsForQuarter(2);
  assert(planned.some((action) => action.ticker === 'APLA' && action.type === 'merger'),
    'APLA merger planned');
  assert(planned.some((action) => action.ticker === 'EMBO' && action.type === 'merger'),
    'EMBO merger planned');

  const base = getQuarterReport(SIM_COMPANY_BY_TICKER.APLA, 3);
  const merger = {
    type: 'merger', quarter: 2, day: 171,
    cashDelta: -5_000_000, ppeDelta: 12_000_000, debtDelta: 7_000_000,
    revenueDelta: 1_500_000, cogsDelta: 780_000,
    operatingExpensesDelta: 0, interestDelta: 70_000,
    investingDelta: -12_000_000, financingDelta: 7_000_000,
  };
  const merged = adjustReportForStructuralActions(base, [merger]);
  assert(merged.structuralAdjustment, 'structural adjustment recorded');
  assertClose(merged.income.revenue, base.income.revenue + merger.revenueDelta,
    0.05, 'merger adds revenue');
  const mergedRevenue = base.income.revenue + merger.revenueDelta;
  const mergedPretax = mergedRevenue - (base.income.cogs + merger.cogsDelta)
    - base.income.operatingExpenses - (base.income.interestExpense + merger.interestDelta);
  assertClose(merged.income.netIncome,
    mergedPretax - Math.max(0, mergedPretax) * 0.21,
    0.05, 'merger income recomputed');
  assertClose(merged.balance.totalAssets,
    merged.balance.totalLiabilities + merged.balance.equity,
    0.05, 'merger balance identity');
  assertClose(merged.balance.totalAssets,
    merged.balance.cash + merged.balance.receivables
    + merged.balance.inventory + merged.balance.ppe,
    0.05, 'merger asset components');
  assertClose(merged.cashFlow.netChange,
    merged.cashFlow.operatingCashFlow + merged.cashFlow.investingCashFlow
    + merged.cashFlow.financingCashFlow,
    0.05, 'merger cash-flow tie');

  const spinoff = {
    type: 'spinoff', quarter: 3, day: 234,
    cashDelta: 0, ppeDelta: -900_000, debtDelta: 0,
    revenueDelta: -400_000, cogsDelta: -208_000,
    operatingExpensesDelta: 0, interestDelta: 0,
    investingDelta: 810_000, financingDelta: -810_000,
  };
  const spunBase = getQuarterReport(SIM_COMPANY_BY_TICKER.MSFY, 4);
  const spun = adjustReportForStructuralActions(spunBase, [spinoff]);
  assert(spun.income.revenue < spunBase.income.revenue, 'spin-off removes revenue');
  assert(spun.balance.totalAssets < spunBase.balance.totalAssets, 'spin-off removes assets');
  assertClose(spun.balance.totalAssets,
    spun.balance.totalLiabilities + spun.balance.equity,
    0.05, 'spin-off balance identity');
  assertClose(spun.cashFlow.netChange,
    spun.cashFlow.operatingCashFlow + spun.cashFlow.investingCashFlow
    + spun.cashFlow.financingCashFlow,
    0.05, 'spin-off cash-flow tie');
});

test('mergers and spin-offs execute in the engine and flow into later reports', () => {
  const state = createExchangeEngine({ seed: 'structural-engine-test' });
  state.dayIndex = 170;
  state.second = 23400 - 1;
  state.lastNewsDay = 171;
  state.lastMacroDay = 171;
  advanceSecond(state);
  assertEqual(state.dayIndex, 171, 'structural-action day');
  const merger = state.structuralActions.find((action) => action.ticker === 'APLA');
  assert(merger && merger.type === 'merger', 'APLA merger executed');
  assert(merger.purchasePrice > 0, 'purchase price recorded');
  assert(state.quotes.APLA.last > 0, 'quote remains valid');

  state.dayIndex = 265;
  state.second = 23400 - 1;
  state.lastNewsDay = 266;
  state.lastMacroDay = 266;
  advanceSecond(state);
  assertEqual(state.dayIndex, 266, 'Q3 report day');
  const base = getQuarterReport(SIM_COMPANY_BY_TICKER.APLA, 3);
  const report = reportHistory(state, 'APLA', 4).find((item) => item.quarter === 3);
  assert(report, 'Q3 report released');
  assertClose(report.income.revenue, base.income.revenue + merger.revenueDelta,
    0.05, 'merger revenue is included in the next quarter');
  assertClose(report.balance.totalAssets,
    report.balance.totalLiabilities + report.balance.equity,
    0.05, 'engine report keeps the balance identity');
  assertClose(report.balance.debt, base.balance.debt + merger.debtDelta,
    0.05, 'merger debt is on the balance sheet');

  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.structuralActions.length, state.structuralActions.length, 'mergers saved');
});

test('spin-offs pay a special distribution to existing shareholders', () => {
  const state = createExchangeEngine({ seed: 'spinoff-engine-test' });
  const bought = submitOrder(state, { ticker: 'MSFY', side: 'buy', type: 'market', qty: 100 });
  assert(bought.ok && bought.order.filledQty === 100, 'position opened');
  const cashBefore = state.account.cash;
  state.dayIndex = 233;
  state.second = 23400 - 1;
  state.lastNewsDay = 234;
  state.lastMacroDay = 234;
  advanceSecond(state);
  assertEqual(state.dayIndex, 234, 'spin-off day');
  const event = state.structuralActions.find((action) => action.ticker === 'MSFY');
  assert(event && event.type === 'spinoff', 'MSFY spin-off executed');
  assert(event.distributionPerShare > 0, 'distribution per share positive');
  assertClose(state.account.cash, cashBefore + event.distributionAmount, 0.05,
    'special distribution credited');
  const ledger = state.account.dividends.find(
    (item) => item.ticker === 'MSFY' && item.type === 'special',
  );
  assert(ledger, 'special distribution recorded');
  assertClose(ledger.amount, event.distributionAmount, 0.05, 'ledger amount matches');
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.structuralActions.length, state.structuralActions.length, 'spin-offs saved');
});

test('trading halts cancel orders, freeze trading and resume automatically', () => {
  assert(!isHaltDay(72), 'day before halt');
  assert(isHaltDay(73), 'halt start');
  assertEqual(haltQuarterForDay(73), 1, 'halt quarter');
  const planned = plannedHaltsForQuarter(1);
  assert(planned.some((halt) => halt.ticker === 'NGLB' && halt.duration === 3),
    'NGLB halt planned');

  const state = createExchangeEngine({ seed: 'halt-test' });
  const ticker = 'NGLB';
  const resting = submitOrder(state, {
    ticker, side: 'buy', type: 'limit', qty: 20,
    limitPrice: state.quotes[ticker].bid - 0.02,
  });
  assert(resting.ok && resting.order.status === 'open', 'limit order rests before halt');
  const volumeBefore = state.companies[ticker].volume;
  state.dayIndex = 72;
  state.second = 23400 - 1;
  state.lastNewsDay = 72;
  state.lastMacroDay = 72;
  advanceSecond(state);
  assertEqual(state.dayIndex, 73, 'halt starts');
  assertEqual(state.companies[ticker].haltedUntilDay, 75, 'three-session halt');
  assert(isTradingHalted(state, ticker), 'ticker halted');
  assertEqual(resting.order.status, 'cancelled', 'resting order cancelled');
  assertEqual(resting.order.reason, 'halt', 'halt reason recorded');
  const blocked = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 10 });
  assert(!blocked.ok, 'new orders rejected');
  assertEqual(blocked.error, 'order.halted', 'halt error');

  const priceDuringHalt = state.quotes[ticker].last;
  const bookDuringHalt = { bid: state.quotes[ticker].bid, ask: state.quotes[ticker].ask };
  advanceSeconds(state, 780);
  assertEqual(state.dayIndex, 73, 'still halted during the first session');
  assertEqual(state.quotes[ticker].last, priceDuringHalt, 'price frozen during halt');
  assertEqual(state.quotes[ticker].bid, bookDuringHalt.bid, 'bid frozen during halt');
  assertEqual(state.quotes[ticker].ask, bookDuringHalt.ask, 'ask frozen during halt');
  assertEqual(state.companies[ticker].volume, volumeBefore, 'no trades during halt');

  state.dayIndex = 75;
  state.second = 0;
  state.lastNewsDay = 75;
  state.lastMacroDay = 75;
  const priceOnFinalHaltDay = state.quotes[ticker].last;
  advanceSeconds(state, 60);
  assert(isTradingHalted(state, ticker), 'still halted on the final halt day');
  assertEqual(state.quotes[ticker].last, priceOnFinalHaltDay, 'price stays frozen');

  state.second = 23400 - 1;
  state.lastNewsDay = 76;
  state.lastMacroDay = 76;
  advanceSecond(state);
  assertEqual(state.dayIndex, 76, 'trading resumes');
  assert(!isTradingHalted(state, ticker), 'halt cleared');
  const resumed = submitOrder(state, { ticker, side: 'buy', type: 'market', qty: 10 });
  assert(resumed.ok && resumed.order.filledQty > 0, 'order accepted after halt');

  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.companies[ticker].haltedUntilDay, 75, 'halt restored');
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
