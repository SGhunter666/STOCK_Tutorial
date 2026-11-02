/**
 * Fund management tests: unlocking, setup, trading limits, fees, high-water
 * mark, clients, payroll and closure conditions.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import { createAccount } from '../js/trading/account.js';
import { COMPANIES } from '../js/data/companies.js';
import {
  createFundState, normalizeFund, fundUnlocked, setupFund, fundMetrics,
  fundBuy, fundSell, hireEmployee, fireEmployee, acceptClient, settleRedemption,
  withdrawCompanyCash, advanceFundDay, fundLeaderboard,
  FUND_FEE_INTERVAL, FUND_AUM_OPTIONS, FUND_COMPANY_SEED, FUND_RANK_REQUIREMENT,
  FUND_MAX_DRAWDOWN, FUND_MAX_UNPAID_DAYS, FUND_KEY_PERSON_DAYS, FUND_MAX_LEVERAGE_DAYS,
  FUND_COMPLIANCE_DAYS,
} from '../js/fund/fundEngine.js';
import {
  normalizeFundPlanConfig, buildFundPlan, executeFundPlan, fundAttribution,
} from '../js/fund/fundStrategy.js';

const STOCK = COMPANIES.find((company) => !company.isEtf).ticker;

function makeState(rank = FUND_RANK_REQUIREMENT) {
  const state = createGameState({ locale: 'en', seed: 'fund-test', initialCash: 10000 });
  state.career = { rank, promotedAtDay: 0, salaryPaidDay: 0, history: [{ rank, day: 0 }] };
  return state;
}

function launch(state, overrides = {}) {
  const result = setupFund(state, {
    name: 'Atlas Capital',
    strategy: 'longOnly',
    riskProfile: 'balanced',
    initialAum: FUND_AUM_OPTIONS[1],
    managementRate: 0.02,
    performanceRate: 0.2,
    ...overrides,
  }, state.market.day || 0);
  assert(result.ok, `setup should succeed: ${result.error}`);
  return result.fund;
}

function quietFund(cash, units) {
  const account = { ...createAccount(units), cash };
  return {
    ...createFundState(),
    status: 'active',
    name: 'Quiet Fund',
    initialAum: units,
    createdDay: 0,
    account,
    units,
    highWaterMark: 1,
    peakNav: 1,
    benchmarkStart: 0,
    managementRate: 0.02,
    performanceRate: 0.2,
    maxPosition: 0.25,
    minCash: 0.1,
    companyCash: FUND_COMPANY_SEED,
    clients: [],
    candidates: [],
    employees: [],
    insights: [],
    history: [{ day: 0, nav: cash, navPerUnit: cash / units, cashRatio: 1, drawdownPct: 0, aum: cash }],
    events: [],
    seed: 'fund-test',
  };
}

suite('Fund: unlock and setup');

test('fund management is locked below rank 5', () => {
  const state = makeState(4);
  assert(!fundUnlocked(state), 'rank 4 must not unlock the fund');
  const result = setupFund(state, { name: 'Too Early' }, 0);
  assertEqual(result.ok, false);
  assertEqual(result.error, 'fund.errorLocked');
});

test('fund setup rejects short names and duplicate funds', () => {
  const state = makeState();
  assertEqual(setupFund(state, { name: 'A' }, 0).error, 'fund.errorName');
  const fund = launch(state);
  assertEqual(setupFund({ ...state, fund }, { name: 'Second Fund' }, 0).error, 'fund.errorAlreadyActive');
});

test('fund setup splits the AUM across clients at NAV 1', () => {
  const state = makeState();
  const fund = launch(state);
  assertEqual(fund.status, 'active');
  assertEqual(fund.clients.length, 4);
  assertEqual(fund.units, FUND_AUM_OPTIONS[1], 'units equal the starting AUM');
  assertEqual(fund.highWaterMark, 1);
  assertEqual(fund.companyCash, FUND_COMPANY_SEED);
  const metrics = fundMetrics(fund, state);
  assertClose(metrics.navPerUnit, 1, 1e-6, 'nav per unit starts at 1');
  assertClose(metrics.nav, FUND_AUM_OPTIONS[1], 0.01, 'starting NAV equals AUM');
  const clientUnits = fund.clients.reduce((sum, client) => sum + client.units, 0);
  assertClose(clientUnits, fund.units, 0.01, 'client units sum to fund units');
});

test('normalizeFund rebuilds a safe inactive state from garbage', () => {
  const normalized = normalizeFund({ status: 'broken', account: null }, 0, 'seed');
  assertEqual(normalized.status, 'none');
  assertEqual(normalized.units, 0);
  assertEqual(normalized.clients.length, 0);
});

suite('Fund: trading limits');

test('fund buys respect the single-position cap', () => {
  const state = makeState();
  const fund = launch(state);
  const ticker = STOCK;
  const quote = state.market.quotes[ticker];
  assert(quote && quote.ask > 0, 'test quote exists');
  const nav = fundMetrics(fund, state).nav;
  const oversized = Math.floor((nav * 0.26) / quote.ask) + 1;
  const rejected = fundBuy(fund, state.market.quotes, { ticker, qty: oversized, day: 0 });
  assertEqual(rejected.ok, false);
  assertEqual(rejected.error, 'fund.errorPositionCap');

  const allowed = Math.floor((nav * 0.2) / quote.ask);
  const accepted = fundBuy(fund, state.market.quotes, { ticker, qty: allowed, day: 0 });
  assert(accepted.ok, `within cap should fill: ${accepted.error}`);
  assert(accepted.fund.account.positions[ticker].qty > 0, 'position recorded');
  assert(accepted.fund.account.cash < fund.account.cash, 'cash left the fund');
});

test('fund buys respect the minimum cash floor', () => {
  const state = makeState();
  const fund = launch(state);
  const forced = { ...fund, minCash: 0.95, maxPosition: 1 };
  const quote = state.market.quotes[STOCK];
  const nav = fundMetrics(fund, state).nav;
  const qty = Math.floor((nav * 0.1) / quote.ask);
  const result = fundBuy(forced, state.market.quotes, { ticker: STOCK, qty, day: 0 });
  assertEqual(result.ok, false);
  assertEqual(result.error, 'fund.errorCashFloor');
  assert(quote.ask > 0);
});

test('fund sells release cash back into the fund account', () => {
  const state = makeState();
  const fund = launch(state);
  const bought = fundBuy(fund, state.market.quotes, { ticker: STOCK, qty: 100, day: 0 });
  assert(bought.ok, `buy should fill: ${bought.error}`);
  const before = bought.fund.account.cash;
  const sold = fundSell(bought.fund, state.market.quotes, { ticker: STOCK, qty: 100, day: 0 });
  assert(sold.ok, `sell should fill: ${sold.error}`);
  assert(sold.fund.account.cash > before, 'cash returned after selling');
  assertEqual((sold.fund.account.positions[STOCK] || { qty: 0 }).qty, 0);
});

suite('Fund: fees and high-water mark');

test('management fee accrues every 21 trading days', () => {
  const fund = quietFund(1000000, 1000000);
  const result = advanceFundDay(fund, { day: FUND_FEE_INTERVAL, quotes: {}, seed: 'fund-test' });
  assertClose(result.fund.managementFees, 1000000 * 0.02 / 12, 0.02, '2% annual fee accrued for one month');
  assert(result.fund.companyCash > FUND_COMPANY_SEED, 'fee paid into the management company');
  assert(result.events.some((event) => event.type === 'managementFee'), 'fee event logged');
});

test('performance fee applies only above the high-water mark', () => {
  const fund = quietFund(1200000, 1000000);
  const first = advanceFundDay(fund, { day: FUND_FEE_INTERVAL, quotes: {}, seed: 'fund-test' });
  assert(first.fund.performanceFees > 0, 'profit above HWM pays a performance fee');
  const expectedNav = 1200000 - 1200000 * 0.02 / 12;
  assertClose(first.fund.performanceFees, (expectedNav - 1000000) * 0.2, 1, 'fee is 20% of excess over HWM');
  assert(first.fund.highWaterMark > 1.15, 'HWM rises after the fee is taken');

  const second = advanceFundDay(first.fund, { day: FUND_FEE_INTERVAL * 2, quotes: {}, seed: 'fund-test' });
  assertEqual(second.fund.performanceFees, first.fund.performanceFees, 'flat NAV pays no second performance fee');
});

suite('Fund: clients, staff and cash');

test('accepting a client adds units and cash without moving NAV per unit', () => {
  const state = makeState();
  const fund = launch(state);
  const metrics = { ...fundMetrics(fund, state), day: 0 };
  const candidate = fund.candidates[0];
  assert(candidate, 'prospect exists after setup');
  const result = acceptClient(fund, candidate.id, metrics);
  assert(result.ok, `subscription should succeed: ${result.error}`);
  assertClose(result.fund.units, fund.units + candidate.principal, 0.02, 'units added at NAV 1');
  assertClose(result.fund.account.cash, fund.account.cash + candidate.principal, 0.02, 'cash added');
  const after = fundMetrics(result.fund, state);
  assertClose(after.navPerUnit, 1, 1e-6, 'NAV per unit unchanged');
  assertEqual(result.fund.candidates.length, fund.candidates.length - 1);
});

test('settling a redemption pays the client and burns units', () => {
  const state = makeState();
  const fund = launch(state);
  const metrics = { ...fundMetrics(fund, state), day: 5 };
  const client = { ...fund.clients[0] };
  const unitsToRedeem = Math.floor(client.units * 0.25);
  const withRequest = {
    ...fund,
    clients: fund.clients.map((entry, index) => (index === 0
      ? { ...entry, request: { units: unitsToRedeem, requestedDay: 0, dueDay: 5, reason: 'liquidity' } }
      : entry)),
  };
  const result = settleRedemption(withRequest, client.id, metrics);
  assert(result.ok, `redemption should settle: ${result.error}`);
  assertClose(result.fund.units, fund.units - unitsToRedeem, 0.02, 'units burned');
  assert(result.fund.account.cash < fund.account.cash, 'cash paid out');
  assertEqual(result.fund.clients[0].request, null);
});

test('hiring and firing staff updates the team and payroll availability', () => {
  const fund = { ...quietFund(1000000, 1000000), companyCash: FUND_COMPANY_SEED };
  const hired = hireEmployee(fund, 'research');
  assert(hired.ok, `hire should succeed: ${hired.error}`);
  assertEqual(hired.fund.employees.length, 1);
  assertEqual(hired.fund.employees[0].role, 'research');
  assertEqual(hireEmployee(hired.fund, 'research').error, 'fund.errorRoleFilled');
  const fired = fireEmployee(hired.fund, 'research');
  assert(fired.ok);
  assertEqual(fired.fund.employees.length, 0);
});

test('company cash can be withdrawn into the personal account', () => {
  const fund = quietFund(1000000, 1000000);
  const result = withdrawCompanyCash(fund, { cash: 5000 });
  assert(result.ok, `withdraw should succeed: ${result.error}`);
  assertClose(result.amount, FUND_COMPANY_SEED, 0.01, 'whole company balance withdrawn');
  assertEqual(result.fund.companyCash, 0);
  assertClose(result.account.cash, 5000 + FUND_COMPANY_SEED, 0.01, 'personal cash credited');
  assertEqual(withdrawCompanyCash(result.fund, { cash: 0 }).error, 'fund.errorNoCompanyCash');
});

suite('Fund: closure and leaderboard');

test('drawdown beyond the limit closes the fund', () => {
  const fund = { ...quietFund(500000, 1000000), peakNav: 2 };
  const result = advanceFundDay(fund, { day: 1, quotes: {}, seed: 'fund-test' });
  assertEqual(result.fund.status, 'closed');
  assertEqual(result.fund.closeReason, 'drawdown');
  assert(result.fund.clients.length >= 0);
  assert(result.events.some((event) => event.type === 'closed'));
  assert(FUND_MAX_DRAWDOWN === 40);
});

test('long unpaid payroll closes the fund', () => {
  let fund = {
    ...quietFund(1000000, 1000000),
    employees: [{ id: 'research', role: 'research', name: 'Maya Chen', salary: 1000, skill: 78, hiredDay: 0 }],
    companyCash: 0,
    managementRate: 0,
  };
  for (let day = FUND_FEE_INTERVAL; day < FUND_FEE_INTERVAL + FUND_MAX_UNPAID_DAYS; day += 1) {
    fund = advanceFundDay(fund, { day, quotes: {}, seed: 'fund-test' }).fund;
  }
  assertEqual(fund.status, 'closed');
  assertEqual(fund.closeReason, 'payroll');
});

test('benchmark selection follows the index, MKT ETF or cash', () => {
  const state = makeState();
  const fund = launch(state, { benchmarkId: 'mkt' });
  assertEqual(fund.benchmarkId, 'mkt', 'MKT benchmark stored');
  assertClose(fund.benchmarkStart, state.market.quotes.MKT.last, 1e-9, 'benchmark starts at the ETF price');
  const before = fundMetrics(fund, state).benchmark;
  state.market.index.value *= 1.2;
  assertClose(fundMetrics(fund, state).benchmark, before, 0.01, 'index moves do not affect an MKT benchmark');
  state.market.quotes.MKT.last *= 1.05;
  assertClose(fundMetrics(fund, state).benchmark, 5, 0.3, 'benchmark follows the ETF');

  const cashFund = launch(makeState(), { benchmarkId: 'cash' });
  assertEqual(cashFund.benchmarkId, 'cash', 'cash benchmark stored');
  assertClose(fundMetrics(cashFund, makeState()).benchmark, 0, 1e-9, 'cash benchmark is always zero');
});

test('hurdle rate gates the performance fee', () => {
  const noHurdle = quietFund(1003000, 1000000);
  const withHurdle = { ...quietFund(1003000, 1000000), hurdleRate: 0.04 };
  const first = advanceFundDay(noHurdle, { day: FUND_FEE_INTERVAL, quotes: {}, seed: 'fund-test' });
  const second = advanceFundDay(withHurdle, { day: FUND_FEE_INTERVAL, quotes: {}, seed: 'fund-test' });
  assert(first.fund.performanceFees > 0, 'no hurdle pays a fee on the excess');
  assertEqual(second.fund.performanceFees, 0, 'the hurdle blocks a fee within the threshold');
});

test('operating costs accrue monthly and can stay payable', () => {
  const fund = {
    ...quietFund(1000000, 1000000),
    companyCash: 0,
    managementRate: 0,
    employees: [{ id: 'research', role: 'research', name: 'Maya Chen', salary: 1000, skill: 78, hiredDay: 0 }],
  };
  const result = advanceFundDay(fund, { day: FUND_FEE_INTERVAL, quotes: {}, seed: 'fund-test' });
  assert(result.fund.operatingCosts >= 1200, 'base operating cost accrued');
  assert(result.fund.operatingDue > 0, 'unpaid cost remains payable');
  assert(result.events.some((event) => event.type === 'operatingCost'), 'operating event logged');
});

test('client expected returns match their risk profile and flow into subscriptions', () => {
  const state = makeState();
  const fund = launch(state);
  const expected = { low: 6, medium: 10, high: 15 };
  for (const client of fund.clients) {
    assertEqual(client.expectedReturn, expected[client.risk], `${client.risk} client expects the profile return`);
  }
  const candidate = fund.candidates[0];
  const metrics = { ...fundMetrics(fund, state), day: 0 };
  const accepted = acceptClient(fund, candidate.id, metrics);
  assert(accepted.ok, `subscription should succeed: ${accepted.error}`);
  const joined = accepted.fund.clients.find((client) => client.id === accepted.client.id);
  assertEqual(joined.expectedReturn, expected[candidate.risk], 'new client inherits the expected return');
});

test('a key person leaving closes the fund', () => {
  const fund = {
    ...quietFund(1000000, 1000000),
    employees: [{ id: 'risk', role: 'risk', name: 'Priya Nair', salary: 1000, skill: 86, hiredDay: 0 }],
    companyCash: 0,
    managementRate: 0,
  };
  let next = fund;
  for (let day = FUND_FEE_INTERVAL; day < FUND_FEE_INTERVAL + FUND_KEY_PERSON_DAYS; day += 1) {
    next = advanceFundDay(next, { day, quotes: {}, seed: 'fund-test' }).fund;
  }
  assertEqual(next.status, 'closed');
  assertEqual(next.closeReason, 'keyPerson');
  assert(next.keyPersonLeft, 'key person recorded');
});

test('compliance officer prevents the early compliance closure', () => {
  const base = {
    ...quietFund(1000000, 1000000),
    minCash: 1.2,
  };
  let unprotected = base;
  for (let day = 1; day <= FUND_COMPLIANCE_DAYS; day += 1) {
    unprotected = advanceFundDay(unprotected, { day, quotes: {}, seed: 'fund-test' }).fund;
  }
  assertEqual(unprotected.closeReason, 'compliance', 'no compliance officer closes on the 10th risk day');

  let protectedFund = {
    ...base,
    employees: [{ id: 'compliance', role: 'compliance', name: 'Elena Rossi', salary: 750, skill: 88, hiredDay: 0 }],
    companyCash: 100000,
  };
  for (let day = 1; day <= FUND_COMPLIANCE_DAYS; day += 1) {
    protectedFund = advanceFundDay(protectedFund, { day, quotes: {}, seed: 'fund-test' }).fund;
  }
  assertEqual(protectedFund.status, 'active', 'compliance officer keeps the fund alive through day 10');
});

test('leverage can be enabled and failure closes after repeated breaches', () => {
  const state = makeState();
  const fund = launch(state, { leverageEnabled: true, riskProfile: 'balanced' });
  assert(fund.leverageEnabled, 'leverage enabled');
  assertClose(fund.leverageLimit, 1.25, 1e-9, 'balanced leverage cap');
  const nav = fundMetrics(fund, state).nav;
  let levered = fund;
  const tickers = Object.entries(state.market.quotes)
    .filter(([, quote]) => quote.last > 0)
    .slice(0, 5)
    .map(([ticker]) => ticker);
  for (const ticker of tickers) {
    const quote = state.market.quotes[ticker];
    const qty = Math.floor((nav * 0.24) / quote.ask);
    const result = fundBuy(levered, state.market.quotes, { ticker, qty, day: 0 });
    if (result.ok) levered = result.fund;
  }
  const metrics = fundMetrics(levered, state);
  assert(metrics.leverage > 1, 'gross exposure exceeds NAV');
  const tight = { ...levered, leverageLimit: 1.05 };
  let next = tight;
  for (let day = 1; day <= FUND_MAX_LEVERAGE_DAYS; day += 1) {
    next = advanceFundDay(next, { day, quotes: state.market.quotes, seed: 'fund-test' }).fund;
  }
  assertEqual(next.status, 'closed');
  assertEqual(next.closeReason, 'leverage');
});

test('a closed fund can be launched again', () => {
  const state = makeState();
  const fund = launch(state);
  const closed = { ...fund, status: 'closed', closeReason: 'drawdown', closedDay: 5 };
  const result = setupFund({ ...state, fund: closed }, {
    name: 'Second Chance',
    strategy: 'quant',
    riskProfile: 'aggressive',
    initialAum: FUND_AUM_OPTIONS[0],
  }, 6);
  assert(result.ok, 'closed funds can be relaunched');
  assertEqual(result.fund.status, 'active');
  assertEqual(result.fund.name, 'Second Chance');
});

test('fund strategy plans normalise, build and execute through normal risk checks', () => {
  const config = normalizeFundPlanConfig({
    strategyId: 'moon',
    topN: 99,
    rebalanceDays: 1,
    cashBuffer: 2,
  });
  assertEqual(config.strategyId, 'smaCross', 'unknown plan strategy falls back');
  assertEqual(config.topN, 10, 'top-N clamps');
  assertEqual(config.rebalanceDays, 5, 'rebalance interval clamps');
  assertEqual(config.cashBuffer, 0.5, 'cash buffer clamps');

  const state = makeState();
  const fund = launch(state);
  const built = buildFundPlan(fund, state, {
    enabled: true,
    strategyId: 'buyHold',
    topN: 3,
    cashBuffer: 0.1,
  });
  assert(built.ok, 'plan builds');
  assertEqual(built.plan.candidates.length, 3, 'top three candidates selected');
  assert(built.plan.trades.every((trade) => trade.side === 'buy'), 'empty fund only buys');
  assert(built.plan.expectedCash >= 0, 'plan keeps cash non-negative');
  const executed = executeFundPlan(fund, state.market.quotes, built.plan, { day: 0 });
  assert(executed.ok, 'plan executes');
  assert(executed.applied.length > 0, 'some plan trades filled');
  assert(executed.fund.account.positions && Object.keys(executed.fund.account.positions).length > 0, 'positions created');
  assertEqual(executeFundPlan(fund, state.market.quotes, { trades: [] }, {}).error, 'fund.plan.errorEmpty');
});

test('fund attribution components reconcile to the total return', () => {
  const state = makeState();
  const fund = launch(state);
  const leveraged = { ...fund, managementFees: 100, performanceFees: 50 };
  const attribution = fundAttribution(leveraged, state);
  assert(attribution, 'attribution computes');
  const sum = Object.values(attribution.contributions).reduce((total, value) => total + value, 0);
  assertClose(sum, attribution.totalReturn, 0.25, 'factor contributions reconcile to total return');
  assertClose(attribution.contributions.fees, -0.015, 0.006, 'fees are a negative drag');
  assert(attribution.sectorRows.length > 0, 'sector exposure rows exist');
  for (const key of ['market', 'sector', 'cash', 'fees', 'selection']) {
    assert(Number.isFinite(attribution.contributions[key]), `${key} contribution is finite`);
  }
});

test('leaderboard is deterministic and includes every peer fund', () => {
  const state = makeState();
  const fund = launch(state);
  const board = fundLeaderboard(fund, 30);
  assertEqual(board.length, 5);
  const again = fundLeaderboard(fund, 30);
  assertDeepishEqual(board, again);
  const days = 30;
  board.forEach((row) => assert(Number.isFinite(row.totalReturn), 'peer return is numeric'));
  const northstar = board.find((row) => row.id === 'northstar');
  assertClose(northstar.totalReturn, (Math.pow(1.09, days / 252) - 1) * 100, 1e-6, 'peer return follows its annual rate');
});

function assertDeepishEqual(a, b) {
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'results should be identical across calls');
}
