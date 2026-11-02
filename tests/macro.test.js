/**
 * Macro world tests: deterministic indicators, releases, surprises and global
 * market linkages.
 */
import {
  suite, test, assert, assertEqual, assertClose,
} from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import {
  macroWorld, macroCalendar, globalMarkets,
} from '../js/market/macro.js';

suite('Macro world');

test('macro world is deterministic and keeps indicators finite', () => {
  const first = macroWorld(42, 'macro-seed');
  const second = macroWorld(42, 'macro-seed');
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'same day and seed match');
  const changed = macroWorld(43, 'macro-seed');
  assert(first.growth !== changed.growth || first.policyRate !== changed.policyRate, 'day changes the cycle');
  for (const value of [first.policyRate, first.inflation, first.growth, first.unemployment,
    first.realRate, first.confidence, first.yield2, first.yield10, first.curve,
    first.creditSpread, first.riskAppetite]) {
    assert(Number.isFinite(value), 'indicator is numeric');
  }
  assert(first.riskAppetite >= 0 && first.riskAppetite <= 100, 'risk appetite is bounded');
  assert(['expansion', 'slowdown', 'inflation', 'neutral'].includes(first.regime), 'regime is known');
});

test('economic calendar releases are ordered and surprises reconcile', () => {
  const events = macroCalendar(60, 'macro-seed', { past: 3, future: 3 });
  assert(events.length >= 4, 'calendar has events');
  for (let index = 1; index < events.length; index += 1) {
    assert(events[index].day >= events[index - 1].day, 'calendar is chronological');
  }
  for (const event of events) {
    assert(event.released === (event.day <= 60), 'release flag matches the current day');
    assert(Number.isFinite(event.actual) && Number.isFinite(event.forecast), 'forecast and actual exist');
    assertClose(event.actual - event.forecast, event.surprise, 0.11, 'surprise is the actual minus forecast');
    assert(Number.isFinite(event.impactPct), 'impact is numeric');
    if (event.type === 'cpi' && event.surprise > 0) {
      assert(event.impactPct <= 0, 'a CPI upside surprise hurts risk assets');
    }
  }
});

test('global markets link to the simulated US index', () => {
  const state = createGameState({ seed: 'macro-global' });
  const rows = globalMarkets(state, state.market.day, state.seed);
  assertEqual(rows.length, 4, 'four regions');
  assertEqual(rows[0].id, 'us', 'US is first');
  assertClose(rows[0].level, state.market.index.value, 0.01, 'US uses the market index');
  assertEqual(rows[0].coupling, 1, 'US coupling is one');
  for (const row of rows.slice(1)) {
    assert(row.coupling > 0 && row.coupling < 1, 'non-US coupling is partial');
    assert(Number.isFinite(row.level), 'regional level is numeric');
    assert(Number.isFinite(row.changePct), 'regional change is numeric');
  }
  const again = globalMarkets(state, state.market.day, state.seed);
  assertEqual(JSON.stringify(rows), JSON.stringify(again), 'global markets are deterministic');
});
