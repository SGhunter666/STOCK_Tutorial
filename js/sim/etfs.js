/**
 * Phase 5 tradable ETFs for the simulated exchange. Each fund is a weighted
 * basket of the 50 fictional stocks, so its NAV follows component prices
 * instead of being driven by an independent company model.
 */
import { SIM_COMPANY_BY_TICKER } from './companies50.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const SIM_ETFS = Object.freeze([
  {
    ticker: 'MKT',
    name: 'Sim Broad Market ETF',
    startPrice: 100,
    avgVolume: 9_000_000,
    spread: 2,
    impact: 0.35,
    beta: 1,
    vol: 0.011,
    sharesOutstanding: 80_000_000,
    expenseRatio: 0.08,
    components: [
      { ticker: 'APLA', weight: 0.10 },
      { ticker: 'MSFY', weight: 0.08 },
      { ticker: 'NVDO', weight: 0.08 },
      { ticker: 'AMEZ', weight: 0.08 },
      { ticker: 'TSLO', weight: 0.07 },
      { ticker: 'GOGL', weight: 0.08 },
      { ticker: 'PPLL', weight: 0.08 },
      { ticker: 'NGRD', weight: 0.07 },
      { ticker: 'HLXB', weight: 0.07 },
      { ticker: 'RDSM', weight: 0.07 },
      { ticker: 'SPMN', weight: 0.07 },
      { ticker: 'SCRL', weight: 0.06 },
      { ticker: 'SLDY', weight: 0.06 },
      { ticker: 'MTLK', weight: 0.05 },
    ],
  },
  {
    ticker: 'TECH',
    name: 'Innovation Leaders ETF',
    startPrice: 75,
    avgVolume: 5_500_000,
    spread: 3,
    impact: 0.45,
    beta: 1.3,
    vol: 0.020,
    sharesOutstanding: 45_000_000,
    expenseRatio: 0.12,
    components: [
      { ticker: 'APLA', weight: 0.15 },
      { ticker: 'MSFY', weight: 0.12 },
      { ticker: 'NVDO', weight: 0.12 },
      { ticker: 'NCRT', weight: 0.11 },
      { ticker: 'QVAL', weight: 0.10 },
      { ticker: 'VCFD', weight: 0.10 },
      { ticker: 'ADBA', weight: 0.08 },
      { ticker: 'INTL', weight: 0.08 },
      { ticker: 'ORCO', weight: 0.08 },
      { ticker: 'SFSE', weight: 0.06 },
    ],
  },
  {
    ticker: 'DIV',
    name: 'Dividend Income ETF',
    startPrice: 40,
    avgVolume: 3_800_000,
    spread: 2,
    impact: 0.3,
    beta: 0.8,
    vol: 0.010,
    sharesOutstanding: 35_000_000,
    expenseRatio: 0.15,
    components: [
      { ticker: 'NGRD', weight: 0.16 },
      { ticker: 'TWUT', weight: 0.14 },
      { ticker: 'PPLL', weight: 0.12 },
      { ticker: 'VISO', weight: 0.10 },
      { ticker: 'AMEZ', weight: 0.10 },
      { ticker: 'WMRT', weight: 0.09 },
      { ticker: 'CCLA', weight: 0.08 },
      { ticker: 'SPMN', weight: 0.08 },
      { ticker: 'MTLK', weight: 0.07 },
      { ticker: 'SCRL', weight: 0.06 },
    ],
  },
  {
    ticker: 'SMAL',
    name: 'Small Cap Growth ETF',
    startPrice: 55,
    avgVolume: 2_800_000,
    spread: 4,
    impact: 0.55,
    beta: 1.2,
    vol: 0.025,
    sharesOutstanding: 28_000_000,
    expenseRatio: 0.18,
    components: [
      { ticker: 'NCRT', weight: 0.12 },
      { ticker: 'QVAL', weight: 0.12 },
      { ticker: 'VCFD', weight: 0.12 },
      { ticker: 'SNAR', weight: 0.12 },
      { ticker: 'BRBY', weight: 0.10 },
      { ticker: 'TDFU', weight: 0.10 },
      { ticker: 'NGLB', weight: 0.08 },
      { ticker: 'ARCR', weight: 0.08 },
      { ticker: 'IGLG', weight: 0.08 },
      { ticker: 'SPMN', weight: 0.08 },
    ],
  },
]);

export const SIM_ETF_TICKERS = Object.freeze(SIM_ETFS.map((etf) => etf.ticker));
export const SIM_ETF_BY_TICKER = Object.freeze(
  Object.fromEntries(SIM_ETFS.map((etf) => [etf.ticker, etf])),
);

function companyFromEtf(etf) {
  return {
    ticker: etf.ticker,
    name: etf.name,
    sector: 'etf',
    origin: 'etf',
    referenceOf: '',
    isEtf: true,
    price: etf.startPrice,
    startPrice: etf.startPrice,
    shares: etf.sharesOutstanding,
    sharesOutstanding: etf.sharesOutstanding,
    bvps: etf.startPrice,
    beta: etf.beta,
    vol: etf.vol,
    revenue: 0,
    margin: 0,
    div: 0,
    avgVolume: etf.avgVolume,
    spread: etf.spread,
    impact: etf.impact,
    stage: 'mature',
    risk: 'low',
    liquidity: 'deep',
    listed: '2020-01-02',
    sectorCorrelation: 0.9,
    institutionalOwnership: 0.7,
    retailParticipation: 0.3,
    priceImpactCoefficient: etf.impact,
    expenseRatio: etf.expenseRatio,
    components: etf.components,
    marketCap: etf.startPrice * etf.sharesOutstanding,
    financials: {
      revenue: 0,
      grossProfit: 0,
      operatingIncome: 0,
      netIncome: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      equity: 0,
      cash: 0,
      debt: 0,
      operatingCashFlow: 0,
      investingCashFlow: 0,
      financingCashFlow: 0,
      freeCashFlow: 0,
      capex: 0,
      eps: 0,
      roe: 0,
      roic: 0,
      pe: null,
      pb: null,
      dividendPerShare: 0,
      buybackPolicy: 'none',
      dividendPolicy: 'none',
    },
    risks: ['trackingError'],
    description: `${etf.name} is a fictional ETF that tracks a weighted basket of simulated companies.`,
  };
}

export const SIM_ETF_INSTRUMENTS = Object.freeze(SIM_ETFS.map(companyFromEtf));

/** Current NAV in fund-share terms, anchored to the fund's start price. */
export function etfNav(state, etf) {
  const def = typeof etf === 'string' ? SIM_ETF_BY_TICKER[etf] : etf;
  if (!def) return 0;
  let basketReturn = 0;
  for (const component of def.components) {
    const live = state.companies[component.ticker];
    const base = SIM_COMPANY_BY_TICKER[component.ticker]?.price || 1;
    const split = live?.splitFactor || 1;
    const adjusted = (live ? live.last : base) * split;
    basketReturn += component.weight * adjusted / base;
  }
  const startPrice = Number.isFinite(def.startPrice) ? def.startPrice : def.price;
  return round(Math.max(0.01, startPrice * basketReturn), 2);
}

export function etfHoldingsRows(state, etf) {
  const def = typeof etf === 'string' ? SIM_ETF_BY_TICKER[etf] : etf;
  if (!def) return [];
  return def.components.map((component) => {
    const company = SIM_COMPANY_BY_TICKER[component.ticker];
    const quote = state.quotes[component.ticker];
    const last = quote?.last || company?.price || 0;
    const base = company?.price || 1;
    const split = state.companies[component.ticker]?.splitFactor || 1;
    const adjusted = last * split;
    return {
      ticker: component.ticker,
      name: company?.name || component.ticker,
      weight: component.weight,
      last: round(last, 2),
      changePct: round((adjusted / base - 1) * 100, 2),
      contribution: round(component.weight * (adjusted / base - 1) * 100, 2),
    };
  });
}
