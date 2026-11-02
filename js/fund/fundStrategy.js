/**
 * Fund strategy plans and factor attribution. A plan is an advisory set of
 * trades generated from the Quant Lab regimes; executing it still goes through
 * the same cash, position and leverage checks as manual fund trades.
 */
import { COMPANIES, getCompany } from '../data/companies.js';
import { positionRows } from '../trading/account.js';
import { unlockedCompanies } from '../market/marketAccess.js';
import { fundBuy, fundSell, fundMetrics } from './fundEngine.js';
import { QUANT_STRATEGIES, strategyRegime } from '../quant/backtestEngine.js';

export const FUND_PLAN_DEFAULT = {
  enabled: false,
  strategyId: 'smaCross',
  params: {
    fast: 20,
    slow: 50,
    rsiPeriod: 14,
    rsiEntry: 30,
    rsiExit: 70,
    lookback: 60,
    threshold: 2,
  },
  topN: 5,
  rebalanceDays: 21,
  cashBuffer: 0.1,
  autoRebalance: false,
  lastPlanDay: null,
  lastAutoDay: null,
  plan: null,
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function planParams(strategyId, params) {
  const strategy = QUANT_STRATEGIES[strategyId] || QUANT_STRATEGIES.smaCross;
  const out = {};
  for (const definition of strategy.params) {
    out[definition.id] = clamp(params?.[definition.id], definition.min, definition.max, definition.default);
  }
  return out;
}

export function normalizeFundPlanConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const strategyId = QUANT_STRATEGIES[source.strategyId] ? source.strategyId : FUND_PLAN_DEFAULT.strategyId;
  const plan = source.plan && typeof source.plan === 'object'
    && Array.isArray(source.plan.trades) && Array.isArray(source.plan.candidates)
    ? source.plan : null;
  return {
    enabled: Boolean(source.enabled),
    strategyId,
    params: planParams(strategyId, source.params),
    topN: Math.round(clamp(source.topN, 2, 10, FUND_PLAN_DEFAULT.topN)),
    rebalanceDays: Math.round(clamp(source.rebalanceDays, 5, 60, FUND_PLAN_DEFAULT.rebalanceDays)),
    cashBuffer: clamp(source.cashBuffer, 0, 0.5, FUND_PLAN_DEFAULT.cashBuffer),
    autoRebalance: Boolean(source.autoRebalance),
    lastPlanDay: source.lastPlanDay === null || source.lastPlanDay === undefined
      ? null
      : (Number.isFinite(Number(source.lastPlanDay)) ? Number(source.lastPlanDay) : null),
    lastAutoDay: source.lastAutoDay === null || source.lastAutoDay === undefined
      ? null
      : (Number.isFinite(Number(source.lastAutoDay)) ? Number(source.lastAutoDay) : null),
    plan,
  };
}

function tradeFee(fund) {
  return fund.employees?.some((employee) => employee.id === 'trader') ? 0.5 : 1;
}

function momentum20(history) {
  const candles = history || [];
  if (candles.length < 2) return 0;
  const last = candles[candles.length - 1].c;
  const base = candles[Math.max(0, candles.length - 21)].c;
  return base > 0 ? ((last / base) - 1) * 100 : 0;
}

/**
 * Build an advisory rebalance plan. It does not mutate the fund; execute it via
 * executeFundPlan so every trade still obeys the normal fund risk checks.
 */
export function buildFundPlan(fund, state, config) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  const cfg = normalizeFundPlanConfig(config || fund.quantPlan);
  const quotes = state.market.quotes;
  const metrics = fundMetrics(fund, state);
  if (!metrics || metrics.nav <= 0) return { ok: false, error: 'fund.errorNoNav' };
  const companies = unlockedCompanies(state);
  const regimes = companies.map((company) => {
    const candles = state.market.history[company.ticker] || [];
    return {
      ticker: company.ticker,
      sector: company.sector,
      regime: strategyRegime(cfg.strategyId, cfg.params, candles),
      momentum: momentum20(candles),
    };
  });
  const ranked = regimes
    .filter((row) => row.regime !== 'sell')
    .sort((a, b) => {
      if (a.regime !== b.regime) return a.regime === 'buy' ? -1 : 1;
      return b.momentum - a.momentum;
    });
  const selected = ranked.slice(0, cfg.topN);
  const cashTarget = Math.min(0.5, Math.max(cfg.cashBuffer, (fund.minCash || 0) + 0.02));
  const targetWeight = Math.min(
    fund.maxPosition || 1,
    (1 - cashTarget) / Math.max(1, selected.length),
  );
  const rows = positionRows(fund.account, quotes);
  const held = new Map(rows.map((row) => [row.ticker, row]));
  const selectedSet = new Set(selected.map((row) => row.ticker));
  const fee = tradeFee(fund);
  let cash = fund.account.cash;
  const trades = [];
  for (const row of rows) {
    if (row.qty <= 0 || selectedSet.has(row.ticker)) continue;
    const quote = quotes[row.ticker];
    if (!quote) continue;
    const qty = row.qty;
    cash += qty * quote.bid - fee;
    trades.push({
      ticker: row.ticker,
      side: 'sell',
      qty,
      price: quote.bid,
      reason: 'rebalance',
    });
  }
  for (const row of selected) {
    const quote = quotes[row.ticker];
    if (!quote) continue;
    const targetValue = metrics.nav * targetWeight;
    const desiredQty = Math.floor(targetValue / quote.ask);
    const existingQty = held.get(row.ticker)?.qty || 0;
    const delta = desiredQty - existingQty;
    if (delta <= 0) continue;
    const affordable = Math.floor((cash - fee) / quote.ask);
    const qty = Math.min(delta, Math.max(0, affordable));
    if (qty <= 0) continue;
    cash -= qty * quote.ask + fee;
    trades.push({
      ticker: row.ticker,
      side: 'buy',
      qty,
      price: quote.ask,
      reason: row.regime === 'buy' ? 'signalBuy' : 'momentum',
    });
  }
  const plan = {
    day: state.market.day,
    strategyId: cfg.strategyId,
    trades,
    candidates: selected.map((row) => ({
      ticker: row.ticker,
      sector: row.sector,
      regime: row.regime,
      momentum: Math.round(row.momentum * 100) / 100,
      targetWeight: Math.round(targetWeight * 10000) / 10000,
    })),
    cashBefore: Math.round(fund.account.cash * 100) / 100,
    expectedCash: Math.round(cash * 100) / 100,
    nav: Math.round(metrics.nav * 100) / 100,
  };
  return { ok: true, plan, config: cfg };
}

/** Executes a plan sequentially; failed legs are reported, not silently dropped. */
export function executeFundPlan(fund, quotes, plan, { day = 0, tick = 0 } = {}) {
  if (!fund || fund.status !== 'active') return { ok: false, error: 'fund.errorNotActive' };
  if (!plan || !Array.isArray(plan.trades) || !plan.trades.length) {
    return { ok: false, error: 'fund.plan.errorEmpty' };
  }
  let next = fund;
  const applied = [];
  const failures = [];
  for (const trade of plan.trades) {
    const args = {
      ticker: trade.ticker,
      qty: trade.qty,
      day,
      tick,
    };
    const result = trade.side === 'sell'
      ? fundSell(next, quotes, args)
      : fundBuy(next, quotes, args);
    if (!result.ok) {
      failures.push({ trade, error: result.error });
      continue;
    }
    next = result.fund;
    applied.push({ ...trade, fillPrice: result.trade?.price || trade.price });
  }
  return {
    ok: applied.length > 0,
    fund: next,
    applied,
    failures,
  };
}

/**
 * Runs one automatic rebalance when the schedule is due. The result always
 * records the attempt day, even when the model has no trades, so the next
 * interval is measured from the last real attempt rather than every tick.
 */
export function autoRebalanceFund(fund, state, day = 0) {
  if (!fund || fund.status !== 'active') {
    return { ok: false, error: 'fund.errorNotActive', executed: false, fund };
  }
  const config = normalizeFundPlanConfig(fund.quantPlan);
  if (!config.enabled || !config.autoRebalance) {
    return { ok: false, skipped: 'disabled', executed: false, fund };
  }
  if (config.lastAutoDay !== null && day - config.lastAutoDay < config.rebalanceDays) {
    return { ok: false, skipped: 'notDue', executed: false, fund };
  }
  const built = buildFundPlan(fund, state, config);
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      executed: false,
      fund: { ...fund, quantPlan: { ...config, lastAutoDay: day } },
    };
  }
  const checked = {
    ...fund,
    quantPlan: { ...config, lastAutoDay: day, lastPlanDay: day, plan: null },
  };
  if (!built.plan.trades.length) {
    return {
      ok: true,
      executed: false,
      skipped: 'aligned',
      fund: checked,
      plan: built.plan,
      applied: [],
      failures: [],
    };
  }
  const run = executeFundPlan(fund, state.market.quotes, built.plan, { day, tick: 0 });
  return {
    ok: run.ok,
    executed: Boolean(run.ok),
    fund: run.ok
      ? {
        ...run.fund,
        quantPlan: { ...config, lastAutoDay: day, lastPlanDay: day, plan: null },
      }
      : checked,
    plan: built.plan,
    applied: run.applied || [],
    failures: run.failures || [],
  };
}

function sectorReturn(state, sector, lookback) {
  const companies = COMPANIES.filter((company) => !company.isEtf && company.sector === sector);
  const returns = [];
  for (const company of companies) {
    const candles = state.market?.history?.[company.ticker] || [];
    if (candles.length < 2) continue;
    const window = candles.slice(-Math.max(2, lookback + 1));
    const first = window[0].c;
    const last = window[window.length - 1].c;
    if (first > 0) returns.push((last / first - 1) * 100);
  }
  return returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
}

/**
 * Simplified factor attribution: beta × benchmark + sector tilt + cash drag +
 * fees, with selection as the residual. Contributions sum to total return.
 */
export function fundAttribution(fund, state) {
  const metrics = fundMetrics(fund, state);
  if (!metrics) return null;
  const quotes = state.market.quotes;
  const nav = metrics.nav > 0 ? metrics.nav : 1;
  const rows = positionRows(fund.account, quotes).filter((row) => row.qty > 0);
  const sectorWeights = {};
  let beta = 0;
  for (const row of rows) {
    const company = getCompany(row.ticker);
    const weight = row.value / nav;
    if (company) {
      beta += weight * (company.beta || 1);
      sectorWeights[company.sector] = (sectorWeights[company.sector] || 0) + weight;
    }
  }
  const cashWeight = fund.account.cash / nav;
  const benchmark = metrics.benchmark;
  const market = beta * benchmark;
  const lookback = 60;
  const sectorRows = COMPANIES.filter((company) => !company.isEtf)
    .reduce((acc, company) => {
      if (!acc.some((row) => row.sector === company.sector)) {
        acc.push({ sector: company.sector, marketCap: 0, returnPct: sectorReturn(state, company.sector, lookback) });
      }
      const row = acc.find((entry) => entry.sector === company.sector);
      const quote = quotes[company.ticker];
      row.marketCap += quote && Number.isFinite(quote.last)
        ? quote.last * company.sharesOutstanding : 0;
      return acc;
    }, [])
    .map((row) => row);
  const totalCap = sectorRows.reduce((sum, row) => sum + row.marketCap, 0) || 1;
  let sector = 0;
  const sectorDetail = sectorRows.map((row) => {
    const portfolioWeight = sectorWeights[row.sector] || 0;
    const benchmarkWeight = row.marketCap / totalCap;
    const contribution = (portfolioWeight - benchmarkWeight) * row.returnPct;
    sector += contribution;
    return {
      sector: row.sector,
      portfolioWeight: portfolioWeight * 100,
      benchmarkWeight: benchmarkWeight * 100,
      returnPct: row.returnPct,
      contribution,
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const cash = cashWeight * (0 - benchmark);
  const fees = fund.initialAum > 0
    ? -((fund.managementFees || 0) + (fund.performanceFees || 0)) / fund.initialAum * 100
    : 0;
  const selection = metrics.totalReturn - market - sector - cash - fees;
  return {
    totalReturn: metrics.totalReturn,
    benchmark,
    alpha: metrics.alpha,
    beta,
    cashWeight: cashWeight * 100,
    contributions: {
      market: Math.round(market * 100) / 100,
      sector: Math.round(sector * 100) / 100,
      cash: Math.round(cash * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      selection: Math.round(selection * 100) / 100,
    },
    sectorRows: sectorDetail.slice(0, 8).map((row) => ({
      ...row,
      portfolioWeight: Math.round(row.portfolioWeight * 10) / 10,
      benchmarkWeight: Math.round(row.benchmarkWeight * 10) / 10,
      returnPct: Math.round(row.returnPct * 10) / 10,
      contribution: Math.round(row.contribution * 100) / 100,
    })),
  };
}
