/**
 * Phase 1 fictional universe: exactly 50 listed companies.
 * 20 names are inspired by well-known business models; 30 are wholly original.
 * No real prices, filings, news or securities data are used.
 */

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const SECTOR_RISKS = {
  technology: ['productCycle', 'competition'],
  communication: ['adSpend', 'regulation'],
  consumer: ['demandCycle', 'competition'],
  financials: ['creditCycle', 'regulation'],
  healthcare: ['trialFailure', 'reimbursement'],
  energy: ['commodityPrice', 'regulation'],
  industrials: ['supplyChain', 'cycle'],
  utilities: ['rateRegulation', 'capex'],
  materials: ['commodityPrice', 'environment'],
  realestate: ['interestRate', 'occupancy'],
  telecom: ['capex', 'competition'],
};

const DEFINITIONS = [
  // ----------------------- 20 reference-inspired names -----------------------
  { ticker: 'APLA', name: 'Appla', sector: 'technology', origin: 'reference', referenceOf: 'Apple', price: 182, shares: 15.2e9, bvps: 4.9, beta: 1.15, vol: 0.018, revenue: 391e9, margin: 0.24, div: 0.005, avgVolume: 55e6, spread: 2, impact: 0.6, stage: 'mature', risk: 'low', liquidity: 'deep', listed: '1990-01-02' },
  { ticker: 'AMEZ', name: 'Amezon', sector: 'consumer', origin: 'reference', referenceOf: 'Amazon', price: 178, shares: 10.4e9, bvps: 18.5, beta: 1.25, vol: 0.022, revenue: 610e9, margin: 0.07, div: 0, avgVolume: 45e6, spread: 2, impact: 0.8, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '1997-05-15' },
  { ticker: 'MSFY', name: 'Microsofy', sector: 'technology', origin: 'reference', referenceOf: 'Microsoft', price: 420, shares: 7.4e9, bvps: 35, beta: 1.05, vol: 0.017, revenue: 245e9, margin: 0.36, div: 0.008, avgVolume: 25e6, spread: 2, impact: 0.5, stage: 'mature', risk: 'low', liquidity: 'deep', listed: '1986-03-13' },
  { ticker: 'NVDO', name: 'Nvidio', sector: 'technology', origin: 'reference', referenceOf: 'NVIDIA', price: 125, shares: 24.6e9, bvps: 2.2, beta: 1.65, vol: 0.032, revenue: 130e9, margin: 0.55, div: 0.001, avgVolume: 50e6, spread: 3, impact: 1.2, stage: 'highGrowth', risk: 'high', liquidity: 'deep', listed: '1999-01-22' },
  { ticker: 'TSLO', name: 'Teslo', sector: 'consumer', origin: 'reference', referenceOf: 'Tesla', price: 245, shares: 3.2e9, bvps: 22, beta: 1.9, vol: 0.038, revenue: 96e9, margin: 0.12, div: 0, avgVolume: 90e6, spread: 3, impact: 1.5, stage: 'highGrowth', risk: 'high', liquidity: 'deep', listed: '2010-06-29' },
  { ticker: 'GOGL', name: 'Googel', sector: 'communication', origin: 'reference', referenceOf: 'Google', price: 165, shares: 12.1e9, bvps: 25, beta: 1.1, vol: 0.02, revenue: 330e9, margin: 0.26, div: 0.008, avgVolume: 28e6, spread: 2, impact: 0.6, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '2004-08-19' },
  { ticker: 'METO', name: 'Meto', sector: 'communication', origin: 'reference', referenceOf: 'Meta', price: 510, shares: 2.55e9, bvps: 65, beta: 1.3, vol: 0.026, revenue: 165e9, margin: 0.3, div: 0.005, avgVolume: 18e6, spread: 3, impact: 0.9, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '2012-05-18' },
  { ticker: 'NTFX', name: 'Netflox', sector: 'communication', origin: 'reference', referenceOf: 'Netflix', price: 620, shares: 0.43e9, bvps: 45, beta: 1.25, vol: 0.028, revenue: 39e9, margin: 0.16, div: 0, avgVolume: 5e6, spread: 4, impact: 1.0, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2002-05-23' },
  { ticker: 'ADBA', name: 'Adoba', sector: 'technology', origin: 'reference', referenceOf: 'Adobe', price: 480, shares: 0.45e9, bvps: 32, beta: 1.2, vol: 0.024, revenue: 21e9, margin: 0.3, div: 0, avgVolume: 3e6, spread: 4, impact: 1.0, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '1986-08-20' },
  { ticker: 'INTL', name: 'Intal', sector: 'technology', origin: 'reference', referenceOf: 'Intel', price: 28, shares: 4.2e9, bvps: 20, beta: 1.15, vol: 0.028, revenue: 54e9, margin: 0.05, div: 0.015, avgVolume: 35e6, spread: 3, impact: 1.1, stage: 'turnaround', risk: 'high', liquidity: 'deep', listed: '1971-10-13' },
  { ticker: 'ORCO', name: 'Oraclo', sector: 'technology', origin: 'reference', referenceOf: 'Oracle', price: 135, shares: 2.7e9, bvps: 12, beta: 1.0, vol: 0.02, revenue: 53e9, margin: 0.18, div: 0.01, avgVolume: 8e6, spread: 2, impact: 0.7, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '1986-03-12' },
  { ticker: 'SFSE', name: 'Salesforse', sector: 'technology', origin: 'reference', referenceOf: 'Salesforce', price: 280, shares: 0.98e9, bvps: 40, beta: 1.35, vol: 0.028, revenue: 38e9, margin: 0.12, div: 0, avgVolume: 6e6, spread: 3, impact: 0.9, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2004-06-23' },
  { ticker: 'SHFY', name: 'Shopifly', sector: 'technology', origin: 'reference', referenceOf: 'Shopify', price: 95, shares: 1.29e9, bvps: 9, beta: 1.5, vol: 0.035, revenue: 8e9, margin: 0.12, div: 0, avgVolume: 9e6, spread: 4, impact: 1.2, stage: 'highGrowth', risk: 'high', liquidity: 'normal', listed: '2015-05-21' },
  { ticker: 'PPLL', name: 'Paypall', sector: 'financials', origin: 'reference', referenceOf: 'PayPal', price: 72, shares: 1.05e9, bvps: 18, beta: 1.2, vol: 0.026, revenue: 30e9, margin: 0.15, div: 0, avgVolume: 12e6, spread: 3, impact: 1.0, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '2015-07-20' },
  { ticker: 'VISO', name: 'Viso', sector: 'financials', origin: 'reference', referenceOf: 'Visa', price: 290, shares: 1.9e9, bvps: 20, beta: 0.95, vol: 0.016, revenue: 36e9, margin: 0.55, div: 0.018, avgVolume: 7e6, spread: 2, impact: 0.5, stage: 'mature', risk: 'low', liquidity: 'deep', listed: '2008-03-19' },
  { ticker: 'MCCD', name: 'Mastercad', sector: 'financials', origin: 'reference', referenceOf: 'Mastercard', price: 490, shares: 0.92e9, bvps: 25, beta: 1.0, vol: 0.017, revenue: 28e9, margin: 0.45, div: 0.006, avgVolume: 3e6, spread: 3, impact: 0.6, stage: 'mature', risk: 'low', liquidity: 'normal', listed: '2006-05-25' },
  { ticker: 'JGCH', name: 'Jorgan Chase', sector: 'financials', origin: 'reference', referenceOf: 'JPMorgan Chase', price: 230, shares: 2.9e9, bvps: 110, beta: 1.1, vol: 0.02, revenue: 160e9, margin: 0.28, div: 0.025, avgVolume: 10e6, spread: 2, impact: 0.7, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '1969-01-02' },
  { ticker: 'CCLA', name: 'Coca-Coola', sector: 'consumer', origin: 'reference', referenceOf: 'Coca-Cola', price: 62, shares: 4.3e9, bvps: 12, beta: 0.65, vol: 0.013, revenue: 46e9, margin: 0.23, div: 0.03, avgVolume: 14e6, spread: 2, impact: 0.4, stage: 'mature', risk: 'low', liquidity: 'deep', listed: '1919-09-05' },
  { ticker: 'WMRT', name: 'Walmort', sector: 'consumer', origin: 'reference', referenceOf: 'Walmart', price: 82, shares: 8.1e9, bvps: 28, beta: 0.7, vol: 0.014, revenue: 650e9, margin: 0.025, div: 0.012, avgVolume: 20e6, spread: 2, impact: 0.5, stage: 'mature', risk: 'low', liquidity: 'deep', listed: '1970-10-01' },
  { ticker: 'DSNX', name: 'Disnex', sector: 'communication', origin: 'reference', referenceOf: 'Disney', price: 105, shares: 1.8e9, bvps: 55, beta: 1.1, vol: 0.022, revenue: 89e9, margin: 0.08, div: 0.008, avgVolume: 11e6, spread: 2, impact: 0.7, stage: 'mature', risk: 'medium', liquidity: 'deep', listed: '1957-11-12' },

  // ------------------------- 30 wholly original names ------------------------
  { ticker: 'NCRT', name: 'NeuralCore Technologies', sector: 'technology', origin: 'original', referenceOf: '', price: 88, shares: 0.32e9, bvps: 12, beta: 1.7, vol: 0.04, revenue: 4.2e9, margin: 0.18, div: 0, avgVolume: 6e6, spread: 4, impact: 1.4, stage: 'highGrowth', risk: 'high', liquidity: 'normal', listed: '2018-04-12' },
  { ticker: 'QVAL', name: 'QuantumVale', sector: 'technology', origin: 'original', referenceOf: '', price: 46, shares: 0.18e9, bvps: 7, beta: 1.8, vol: 0.045, revenue: 0.8e9, margin: -0.05, div: 0, avgVolume: 3e6, spread: 6, impact: 1.8, stage: 'early', risk: 'veryHigh', liquidity: 'thin', listed: '2021-02-09' },
  { ticker: 'CLHB', name: 'CloudHarbor', sector: 'technology', origin: 'original', referenceOf: '', price: 120, shares: 0.45e9, bvps: 20, beta: 1.25, vol: 0.03, revenue: 9e9, margin: 0.15, div: 0, avgVolume: 4e6, spread: 3, impact: 0.9, stage: 'growth', risk: 'medium', liquidity: 'normal', listed: '2016-06-15' },
  { ticker: 'VCFD', name: 'VectorFoundry', sector: 'technology', origin: 'original', referenceOf: '', price: 210, shares: 0.28e9, bvps: 45, beta: 1.5, vol: 0.035, revenue: 6.5e9, margin: 0.22, div: 0.005, avgVolume: 2e6, spread: 5, impact: 1.6, stage: 'growth', risk: 'high', liquidity: 'thin', listed: '2017-09-20' },
  { ticker: 'SNAR', name: 'SentinelArc', sector: 'technology', origin: 'original', referenceOf: '', price: 75, shares: 0.35e9, bvps: 10, beta: 1.3, vol: 0.033, revenue: 3.2e9, margin: 0.12, div: 0, avgVolume: 3e6, spread: 4, impact: 1.2, stage: 'growth', risk: 'medium', liquidity: 'normal', listed: '2017-03-08' },
  { ticker: 'BRBY', name: 'BrightByte', sector: 'technology', origin: 'original', referenceOf: '', price: 54, shares: 0.4e9, bvps: 9, beta: 1.25, vol: 0.032, revenue: 2.8e9, margin: 0.08, div: 0, avgVolume: 2.5e6, spread: 4, impact: 1.3, stage: 'growth', risk: 'medium', liquidity: 'normal', listed: '2018-11-14' },
  { ticker: 'WBFI', name: 'Westbridge Financial', sector: 'financials', origin: 'original', referenceOf: '', price: 46, shares: 0.8e9, bvps: 30, beta: 1.0, vol: 0.018, revenue: 12e9, margin: 0.25, div: 0.03, avgVolume: 3e6, spread: 3, impact: 0.8, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2010-07-01' },
  { ticker: 'MRDT', name: 'Meridian Trust', sector: 'financials', origin: 'original', referenceOf: '', price: 68, shares: 0.3e9, bvps: 25, beta: 0.95, vol: 0.015, revenue: 2.1e9, margin: 0.22, div: 0.025, avgVolume: 1e6, spread: 4, impact: 0.9, stage: 'mature', risk: 'medium', liquidity: 'thin', listed: '2012-05-10' },
  { ticker: 'CDIN', name: 'Cedarstone Insurance', sector: 'financials', origin: 'original', referenceOf: '', price: 58, shares: 0.25e9, bvps: 28, beta: 0.85, vol: 0.016, revenue: 3.5e9, margin: 0.12, div: 0.022, avgVolume: 1e6, spread: 4, impact: 1.0, stage: 'mature', risk: 'medium', liquidity: 'thin', listed: '2014-10-22' },
  { ticker: 'ATPY', name: 'AtlasPay', sector: 'financials', origin: 'original', referenceOf: '', price: 38, shares: 0.5e9, bvps: 8, beta: 1.4, vol: 0.035, revenue: 4.5e9, margin: 0.1, div: 0, avgVolume: 4e6, spread: 4, impact: 1.2, stage: 'growth', risk: 'medium', liquidity: 'normal', listed: '2019-06-18' },
  { ticker: 'NGRD', name: 'NorthGrid Energy', sector: 'utilities', origin: 'original', referenceOf: '', price: 72, shares: 0.6e9, bvps: 26, beta: 0.6, vol: 0.014, revenue: 8.5e9, margin: 0.18, div: 0.035, avgVolume: 2e6, spread: 3, impact: 0.7, stage: 'mature', risk: 'low', liquidity: 'normal', listed: '2008-09-15' },
  { ticker: 'SLDY', name: 'Solara Dynamics', sector: 'energy', origin: 'original', referenceOf: '', price: 44, shares: 0.35e9, bvps: 11, beta: 1.3, vol: 0.033, revenue: 2.8e9, margin: 0.06, div: 0.008, avgVolume: 3e6, spread: 4, impact: 1.3, stage: 'growth', risk: 'high', liquidity: 'normal', listed: '2015-04-20' },
  { ticker: 'EMBO', name: 'Emberline Oil', sector: 'energy', origin: 'original', referenceOf: '', price: 96, shares: 0.4e9, bvps: 38, beta: 1.1, vol: 0.025, revenue: 18e9, margin: 0.14, div: 0.045, avgVolume: 2e6, spread: 3, impact: 1.0, stage: 'mature', risk: 'high', liquidity: 'normal', listed: '2005-11-01' },
  { ticker: 'TDFU', name: 'TidalFusion', sector: 'energy', origin: 'original', referenceOf: '', price: 62, shares: 0.3e9, bvps: 9, beta: 1.5, vol: 0.04, revenue: 1.2e9, margin: -0.1, div: 0, avgVolume: 2e6, spread: 5, impact: 1.8, stage: 'early', risk: 'veryHigh', liquidity: 'thin', listed: '2020-10-15' },
  { ticker: 'HLXB', name: 'HelixBio Pharmaceuticals', sector: 'healthcare', origin: 'original', referenceOf: '', price: 140, shares: 0.2e9, bvps: 18, beta: 1.2, vol: 0.04, revenue: 2.4e9, margin: 0.1, div: 0, avgVolume: 1.5e6, spread: 5, impact: 1.5, stage: 'growth', risk: 'high', liquidity: 'thin', listed: '2016-02-11' },
  { ticker: 'AUMD', name: 'AuroraMed', sector: 'healthcare', origin: 'original', referenceOf: '', price: 85, shares: 0.25e9, bvps: 20, beta: 1.05, vol: 0.028, revenue: 3.1e9, margin: 0.14, div: 0.005, avgVolume: 1e6, spread: 4, impact: 1.1, stage: 'growth', risk: 'medium', liquidity: 'thin', listed: '2013-03-19' },
  { ticker: 'VLTH', name: 'Vela Therapeutics', sector: 'healthcare', origin: 'original', referenceOf: '', price: 52, shares: 0.4e9, bvps: 10, beta: 1.0, vol: 0.032, revenue: 6e9, margin: 0.18, div: 0.012, avgVolume: 2e6, spread: 4, impact: 1.0, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2011-08-04' },
  { ticker: 'NGLB', name: 'NovaGen Labs', sector: 'healthcare', origin: 'original', referenceOf: '', price: 34, shares: 0.3e9, bvps: 6, beta: 1.6, vol: 0.05, revenue: 0.9e9, margin: -0.15, div: 0, avgVolume: 2e6, spread: 6, impact: 1.9, stage: 'early', risk: 'veryHigh', liquidity: 'thin', listed: '2019-09-12' },
  { ticker: 'RDSM', name: 'Redstone Manufacturing', sector: 'industrials', origin: 'original', referenceOf: '', price: 66, shares: 0.5e9, bvps: 24, beta: 1.1, vol: 0.024, revenue: 7.5e9, margin: 0.09, div: 0.02, avgVolume: 1.5e6, spread: 4, impact: 1.1, stage: 'mature', risk: 'medium', liquidity: 'thin', listed: '2009-06-01' },
  { ticker: 'ARCR', name: 'AeroCrest', sector: 'industrials', origin: 'original', referenceOf: '', price: 118, shares: 0.3e9, bvps: 35, beta: 1.2, vol: 0.03, revenue: 5.5e9, margin: 0.1, div: 0.008, avgVolume: 1e6, spread: 5, impact: 1.4, stage: 'growth', risk: 'high', liquidity: 'thin', listed: '2014-01-17' },
  { ticker: 'IGLG', name: 'IronGate Logistics', sector: 'industrials', origin: 'original', referenceOf: '', price: 42, shares: 0.55e9, bvps: 15, beta: 1.0, vol: 0.023, revenue: 9.8e9, margin: 0.05, div: 0.018, avgVolume: 2e6, spread: 4, impact: 0.9, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2010-11-08' },
  { ticker: 'BRBT', name: 'Boreal Robotics', sector: 'industrials', origin: 'original', referenceOf: '', price: 78, shares: 0.28e9, bvps: 12, beta: 1.4, vol: 0.034, revenue: 2e9, margin: 0.08, div: 0, avgVolume: 1.5e6, spread: 5, impact: 1.5, stage: 'growth', risk: 'high', liquidity: 'thin', listed: '2018-07-19' },
  { ticker: 'HRFD', name: 'HarborFoods', sector: 'consumer', origin: 'original', referenceOf: '', price: 36, shares: 0.6e9, bvps: 14, beta: 0.55, vol: 0.013, revenue: 12e9, margin: 0.06, div: 0.028, avgVolume: 2e6, spread: 3, impact: 0.6, stage: 'mature', risk: 'low', liquidity: 'normal', listed: '2008-03-12' },
  { ticker: 'GRBK', name: 'GreenBasket', sector: 'consumer', origin: 'original', referenceOf: '', price: 29, shares: 0.45e9, bvps: 10, beta: 0.8, vol: 0.018, revenue: 8.5e9, margin: 0.035, div: 0.015, avgVolume: 2.5e6, spread: 3, impact: 0.7, stage: 'mature', risk: 'low', liquidity: 'normal', listed: '2011-05-05' },
  { ticker: 'LMRT', name: 'Luma Retail', sector: 'consumer', origin: 'original', referenceOf: '', price: 51, shares: 0.3e9, bvps: 18, beta: 1.05, vol: 0.026, revenue: 4.2e9, margin: 0.07, div: 0.01, avgVolume: 1e6, spread: 4, impact: 1.0, stage: 'growth', risk: 'medium', liquidity: 'thin', listed: '2015-09-24' },
  { ticker: 'HRHM', name: 'HearthHome', sector: 'consumer', origin: 'original', referenceOf: '', price: 63, shares: 0.4e9, bvps: 22, beta: 1.0, vol: 0.022, revenue: 5.6e9, margin: 0.09, div: 0.018, avgVolume: 1.2e6, spread: 4, impact: 0.9, stage: 'mature', risk: 'medium', liquidity: 'thin', listed: '2013-10-03' },
  { ticker: 'SCRL', name: 'Stonecrest Realty', sector: 'realestate', origin: 'original', referenceOf: '', price: 47, shares: 0.7e9, bvps: 25, beta: 0.9, vol: 0.019, revenue: 3.8e9, margin: 0.2, div: 0.032, avgVolume: 2e6, spread: 3, impact: 0.8, stage: 'mature', risk: 'medium', liquidity: 'normal', listed: '2009-09-30' },
  { ticker: 'MTLK', name: 'MetroLink Telecom', sector: 'telecom', origin: 'original', referenceOf: '', price: 41, shares: 0.9e9, bvps: 19, beta: 0.7, vol: 0.015, revenue: 11e9, margin: 0.12, div: 0.03, avgVolume: 3e6, spread: 3, impact: 0.7, stage: 'mature', risk: 'low', liquidity: 'normal', listed: '2007-04-11' },
  { ticker: 'TWUT', name: 'TerraWater Utilities', sector: 'utilities', origin: 'original', referenceOf: '', price: 58, shares: 0.5e9, bvps: 30, beta: 0.45, vol: 0.011, revenue: 2.6e9, margin: 0.22, div: 0.034, avgVolume: 1e6, spread: 3, impact: 0.5, stage: 'mature', risk: 'low', liquidity: 'thin', listed: '2006-02-15' },
  { ticker: 'SPMN', name: 'SilverPeak Mining', sector: 'materials', origin: 'original', referenceOf: '', price: 33, shares: 0.6e9, bvps: 20, beta: 1.15, vol: 0.028, revenue: 4.5e9, margin: 0.13, div: 0.025, avgVolume: 2e6, spread: 4, impact: 1.1, stage: 'mature', risk: 'high', liquidity: 'normal', listed: '2007-07-09' },
];

function sectorCorrelation(sector) {
  return {
    technology: 0.72,
    communication: 0.66,
    consumer: 0.58,
    financials: 0.62,
    healthcare: 0.45,
    energy: 0.52,
    industrials: 0.55,
    utilities: 0.32,
    materials: 0.48,
    realestate: 0.4,
    telecom: 0.38,
  }[sector] || 0.5;
}

function buildCompany(row) {
  const shares = row.shares;
  const price = row.price;
  const netIncome = row.revenue * row.margin;
  const equity = shares * row.bvps;
  const assets = Math.max(equity * 1.8, row.revenue * 0.9, price * shares * 0.55);
  const liabilities = Math.max(0, assets - equity);
  const debt = liabilities * 0.55;
  const cash = assets * 0.18;
  const grossProfit = row.revenue * 0.52;
  const operatingIncome = netIncome * 1.25;
  const ocf = netIncome * 1.3;
  const capex = row.revenue * 0.07;
  const icf = -capex;
  const fcf = ocf + icf;
  const financing = debt * 0.05;
  const eps = shares ? netIncome / shares : 0;
  const roe = equity ? netIncome / equity : 0;
  const investedCapital = equity + debt;
  const roic = investedCapital ? (operatingIncome * 0.79) / investedCapital : 0;
  const pe = eps > 0 ? price / eps : null;
  const pb = row.bvps > 0 ? price / row.bvps : null;
  const marketCap = price * shares;
  return {
    ...row,
    ticker: row.ticker.toUpperCase(),
    marketCap: round(marketCap, 2),
    sharesOutstanding: shares,
    floatShares: round(shares * 0.82, 0),
    sectorCorrelation: sectorCorrelation(row.sector),
    institutionalOwnership: row.liquidity === 'deep' ? 0.78 : row.liquidity === 'normal' ? 0.62 : 0.38,
    retailParticipation: row.liquidity === 'deep' ? 0.22 : row.liquidity === 'normal' ? 0.38 : 0.62,
    priceImpactCoefficient: row.impact,
    financials: {
      revenue: round(row.revenue, 2),
      grossProfit: round(grossProfit, 2),
      operatingIncome: round(operatingIncome, 2),
      netIncome: round(netIncome, 2),
      totalAssets: round(assets, 2),
      totalLiabilities: round(liabilities, 2),
      equity: round(equity, 2),
      cash: round(cash, 2),
      debt: round(debt, 2),
      operatingCashFlow: round(ocf, 2),
      investingCashFlow: round(icf, 2),
      financingCashFlow: round(financing, 2),
      freeCashFlow: round(fcf, 2),
      capex: round(capex, 2),
      eps: round(eps, 4),
      roe: round(roe, 4),
      roic: round(roic, 4),
      pe: pe === null ? null : round(pe, 2),
      pb: pb === null ? null : round(pb, 2),
      dividendPerShare: round(price * row.div, 4),
      buybackPolicy: row.stage === 'mature' && fcf > 0 ? 'opportunistic' : 'none',
      dividendPolicy: row.div > 0.02 ? 'progressive' : row.div > 0 ? 'stable' : 'none',
    },
    risks: [...(SECTOR_RISKS[row.sector] || []), ...(row.risk === 'veryHigh' ? ['funding'] : [])],
    description: `${row.name} is a fictional ${row.sector} company used for market-structure teaching. Its price, filings and news are generated by the local simulation only.`,
  };
}

export const SIM_COMPANIES = DEFINITIONS.map(buildCompany);
export const SIM_COMPANY_BY_TICKER = Object.fromEntries(
  SIM_COMPANIES.map((company) => [company.ticker, company]),
);

export function validateSimUniverse(companies = SIM_COMPANIES) {
  if (!Array.isArray(companies) || companies.length !== 50) {
    throw new Error('sim.universe.count');
  }
  const tickers = new Set();
  const references = companies.filter((company) => company.origin === 'reference');
  const originals = companies.filter((company) => company.origin === 'original');
  if (references.length !== 20 || originals.length !== 30) {
    throw new Error('sim.universe.mix');
  }
  for (const company of companies) {
    if (!/^[A-Z]{4}$/.test(company.ticker)) throw new Error('sim.universe.ticker');
    if (tickers.has(company.ticker)) throw new Error('sim.universe.duplicate');
    tickers.add(company.ticker);
    if (!company.name || !company.sector || !company.financials) {
      throw new Error('sim.universe.fields');
    }
    if (!Number.isFinite(company.price) || company.price <= 0) {
      throw new Error('sim.universe.price');
    }
  }
  return true;
}
