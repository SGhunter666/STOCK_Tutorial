/**
 * Multi-factor risk model tests: exposures, risk contributions, stress paths
 * and deterministic output.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import { setupFund, fundBuy, FUND_AUM_OPTIONS, FUND_RANK_REQUIREMENT } from '../js/fund/fundEngine.js';
import { buildFundRiskModel, portfolioFactorRisk, FUND_RISK_FACTORS } from '../js/fund/riskModel.js';
import { COMPANIES } from '../js/data/companies.js';

function activeFundState(seed) {
  const state = createGameState({ seed, locale: 'en', initialCash: 10000 });
  state.career = {
    rank: FUND_RANK_REQUIREMENT,
    promotedAtDay: 0,
    salaryPaidDay: 0,
    history: [{ rank: FUND_RANK_REQUIREMENT, day: 0 }],
  };
  const result = setupFund(state, {
    name: 'Atlas Capital',
    strategy: 'longOnly',
    riskProfile: 'balanced',
    initialAum: FUND_AUM_OPTIONS[1],
  }, 0);
  assert(result.ok, `fund setup should succeed: ${result.error}`);
  state.fund = result.fund;
  return state;
}

suite('Fund: multi-factor risk model');

test('risk model builds market, style exposures and covariance', () => {
  const state = createGameState({ seed: 'risk-model', locale: 'en' });
  const model = buildFundRiskModel(state, { lookback: 60 });
  assert(model.ok, 'risk model builds from the seeded history');
  assert(model.universe >= 4, 'several companies enter the factor panel');
  assertEqual(model.factorCovariance.length, FUND_RISK_FACTORS.length, 'factor covariance is square');
  assertEqual(model.exposures[0].market !== undefined, true, 'market beta is exposed');
  for (const factor of ['size', 'value', 'momentum', 'lowVol']) {
    assert(Number.isFinite(model.exposures[0][factor]), `${factor} exposure is numeric`);
  }
  assert(model.factorVolatilityPct.every((value) => Number.isFinite(value) && value >= 0), 'factor volatilities are finite');
  assert(model.specificVariance.every((value) => value > 0), 'specific variances are positive');
});

test('equal-weight factor risk decomposes into factor and specific parts', () => {
  const state = createGameState({ seed: 'risk-decompose', locale: 'en' });
  const model = buildFundRiskModel(state, { lookback: 60 });
  const weights = model.tickers.map((ticker) => ({ ticker, weight: 1 / model.tickers.length }));
  const risk = portfolioFactorRisk(state, weights, { lookback: 60 });
  assert(risk.ok, 'portfolio risk computes');
  assert(risk.totalRiskPct > 0, 'total risk is positive');
  assert(risk.factorRiskPct >= 0 && risk.specificRiskPct >= 0, 'risk parts are non-negative');
  assert(risk.totalRiskPct <= risk.factorRiskPct + risk.specificRiskPct + 0.2, 'total volatility is below the sum of parts');
  assertEqual(risk.contributions.length, FUND_RISK_FACTORS.length + 1, 'factor plus specific contributions');
  const sum = risk.contributions.reduce((total, row) => total + row.contributionPct, 0);
  assertClose(sum, 100, 1, 'risk contributions add up to 100%');
  assert(risk.stress.length === 4, 'four stress scenarios');
  const marketStress = risk.stress.find((row) => row.id === 'marketDown');
  assert(marketStress.impactPct < 0, 'a market drawdown hurts a long-only portfolio');
  const again = portfolioFactorRisk(state, weights, { lookback: 60 });
  assertEqual(JSON.stringify(risk), JSON.stringify(again), 'risk model is deterministic');
});

test('active fund holdings produce a portfolio risk profile', () => {
  const state = activeFundState('risk-fund');
  const ticker = COMPANIES.find((company) => !company.isEtf).ticker;
  const bought = fundBuy(state.fund, state.market.quotes, { ticker, qty: 10 });
  assert(bought.ok, `fund position should open: ${bought.error}`);
  state.fund = bought.fund;
  const risk = portfolioFactorRisk(state, [{ ticker, weight: 0.1 }], { lookback: 60 });
  assert(risk.ok, 'active fund risk computes');
  assertEqual(risk.holdings, 1, 'one holding is analysed');
  assertClose(risk.investedPct, 10, 0.1, 'invested weight is preserved');
  assert(risk.totalRiskPct > 0, 'risk is positive');
  const empty = portfolioFactorRisk(state, [], { lookback: 60 });
  assertEqual(empty.ok, false);
  assertEqual(empty.error, 'fund.riskModel.empty');
});
