/**
 * UK tax estimator for the 2026/27 tax year.
 *
 * This is an educational estimate, not tax advice and not a filing-ready
 * computation. It implements the rules that matter for the game's simplified
 * ledger:
 *   - share identification: same-day, 30-day (bed and breakfast) and the
 *     Section 104 pool, in that order;
 *   - capital gains tax with the annual exempt amount and the 18% / 24% split;
 *   - dividend allowance and the 10.75% / 35.75% / 39.35% dividend rates;
 *   - ISA exemption and the £20,000 subscription limit;
 *   - SDRT at 0.5% on purchases of instruments explicitly marked as UK shares;
 *   - conversion from the game's virtual USD prices to GBP at a fixed,
 *     user-supplied educational FX rate.
 *
 * Rates and thresholds are published HMRC figures for 2026/27. The engine never
 * invents a tax year: an unknown year or an invalid input returns an error code
 * that the UI translates. Short positions, options, futures, funds and other
 * assets outside the share ledger are deliberately excluded and reported as
 * such.
 */
import { dateForTradingDay } from '../market/calendar.js';

const MS_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TAX_YEAR = '2026/27';

/**
 * HMRC rates used by the estimator. The `sources` block is part of the result so
 * the UI can always show where the numbers came from.
 */
export const UK_TAX_YEARS = {
  '2026/27': {
    id: '2026/27',
    label: '2026/27',
    startDate: '2026-04-06',
    endDate: '2027-04-05',
    annualExemptAmount: 3000,
    basicRateBand: 37700,
    additionalRateThreshold: 125140,
    cgtBasicRate: 0.18,
    cgtHigherRate: 0.24,
    dividendAllowance: 500,
    dividendBasicRate: 0.1075,
    dividendHigherRate: 0.3575,
    dividendAdditionalRate: 0.3935,
    isaAllowance: 20000,
    sdrtRate: 0.005,
  },
};

export const UK_TAX_SOURCES = [
  { id: 'cgt', url: 'https://www.gov.uk/capital-gains-tax' },
  { id: 'shares', url: 'https://www.gov.uk/tax-sell-shares' },
  { id: 'dividends', url: 'https://www.gov.uk/tax-on-dividends' },
  { id: 'isa', url: 'https://www.gov.uk/individual-savings-accounts' },
  { id: 'sdrt', url: 'https://www.gov.uk/guidance/pay-stamp-duty-reserve-tax' },
];

export const UK_TAX_LIMITATIONS = [
  'estimateOnly',
  'simulatedPrices',
  'fixedFxRate',
  'sameDayFifo',
  'tradeLogLimit',
  'dividendLogLimit',
  'excludedAssets',
];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDay(dayIndex) {
  return dateForTradingDay(dayIndex).toISOString().slice(0, 10);
}

function dateMs(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function withinYear(isoDate, year) {
  return isoDate >= year.startDate && isoDate <= year.endDate;
}

function tradeQty(trade) {
  const value = Number(trade && trade.qty);
  if (!Number.isFinite(value)) return 0;
  const qty = Math.floor(Math.abs(value));
  return qty > 0 ? qty : 0;
}

function tradePrice(trade) {
  const value = Number(trade && trade.price);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function tradeCost(trade, key) {
  const value = Number(trade && trade[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function upper(value) {
  return String(value || '').toUpperCase();
}

/**
 * Estimate UK tax for a set of simulated trades and dividends.
 *
 * @param {object} options
 * @param {string} [options.taxYear='2026/27']
 * @param {'gia'|'isa'} [options.accountType='gia']
 * @param {'basic'|'higher'|'additional'|''} [options.incomeBand='']
 * @param {number} [options.taxableIncome=0] non-dividend taxable income after the personal allowance
 * @param {Array} [options.trades=[]] account trade log (buy / sell rows)
 * @param {Array} [options.dividends=[]] dividend ledger rows with `day` and `amount`
 * @param {number} [options.isaContributions=0]
 * @param {number} [options.fxRate=1] GBP per unit of the game currency
 * @param {string} [options.currency='USD']
 * @param {string[]} [options.ukShareTickers=[]] tickers that should attract SDRT
 */
export function estimateUkTax(options = {}) {
  const {
    taxYear = DEFAULT_TAX_YEAR,
    accountType = 'gia',
    incomeBand = '',
    taxableIncome = 0,
    trades = [],
    dividends = [],
    isaContributions = 0,
    fxRate = 1,
    currency = 'USD',
    ukShareTickers = [],
  } = options;

  const year = UK_TAX_YEARS[taxYear];
  if (!year) return { ok: false, error: 'error.ukTaxYear', taxYear };
  if (accountType !== 'gia' && accountType !== 'isa') {
    return { ok: false, error: 'error.ukTaxAccount', accountType };
  }
  if (!['', 'basic', 'higher', 'additional'].includes(incomeBand)) {
    return { ok: false, error: 'error.ukTaxIncome', incomeBand };
  }

  const income = Number(taxableIncome);
  if (!Number.isFinite(income) || income < 0) {
    return { ok: false, error: 'error.ukTaxIncome', taxableIncome };
  }
  const rate = Number(fxRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'error.ukTaxFx', fxRate };
  }
  const contributions = Math.max(0, Number(isaContributions) || 0);
  const ukShareSet = new Set((ukShareTickers || []).map(upper).filter(Boolean));

  const warnings = [];
  const excludedTrades = [];
  const events = [];

  (Array.isArray(trades) ? trades : []).forEach((trade, index) => {
    if (!trade) return;
    if (trade.side !== 'buy' && trade.side !== 'sell') {
      excludedTrades.push({ ticker: trade.ticker, side: trade.side });
      return;
    }
    const qty = tradeQty(trade);
    const price = tradePrice(trade);
    if (!qty || !price) return;
    const dayIndex = Math.floor(Number(trade.day) || 0);
    events.push({
      source: trade,
      index,
      side: trade.side,
      ticker: upper(trade.ticker),
      qty,
      price,
      day: dayIndex,
      tick: Math.floor(Number(trade.tick) || 0),
      id: Number.isFinite(Number(trade.id)) ? Number(trade.id) : index,
      date: isoDay(dayIndex),
    });
  });

  events.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.id !== b.id) return a.id - b.id;
    return a.index - b.index;
  });

  const isUkShare = (event) => (
    event.source.instrumentType === 'ukShare' || ukShareSet.has(event.ticker)
  );

  const lotsByTicker = new Map();
  for (const event of events) {
    if (event.side !== 'buy') continue;
    const gross = event.qty * event.price;
    const fee = tradeCost(event.source, 'fee');
    const levy = tradeCost(event.source, 'levy');
    const declaredSdrt = tradeCost(event.source, 'sdrt');
    const sdrt = declaredSdrt || (isUkShare(event) ? round2(gross * year.sdrtRate) : 0);
    const total = (gross + fee + levy + sdrt) * rate;
    const lot = {
      id: event.id,
      index: event.index,
      ticker: event.ticker,
      date: event.date,
      day: event.day,
      qty: event.qty,
      remaining: event.qty,
      unitCostGbp: total / event.qty,
      sdrtLocal: sdrt,
      inPool: false,
    };
    event.lot = lot;
    if (!lotsByTicker.has(event.ticker)) lotsByTicker.set(event.ticker, []);
    lotsByTicker.get(event.ticker).push(lot);
  }

  const pools = new Map();
  function poolFor(ticker) {
    if (!pools.has(ticker)) pools.set(ticker, { qty: 0, cost: 0 });
    return pools.get(ticker);
  }

  const disposals = [];
  let ignoredDisposals = 0;
  let sdrtTotal = 0;
  let sdrtConsideration = 0;
  const sdrtPurchases = [];

  for (const event of events) {
    if (event.side === 'buy') {
      const lot = event.lot;
      if (lot.sdrtLocal && withinYear(event.date, year)) {
        sdrtTotal += lot.sdrtLocal * rate;
        sdrtConsideration += event.qty * event.price * rate;
        sdrtPurchases.push({
          ticker: event.ticker,
          date: event.date,
          qty: event.qty,
          consideration: round2(event.qty * event.price * rate),
          sdrt: round2(lot.sdrtLocal * rate),
        });
      }
      if (lot.remaining > 0) {
        const pool = poolFor(event.ticker);
        pool.qty += lot.remaining;
        pool.cost += lot.remaining * lot.unitCostGbp;
        lot.inPool = true;
      }
      continue;
    }

    const pool = poolFor(event.ticker);
    let remaining = event.qty;
    const matches = {
      sameDay: { qty: 0, cost: 0 },
      thirtyDay: { qty: 0, cost: 0 },
      pool: { qty: 0, cost: 0 },
    };

    // 1. Same-day acquisitions are matched first, regardless of intraday order.
    const sameDayLots = (lotsByTicker.get(event.ticker) || [])
      .filter((lot) => lot.date === event.date && lot.remaining > 0)
      .sort((a, b) => a.id - b.id || a.index - b.index);
    for (const lot of sameDayLots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.remaining);
      const cost = take * lot.unitCostGbp;
      if (lot.inPool) {
        pool.qty -= take;
        pool.cost -= cost;
        if (pool.qty <= 1e-9) {
          pool.qty = 0;
          pool.cost = 0;
        }
      }
      lot.remaining -= take;
      remaining -= take;
      matches.sameDay.qty += take;
      matches.sameDay.cost += cost;
    }

    // 2. Acquisitions in the following 30 calendar days, earliest first.
    if (remaining > 0) {
      const saleMs = dateMs(event.date);
      const futureLots = (lotsByTicker.get(event.ticker) || [])
        .filter((lot) => lot.remaining > 0
          && lot.date > event.date
          && dateMs(lot.date) <= saleMs + 30 * MS_DAY)
        .sort((a, b) => dateMs(a.date) - dateMs(b.date) || a.id - b.id || a.index - b.index);
      for (const lot of futureLots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.remaining);
        lot.remaining -= take;
        remaining -= take;
        matches.thirtyDay.qty += take;
        matches.thirtyDay.cost += take * lot.unitCostGbp;
      }
    }

    // 3. The Section 104 pool at its average cost.
    if (remaining > 0 && pool.qty > 0) {
      const take = Math.min(remaining, pool.qty);
      const average = pool.cost / pool.qty;
      const cost = take * average;
      pool.qty -= take;
      pool.cost -= cost;
      if (pool.qty <= 1e-9) {
        pool.qty = 0;
        pool.cost = 0;
      }
      remaining -= take;
      matches.pool.qty += take;
      matches.pool.cost += cost;
    }

    if (remaining > 0) {
      warnings.push({ code: 'poolMismatch', params: { ticker: event.ticker, qty: remaining } });
    }

    const grossLocal = event.qty * event.price;
    const feeLocal = tradeCost(event.source, 'fee');
    const levyLocal = tradeCost(event.source, 'levy');
    const proceeds = round2((grossLocal - feeLocal - levyLocal) * rate);
    const costBasis = matches.sameDay.cost + matches.thirtyDay.cost + matches.pool.cost;
    const gain = proceeds - costBasis;
    if (!withinYear(event.date, year)) {
      ignoredDisposals += 1;
      continue;
    }
    disposals.push({
      ticker: event.ticker,
      date: event.date,
      day: event.day,
      qty: event.qty,
      proceeds,
      costBasis: round2(costBasis),
      gain: round2(gain),
      matches: {
        sameDay: { qty: matches.sameDay.qty, cost: round2(matches.sameDay.cost) },
        thirtyDay: { qty: matches.thirtyDay.qty, cost: round2(matches.thirtyDay.cost) },
        pool: { qty: matches.pool.qty, cost: round2(matches.pool.cost) },
      },
    });
  }

  if (excludedTrades.length) {
    warnings.push({ code: 'excludedTrades', params: { count: excludedTrades.length } });
  }

  const dividendRows = (Array.isArray(dividends) ? dividends : [])
    .filter((row) => row && Number(row.amount) > 0)
    .map((row) => {
      const dayIndex = Math.floor(Number(row.day) || 0);
      return {
        ticker: upper(row.ticker),
        day: dayIndex,
        date: isoDay(dayIndex),
        amount: Number(row.amount) * rate,
      };
    })
    .filter((row) => withinYear(row.date, year))
    .sort((a, b) => a.day - b.day);
  const dividendsGross = dividendRows.reduce((sum, row) => sum + row.amount, 0);
  const dividendAllowanceUsed = Math.min(dividendsGross, year.dividendAllowance);
  const dividendTaxable = dividendsGross - dividendAllowanceUsed;

  const grossProceeds = disposals.reduce((sum, row) => sum + row.proceeds, 0);
  const allowableCosts = disposals.reduce((sum, row) => sum + row.costBasis, 0);
  const gains = disposals.reduce((sum, row) => sum + Math.max(0, row.gain), 0);
  const losses = disposals.reduce((sum, row) => sum + Math.max(0, -row.gain), 0);
  const netGain = gains - losses;
  const isaAccount = accountType === 'isa';
  const annualExemptAmountUsed = isaAccount || netGain <= 0
    ? 0
    : Math.min(netGain, year.annualExemptAmount);
  const taxableGain = isaAccount ? 0 : Math.max(0, netGain - annualExemptAmountUsed);

  // Dividends are the top slice of income and consume the basic-rate band before
  // CGT is calculated. The £500 dividend allowance occupies band at a 0% rate.
  // An explicit income band acts as a floor for callers that do not model income.
  const bandFloor = incomeBand === 'additional'
    ? year.additionalRateThreshold
    : incomeBand === 'higher'
      ? year.basicRateBand
      : 0;
  const effectiveIncome = Math.max(income, bandFloor);
  let availableBasicBand = 0;
  if (!isaAccount) {
    availableBasicBand = Math.max(0, year.basicRateBand - effectiveIncome - dividendsGross);
  }
  const cgtBasicPart = isaAccount ? 0 : Math.min(taxableGain, availableBasicBand);
  const cgtHigherPart = isaAccount ? 0 : Math.max(0, taxableGain - cgtBasicPart);
  const cgtBasic = cgtBasicPart * year.cgtBasicRate;
  const cgtHigher = cgtHigherPart * year.cgtHigherRate;
  const cgtTax = isaAccount ? 0 : cgtBasic + cgtHigher;

  // The allowance uses band but is taxed at 0%.
  const dividendStart = effectiveIncome + dividendAllowanceUsed;
  const basicRoom = Math.max(0, year.basicRateBand - dividendStart);
  const dividendBasicPart = Math.min(dividendTaxable, basicRoom);
  const afterBasic = dividendTaxable - dividendBasicPart;
  const higherRoom = Math.max(0, year.additionalRateThreshold - Math.max(dividendStart, year.basicRateBand));
  const dividendHigherPart = Math.min(afterBasic, higherRoom);
  const dividendAdditionalPart = Math.max(0, afterBasic - dividendHigherPart);
  const dividendBasic = dividendBasicPart * year.dividendBasicRate;
  const dividendHigher = dividendHigherPart * year.dividendHigherRate;
  const dividendAdditional = dividendAdditionalPart * year.dividendAdditionalRate;
  const dividendTax = isaAccount
    ? 0
    : dividendBasic + dividendHigher + dividendAdditional;

  const isaRemaining = Math.max(0, year.isaAllowance - contributions);
  const isaExcess = Math.max(0, contributions - year.isaAllowance);
  if (isaExcess > 0) warnings.push({ code: 'isaExcess', params: { amount: round2(isaExcess) } });

  const totalTax = cgtTax + dividendTax + sdrtTotal;

  return {
    ok: true,
    educationalOnly: true,
    region: 'UK',
    taxYear: year.id,
    accountType,
    currency: currency || 'USD',
    fxRate: rate,
    period: { start: year.startDate, end: year.endDate },
    cgt: {
      exempt: accountType === 'isa',
      grossProceeds: round2(grossProceeds),
      allowableCosts: round2(allowableCosts),
      gains: round2(gains),
      losses: round2(losses),
      netGain: round2(netGain),
      annualExemptAmount: year.annualExemptAmount,
      annualExemptAmountUsed: round2(annualExemptAmountUsed),
      taxableGain: round2(taxableGain),
      basicRate: year.cgtBasicRate,
      higherRate: year.cgtHigherRate,
      basicPart: round2(cgtBasicPart),
      higherPart: round2(cgtHigherPart),
      basicTax: round2(cgtBasic),
      higherTax: round2(cgtHigher),
      tax: round2(cgtTax),
      effectiveRate: netGain > 0 ? round2((cgtTax / netGain) * 100) : 0,
    },
    dividends: {
      exempt: accountType === 'isa',
      rows: dividendRows.map((row) => ({ ...row, amount: round2(row.amount) })),
      gross: round2(dividendsGross),
      allowance: year.dividendAllowance,
      allowanceUsed: round2(dividendAllowanceUsed),
      taxable: round2(dividendTaxable),
      basicRate: year.dividendBasicRate,
      higherRate: year.dividendHigherRate,
      additionalRate: year.dividendAdditionalRate,
      basicPart: round2(dividendBasicPart),
      higherPart: round2(dividendHigherPart),
      additionalPart: round2(dividendAdditionalPart),
      basicTax: round2(dividendBasic),
      higherTax: round2(dividendHigher),
      additionalTax: round2(dividendAdditional),
      tax: round2(dividendTax),
    },
    isa: {
      allowance: year.isaAllowance,
      contributions: round2(contributions),
      remaining: round2(isaRemaining),
      excess: round2(isaExcess),
      exempt: true,
    },
    sdrt: {
      rate: year.sdrtRate,
      total: round2(sdrtTotal),
      consideration: round2(sdrtConsideration * rate),
      purchases: sdrtPurchases.map((row) => ({ ...row, sdrt: round2(row.sdrt) })),
    },
    summary: {
      grossProceeds: round2(grossProceeds),
      allowableCosts: round2(allowableCosts),
      netGain: round2(netGain),
      cgt: round2(cgtTax),
      dividendTax: round2(dividendTax),
      sdrt: round2(sdrtTotal),
      totalTax: round2(totalTax),
      // SDRT is already inside the acquisition cost basis, so it is not deducted again.
      afterTaxGain: round2(netGain + dividendsGross - cgtTax - dividendTax),
    },
    disposals,
    ignoredDisposals,
    warnings,
    sources: UK_TAX_SOURCES,
    limitations: UK_TAX_LIMITATIONS,
  };
}
