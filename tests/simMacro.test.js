import { test, assert, assertEqual, assertClose } from './harness.js';
import { SIM_COMPANY_BY_TICKER } from '../js/sim/companies50.js';
import {
  createMacroState, advanceMacro, isMacroEventDay, macroEventTypeForDay,
  nextMacroEventDay, deriveMacroRegime,
} from '../js/sim/macroEconomy.js';
import {
  macroImpactForCompany, macroDriftForCompany, sectorLinkWeight, sectorSpillovers,
} from '../js/sim/industryModel.js';
import {
  createExchangeEngine, advanceSecond, serializeExchange, deserializeExchange,
} from '../js/sim/exchangeEngine.js';
import { guidanceQuarterForDay } from '../js/sim/fundamentals.js';

test('macro state and releases are deterministic for the same seed and day', () => {
  const first = advanceMacro({ seed: 'macro-test', dayIndex: 7, macro: createMacroState() });
  const second = advanceMacro({ seed: 'macro-test', dayIndex: 7, macro: createMacroState() });
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'same macro stream');
  assert(first.event, 'scheduled release');
  assertEqual(first.event.type, 'cpi', 'first release type');
  assert(Number.isFinite(first.macro.inflation), 'inflation finite');
  assert(Number.isFinite(first.macro.riskAppetite), 'risk appetite finite');
});

test('macro releases follow the calendar and never leak future events', () => {
  assert(!isMacroEventDay(6), 'day six is quiet');
  assert(isMacroEventDay(7), 'day seven releases data');
  assertEqual(macroEventTypeForDay(7), 'cpi', 'CPI first');
  assertEqual(macroEventTypeForDay(28), 'payrolls', 'payrolls second');
  assertEqual(macroEventTypeForDay(49), 'centralBank', 'central bank third');
  assertEqual(macroEventTypeForDay(70), 'gdp', 'GDP fourth');
  assertEqual(macroEventTypeForDay(91), 'energy', 'energy fifth');
  assertEqual(nextMacroEventDay(0), 7, 'first release');
  assertEqual(nextMacroEventDay(7), 28, 'next release after an event');
  const quiet = advanceMacro({ seed: 'macro-quiet', dayIndex: 1, macro: createMacroState() });
  assertEqual(quiet.event, null, 'no unscheduled event');
  assertEqual(quiet.macro.events.length, 0, 'no future event stored');
});

test('macro indicators move slowly and policy rates only change on decisions', () => {
  let macro = createMacroState();
  const rates = [macro.policyRate];
  for (let day = 1; day <= 140; day += 1) {
    const result = advanceMacro({ seed: 'macro-slow', dayIndex: day, macro });
    macro = result.macro;
    if (isMacroEventDay(day)) rates.push(macro.policyRate);
    assert(Number.isFinite(macro.inflation), `inflation day ${day}`);
    assert(Number.isFinite(macro.gdpGrowth), `GDP day ${day}`);
    assert(macro.riskAppetite >= 0 && macro.riskAppetite <= 100, `risk day ${day}`);
    assert(['normal', 'bull', 'bear', 'highVol', 'crisis', 'liquidity', 'sectorBubble',
      'recession', 'recovery'].includes(macro.regime), `regime day ${day}`);
    if (!isMacroEventDay(day)) {
      assertEqual(macro.policyRate, rates[rates.length - 1], `no rate change day ${day}`);
    }
  }
  for (let index = 1; index < rates.length; index += 1) {
    assertClose(rates[index] - rates[index - 1], 0, 0.251, 'rate decision step');
  }
});

test('macro channels produce explainable sector and cross-sector responses', () => {
  const hotCpi = { channels: { rates: 1, growth: -0.2, risk: -0.5 } };
  const tech = macroImpactForCompany({ event: hotCpi, company: SIM_COMPANY_BY_TICKER.NCRT });
  const realestate = macroImpactForCompany({ event: hotCpi, company: SIM_COMPANY_BY_TICKER.SCRL });
  const financials = macroImpactForCompany({ event: hotCpi, company: SIM_COMPANY_BY_TICKER.JGCH });
  assert(tech < 0, 'hot CPI hurts rate-sensitive technology');
  assert(realestate < 0, 'hot CPI hurts real estate');
  assert(financials > tech, 'banks react differently from growth stocks');

  const energyShock = { channels: { energy: 1, growth: -0.15, risk: -0.25 } };
  const energy = macroImpactForCompany({ event: energyShock, company: SIM_COMPANY_BY_TICKER.EMBO });
  const consumer = macroImpactForCompany({ event: energyShock, company: SIM_COMPANY_BY_TICKER.HRFD });
  const utilities = macroImpactForCompany({ event: energyShock, company: SIM_COMPANY_BY_TICKER.TWUT });
  assert(energy > 0, 'energy producers benefit from higher energy prices');
  assert(consumer < 0, 'consumer companies face higher input costs');
  assert(utilities < 0, 'utilities face higher fuel costs');

  assertEqual(sectorLinkWeight('technology', 'communication'), 0.45, 'direct link');
  assertEqual(sectorLinkWeight('communication', 'technology'), 0.45, 'reverse link');
  assert(sectorLinkWeight('technology', 'healthcare') > 0, 'indirect link');
  assert(sectorSpillovers('technology')[0].sector === 'communication', 'closest sector first');
  assert(macroDriftForCompany({ macro: createMacroState(), company: SIM_COMPANY_BY_TICKER.APLA }) !== undefined,
    'daily drift is defined');
});

test('the exchange applies macro releases at the open and stores them', () => {
  const withMacro = createExchangeEngine({ seed: 'macro-engine-test' });
  const withoutMacro = createExchangeEngine({ seed: 'macro-engine-test' });
  for (const state of [withMacro, withoutMacro]) {
    state.dayIndex = 6;
    state.second = 23400 - 1;
    state.lastNewsDay = 7;
  }
  withoutMacro.lastMacroDay = 7;
  advanceSecond(withMacro);
  advanceSecond(withoutMacro);
  assertEqual(withMacro.dayIndex, 7, 'next session');
  assertEqual(withMacro.macro.events.length, 1, 'release recorded');
  assertEqual(withMacro.lastMacroDay, 7, 'macro applied once');
  const event = withMacro.macro.events[0];
  assertEqual(event.type, 'cpi', 'CPI release');
  assert(withMacro.quotes.APLA.last !== withoutMacro.quotes.APLA.last,
    'macro release moves quotes');
  const restored = deserializeExchange(serializeExchange(withMacro));
  assertEqual(restored.macro.events.length, 1, 'macro event saved');
  assertEqual(restored.lastMacroDay, 7, 'macro day saved');
  assertEqual(restored.macro.regime, withMacro.macro.regime, 'regime saved');
});

test('mid-quarter guidance changes the expectation used by the next report', () => {
  const state = createExchangeEngine({ seed: 'guidance-test' });
  state.dayIndex = 34;
  state.second = 23400 - 1;
  state.lastNewsDay = 35;
  state.lastMacroDay = 35;
  advanceSecond(state);
  assertEqual(state.dayIndex, 35, 'guidance day');
  assert(state.guidance.length >= 1, 'guidance released');
  const guidance = state.guidance[0];
  assertEqual(guidance.quarter, guidanceQuarterForDay(35), 'current quarter');
  assert(state.corporateActions.some((event) => event.type === 'guidance' && event.ticker === guidance.ticker),
    'guidance recorded as a company event');

  state.dayIndex = 76;
  state.second = 23400 - 1;
  state.lastNewsDay = 77;
  state.lastMacroDay = 77;
  advanceSecond(state);
  assertEqual(state.dayIndex, 77, 'report day');
  const report = state.reports.find(
    (entry) => entry.ticker === guidance.ticker && entry.quarter === guidance.quarter,
  );
  assert(report, 'guided company report released');
  assert(report.guidance, 'guidance flag recorded');
  assertClose(report.expectedEps, guidance.eps, 0.0002, 'report uses guided EPS');
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.guidance.length, state.guidance.length, 'guidance saved');
});

test('market regimes are derived from macro levels, not from a fixed winner', () => {
  assertEqual(deriveMacroRegime({
    creditGrowth: -2, riskAppetite: 20, gdpGrowth: 0.5, unemployment: 7, inflation: 2,
  }), 'crisis', 'credit stress');
  assertEqual(deriveMacroRegime({
    creditGrowth: 2, riskAppetite: 70, gdpGrowth: 3.4, unemployment: 4, inflation: 2,
  }), 'bull', 'strong growth');
  assertEqual(deriveMacroRegime({
    creditGrowth: 2, riskAppetite: 30, gdpGrowth: 1, unemployment: 4, inflation: 2,
  }), 'bear', 'weak growth');
  assertEqual(deriveMacroRegime({
    creditGrowth: 2, riskAppetite: 55, gdpGrowth: 2.2, unemployment: 4, inflation: 4.8,
  }), 'highVol', 'inflation shock');
  assertEqual(deriveMacroRegime({
    creditGrowth: 2, riskAppetite: 65, gdpGrowth: 2.2, unemployment: 4, inflation: 2,
  }, 'normal', 'technology'), 'sectorBubble', 'sector bubble');
});
