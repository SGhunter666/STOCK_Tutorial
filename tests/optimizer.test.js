/**
 * Portfolio optimiser tests: bounded weights, risk comparison, determinism and
 * plan generation without mutating the fund.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import { setupFund, FUND_AUM_OPTIONS, FUND_RANK_REQUIREMENT } from '../js/fund/fundEngine.js';
import {
  FUND_OPTIMIZER_METHODS, optimizeFundPortfolio, buildFundWeightPlan,
} from '../js/fund/optimizer.js';
import { estimateTradeCost, targetBuyQuantity } from '../js/fund/costModel.js';

function activeFundState(seed) {
  const state = createGameState({ seed, locale: 'en', initialCash: 10000 });
  state.career = { rank: FUND_RANK_REQUIREMENT, promotedAtDay: 0, salaryPaidDay: 0, history: [{ rank: FUND_RANK_REQUIREMENT, day: 0 }] };
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

function investedPct(result) {
  return result.weights.reduce((sum, row) => sum + row.weight, 0) * 100 + result.cashWeightPct;
}

suite('Fund: portfolio optimiser');

test('optimiser methods expose names and descriptions', () => {
  assertEqual(FUND_OPTIMIZER_METHODS.length, 3, 'three optimisation methods');
  assert(FUND_OPTIMIZER_METHODS.every((entry) => entry.nameKey && entry.descKey), 'localised method keys');
});

test('transaction costs are bounded and target sizing accounts for impact', () => {
  const state = createGameState({ seed: 'optimizer-costs', locale: 'en' });
  const ticker = Object.keys(state.market.quotes)[0];
  const quote = state.market.quotes[ticker];
  const cost = estimateTradeCost(ticker, quote, 'buy', 100, 1);
  assert(cost, 'trade cost estimate exists');
  assert(cost.notional > 0, 'notional is positive');
  assert(cost.impactPct >= 0 && cost.impactPct <= 0.35, `impact is bounded (${cost.impactPct})`);
  assert(cost.commission === 1, 'commission is reported');
  const targetValue = 10000;
  const qty = targetBuyQuantity(ticker, quote, targetValue, 1);
  assert(qty > 0, 'target quantity is positive');
  const targetCost = estimateTradeCost(ticker, quote, 'buy', qty, 1);
  const effectivePrice = Math.round(quote.ask * (1 + targetCost.impactPct / 100) * 100) / 100;
  assert(qty * effectivePrice <= targetValue + effectivePrice, 'quantity respects the target value after impact');
});

test('risk parity allocates bounded long-only weights deterministically', () => {
  const state = createGameState({ seed: 'optimizer-risk-parity', locale: 'en' });
  const first = optimizeFundPortfolio(state, {
    method: 'riskParity', lookback: 60, maxWeight: 0.25, cashBuffer: 0.1,
  });
  assert(first.ok, 'risk parity optimiser runs');
  assert(first.weights.length >= 3, 'several holdings receive weight');
  assert(first.weights.every((row) => row.weight >= 0 && row.weight <= 0.250001), 'single-name cap respected');
  assertClose(investedPct(first), 100, 0.2, 'weights plus cash cover the portfolio');
  assert(first.cashWeightPct >= 9.9, 'cash buffer is preserved');
  const second = optimizeFundPortfolio(state, {
    method: 'riskParity', lookback: 60, maxWeight: 0.25, cashBuffer: 0.1,
  });
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'risk parity is deterministic');
});

test('minimum variance does not exceed equal-weight volatility', () => {
  const state = createGameState({ seed: 'optimizer-min-variance', locale: 'en' });
  const result = optimizeFundPortfolio(state, {
    method: 'minVariance', lookback: 60, maxWeight: 0.25, cashBuffer: 0.1,
  });
  assert(result.ok, 'minimum-variance optimiser runs');
  assert(result.expectedVolatilityPct > 0, 'expected volatility is positive');
  assert(
    result.expectedVolatilityPct <= result.equalWeightVolatilityPct + 0.05,
    'minimum variance should not be worse than equal weight',
  );
  assert(result.weights.every((row) => row.weight <= 0.250001), 'names stay capped');
  assert(result.diversificationRatio >= 1, 'diversification ratio is at least one');
});

test('mean-variance weights stay bounded and use the cash buffer', () => {
  const state = createGameState({ seed: 'optimizer-mean-variance', locale: 'en' });
  const result = optimizeFundPortfolio(state, {
    method: 'meanVariance', lookback: 60, maxWeight: 0.3, cashBuffer: 0.15, riskAversion: 2,
  });
  assert(result.ok, 'mean-variance optimiser runs');
  assert(result.weights.every((row) => row.weight <= 0.300001), 'single-name cap respected');
  assert(result.cashWeightPct >= 14.9, 'cash buffer respected');
  assert(Number.isFinite(result.expectedReturnPct), 'expected return is numeric');
});

test('optimiser reports short history and clamps bad inputs', () => {
  const state = createGameState({ seed: 'optimizer-short', locale: 'en' });
  for (const ticker of Object.keys(state.market.history)) {
    state.market.history[ticker] = state.market.history[ticker].slice(-10);
  }
  const short = optimizeFundPortfolio(state, { lookback: 60, method: 'minVariance' });
  assertEqual(short.ok, false);
  assertEqual(short.error, 'fund.errorOptimizerHistory');
  const clamped = optimizeFundPortfolio(state, {
    lookback: 999, maxWeight: 1, cashBuffer: 1, method: 'moon',
  });
  assert(clamped.ok || clamped.error === 'fund.errorOptimizerHistory', 'bad inputs do not throw');
});

test('optimiser respects the active fund position cap and cash floor', () => {
  const state = activeFundState('optimizer-fund-limits');
  const result = optimizeFundPortfolio(state, {
    method: 'minVariance', lookback: 60, maxWeight: 0.5, cashBuffer: 0.05,
  });
  assert(result.ok, 'optimiser runs for an active fund');
  assert(result.weights.every((row) => row.weight <= 0.250001), 'fund max position overrides the requested cap');
  assert(result.cashWeightPct >= 9.9, 'fund min cash overrides the requested buffer');
});

test('optimised weights become an advisory plan without mutating the fund', () => {
  const state = activeFundState('optimizer-plan');
  const before = JSON.stringify(state.fund);
  const result = optimizeFundPortfolio(state, {
    method: 'riskParity', lookback: 60, maxWeight: 0.25, cashBuffer: 0.15,
  });
  assert(result.ok, 'optimiser runs for an active fund');
  const plan = buildFundWeightPlan(state.fund, state, result.weights);
  assert(plan.ok, `weight plan builds: ${plan.error}`);
  assert(plan.plan.trades.length > 0, 'plan contains actionable buys');
  assertEqual(plan.plan.source, 'optimizer', 'plan source is labelled');
  assert(plan.plan.candidates.length >= 3, 'candidates carry target weights');
  assert(plan.plan.costs && plan.plan.costs.total > 0, 'optimiser plan estimates costs');
  assert(plan.plan.trades.every((trade) => trade.reason === 'optimizer' || trade.reason === 'optimizerExit' || trade.reason === 'rebalance'), 'optimiser reasons are labelled');
  assertEqual(JSON.stringify(state.fund), before, 'building the plan leaves the fund untouched');
  const empty = buildFundWeightPlan(state.fund, state, []);
  assertEqual(empty.ok, false);
  assertEqual(empty.error, 'fund.errorOptimizerEmpty');
});
