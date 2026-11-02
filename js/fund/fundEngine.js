/**
 * Fund management engine. A fund has its own account, client units, a management
 * company ledger and a deterministic operating cycle. Fund assets are never mixed
 * with the player's personal trading account.
 */
import {
  buy, sell, createAccount, equity, positionRows,
} from '../trading/account.js';
import { COMPANIES, getCompany } from '../data/companies.js';
import { payableDividends, applyDividends } from '../market/dividends.js';
import { macroSnapshot } from '../market/macro.js';

export const FUND_RANK_REQUIREMENT = 5;
export const FUND_FEE_INTERVAL = 21;
export const FUND_CAPITAL_INTERVAL = 30;
export const FUND_REDEMPTION_DAYS = 5;
export const FUND_REDEMPTION_GRACE = 3;
export const FUND_MAX_DRAWDOWN = 40;
export const FUND_MAX_UNPAID_DAYS = 10;
export const FUND_MAX_RISK_DAYS = 15;
export const FUND_COMPLIANCE_DAYS = 10;
export const FUND_COMPANY_SEED = 3000;
export const FUND_TRADE_FEE = 1;
export const FUND_TRADER_FEE = 0.5;
export const FUND_AUM_OPTIONS = [250000, 1000000, 5000000];
export const FUND_HURDLE_OPTIONS = [0, 0.02, 0.04];
export const FUND_OPERATING_BASE = 1200;
export const FUND_OPERATING_PER_HEAD = 120;
export const FUND_KEY_PERSON_DAYS = 5;
export const FUND_MAX_LEVERAGE_DAYS = 3;

export const FUND_BENCHMARKS = {
  index: {
    id: 'index',
    nameKey: 'fund.benchmark.index',
    descKey: 'fund.benchmark.indexDesc',
  },
  mkt: {
    id: 'mkt',
    nameKey: 'fund.benchmark.mkt',
    descKey: 'fund.benchmark.mktDesc',
    ticker: 'MKT',
  },
  cash: {
    id: 'cash',
    nameKey: 'fund.benchmark.cash',
    descKey: 'fund.benchmark.cashDesc',
  },
};

export const FUND_STRATEGIES = {
  longOnly: {
    id: 'longOnly',
    nameKey: 'fund.strategy.longOnly.name',
    descKey: 'fund.strategy.longOnly.desc',
    maxPosition: 0.25,
    minCash: 0.1,
  },
  macro: {
    id: 'macro',
    nameKey: 'fund.strategy.macro.name',
    descKey: 'fund.strategy.macro.desc',
    maxPosition: 0.3,
    minCash: 0.15,
  },
  quant: {
    id: 'quant',
    nameKey: 'fund.strategy.quant.name',
    descKey: 'fund.strategy.quant.desc',
    maxPosition: 0.2,
    minCash: 0.1,
  },
  marketNeutral: {
    id: 'marketNeutral',
    nameKey: 'fund.strategy.marketNeutral.name',
    descKey: 'fund.strategy.marketNeutral.desc',
    maxPosition: 0.15,
    minCash: 0.2,
  },
};

export const FUND_RISK_PROFILES = {
  conservative: {
    id: 'conservative',
    nameKey: 'fund.riskProfile.conservative',
    maxPosition: 0.15,
    minCash: 0.2,
    leverageLimit: 1,
    expectedReturn: 6,
  },
  balanced: {
    id: 'balanced',
    nameKey: 'fund.riskProfile.balanced',
    maxPosition: 0.25,
    minCash: 0.1,
    leverageLimit: 1.25,
    expectedReturn: 10,
  },
  aggressive: {
    id: 'aggressive',
    nameKey: 'fund.riskProfile.aggressive',
    maxPosition: 0.35,
    minCash: 0.05,
    leverageLimit: 1.5,
    expectedReturn: 15,
  },
};

export const FUND_ROLES = [
  {
    id: 'research',
    nameKey: 'fund.role.research.name',
    descKey: 'fund.role.research.desc',
    salary: 700,
    skill: 78,
    person: 'Maya Chen',
  },
  {
    id: 'quant',
    nameKey: 'fund.role.quant.name',
    descKey: 'fund.role.quant.desc',
    salary: 900,
    skill: 84,
    person: 'Owen Park',
  },
  {
    id: 'risk',
    nameKey: 'fund.role.risk.name',
    descKey: 'fund.role.risk.desc',
    salary: 800,
    skill: 86,
    person: 'Priya Nair',
  },
  {
    id: 'trader',
    nameKey: 'fund.role.trader.name',
    descKey: 'fund.role.trader.desc',
    salary: 600,
    skill: 80,
    person: 'Lucas Reed',
  },
  {
    id: 'macro',
    nameKey: 'fund.role.macro.name',
    descKey: 'fund.role.macro.desc',
    salary: 800,
    skill: 82,
    person: 'Sofia Marin',
  },
  {
    id: 'operations',
    nameKey: 'fund.role.operations.name',
    descKey: 'fund.role.operations.desc',
    salary: 500,
    skill: 76,
    person: 'Daniel Cho',
  },
  {
    id: 'compliance',
    nameKey: 'fund.role.compliance.name',
    descKey: 'fund.role.compliance.desc',
    salary: 750,
    skill: 88,
    person: 'Elena Rossi',
  },
];

const CLIENT_POOL = [
  { id: 'northwind', name: 'Northwind Pension', typeKey: 'fund.clientType.pension', risk: 'low', horizon: 'long', liquidity: 'low' },
  { id: 'blueharbor', name: 'Blue Harbor Endowment', typeKey: 'fund.clientType.endowment', risk: 'low', horizon: 'veryLong', liquidity: 'low' },
  { id: 'kestrel', name: 'Kestrel Family Office', typeKey: 'fund.clientType.familyOffice', risk: 'medium', horizon: 'medium', liquidity: 'medium' },
  { id: 'meridian', name: 'Meridian Insurance', typeKey: 'fund.clientType.insurance', risk: 'low', horizon: 'long', liquidity: 'medium' },
  { id: 'silverline', name: 'Silverline Capital', typeKey: 'fund.clientType.fundOfFunds', risk: 'medium', horizon: 'medium', liquidity: 'high' },
  { id: 'cedar', name: 'Cedar Partners', typeKey: 'fund.clientType.privateClient', risk: 'high', horizon: 'short', liquidity: 'high' },
  { id: 'atlas', name: 'Atlas Trust', typeKey: 'fund.clientType.trust', risk: 'medium', horizon: 'long', liquidity: 'low' },
  { id: 'horizon', name: 'Horizon Foundation', typeKey: 'fund.clientType.foundation', risk: 'low', horizon: 'veryLong', liquidity: 'low' },
];

const PEER_FUNDS = [
  { id: 'northstar', nameKey: 'fund.peer.northstar', annual: 0.09, aum: 42000000 },
  { id: 'quantedge', nameKey: 'fund.peer.quantedge', annual: 0.12, aum: 18000000 },
  { id: 'macroline', nameKey: 'fund.peer.macroline', annual: 0.06, aum: 35000000 },
  { id: 'cedarrock', nameKey: 'fund.peer.cedarrock', annual: 0.15, aum: 9000000 },
  { id: 'steady', nameKey: 'fund.peer.steady', annual: 0.04, aum: 60000000 },
];

const SPLIT = [0.4, 0.3, 0.2, 0.1];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hash32(text) {
  let hash = 2166136261;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roll(seed, id, day) {
  return (hash32(`${seed}:${id}:${day}`) % 10000) / 10000;
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

export function createFundState() {
  return {
    status: 'none',
    name: '',
    strategy: 'longOnly',
    riskProfile: 'balanced',
    initialAum: 0,
    createdDay: null,
    account: null,
    units: 0,
    highWaterMark: 1,
    peakNav: 1,
    benchmarkId: 'index',
    benchmarkStart: 0,
    hurdleRate: 0,
    managementRate: 0.02,
    performanceRate: 0.2,
    maxPosition: 0.25,
    minCash: 0.1,
    leverageEnabled: false,
    leverageLimit: 1,
    leverageBreachDays: 0,
    companyCash: 0,
    operatingCosts: 0,
    operatingDue: 0,
    unpaidCostDays: 0,
    keyPersonLeft: '',
    managementFees: 0,
    performanceFees: 0,
    feePayable: 0,
    payrollDue: 0,
    unpaidSalaryDays: 0,
    riskBreachDays: 0,
    withdrawnToPersonal: 0,
    lastFeeDay: 0,
    lastPayrollDay: 0,
    lastCapitalDay: 0,
    clients: [],
    candidates: [],
    employees: [],
    quantPlan: {
      enabled: false,
      strategyId: 'smaCross',
      params: {
        fast: 20, slow: 50, rsiPeriod: 14, rsiEntry: 30, rsiExit: 70, lookback: 60, threshold: 2,
      },
      topN: 5,
      rebalanceDays: 21,
      cashBuffer: 0.1,
      lastPlanDay: null,
      plan: null,
    },
    insights: [],
    history: [],
    events: [],
    closedDay: null,
    closeReason: '',
  };
}

const CLIENT_EXPECTED_RETURN = { low: 6, medium: 10, high: 15 };

function normalizeClient(client, index, day) {
  const source = client && typeof client === 'object' ? client : {};
  const risk = ['low', 'medium', 'high'].includes(source.risk) ? source.risk : 'medium';
  return {
    id: String(source.id || `client-${index}`),
    name: String(source.name || 'Client'),
    typeKey: source.typeKey || 'fund.clientType.privateClient',
    risk,
    expectedReturn: Number.isFinite(Number(source.expectedReturn))
      ? Number(source.expectedReturn)
      : CLIENT_EXPECTED_RETURN[risk],
    horizon: source.horizon || 'medium',
    liquidity: source.liquidity || 'medium',
    principal: Number.isFinite(Number(source.principal)) ? Number(source.principal) : 0,
    units: Number.isFinite(Number(source.units)) ? Math.max(0, Number(source.units)) : 0,
    trust: Number.isFinite(Number(source.trust)) ? Math.max(0, Math.min(100, Number(source.trust))) : 65,
    joinedDay: Number.isFinite(Number(source.joinedDay)) ? Number(source.joinedDay) : day,
    request: source.request && Number.isFinite(Number(source.request.units))
      ? {
        units: Math.max(0, Number(source.request.units)),
        requestedDay: Number.isFinite(Number(source.request.requestedDay)) ? Number(source.request.requestedDay) : day,
        dueDay: Number.isFinite(Number(source.request.dueDay)) ? Number(source.request.dueDay) : day + FUND_REDEMPTION_DAYS,
        reason: source.request.reason || 'drawdown',
      }
      : null,
  };
}

export function normalizeFund(fund, day = 0, seed = 'academy-2026') {
  const currentDay = Number.isFinite(Number(day)) ? Math.max(0, Number(day)) : 0;
  if (!fund || typeof fund !== 'object' || !['active', 'closed'].includes(fund.status)) {
    return createFundState();
  }
  const base = createFundState();
  const aum = Number.isFinite(Number(fund.initialAum)) ? Math.max(0, Number(fund.initialAum)) : 0;
  const account = {
    ...createAccount(aum),
    ...(fund.account && typeof fund.account === 'object' ? fund.account : {}),
  };
  account.positions = account.positions && typeof account.positions === 'object' ? account.positions : {};
  account.trades = Array.isArray(account.trades) ? account.trades : [];
  account.dividends = Array.isArray(account.dividends) ? account.dividends : [];
  account.equityHistory = Array.isArray(account.equityHistory) ? account.equityHistory : [];
  account.cash = Number.isFinite(Number(account.cash)) ? Number(account.cash) : aum;
  account.initialCash = Number.isFinite(Number(account.initialCash)) ? Number(account.initialCash) : aum;
  account.bonds = Array.isArray(account.bonds) ? account.bonds : [];
  account.fx = Array.isArray(account.fx) ? account.fx : [];

  const clients = (Array.isArray(fund.clients) ? fund.clients : [])
    .map((client, index) => normalizeClient(client, index, currentDay))
    .filter((client) => client.units > 0.0001);
  const units = Number.isFinite(Number(fund.units)) && Number(fund.units) > 0
    ? Number(fund.units)
    : clients.reduce((sum, client) => sum + client.units, 0) || aum;

  return {
    ...base,
    ...fund,
    status: fund.status,
    name: String(fund.name || 'Atlas Capital'),
    strategy: FUND_STRATEGIES[fund.strategy] ? fund.strategy : 'longOnly',
    riskProfile: FUND_RISK_PROFILES[fund.riskProfile] ? fund.riskProfile : 'balanced',
    initialAum: aum,
    createdDay: Number.isFinite(Number(fund.createdDay)) ? Number(fund.createdDay) : currentDay,
    account,
    units,
    highWaterMark: Number.isFinite(Number(fund.highWaterMark)) && Number(fund.highWaterMark) > 0
      ? Number(fund.highWaterMark) : 1,
    peakNav: Number.isFinite(Number(fund.peakNav)) && Number(fund.peakNav) > 0
      ? Number(fund.peakNav) : 1,
    benchmarkId: FUND_BENCHMARKS[fund.benchmarkId] ? fund.benchmarkId : 'index',
    benchmarkStart: Number.isFinite(Number(fund.benchmarkStart)) ? Number(fund.benchmarkStart) : 0,
    hurdleRate: Number.isFinite(Number(fund.hurdleRate)) ? Number(fund.hurdleRate) : 0,
    managementRate: Number.isFinite(Number(fund.managementRate)) ? Number(fund.managementRate) : 0.02,
    performanceRate: Number.isFinite(Number(fund.performanceRate)) ? Number(fund.performanceRate) : 0.2,
    maxPosition: Number.isFinite(Number(fund.maxPosition)) ? Number(fund.maxPosition) : 0.25,
    minCash: Number.isFinite(Number(fund.minCash)) ? Number(fund.minCash) : 0.1,
    leverageEnabled: Boolean(fund.leverageEnabled),
    leverageLimit: Boolean(fund.leverageEnabled) && Number.isFinite(Number(fund.leverageLimit))
      ? Math.max(1, Number(fund.leverageLimit)) : 1,
    leverageBreachDays: Number.isFinite(Number(fund.leverageBreachDays)) ? Number(fund.leverageBreachDays) : 0,
    companyCash: Number.isFinite(Number(fund.companyCash)) ? Number(fund.companyCash) : 0,
    operatingCosts: Number.isFinite(Number(fund.operatingCosts)) ? Number(fund.operatingCosts) : 0,
    operatingDue: Number.isFinite(Number(fund.operatingDue)) ? Math.max(0, Number(fund.operatingDue)) : 0,
    unpaidCostDays: Number.isFinite(Number(fund.unpaidCostDays)) ? Number(fund.unpaidCostDays) : 0,
    keyPersonLeft: typeof fund.keyPersonLeft === 'string' ? fund.keyPersonLeft : '',
    managementFees: Number.isFinite(Number(fund.managementFees)) ? Number(fund.managementFees) : 0,
    performanceFees: Number.isFinite(Number(fund.performanceFees)) ? Number(fund.performanceFees) : 0,
    feePayable: Number.isFinite(Number(fund.feePayable)) ? Math.max(0, Number(fund.feePayable)) : 0,
    payrollDue: Number.isFinite(Number(fund.payrollDue)) ? Math.max(0, Number(fund.payrollDue)) : 0,
    unpaidSalaryDays: Number.isFinite(Number(fund.unpaidSalaryDays)) ? Number(fund.unpaidSalaryDays) : 0,
    riskBreachDays: Number.isFinite(Number(fund.riskBreachDays)) ? Number(fund.riskBreachDays) : 0,
    withdrawnToPersonal: Number.isFinite(Number(fund.withdrawnToPersonal)) ? Number(fund.withdrawnToPersonal) : 0,
    lastFeeDay: Number.isFinite(Number(fund.lastFeeDay)) ? Number(fund.lastFeeDay) : currentDay,
    lastPayrollDay: Number.isFinite(Number(fund.lastPayrollDay)) ? Number(fund.lastPayrollDay) : currentDay,
    lastCapitalDay: Number.isFinite(Number(fund.lastCapitalDay)) ? Number(fund.lastCapitalDay) : currentDay,
    clients,
    candidates: Array.isArray(fund.candidates) ? fund.candidates : [],
    employees: Array.isArray(fund.employees) ? fund.employees : [],
    quantPlan: fund.quantPlan && typeof fund.quantPlan === 'object' ? fund.quantPlan : base.quantPlan,
    insights: Array.isArray(fund.insights) ? fund.insights : [],
    history: Array.isArray(fund.history) ? fund.history : [],
    events: Array.isArray(fund.events) ? fund.events : [],
    closedDay: Number.isFinite(Number(fund.closedDay)) ? Number(fund.closedDay) : null,
    closeReason: typeof fund.closeReason === 'string' ? fund.closeReason : '',
    seed: seed || 'academy-2026',
  };
}

export function fundUnlocked(state) {
  return Boolean(state && state.career && Number(state.career.rank) >= FUND_RANK_REQUIREMENT);
}

export function benchmarkStartValue(state, benchmarkId = 'index') {
  if (benchmarkId === 'mkt') {
    const quote = state?.market?.quotes?.MKT;
    return quote && Number.isFinite(quote.last) ? quote.last : 0;
  }
  if (benchmarkId === 'cash') return 0;
  const value = Number(state?.market?.index?.value);
  return Number.isFinite(value) ? value : 0;
}

function benchmarkReturn(fund, state) {
  const id = fund.benchmarkId || 'index';
  if (id === 'cash') return 0;
  const current = id === 'mkt'
    ? Number(state?.market?.quotes?.MKT?.last)
    : Number(state?.market?.index?.value);
  const start = Number(fund.benchmarkStart);
  if (!Number.isFinite(current) || !Number.isFinite(start) || start <= 0) return 0;
  return ((current / start) - 1) * 100;
}

function pickClients(seed, strategy, count = 4) {
  const offset = hash32(`${seed}:${strategy}:clients`) % CLIENT_POOL.length;
  const picks = [];
  for (let index = 0; index < count; index += 1) {
    picks.push(CLIENT_POOL[(offset + index) % CLIENT_POOL.length]);
  }
  return picks;
}

export function setupFund(state, input = {}, day = 0) {
  if (!fundUnlocked(state)) return { ok: false, error: 'fund.errorLocked' };
  if (state.fund && state.fund.status === 'active') return { ok: false, error: 'fund.errorAlreadyActive' };
  const name = String(input.name || '').trim().slice(0, 36);
  if (name.length < 2) return { ok: false, error: 'fund.errorName' };
  const strategy = FUND_STRATEGIES[input.strategy] ? input.strategy : 'longOnly';
  const riskProfile = FUND_RISK_PROFILES[input.riskProfile] ? input.riskProfile : 'balanced';
  const aum = FUND_AUM_OPTIONS.includes(Number(input.initialAum))
    ? Number(input.initialAum) : FUND_AUM_OPTIONS[1];
  const managementRate = [0.01, 0.02].includes(Number(input.managementRate))
    ? Number(input.managementRate) : 0.02;
  const performanceRate = [0.1, 0.2].includes(Number(input.performanceRate))
    ? Number(input.performanceRate) : 0.2;
  const benchmarkId = FUND_BENCHMARKS[input.benchmarkId] ? input.benchmarkId : 'index';
  const hurdleRate = FUND_HURDLE_OPTIONS.includes(Number(input.hurdleRate))
    ? Number(input.hurdleRate) : 0;

  const strategyDef = FUND_STRATEGIES[strategy];
  const riskDef = FUND_RISK_PROFILES[riskProfile];
  const maxPosition = Math.min(strategyDef.maxPosition, riskDef.maxPosition);
  const minCash = Math.max(strategyDef.minCash, riskDef.minCash);
  const currentDay = Math.max(0, Number(day) || 0);
  const picks = pickClients(state.seed || 'academy-2026', strategy);
  const clients = picks.map((entry, index) => {
    const principal = round2(aum * SPLIT[index]);
    return {
      id: `${entry.id}-${index}`,
      name: entry.name,
      typeKey: entry.typeKey,
      risk: entry.risk,
      expectedReturn: CLIENT_EXPECTED_RETURN[entry.risk] || 10,
      horizon: entry.horizon,
      liquidity: entry.liquidity,
      principal,
      units: principal,
      trust: entry.risk === 'low' ? 78 : entry.risk === 'high' ? 58 : 68,
      joinedDay: currentDay,
      request: null,
    };
  });
  const candidateEntries = CLIENT_POOL.filter((entry) => !picks.some((pick) => pick.id === entry.id)).slice(0, 2);
  const candidates = candidateEntries.map((entry) => ({
    id: `${entry.id}-prospect`,
    name: entry.name,
    typeKey: entry.typeKey,
    risk: entry.risk,
    horizon: entry.horizon,
    liquidity: entry.liquidity,
    principal: round2(Math.max(50000, aum * 0.1)),
  }));

  const account = createAccount(aum);
  const benchmarkStart = benchmarkStartValue(state, benchmarkId);
  const units = clients.reduce((sum, client) => sum + client.units, 0);
  const leverageEnabled = Boolean(input.leverageEnabled);
  const leverageLimit = leverageEnabled ? Math.max(1, riskDef.leverageLimit || 1) : 1;

  return {
    ok: true,
    fund: {
      ...createFundState(),
      status: 'active',
      name,
      strategy,
      riskProfile,
      initialAum: aum,
      createdDay: currentDay,
      account,
      units,
      highWaterMark: 1,
      peakNav: 1,
      benchmarkId,
      benchmarkStart,
      hurdleRate,
      managementRate,
      performanceRate,
      maxPosition,
      minCash,
      leverageEnabled,
      leverageLimit,
      leverageBreachDays: 0,
      companyCash: FUND_COMPANY_SEED,
      operatingCosts: 0,
      operatingDue: 0,
      unpaidCostDays: 0,
      keyPersonLeft: '',
      managementFees: 0,
      performanceFees: 0,
      feePayable: 0,
      payrollDue: 0,
      unpaidSalaryDays: 0,
      riskBreachDays: 0,
      withdrawnToPersonal: 0,
      lastFeeDay: currentDay,
      lastPayrollDay: currentDay,
      lastCapitalDay: currentDay,
      clients,
      candidates,
      employees: [],
      insights: [],
      history: [{ day: currentDay, nav: aum, navPerUnit: 1, cashRatio: 1, drawdownPct: 0, aum }],
      events: [{ day: currentDay, type: 'created', amount: aum }],
      closedDay: null,
      closeReason: '',
      seed: state.seed || 'academy-2026',
    },
  };
}

export function fundMetrics(fund, state) {
  if (!fund || fund.status === 'none' || !fund.account) return null;
  const quotes = state.market.quotes;
  const feePayable = fund.feePayable || 0;
  const nav = Math.max(0, equity(fund.account, quotes) - feePayable);
  const units = Math.max(0.0001, fund.units || 0);
  const navPerUnit = nav / units;
  const totalReturn = (navPerUnit - 1) * 100;
  const peak = Math.max(1, fund.peakNav || 1, navPerUnit);
  const drawdown = peak > 0 ? ((peak - navPerUnit) / peak) * 100 : 0;
  const cashRatio = nav > 0 ? (fund.account.cash / nav) * 100 : 0;
  const rows = positionRows(fund.account, quotes);
  const top = rows.reduce((best, row) => (
    !best || Math.abs(row.value) > Math.abs(best.value) ? row : best
  ), null);
  const topWeight = top && nav > 0 ? (Math.abs(top.value) / nav) * 100 : 0;
  const benchmark = benchmarkReturn(fund, state);
  const alpha = totalReturn - benchmark;
  const holdingsValue = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);
  const leverage = nav > 0 ? holdingsValue / nav : 0;
  const leverageLimit = Math.max(1, fund.leverageLimit || 1);
  const cashFloorPct = leverageLimit > 1 ? -(leverageLimit - 1) * 100 : (fund.minCash || 0) * 100;
  const weightedExpected = fund.clients.reduce((sum, client) => sum + (client.units || 0) * (client.expectedReturn || 0), 0);
  const avgExpectedReturn = units > 0 ? weightedExpected / units : 0;
  return {
    nav,
    units,
    navPerUnit,
    totalReturn,
    drawdown,
    cashRatio,
    topTicker: top ? top.ticker : '',
    topWeight,
    holdingsValue,
    benchmark,
    alpha,
    benchmarkId: fund.benchmarkId || 'index',
    hurdleRate: fund.hurdleRate || 0,
    feePayable,
    cash: fund.account.cash,
    positionCount: rows.length,
    maxPositionPct: (fund.maxPosition || 0) * 100,
    minCashPct: (fund.minCash || 0) * 100,
    cashFloorPct,
    cashBreach: cashRatio < cashFloorPct,
    positionBreach: topWeight > (fund.maxPosition || 0) * 100,
    leverage,
    leverageEnabled: Boolean(fund.leverageEnabled),
    leverageLimit,
    leverageBreach: leverage > leverageLimit + 0.0001,
    leverageDays: fund.leverageBreachDays || 0,
    operatingCosts: fund.operatingCosts || 0,
    operatingDue: fund.operatingDue || 0,
    avgExpectedReturn,
    drawdownLimit: FUND_MAX_DRAWDOWN,
    riskDays: fund.riskBreachDays || 0,
  };
}

export function fundLeaderboard(fund, day) {
  if (!fund || fund.status === 'none') return [];
  const days = Math.max(0, Number(day || 0) - (fund.createdDay || 0));
  return PEER_FUNDS.map((peer) => {
    const totalReturn = (Math.pow(1 + peer.annual, days / 252) - 1) * 100;
    return {
      id: peer.id,
      nameKey: peer.nameKey,
      totalReturn,
      aum: peer.aum * (1 + totalReturn / 100),
      simulated: true,
    };
  });
}

export function fundBuy(fund, quotes, { ticker, qty, day = 0, tick = 0 }) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const quote = quotes[ticker];
  if (!quote) return { ok: false, error: 'error.unknownTicker' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  const price = quote.ask;
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'error.priceInvalid' };
  const fee = fund.employees?.some((employee) => employee.id === 'trader')
    ? FUND_TRADER_FEE : FUND_TRADE_FEE;
  const nav = Math.max(0, equity(fund.account, quotes) - (fund.feePayable || 0));
  if (nav <= 0) return { ok: false, error: 'fund.errorNoNav' };
  const existing = fund.account.positions[ticker];
  const existingQty = existing && existing.qty > 0 ? existing.qty : 0;
  const nextValue = (existingQty + quantity) * price;
  if (nextValue > nav * (fund.maxPosition || 1) + 1e-6) {
    return { ok: false, error: 'fund.errorPositionCap' };
  }
  const leverageLimit = Math.max(1, fund.leverageLimit || 1);
  const holdings = positionRows(fund.account, quotes)
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  if (holdings + quantity * price > nav * leverageLimit + 1e-6) {
    return { ok: false, error: 'fund.errorLeverage' };
  }
  const nextCash = fund.account.cash - quantity * price - fee;
  const cashFloor = leverageLimit > 1
    ? -nav * (leverageLimit - 1)
    : nav * (fund.minCash || 0);
  if (nextCash < cashFloor - 1e-6) {
    return { ok: false, error: 'fund.errorCashFloor' };
  }
  const result = buy(fund.account, {
    ticker, qty: quantity, price, fee, day, tick, allowDebit: true,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    fund: { ...fund, account: result.account },
    trade: result.trade,
  };
}

export function fundSell(fund, quotes, { ticker, qty, day = 0, tick = 0 }) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const quote = quotes[ticker];
  if (!quote) return { ok: false, error: 'error.unknownTicker' };
  const fee = fund.employees?.some((employee) => employee.id === 'trader')
    ? FUND_TRADER_FEE : FUND_TRADE_FEE;
  const result = sell(fund.account, {
    ticker, qty: Math.floor(Number(qty)), price: quote.bid, fee, day, tick,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    fund: { ...fund, account: result.account },
    trade: result.trade,
  };
}

export function hireEmployee(fund, roleId) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const role = FUND_ROLES.find((entry) => entry.id === roleId);
  if (!role) return { ok: false, error: 'fund.errorUnknownRole' };
  if (fund.employees.some((employee) => employee.role === roleId)) {
    return { ok: false, error: 'fund.errorRoleFilled' };
  }
  if (fund.companyCash < role.salary + (fund.payrollDue || 0)) {
    return { ok: false, error: 'fund.errorCannotAfford' };
  }
  return {
    ok: true,
    fund: {
      ...fund,
      employees: [...fund.employees, {
        id: role.id,
        role: role.id,
        name: role.person,
        salary: role.salary,
        skill: role.skill,
        hiredDay: fund.createdDay,
      }],
    },
    employee: role,
  };
}

export function fireEmployee(fund, roleId) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  if (!fund.employees.some((employee) => employee.role === roleId)) {
    return { ok: false, error: 'fund.errorNoEmployee' };
  }
  return { ok: true, fund: { ...fund, employees: fund.employees.filter((employee) => employee.role !== roleId) } };
}

export function acceptClient(fund, candidateId, metrics) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const candidate = (fund.candidates || []).find((entry) => entry.id === candidateId);
  if (!candidate || !metrics) return { ok: false, error: 'fund.errorNoCandidate' };
  const navPerUnit = Math.max(0.0001, metrics.navPerUnit);
  const units = round2(candidate.principal / navPerUnit);
  const client = {
    id: `${candidate.id}-${fund.createdDay}-${Math.round(units)}`,
    name: candidate.name,
    typeKey: candidate.typeKey,
    risk: candidate.risk,
    expectedReturn: CLIENT_EXPECTED_RETURN[candidate.risk] || 10,
    horizon: candidate.horizon,
    liquidity: candidate.liquidity,
    principal: candidate.principal,
    units,
    trust: 65,
    joinedDay: metrics.day || fund.createdDay,
    request: null,
  };
  return {
    ok: true,
    fund: {
      ...fund,
      account: { ...fund.account, cash: round2(fund.account.cash + candidate.principal) },
      units: round2(fund.units + units),
      clients: [...fund.clients, client],
      candidates: fund.candidates.filter((entry) => entry.id !== candidateId),
      events: [{ day: metrics.day || fund.createdDay, type: 'subscription', name: candidate.name, amount: candidate.principal }, ...fund.events].slice(0, 24),
    },
    client,
  };
}

export function settleRedemption(fund, clientId, metrics) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const client = (fund.clients || []).find((entry) => entry.id === clientId);
  if (!client || !client.request || !metrics) return { ok: false, error: 'fund.errorNoRedemption' };
  const units = Math.min(client.request.units, client.units);
  const amount = round2(units * Math.max(0.0001, metrics.navPerUnit));
  if (fund.account.cash < amount) return { ok: false, error: 'fund.errorRedemptionCash' };
  const nextClients = fund.clients
    .map((entry) => (entry.id === clientId
      ? { ...entry, units: round2(entry.units - units), request: null }
      : entry))
    .filter((entry) => entry.units > 0.0001);
  return {
    ok: true,
    fund: {
      ...fund,
      account: { ...fund.account, cash: round2(fund.account.cash - amount) },
      units: Math.max(0, round2(fund.units - units)),
      clients: nextClients,
      events: [{ day: metrics.day || fund.createdDay, type: 'redemption', name: client.name, amount }, ...fund.events].slice(0, 24),
    },
    amount,
  };
}

export function withdrawCompanyCash(fund, account) {
  if (!fund || fund.status === 'none') return { ok: false, error: 'fund.errorNotActive' };
  const amount = round2(fund.companyCash || 0);
  if (amount <= 0) return { ok: false, error: 'fund.errorNoCompanyCash' };
  return {
    ok: true,
    fund: { ...fund, companyCash: 0, withdrawnToPersonal: round2((fund.withdrawnToPersonal || 0) + amount) },
    account: { ...account, cash: round2(account.cash + amount) },
    amount,
  };
}

function payObligation(fund, amount) {
  if (amount <= 0) return 0;
  const available = Math.min(fund.account.cash, amount);
  fund.account.cash = round2(fund.account.cash - available);
  fund.companyCash = round2((fund.companyCash || 0) + available);
  fund.feePayable = round2((fund.feePayable || 0) + (amount - available));
  return available;
}

function settleFeePayable(fund) {
  const due = round2(fund.feePayable || 0);
  if (due <= 0) return 0;
  const available = Math.min(fund.account.cash, due);
  fund.account.cash = round2(fund.account.cash - available);
  fund.companyCash = round2((fund.companyCash || 0) + available);
  fund.feePayable = round2(due - available);
  return available;
}

function momentum(history, ticker, days = 20) {
  const candles = history && history[ticker];
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const last = candles[candles.length - 1].c;
  const base = candles[Math.max(0, candles.length - days)].c;
  if (!base) return null;
  return (last / base - 1) * 100;
}

function insightForRole(role, fund, context) {
  const { day, seed, marketHistory } = context;
  if (role === 'research' || role === 'quant') {
    const companies = COMPANIES.filter((company) => !company.isEtf);
    const ranked = companies
      .map((company) => ({
        ticker: company.ticker,
        momentum: momentum(marketHistory, company.ticker),
      }))
      .filter((entry) => Number.isFinite(entry.momentum));
    if (role === 'quant') {
      const best = ranked.sort((a, b) => b.momentum - a.momentum)[0];
      if (!best) return null;
      return { id: `quant-${day}`, day, role, kind: 'quant', ticker: best.ticker, momentum: round2(best.momentum) };
    }
    const index = hash32(`${seed}:research:${day}`) % companies.length;
    const ticker = companies[index].ticker;
    const move = momentum(marketHistory, ticker);
    return {
      id: `research-${day}`,
      day,
      role,
      kind: 'research',
      ticker,
      momentum: Number.isFinite(move) ? round2(move) : 0,
      rating: Number.isFinite(move) && move > 3 ? 'buy' : Number.isFinite(move) && move < -3 ? 'avoid' : 'hold',
    };
  }
  if (role === 'macro') {
    const snapshot = macroSnapshot(day, seed);
    return { id: `macro-${day}`, day, role, kind: 'macro', snapshot };
  }
  if (role === 'risk') {
    const nav = equity(fund.account, context.quotes) - (fund.feePayable || 0);
    const units = Math.max(0.0001, fund.units);
    const navPerUnit = nav / units;
    const peak = Math.max(1, fund.peakNav || 1, navPerUnit);
    const rows = positionRows(fund.account, context.quotes);
    const top = rows.reduce((best, row) => (!best || Math.abs(row.value) > Math.abs(best.value) ? row : best), null);
    return {
      id: `risk-${day}`,
      day,
      role,
      kind: 'risk',
      cashRatio: nav > 0 ? round2((fund.account.cash / nav) * 100) : 0,
      topWeight: top && nav > 0 ? round2((Math.abs(top.value) / nav) * 100) : 0,
      drawdown: peak > 0 ? round2(((peak - navPerUnit) / peak) * 100) : 0,
    };
  }
  return null;
}

function closeFund(fund, day, reason, events) {
  fund.status = 'closed';
  fund.closedDay = day;
  fund.closeReason = reason;
  events.push({ type: 'closed', reason, day });
}

export function advanceFundDay(fund, context = {}) {
  if (!fund || fund.status !== 'active') return { fund, events: [] };
  const day = Math.max(0, Number(context.day) || 0);
  const quotes = context.quotes || {};
  const seed = context.seed || fund.seed || 'academy-2026';
  const events = [];
  const next = {
    ...fund,
    account: {
      ...fund.account,
      positions: { ...fund.account.positions },
      trades: [...fund.account.trades],
      dividends: [...fund.account.dividends],
    },
    clients: fund.clients.map((client) => ({ ...client, request: client.request ? { ...client.request } : null })),
    candidates: [...(fund.candidates || [])],
    employees: [...(fund.employees || [])],
    insights: [...(fund.insights || [])],
    history: [...(fund.history || [])],
    events: [...(fund.events || [])],
  };

  const rows = payableDividends(next.account, day);
  const applied = applyDividends(next.account, rows);
  next.account = applied.account;
  if (applied.dividends.length) {
    events.push({ type: 'dividend', amount: applied.total });
  }

  settleFeePayable(next);

  if (day >= next.lastFeeDay + FUND_FEE_INTERVAL) {
    const navBefore = Math.max(0, equity(next.account, quotes) - (next.feePayable || 0));
    const managementFee = round2(navBefore * (next.managementRate || 0) / 12);
    if (managementFee > 0) {
      const paid = payObligation(next, managementFee);
      next.managementFees = round2(next.managementFees + managementFee);
      events.push({ type: 'managementFee', amount: managementFee, paid });
    }
    const navAfterManagement = Math.max(0, equity(next.account, quotes) - (next.feePayable || 0));
    const highWaterValue = next.units * next.highWaterMark;
    const hurdleValue = highWaterValue * (next.hurdleRate || 0) / 12;
    const excessOverHurdle = navAfterManagement - highWaterValue - hurdleValue;
    if (excessOverHurdle > 0 && next.performanceRate > 0) {
      const performanceFee = round2(excessOverHurdle * next.performanceRate);
      if (performanceFee > 0) {
        const paid = payObligation(next, performanceFee);
        next.performanceFees = round2(next.performanceFees + performanceFee);
        events.push({ type: 'performanceFee', amount: performanceFee, paid });
      }
    }
    const navAfterFees = Math.max(0, equity(next.account, quotes) - (next.feePayable || 0));
    next.highWaterMark = Math.max(next.highWaterMark, navAfterFees / Math.max(0.0001, next.units));
    next.lastFeeDay = day;

    const reference = [...next.history].reverse()
      .find((entry) => Number.isFinite(entry.day) && entry.day <= day - FUND_FEE_INTERVAL);
    const referenceNav = reference && reference.navPerUnit > 0 ? reference.navPerUnit : 1;
    const periodReturnPct = next.units > 0 && referenceNav > 0
      ? ((navAfterFees / next.units) / referenceNav - 1) * 100
      : 0;
    const hasOperations = next.employees.some((employee) => employee.id === 'operations');
    const hasCompliance = next.employees.some((employee) => employee.id === 'compliance');
    next.clients = next.clients.map((client) => {
      let trust = client.trust + (hasOperations ? 2 : 1) + (hasCompliance ? 1 : 0);
      const expectedMonthly = (client.expectedReturn || 0) / 12;
      if (periodReturnPct < expectedMonthly - 1) trust -= 4;
      else if (periodReturnPct < expectedMonthly) trust -= 2;
      else trust += 2;
      if (client.trust < 50) trust -= 1;
      if (client.request) trust -= 3;
      return { ...client, trust: clampPct(trust) };
    });

    for (const role of ['research', 'quant', 'macro', 'risk']) {
      if (!next.employees.some((employee) => employee.id === role)) continue;
      const insight = insightForRole(role, next, { day, seed, marketHistory: context.marketHistory, quotes });
      if (insight && !next.insights.some((entry) => entry.id === insight.id)) {
        next.insights.push(insight);
      }
    }
    next.insights = next.insights.slice(-12);

    const payroll = next.employees.reduce((sum, employee) => sum + employee.salary, 0);
    if (payroll > 0) {
      next.payrollDue = round2(next.payrollDue + payroll);
      next.lastPayrollDay = day;
      events.push({ type: 'payroll', amount: payroll, paid: 0 });
    }

    const operatingCost = round2(FUND_OPERATING_BASE + next.employees.length * FUND_OPERATING_PER_HEAD);
    next.operatingCosts = round2(next.operatingCosts + operatingCost);
    const operatingPaid = Math.min(next.companyCash, operatingCost);
    next.companyCash = round2(next.companyCash - operatingPaid);
    next.operatingDue = round2(next.operatingDue + operatingCost - operatingPaid);
    events.push({ type: 'operatingCost', amount: operatingCost, paid: operatingPaid });
  }

  if (next.payrollDue > 0) {
    const paid = Math.min(next.companyCash, next.payrollDue);
    next.companyCash = round2(next.companyCash - paid);
    next.payrollDue = round2(next.payrollDue - paid);
    if (next.payrollDue > 0) {
      next.unpaidSalaryDays += 1;
      events.push({ type: 'payrollShort', amount: next.payrollDue });
    } else {
      next.unpaidSalaryDays = 0;
    }
  } else {
    next.unpaidSalaryDays = 0;
  }

  if (next.operatingDue > 0) {
    const paid = Math.min(next.companyCash, next.operatingDue);
    next.companyCash = round2(next.companyCash - paid);
    next.operatingDue = round2(next.operatingDue - paid);
    if (next.operatingDue > 0) {
      next.unpaidCostDays += 1;
    } else {
      next.unpaidCostDays = 0;
    }
  } else {
    next.unpaidCostDays = 0;
  }

  if (next.unpaidSalaryDays >= FUND_KEY_PERSON_DAYS && next.status === 'active') {
    const key = next.employees.find((employee) => (
      ['risk', 'compliance', 'operations'].includes(employee.role)
    ));
    if (key) {
      next.employees = next.employees.filter((employee) => employee.id !== key.id);
      next.keyPersonLeft = key.name;
      events.push({ type: 'keyPerson', name: key.name, role: key.role });
      closeFund(next, day, 'keyPerson', events);
    }
  }

  let navPerUnit = Math.max(0.0001, (equity(next.account, quotes) - (next.feePayable || 0)) / Math.max(0.0001, next.units));
  let peak = Math.max(next.peakNav || 1, navPerUnit);
  let drawdown = peak > 0 ? ((peak - navPerUnit) / peak) * 100 : 0;

  for (const client of [...next.clients]) {
    if (!client.request) continue;
    if (day < client.request.dueDay) continue;
    const amount = round2(client.request.units * navPerUnit);
    if (next.account.cash >= amount) {
      const units = Math.min(client.request.units, client.units);
      next.account.cash = round2(next.account.cash - amount);
      next.units = Math.max(0, round2(next.units - units));
      client.units = round2(client.units - units);
      client.request = null;
      if (client.units <= 0.0001) {
        next.clients = next.clients.filter((entry) => entry.id !== client.id);
      }
      events.push({ type: 'redemptionPaid', name: client.name, amount });
    } else if (day > client.request.dueDay + FUND_REDEMPTION_GRACE) {
      closeFund(next, day, 'liquidity', events);
      break;
    }
  }

  const returnReference = [...next.history].reverse()
    .find((entry) => Number.isFinite(entry.day) && entry.day <= day - FUND_FEE_INTERVAL);
  const referenceReturnNav = returnReference && returnReference.navPerUnit > 0
    ? returnReference.navPerUnit : 1;
  const trailingReturnPct = referenceReturnNav > 0
    ? (navPerUnit / referenceReturnNav - 1) * 100
    : 0;

  if (next.status === 'active') {
    for (const client of next.clients) {
      if (client.request) continue;
      const expectedMonthly = (client.expectedReturn || 0) / 12;
      const shortfall = Math.max(0, expectedMonthly - trailingReturnPct) / 100 * 0.4;
      const chance = Math.min(0.4, 0.01
        + Math.max(0, drawdown - 5) / 100 * 0.6
        + (client.risk === 'low' ? 0.025 : client.risk === 'high' ? 0.005 : 0.015)
        + (client.trust < 50 ? 0.02 : 0)
        + shortfall);
      if (roll(seed, client.id, day) >= chance) continue;
      const fraction = 0.25 + roll(seed, `${client.id}:size`, day) * 0.2;
      const units = Math.max(1, Math.floor(client.units * fraction));
      client.request = {
        units,
        requestedDay: day,
        dueDay: day + FUND_REDEMPTION_DAYS,
        reason: drawdown > 5 ? 'drawdown' : client.trust < 50 ? 'trust' : 'liquidity',
      };
      events.push({ type: 'redemptionRequest', name: client.name, units });
    }
  }

  navPerUnit = Math.max(0.0001, (equity(next.account, quotes) - (next.feePayable || 0)) / Math.max(0.0001, next.units));
  const navNow = Math.max(0, equity(next.account, quotes) - (next.feePayable || 0));
  const cashRatio = navNow > 0 ? (next.account.cash / navNow) * 100 : 0;
  const leverageLimit = Math.max(1, next.leverageLimit || 1);
  const cashFloorPct = leverageLimit > 1
    ? -(leverageLimit - 1) * 100
    : (next.minCash || 0) * 100;
  if (next.status === 'active' && cashRatio < cashFloorPct) {
    next.riskBreachDays += 1;
    const hasCompliance = next.employees.some((employee) => employee.id === 'compliance');
    if (!hasCompliance && next.riskBreachDays >= FUND_COMPLIANCE_DAYS) {
      closeFund(next, day, 'compliance', events);
    } else if (next.riskBreachDays >= FUND_MAX_RISK_DAYS) {
      closeFund(next, day, 'risk', events);
    }
  } else {
    next.riskBreachDays = 0;
  }

  const holdingsNow = positionRows(next.account, quotes)
    .reduce((sum, row) => sum + Math.abs(row.value), 0);
  const grossExposure = navNow > 0 ? holdingsNow / navNow : 0;
  if (next.status === 'active' && grossExposure > leverageLimit + 1e-4) {
    next.leverageBreachDays += 1;
    if (next.leverageBreachDays >= FUND_MAX_LEVERAGE_DAYS) {
      closeFund(next, day, 'leverage', events);
    }
  } else {
    next.leverageBreachDays = 0;
  }

  if (day >= next.lastCapitalDay + FUND_CAPITAL_INTERVAL && next.candidates.length < 2 && next.status === 'active') {
    const used = new Set([...next.clients.map((client) => client.name), ...next.candidates.map((client) => client.name)]);
    const entry = CLIENT_POOL.find((client) => !used.has(client.name));
    if (entry) {
      const principal = round2(Math.max(50000, navNow * 0.1));
      next.candidates.push({
        id: `${entry.id}-${day}`,
        name: entry.name,
        typeKey: entry.typeKey,
        risk: entry.risk,
        horizon: entry.horizon,
        liquidity: entry.liquidity,
        principal,
      });
      events.push({ type: 'candidate', name: entry.name, amount: principal });
    }
    next.lastCapitalDay = day;
  }

  peak = Math.max(next.peakNav || 1, navPerUnit);
  next.peakNav = peak;
  drawdown = peak > 0 ? ((peak - navPerUnit) / peak) * 100 : 0;
  if (drawdown >= FUND_MAX_DRAWDOWN && next.status === 'active') {
    closeFund(next, day, 'drawdown', events);
  }
  if (next.units <= 0.0001 && next.status === 'active') {
    closeFund(next, day, 'redeemed', events);
  }
  if (next.unpaidSalaryDays >= FUND_MAX_UNPAID_DAYS && next.status === 'active') {
    closeFund(next, day, 'payroll', events);
  }

  const snapshot = {
    day,
    nav: round2(navNow),
    navPerUnit: round2(navPerUnit),
    cashRatio: round2(cashRatio / 100),
    drawdownPct: round2(drawdown),
    aum: round2(navNow),
  };
  const last = next.history[next.history.length - 1];
  if (last && last.day === day) next.history[next.history.length - 1] = snapshot;
  else next.history.push(snapshot);
  next.history = next.history.slice(-260);

  next.events = [...events, ...next.events].slice(0, 24);
  return { fund: next, events };
}
