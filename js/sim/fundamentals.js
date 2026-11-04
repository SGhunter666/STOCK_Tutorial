/**
 * Phase 4 company fundamentals: deterministic quarterly statements, report
 * releases, dividends and planned splits for the fictional exchange.
 *
 * All statements are generated locally from each company's static base data.
 * The model is deliberately simplified but keeps the balance sheet identity
 * (assets = liabilities + equity) and ties the cash-flow statement to the cash
 * balance. Reports are only visible after their release day.
 */
import { dateForTradingDay } from '../market/calendar.js';
import { hashSeed } from '../core/rng.js';

export const SIM_QUARTER_DAYS = 63; // 252 trading days / 4
export const SIM_REPORT_LAG_DAYS = 14;
export const SIM_FIRST_REPORT_QUARTER = -8;
export const SIM_LAST_REPORT_QUARTER = 40;
export const SIM_GUIDANCE_OFFSET = 35; // mid-quarter guidance day

const GROWTH_BY_STAGE = {
  early: 0.018,
  highGrowth: 0.026,
  growth: 0.017,
  turnaround: -0.004,
  mature: 0.007,
};

const SPLIT_PLAN = {
  APLA: [{ quarter: 6, ratio: 4 }],
  NVDO: [{ quarter: 3, ratio: 2 }],
  TSLO: [{ quarter: 4, ratio: 3 }],
  METO: [{ quarter: 5, ratio: 2 }],
  NCRT: [{ quarter: 2, ratio: 2 }],
  VCFD: [{ quarter: 6, ratio: 2 }],
};

const SERIES_CACHE = new Map();

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function isoDate(dayIndex) {
  return dateForTradingDay(dayIndex).toISOString().slice(0, 10);
}

function phaseFor(ticker, salt = 0) {
  return (hashSeed(`${ticker}:${salt}`) % 6283) / 1000;
}

export function quarterEndDay(quarter) {
  return quarter * SIM_QUARTER_DAYS + SIM_QUARTER_DAYS - 1;
}

export function reportDayForQuarter(quarter) {
  return (quarter + 1) * SIM_QUARTER_DAYS + SIM_REPORT_LAG_DAYS;
}

/** Latest quarter whose report has been released at `dayIndex`. */
export function reportQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_REPORT_LAG_DAYS) / SIM_QUARTER_DAYS) - 1;
}

export function quarterForDay(dayIndex) {
  return Math.floor(dayIndex / SIM_QUARTER_DAYS);
}

export function quarterLabel(quarter) {
  const date = dateForTradingDay(quarterEndDay(quarter));
  const year = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year} Q${q}`;
}

export function splitPlanForTicker(ticker) {
  return SPLIT_PLAN[ticker] || [];
}

/** Cumulative split factor applied to a ticker on or before `dayIndex`. */
export function splitFactorThrough(ticker, dayIndex) {
  return splitPlanForTicker(ticker).reduce((factor, split) => (
    split.quarter * SIM_QUARTER_DAYS <= dayIndex ? factor * split.ratio : factor
  ), 1);
}

/** Splits scheduled for the first session of a quarter. */
export function plannedSplitsForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(SPLIT_PLAN).flatMap(([ticker, splits]) => splits
    .filter((split) => split.quarter === quarter)
    .map((split) => ({ ticker, ratio: split.ratio, quarter })));
}

/** Dividend ex-date: first session after each completed quarter. */
export function isDividendDay(dayIndex) {
  return dayIndex > 0 && dayIndex % SIM_QUARTER_DAYS === 0;
}

export function dividendQuarterForDay(dayIndex) {
  return Math.floor(dayIndex / SIM_QUARTER_DAYS) - 1;
}

/** Guidance is published once per quarter, 35 days into the period. */
export function isGuidanceDay(dayIndex) {
  return dayIndex >= SIM_GUIDANCE_OFFSET
    && (dayIndex - SIM_GUIDANCE_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function guidanceQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_GUIDANCE_OFFSET) / SIM_QUARTER_DAYS);
}

function baseSeries(company) {
  const cached = SERIES_CACHE.get(company.ticker);
  if (cached) return cached;
  const shares = company.shares;
  const annualRevenue = company.revenue;
  const q0Revenue = annualRevenue / 4;
  const growth = GROWTH_BY_STAGE[company.stage] || 0.006;
  const grossMarginBase = company.financials.grossProfit / annualRevenue;
  const operatingMarginBase = company.financials.operatingIncome / annualRevenue;
  const annualDps = company.financials.dividendPerShare;
  const phaseA = phaseFor(company.ticker, 'revenue');
  const phaseB = phaseFor(company.ticker, 'margin');
  const startQuarter = SIM_FIRST_REPORT_QUARTER;

  let equity = company.financials.equity * (1.02 ** startQuarter);
  let debt = company.financials.totalLiabilities * 0.55 * (1.01 ** startQuarter);
  let otherLiabilities = company.financials.totalLiabilities * 0.45 * (1.01 ** startQuarter);
  let liabilities = debt + otherLiabilities;
  let assets = equity + liabilities;
  let cash = assets * Math.max(0.08, Math.min(0.3,
    company.financials.cash / Math.max(1, company.financials.totalAssets)));

  const series = new Map();
  for (let quarter = startQuarter; quarter <= SIM_LAST_REPORT_QUARTER; quarter += 1) {
    const seasonal = 1 + 0.02 * Math.sin((quarter + 3) * 1.7 + phaseA);
    const revenue = q0Revenue * ((1 + growth) ** quarter) * seasonal;
    const marginCycle = 0.008 * Math.sin((quarter + 1) * 0.9 + phaseB);
    const grossProfit = revenue * (grossMarginBase + marginCycle);
    const operatingIncome = revenue * (operatingMarginBase + marginCycle * 0.5);
    const interestExpense = debt * 0.04 / 4;
    const pretaxIncome = operatingIncome - interestExpense;
    const taxExpense = Math.max(0, pretaxIncome) * 0.21;
    const netIncome = pretaxIncome - taxExpense;
    const annualDividendPerShare = Math.max(0, annualDps * (1.01 ** quarter));
    const dividendsPaid = annualDividendPerShare / 4 * shares;
    const debtIssuance = debt * 0.005;

    equity = Math.max(1, equity + netIncome - dividendsPaid);
    debt += debtIssuance;
    otherLiabilities *= 1.006;
    liabilities = debt + otherLiabilities;
    assets = equity + liabilities;

    const operatingCashFlow = netIncome * 1.2 + revenue * 0.02;
    const capex = revenue * 0.055;
    const priorCash = cash;
    const targetCash = Math.min(assets * 0.35,
      Math.max(assets * 0.05, priorCash + operatingCashFlow - capex - dividendsPaid));
    cash = targetCash;
    const financing = cash - priorCash - operatingCashFlow + capex;
    const netChange = cash - priorCash;
    const otherAssets = Math.max(0, assets - cash);
    const receivables = otherAssets * 0.24;
    const inventory = otherAssets * 0.22;
    const ppe = otherAssets - receivables - inventory;

    const report = {
      ticker: company.ticker,
      quarter,
      periodLabel: quarterLabel(quarter),
      periodStart: isoDate(quarter * SIM_QUARTER_DAYS),
      periodEnd: isoDate(quarterEndDay(quarter)),
      reportDay: reportDayForQuarter(quarter),
      reportDate: isoDate(reportDayForQuarter(quarter)),
      income: {
        revenue: round(revenue),
        cogs: round(revenue - grossProfit),
        grossProfit: round(grossProfit),
        operatingExpenses: round(grossProfit - operatingIncome),
        operatingIncome: round(operatingIncome),
        interestExpense: round(interestExpense),
        pretaxIncome: round(pretaxIncome),
        taxExpense: round(taxExpense),
        netIncome: round(netIncome),
        eps: round(netIncome / shares, 4),
        sharesOutstanding: shares,
        dividendsPaid: round(dividendsPaid),
      },
      balance: {
        cash: round(cash),
        receivables: round(receivables),
        inventory: round(inventory),
        ppe: round(ppe),
        totalAssets: round(assets),
        debt: round(debt),
        otherLiabilities: round(otherLiabilities),
        totalLiabilities: round(liabilities),
        equity: round(equity),
      },
      cashFlow: {
        operatingCashFlow: round(operatingCashFlow),
        capex: round(capex),
        investingCashFlow: round(-capex),
        financingCashFlow: round(financing),
        debtIssuance: round(debtIssuance),
        dividendsPaid: round(dividendsPaid),
        netChange: round(netChange),
        freeCashFlow: round(operatingCashFlow - capex),
      },
      ratios: {
        grossMargin: round(grossProfit / revenue, 4),
        operatingMargin: round(operatingIncome / revenue, 4),
        netMargin: round(netIncome / revenue, 4),
        roe: round(netIncome / Math.max(1, equity), 4),
        debtToEquity: round(liabilities / Math.max(1, equity), 4),
        bookValuePerShare: round(equity / shares, 4),
        annualDividendPerShare: round(annualDividendPerShare, 4),
        quarterlyDividendPerShare: round(annualDividendPerShare / 4, 4),
      },
    };
    series.set(quarter, report);
  }
  SERIES_CACHE.set(company.ticker, series);
  return series;
}

/**
 * Returns a quarter report adjusted for splits that happened before its
 * release date. Per-share values change; totals stay the same.
 */
export function getQuarterReport(company, quarter) {
  if (quarter < SIM_FIRST_REPORT_QUARTER || quarter > SIM_LAST_REPORT_QUARTER) return null;
  const base = baseSeries(company).get(quarter);
  if (!base) return null;
  const factor = splitFactorThrough(company.ticker, base.reportDay);
  const adjustedShares = base.income.sharesOutstanding * factor;
  return {
    ...base,
    splitFactor: factor,
    sharesOutstanding: adjustedShares,
    income: {
      ...base.income,
      sharesOutstanding: adjustedShares,
      eps: round(base.income.netIncome / adjustedShares, 4),
    },
    ratios: {
      ...base.ratios,
      bookValuePerShare: round(base.balance.equity / adjustedShares, 4),
      annualDividendPerShare: round(base.ratios.annualDividendPerShare / factor, 4),
      quarterlyDividendPerShare: round(base.ratios.quarterlyDividendPerShare / factor, 4),
    },
  };
}

/** Latest report visible at `dayIndex`; never returns a future report. */
export function latestReportForDay(company, dayIndex) {
  const quarter = reportQuarterForDay(dayIndex);
  if (quarter < SIM_FIRST_REPORT_QUARTER || quarter > SIM_LAST_REPORT_QUARTER) return null;
  const report = getQuarterReport(company, quarter);
  return report && report.reportDay <= dayIndex ? report : null;
}

export function reportHistoryForDay(company, dayIndex, count = 4) {
  const latest = reportQuarterForDay(dayIndex);
  const reports = [];
  for (let quarter = latest; quarter >= SIM_FIRST_REPORT_QUARTER && reports.length < count; quarter -= 1) {
    const report = getQuarterReport(company, quarter);
    if (report && report.reportDay <= dayIndex) reports.push(report);
  }
  return reports;
}

/** Expected EPS used for the deterministic earnings surprise. */
export function expectedEps(company, quarter) {
  const prior = getQuarterReport(company, quarter - 1);
  if (!prior) return 0;
  const currentFactor = splitFactorThrough(company.ticker, reportDayForQuarter(quarter));
  return prior.income.eps * (prior.splitFactor / currentFactor);
}
