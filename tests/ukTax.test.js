/**
 * UK tax engine tests: share matching, CGT bands, dividends, ISA and SDRT.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { dateForTradingDay } from '../js/market/calendar.js';
import { estimateUkTax, UK_TAX_YEARS, UK_TAX_SOURCES } from '../js/tax/ukTaxEngine.js';

function dayFor(iso) {
  for (let day = -60; day <= 500; day += 1) {
    if (dateForTradingDay(day).toISOString().slice(0, 10) === iso) return day;
  }
  throw new Error(`No trading day for ${iso}`);
}

let seq = 1;
function trade(side, ticker, qty, price, iso, extra = {}) {
  const row = {
    id: seq,
    side,
    ticker,
    qty,
    price,
    fee: 0,
    levy: 0,
    day: dayFor(iso),
    tick: 0,
    ...extra,
  };
  seq += 1;
  return row;
}

function estimate(trades, overrides = {}) {
  const result = estimateUkTax({
    taxYear: '2026/27',
    trades,
    dividends: [],
    ...overrides,
  });
  assert(result.ok, `estimate should succeed: ${result.error}`);
  return result;
}

suite('UK tax engine');

test('same-day matching takes priority over the pool', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 20, '2026-04-10'),
  ];
  const result = estimate(trades);
  assertEqual(result.disposals.length, 1, 'one disposal');
  assertEqual(result.disposals[0].matches.sameDay.qty, 1000, 'same-day quantity');
  assertClose(result.disposals[0].costBasis, 10000, 0.01, 'same-day cost');
  assertClose(result.disposals[0].gain, 10000, 0.01, 'gain');
  assertClose(result.cgt.taxableGain, 7000, 0.01, 'AEA applied');
  assertClose(result.cgt.tax, 1260, 0.01, '18% CGT');
});

test('30-day matching uses future acquisitions before the pool', () => {
  seq = 1;
  const trades = [
    trade('sell', 'AURA', 100, 10, '2026-04-10'),
    trade('buy', 'AURA', 100, 15, '2026-04-20'),
  ];
  const result = estimate(trades);
  const row = result.disposals[0];
  assertEqual(row.matches.thirtyDay.qty, 100, '30-day quantity');
  assertClose(row.matches.thirtyDay.cost, 1500, 0.01, '30-day cost');
  assertEqual(row.matches.pool.qty, 0, 'pool unused');
  assertClose(row.gain, -500, 0.01, 'loss');
  assertClose(result.cgt.tax, 0, 0.01, 'loss produces no CGT');
});

test('acquisition 31 days later falls back to the Section 104 pool', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 100, 10, '2026-04-01'),
    trade('sell', 'AURA', 100, 20, '2026-04-10'),
    trade('buy', 'AURA', 100, 15, '2026-05-11'),
  ];
  const result = estimate(trades);
  const row = result.disposals[0];
  assertEqual(row.matches.thirtyDay.qty, 0, '31 days is outside the 30-day window');
  assertEqual(row.matches.pool.qty, 100, 'pool used');
  assertClose(row.gain, 1000, 0.01, 'pool gain');
});

test('Section 104 pool averages the cost of unmatched acquisitions', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('buy', 'AURA', 1000, 20, '2026-05-01'),
    trade('sell', 'AURA', 1000, 40, '2026-06-01'),
  ];
  const result = estimate(trades);
  const row = result.disposals[0];
  assertEqual(row.matches.pool.qty, 1000, 'pool quantity');
  assertClose(row.costBasis, 15000, 0.01, 'pool average cost');
  assertClose(row.gain, 25000, 0.01, 'gain');
  assertClose(result.cgt.taxableGain, 22000, 0.01, 'taxable gain');
  assertClose(result.cgt.tax, 3960, 0.01, '18% CGT');
});

test('CGT splits between 18% and 24% using the remaining basic band', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 2000, 10, '2026-04-10'),
    trade('sell', 'AURA', 2000, 20, '2026-05-01'),
  ];
  const result = estimate(trades, { taxableIncome: 30000 });
  assertClose(result.cgt.basicPart, 7700, 0.01, 'basic-rate slice');
  assertClose(result.cgt.higherPart, 9300, 0.01, 'higher-rate slice');
  assertClose(result.cgt.basicTax, 1386, 0.01, '18% tax');
  assertClose(result.cgt.higherTax, 2232, 0.01, '24% tax');
  assertClose(result.cgt.tax, 3618, 0.01, 'total CGT');
});

test('dividends consume the basic-rate band before CGT is calculated', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 2000, 10, '2026-04-10'),
    trade('sell', 'AURA', 2000, 20, '2026-05-01'),
  ];
  const result = estimate(trades, {
    taxableIncome: 20000,
    dividends: [{ ticker: 'AURA', day: dayFor('2026-06-01'), amount: 10000 }],
  });
  assertClose(result.cgt.basicPart, 7700, 0.01, 'remaining basic band after dividends');
  assertClose(result.cgt.higherPart, 9300, 0.01, 'higher-rate slice');
  assertClose(result.cgt.tax, 3618, 0.01, 'CGT with dividends in the band');
});

test('an explicit income band floors the rate used for CGT', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 20, '2026-09-01'),
  ];
  const result = estimate(trades, { incomeBand: 'higher' });
  assertClose(result.cgt.basicPart, 0, 0.01, 'no basic-rate slice');
  assertClose(result.cgt.higherPart, 7000, 0.01, 'higher-rate slice');
  assertClose(result.cgt.tax, 1680, 0.01, '24% CGT');
});

test('losses offset gains before the annual exempt amount', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 15, '2026-05-01'),
    trade('buy', 'HLIX', 1000, 10, '2026-04-10'),
    trade('sell', 'HLIX', 1000, 8, '2026-05-01'),
  ];
  const result = estimate(trades);
  assertClose(result.cgt.gains, 5000, 0.01, 'gains');
  assertClose(result.cgt.losses, 2000, 0.01, 'losses');
  assertClose(result.cgt.netGain, 3000, 0.01, 'net gain');
  assertClose(result.cgt.annualExemptAmountUsed, 3000, 0.01, 'AEA covers net gain');
  assertClose(result.cgt.tax, 0, 0.01, 'no CGT');
});

test('annual exempt amount is only used against a net gain', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 100, 10, '2026-04-10'),
    trade('sell', 'AURA', 100, 15, '2026-05-01'),
  ];
  const result = estimate(trades);
  assertClose(result.cgt.netGain, 500, 0.01, 'net gain');
  assertClose(result.cgt.annualExemptAmountUsed, 500, 0.01, 'AEA used');
  assertClose(result.cgt.tax, 0, 0.01, 'no CGT');
});

test('dividend allowance and basic-rate dividend tax', () => {
  seq = 1;
  const result = estimate([], {
    dividends: [{ ticker: 'AURA', day: dayFor('2026-06-01'), amount: 5000 }],
  });
  assertClose(result.dividends.gross, 5000, 0.01, 'gross dividends');
  assertClose(result.dividends.allowanceUsed, 500, 0.01, 'allowance used');
  assertClose(result.dividends.taxable, 4500, 0.01, 'taxable dividends');
  assertClose(result.dividends.tax, 483.75, 0.01, '10.75% dividend tax');
});

test('dividends are taxed at higher and additional rates', () => {
  seq = 1;
  const high = estimate([], {
    taxableIncome: 40000,
    dividends: [{ ticker: 'AURA', day: dayFor('2026-06-01'), amount: 5000 }],
  });
  assertClose(high.dividends.higherPart, 4500, 0.01, 'higher-rate slice');
  assertClose(high.dividends.higherTax, 1608.75, 0.01, '35.75% tax');

  const additional = estimate([], {
    taxableIncome: 130000,
    dividends: [{ ticker: 'AURA', day: dayFor('2026-06-01'), amount: 5000 }],
  });
  assertClose(additional.dividends.additionalPart, 4500, 0.01, 'additional-rate slice');
  assertClose(additional.dividends.additionalTax, 1770.75, 0.01, '39.35% tax');
});

test('ISA exempts gains and dividends but not SDRT', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 20, '2026-09-01'),
  ];
  const result = estimate(trades, {
    accountType: 'isa',
    isaContributions: 15000,
    dividends: [{ ticker: 'AURA', day: dayFor('2026-06-01'), amount: 1000 }],
    ukShareTickers: ['AURA'],
  });
  assert(result.cgt.exempt, 'CGT exempt');
  assertClose(result.cgt.tax, 0, 0.01, 'no CGT in ISA');
  assert(result.dividends.exempt, 'dividends exempt');
  assertClose(result.dividends.tax, 0, 0.01, 'no dividend tax in ISA');
  assertClose(result.sdrt.total, 50, 0.01, 'SDRT still applies');
  assertClose(result.isa.remaining, 5000, 0.01, 'ISA allowance remaining');
  assertClose(result.summary.totalTax, 50, 0.01, 'only SDRT due');
});

test('SDRT is charged on UK share purchases and added to the cost basis', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 20, '2026-09-01'),
  ];
  const result = estimate(trades, { ukShareTickers: ['AURA'] });
  assertClose(result.sdrt.total, 50, 0.01, '0.5% SDRT');
  assertClose(result.disposals[0].costBasis, 10050, 0.01, 'SDRT in cost basis');
  assertClose(result.cgt.taxableGain, 6950, 0.01, 'AEA then taxable');
  assertClose(result.cgt.tax, 1251, 0.01, 'CGT after SDRT');
});

test('FX rate converts simulated USD amounts into GBP', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 1000, 10, '2026-04-10'),
    trade('sell', 'AURA', 1000, 20, '2026-09-01'),
  ];
  const result = estimate(trades, { fxRate: 0.8, currency: 'USD' });
  assertClose(result.disposals[0].proceeds, 16000, 0.01, 'GBP proceeds');
  assertClose(result.disposals[0].costBasis, 8000, 0.01, 'GBP cost');
  assertClose(result.cgt.taxableGain, 5000, 0.01, 'GBP taxable gain');
  assertClose(result.cgt.tax, 900, 0.01, 'CGT on GBP gain');
  assertEqual(result.fxRate, 0.8, 'FX rate echoed');
});

test('disposals outside the tax year are processed but not taxed', () => {
  seq = 1;
  const trades = [
    trade('buy', 'AURA', 200, 10, '2026-04-01'),
    trade('sell', 'AURA', 100, 20, '2026-04-02'),
    trade('sell', 'AURA', 100, 20, '2026-06-01'),
  ];
  const result = estimate(trades);
  assertEqual(result.ignoredDisposals, 1, 'one prior-year disposal ignored');
  assertEqual(result.disposals.length, 1, 'one in-year disposal');
  assert(result.disposals[0].date >= UK_TAX_YEARS['2026/27'].startDate, 'disposal in tax year');
});

test('dividends outside the tax year are excluded', () => {
  seq = 1;
  const result = estimate([], {
    dividends: [
      { ticker: 'AURA', day: dayFor('2026-03-02'), amount: 1000 },
      { ticker: 'AURA', day: dayFor('2026-06-01'), amount: 2000 },
    ],
  });
  assertClose(result.dividends.gross, 2000, 0.01, 'only in-year dividend');
});

test('unknown tax years and invalid inputs return errors', () => {
  const missingYear = estimateUkTax({ taxYear: '2030/31' });
  assert(!missingYear.ok, 'unknown year rejected');
  assertEqual(missingYear.error, 'error.ukTaxYear', 'year error code');

  const badFx = estimateUkTax({ fxRate: 0 });
  assert(!badFx.ok, 'zero FX rejected');
  assertEqual(badFx.error, 'error.ukTaxFx', 'FX error code');

  const badBand = estimateUkTax({ incomeBand: 'top' });
  assert(!badBand.ok, 'unknown band rejected');
  assertEqual(badBand.error, 'error.ukTaxIncome', 'income error code');

  const badAccount = estimateUkTax({ accountType: 'broker' });
  assert(!badAccount.ok, 'unknown account type rejected');
  assertEqual(badAccount.error, 'error.ukTaxAccount', 'account error code');
});

test('result exposes rates, sources and educational limitations', () => {
  seq = 1;
  const result = estimate([
    trade('buy', 'AURA', 100, 10, '2026-04-10'),
    trade('sell', 'AURA', 100, 20, '2026-06-01'),
  ]);
  assert(result.educationalOnly, 'marked as educational');
  assertEqual(result.taxYear, '2026/27', 'tax year echoed');
  assertEqual(result.sources.length, UK_TAX_SOURCES.length, 'all sources listed');
  assert(result.limitations.includes('estimateOnly'), 'limitations listed');
  assert(result.warnings.length === 0, 'no warnings for a clean ledger');
});
