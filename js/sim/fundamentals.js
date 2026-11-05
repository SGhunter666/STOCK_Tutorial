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
export const SIM_CAPITAL_ACTION_OFFSET = 20; // buyback / offering day within a quarter
export const SIM_STRUCTURAL_ACTION_OFFSET = 45; // merger / spin-off day within a quarter
export const SIM_HALT_OFFSET = 10; // trading-halt start day within a quarter
export const SIM_RIGHTS_OFFSET = 25; // rights issue day within a quarter
export const SIM_BANKRUPTCY_OFFSET = 55; // bankruptcy / delisting day within a quarter

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
  QVAL: [{ quarter: 5, ratio: 0.5 }],
};

const CAPITAL_PLAN = {
  APLA: [{ quarter: 1, type: 'buyback', ratio: 0.02 }, { quarter: 5, type: 'buyback', ratio: 0.02 }],
  MSFY: [{ quarter: 2, type: 'buyback', ratio: 0.015 }, { quarter: 6, type: 'buyback', ratio: 0.015 }],
  JGCH: [{ quarter: 3, type: 'buyback', ratio: 0.02 }],
  TSLO: [{ quarter: 2, type: 'offering', ratio: 0.10 }, { quarter: 6, type: 'offering', ratio: 0.08 }],
  QVAL: [{ quarter: 1, type: 'offering', ratio: 0.15 }, { quarter: 4, type: 'offering', ratio: 0.12 }],
  NCRT: [{ quarter: 3, type: 'offering', ratio: 0.08 }],
  HLXB: [{ quarter: 2, type: 'offering', ratio: 0.12 }],
  NGLB: [{ quarter: 1, type: 'offering', ratio: 0.18 }, { quarter: 5, type: 'offering', ratio: 0.15 }],
};

const STRUCTURAL_PLAN = {
  APLA: [{ quarter: 2, type: 'merger', revenueShare: 0.02, purchaseMultiple: 0.45 }],
  EMBO: [{ quarter: 2, type: 'merger', revenueShare: 0.03, purchaseMultiple: 0.35 }],
  MSFY: [{ quarter: 3, type: 'spinoff', assetShare: 0.10 }],
  NCRT: [{ quarter: 4, type: 'spinoff', assetShare: 0.12 }],
  JGCH: [{ quarter: 5, type: 'merger', revenueShare: 0.015, purchaseMultiple: 0.4 }],
};

const HALT_PLAN = {
  NGLB: [{ quarter: 1, duration: 3 }],
  VCFD: [{ quarter: 2, duration: 2 }],
  TDFU: [{ quarter: 3, duration: 4 }],
};

const RIGHTS_PLAN = {
  NGLB: [{ quarter: 2, ratio: 0.20, discount: 0.85, duration: 5 }],
  QVAL: [{ quarter: 3, ratio: 0.25, discount: 0.80, duration: 5 }],
};

const BANKRUPTCY_PLAN = {
  TDFU: [{ quarter: 4 }],
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

/** Buybacks and offerings are executed on the 20th trading day of a quarter. */
export function isCapitalActionDay(dayIndex) {
  return dayIndex >= SIM_QUARTER_DAYS + SIM_CAPITAL_ACTION_OFFSET
    && (dayIndex - SIM_CAPITAL_ACTION_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function capitalQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_CAPITAL_ACTION_OFFSET) / SIM_QUARTER_DAYS);
}

export function plannedCapitalActionsForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(CAPITAL_PLAN).flatMap(([ticker, actions]) => actions
    .filter((action) => action.quarter === quarter)
    .map((action) => ({ ticker, type: action.type, ratio: action.ratio, quarter })));
}

/** Mergers and spin-offs execute on the 45th trading day of a quarter. */
export function isStructuralActionDay(dayIndex) {
  return dayIndex >= SIM_QUARTER_DAYS + SIM_STRUCTURAL_ACTION_OFFSET
    && (dayIndex - SIM_STRUCTURAL_ACTION_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function structuralQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_STRUCTURAL_ACTION_OFFSET) / SIM_QUARTER_DAYS);
}

export function plannedStructuralActionsForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(STRUCTURAL_PLAN).flatMap(([ticker, actions]) => actions
    .filter((action) => action.quarter === quarter)
    .map((action) => ({ ticker, quarter, ...action })));
}

/** Halts start once per quarter and block trading for `duration` sessions. */
export function isHaltDay(dayIndex) {
  return dayIndex >= SIM_QUARTER_DAYS + SIM_HALT_OFFSET
    && (dayIndex - SIM_HALT_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function haltQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_HALT_OFFSET) / SIM_QUARTER_DAYS);
}

export function plannedHaltsForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(HALT_PLAN).flatMap(([ticker, halts]) => halts
    .filter((halt) => halt.quarter === quarter)
    .map((halt) => ({ ticker, quarter, duration: halt.duration })));
}

/** Rights issues open on the 25th trading day of a quarter. */
export function isRightsDay(dayIndex) {
  return dayIndex >= SIM_QUARTER_DAYS + SIM_RIGHTS_OFFSET
    && (dayIndex - SIM_RIGHTS_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function rightsQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_RIGHTS_OFFSET) / SIM_QUARTER_DAYS);
}

export function plannedRightsForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(RIGHTS_PLAN).flatMap(([ticker, offers]) => offers
    .filter((offer) => offer.quarter === quarter)
    .map((offer) => ({ ticker, quarter, ...offer })));
}

/** Bankruptcy / delisting executes on the 55th trading day of a quarter. */
export function isBankruptcyDay(dayIndex) {
  return dayIndex >= SIM_QUARTER_DAYS + SIM_BANKRUPTCY_OFFSET
    && (dayIndex - SIM_BANKRUPTCY_OFFSET) % SIM_QUARTER_DAYS === 0;
}

export function bankruptcyQuarterForDay(dayIndex) {
  return Math.floor((dayIndex - SIM_BANKRUPTCY_OFFSET) / SIM_QUARTER_DAYS);
}

export function plannedBankruptciesForQuarter(quarter) {
  if (quarter <= 0) return [];
  return Object.entries(BANKRUPTCY_PLAN).flatMap(([ticker, events]) => events
    .filter((event) => event.quarter === quarter)
    .map((event) => ({ ticker, quarter })));
}

/**
 * Applies executed buybacks / offerings to a report. Totals stay internally
 * consistent: cash, total assets and equity move by the same cash delta while
 * financing cash flow and net cash change absorb the same amount. Per-share
 * values use the adjusted share count.
 */
export function adjustReportForCapitalActions(report, actions = []) {
  if (!report || !actions.length) return report;
  const shareFactor = actions.reduce(
    (factor, action) => factor * (Number.isFinite(action.shareFactor) ? action.shareFactor : 1),
    1,
  );
  const cashDelta = actions.reduce((sum, action) => sum + (action.cashDelta || 0), 0);
  const periodCashDelta = actions
    .filter((action) => action.quarter === report.quarter)
    .reduce((sum, action) => sum + (action.cashDelta || 0), 0);
  if (Math.abs(shareFactor - 1) < 1e-9 && Math.abs(cashDelta) < 1e-9) return report;
  const shares = report.income.sharesOutstanding * shareFactor;
  const cash = report.balance.cash + cashDelta;
  const assets = report.balance.totalAssets + cashDelta;
  const equity = report.balance.equity + cashDelta;
  const netIncome = report.income.netIncome;
  return {
    ...report,
    capitalAdjustment: {
      shareFactor: round(shareFactor, 6),
      cashDelta: round(cashDelta),
    },
    income: {
      ...report.income,
      sharesOutstanding: round(shares),
      eps: round(netIncome / Math.max(1e-9, shares), 4),
    },
    balance: {
      ...report.balance,
      cash: round(cash),
      totalAssets: round(assets),
      equity: round(equity),
    },
    cashFlow: {
      ...report.cashFlow,
      financingCashFlow: round(report.cashFlow.financingCashFlow + periodCashDelta),
      netChange: round(report.cashFlow.netChange + periodCashDelta),
    },
    ratios: {
      ...report.ratios,
      roe: round(netIncome / Math.max(1, equity), 4),
      bookValuePerShare: round(equity / Math.max(1e-9, shares), 4),
    },
  };
}

/**
 * Applies mergers and spin-offs to a released quarter. Balance-sheet changes
 * are one-time and cumulative; the acquired / divested business contributes to
 * revenue and earnings from the action quarter onward. Recurring net income is
 * mirrored into cash and equity so the balance identity and cash-flow tie hold.
 */
export function adjustReportForStructuralActions(report, actions = []) {
  if (!report || !actions.length) return report;
  const income = { ...report.income };
  const balance = { ...report.balance };
  const cashFlow = { ...report.cashFlow };
  let changed = false;
  for (const action of actions) {
    if (action.day <= report.reportDay) {
      balance.cash += action.cashDelta || 0;
      balance.ppe += action.ppeDelta || 0;
      balance.debt += action.debtDelta || 0;
      balance.otherLiabilities += action.otherLiabilitiesDelta || 0;
      if (action.quarter === report.quarter) {
        cashFlow.investingCashFlow += action.investingDelta || 0;
        cashFlow.financingCashFlow += action.financingDelta || 0;
      }
      changed = true;
    }
    const elapsed = report.quarter - action.quarter;
    if (elapsed >= 0) {
      const revenueDelta = action.revenueDelta || 0;
      const cogsDelta = action.cogsDelta || 0;
      const operatingExpensesDelta = action.operatingExpensesDelta || 0;
      const interestDelta = action.interestDelta || 0;
      const grossDelta = revenueDelta - cogsDelta;
      const operatingDelta = grossDelta - operatingExpensesDelta;
      const pretaxDelta = operatingDelta - interestDelta;
      const taxDelta = Math.max(0, pretaxDelta) * 0.21;
      const netDelta = pretaxDelta - taxDelta;
      income.revenue += revenueDelta;
      income.cogs += cogsDelta;
      income.operatingExpenses += operatingExpensesDelta;
      income.interestExpense += interestDelta;
      balance.cash += netDelta * (elapsed + 1);
      cashFlow.operatingCashFlow += netDelta;
      changed = true;
    }
  }
  if (!changed) return report;

  const revenue = income.revenue;
  const cogs = income.cogs;
  const grossProfit = revenue - cogs;
  const operatingExpenses = income.operatingExpenses;
  const operatingIncome = grossProfit - operatingExpenses;
  const interestExpense = income.interestExpense;
  const pretaxIncome = operatingIncome - interestExpense;
  const taxExpense = Math.max(0, pretaxIncome) * 0.21;
  const netIncome = pretaxIncome - taxExpense;
  const totalAssets = balance.cash + balance.receivables + balance.inventory + balance.ppe;
  const totalLiabilities = balance.debt + balance.otherLiabilities;
  const equity = totalAssets - totalLiabilities;
  const shares = income.sharesOutstanding;
  const operatingCashFlow = cashFlow.operatingCashFlow;
  const capex = cashFlow.capex;
  const investingCashFlow = cashFlow.investingCashFlow;
  const financingCashFlow = cashFlow.financingCashFlow;
  return {
    ...report,
    structuralAdjustment: { count: actions.length },
    income: {
      ...income,
      revenue: round(revenue),
      cogs: round(cogs),
      grossProfit: round(grossProfit),
      operatingExpenses: round(operatingExpenses),
      operatingIncome: round(operatingIncome),
      interestExpense: round(interestExpense),
      pretaxIncome: round(pretaxIncome),
      taxExpense: round(taxExpense),
      netIncome: round(netIncome),
      eps: round(netIncome / Math.max(1e-9, shares), 4),
    },
    balance: {
      ...balance,
      cash: round(balance.cash),
      ppe: round(balance.ppe),
      debt: round(balance.debt),
      otherLiabilities: round(balance.otherLiabilities),
      totalAssets: round(totalAssets),
      totalLiabilities: round(totalLiabilities),
      equity: round(equity),
    },
    cashFlow: {
      ...cashFlow,
      operatingCashFlow: round(operatingCashFlow),
      investingCashFlow: round(investingCashFlow),
      financingCashFlow: round(financingCashFlow),
      netChange: round(operatingCashFlow + investingCashFlow + financingCashFlow),
      freeCashFlow: round(operatingCashFlow - capex),
    },
    ratios: {
      ...report.ratios,
      grossMargin: round(grossProfit / Math.max(1e-9, revenue), 4),
      operatingMargin: round(operatingIncome / Math.max(1e-9, revenue), 4),
      netMargin: round(netIncome / Math.max(1e-9, revenue), 4),
      roe: round(netIncome / Math.max(1, equity), 4),
      debtToEquity: round(totalLiabilities / Math.max(1, equity), 4),
      bookValuePerShare: round(equity / Math.max(1e-9, shares), 4),
    },
  };
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
