import { test, assert, assertEqual, assertClose } from './harness.js';
import {
  SIM_COMPANIES, SIM_COMPANY_BY_TICKER, validateSimUniverse,
} from '../js/sim/companies50.js';

test('the fictional exchange has exactly 50 listed companies', () => {
  assertEqual(SIM_COMPANIES.length, 50, 'company count');
  assertEqual(SIM_COMPANIES.filter((company) => company.origin === 'reference').length, 20, 'reference names');
  assertEqual(SIM_COMPANIES.filter((company) => company.origin === 'original').length, 30, 'original names');
  assertEqual(Object.keys(SIM_COMPANY_BY_TICKER).length, 50, 'ticker map');
  validateSimUniverse();
});

test('every fictional company has unique codes and required fields', () => {
  const seen = new Set();
  for (const company of SIM_COMPANIES) {
    assert(/^[A-Z]{4}$/.test(company.ticker), `${company.ticker} format`);
    assert(!seen.has(company.ticker), `${company.ticker} duplicate`);
    seen.add(company.ticker);
    assert(company.name && company.sector, `${company.ticker} identity`);
    assert(company.description.includes('fictional'), `${company.ticker} disclosure`);
    assert(company.risks.length > 0, `${company.ticker} risks`);
    for (const key of ['price', 'shares', 'beta', 'vol', 'revenue', 'margin', 'avgVolume', 'spread', 'impact']) {
      assert(Number.isFinite(company[key]), `${company.ticker} ${key}`);
    }
    if (company.origin === 'reference') assert(company.referenceOf, `${company.ticker} reference`);
    else assertEqual(company.referenceOf, '', `${company.ticker} no reference`);
  }
});

test('derived financial statements reconcile with company inputs', () => {
  for (const company of SIM_COMPANIES) {
    const f = company.financials;
    assertClose(f.netIncome, company.revenue * company.margin, 0.01, `${company.ticker} net income`);
    assertClose(f.equity, company.shares * company.bvps, 0.01, `${company.ticker} equity`);
    assertClose(f.totalAssets - f.totalLiabilities, f.equity, 0.02, `${company.ticker} balance sheet`);
    assertClose(f.freeCashFlow, f.operatingCashFlow + f.investingCashFlow, 0.02, `${company.ticker} free cash flow`);
    assert(f.totalAssets > 0 && f.cash >= 0, `${company.ticker} assets`);
  }
});

test('universe validation rejects duplicate or wrong-mix lists', () => {
  const duplicate = [...SIM_COMPANIES];
  duplicate[1] = { ...duplicate[1], ticker: duplicate[0].ticker };
  let error = null;
  try { validateSimUniverse(duplicate); } catch (err) { error = err; }
  assert(error && error.message === 'sim.universe.duplicate', 'duplicate rejected');

  const wrongMix = SIM_COMPANIES.map((company) => ({ ...company, origin: 'original', referenceOf: '' }));
  error = null;
  try { validateSimUniverse(wrongMix); } catch (err) { error = err; }
  assert(error && error.message === 'sim.universe.mix', 'mix rejected');

  error = null;
  try { validateSimUniverse(SIM_COMPANIES.slice(0, 49)); } catch (err) { error = err; }
  assert(error && error.message === 'sim.universe.count', 'count rejected');
});
