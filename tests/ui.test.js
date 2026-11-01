/**
 * Lightweight view smoke tests: mount the new ETF trading page, branch map,
 * challenge board and sandbox setup in a real browser DOM.
 */
import { suite, test, assert, assertEqual } from './harness.js';
import { createGameState } from '../js/game/gameState.js';
import { createStore } from '../js/core/store.js';
import { createBus } from '../js/core/bus.js';
import { createTradeView } from '../js/ui/views/trading.js';
import { createBranchesView } from '../js/ui/views/branches.js';
import { createChallengesView } from '../js/ui/views/challenges.js';
import { createSandboxView } from '../js/ui/views/sandbox.js';
import { createCareerView } from '../js/ui/views/career.js';
import { createFundView } from '../js/ui/views/fund.js';
import { setupFund, FUND_AUM_OPTIONS } from '../js/fund/fundEngine.js';

const fakeI18n = {
  locale: 'en',
  t: (key) => key,
  translate: (locale, key) => key,
  otherLocale: () => 'zh-CN',
  onChange: () => {},
};

function makeCtx(state, { mode = 'career' } = {}) {
  const store = createStore({ bus: createBus(), initialState: state });
  const router = { go: () => {}, current: '/' };
  return {
    ctx: {
      i18n: fakeI18n,
      store,
      bus: createBus(),
      router,
      actions: {
        getAppMode: () => mode,
        getSandboxConfig: () => ({ cash: 100000, seed: 'ui-test', difficulty: 'normal', commission: 1 }),
      },
      toast: () => {},
    },
    store,
  };
}

function mountView(view) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  view.mount(host);
  return host;
}

suite('New views smoke test');

test('trading view renders an ETF profile and holdings instead of financials', () => {
  const state = createGameState({ seed: 'ui-etf' });
  state.education.units.u7.completedAt = Date.now();
  state.settings.layout = 'advanced';
  const { ctx } = makeCtx(state);
  const view = createTradeView(ctx, { ticker: 'MKT' });
  const host = mountView(view);
  const text = host.textContent;
  assert(text.includes('MKT'), 'ETF ticker is rendered');
  assert(text.includes('trade.etfExpenseRatio'), 'expense ratio row is rendered');
  assert(text.includes('trade.etfHoldings'), 'holdings card replaces corporate financials');
  assert(!text.includes('trade.financialsTitle'), 'ETF does not show the company financials card');
  view.destroy();
  host.remove();
});

test('branches view renders six cards once Unit 32 is complete', () => {
  const state = createGameState({ seed: 'ui-branches' });
  state.education.units.u32.completedAt = Date.now();
  const { ctx } = makeCtx(state);
  const view = createBranchesView(ctx);
  const host = mountView(view);
  const cards = host.querySelectorAll('.branch-card');
  assertEqual(cards.length, 6, 'six branch cards');
  assert(host.textContent.includes('branch.asset.name'), 'branch metadata is rendered');
  view.destroy();
  host.remove();
});

test('career view shows the ladder and a ready promotion button', () => {
  const state = createGameState({ seed: 'ui-career' });
  state.education.units.u4.completedAt = Date.now();
  state.account.trades = [{ id: 1, side: 'buy', ticker: 'AURA', qty: 1, price: 10, day: 1 }];
  state.education.inspectedTickers = ['AURA', 'HLIX', 'VRDN'];
  const { ctx } = makeCtx(state);
  ctx.actions.promoteCareer = () => ({ ok: true });
  const view = createCareerView(ctx);
  const host = mountView(view);
  assertEqual(host.querySelectorAll('.career-rank').length, 8, 'eight career ranks');
  const promote = host.querySelector('[data-career-promote]');
  assert(promote, 'promotion button exists');
  assert(!promote.disabled, 'promotion button is enabled when requirements are met');
  view.destroy();
  host.remove();
});

test('fund view gates, launches and renders an active fund', () => {
  const lockedState = createGameState({ seed: 'ui-fund-locked' });
  lockedState.career.rank = 1;
  const locked = createFundView(makeCtx(lockedState).ctx);
  const lockedHost = mountView(locked);
  assert(lockedHost.textContent.includes('fund.lockedTitle'), 'locked card is shown before rank 5');
  assert(!lockedHost.querySelector('[data-fund-form]'), 'setup form is hidden while locked');
  locked.destroy();
  lockedHost.remove();

  const setupState = createGameState({ seed: 'ui-fund-setup' });
  setupState.career.rank = 5;
  const setup = createFundView(makeCtx(setupState).ctx);
  const setupHost = mountView(setup);
  assert(setupHost.querySelector('[data-fund-form]'), 'setup form renders once unlocked');
  assert(setupHost.querySelector('[data-fund-ticker]') === null, 'no trading UI before a fund exists');
  setup.destroy();
  setupHost.remove();

  const activeState = createGameState({ seed: 'ui-fund-active' });
  activeState.career.rank = 5;
  const result = setupFund(activeState, {
    name: 'Atlas Capital',
    strategy: 'longOnly',
    riskProfile: 'balanced',
    initialAum: FUND_AUM_OPTIONS[1],
  }, 0);
  assert(result.ok, 'fund setup succeeds in the UI test');
  activeState.fund = result.fund;
  const active = createFundView(makeCtx(activeState).ctx);
  const activeHost = mountView(active);
  assert(activeHost.querySelector('#fund-aum'), 'AUM stat card renders');
  assert(activeHost.querySelector('#fund-nav-chart'), 'NAV chart renders');
  assert(activeHost.querySelector('[data-fund-buy]'), 'fund buy button renders');
  assert(activeHost.querySelector('[data-fund-ticker]'), 'fund ticker selector renders');
  assertEqual(activeHost.querySelectorAll('.fund-team-member').length, 6, 'six team roles render');
  active.destroy();
  activeHost.remove();
});

test('challenge board and sandbox setup mount without errors', () => {
  const state = createGameState({ seed: 'ui-modes' });
  const { ctx } = makeCtx(state);
  const challenges = createChallengesView(ctx);
  const challengeHost = mountView(challenges);
  assertEqual(challengeHost.querySelectorAll('.challenge-card').length, 6, 'six challenge cards');
  challenges.destroy();
  challengeHost.remove();

  const sandboxCtx = makeCtx(state, { mode: 'career' });
  const sandbox = createSandboxView(sandboxCtx.ctx);
  const sandboxHost = mountView(sandbox);
  assert(sandboxHost.querySelector('#sandbox-cash'), 'sandbox cash field exists');
  assert(sandboxHost.querySelector('#sandbox-seed'), 'sandbox seed field exists');
  assert(sandboxHost.querySelector('#sandbox-difficulty'), 'sandbox difficulty field exists');
  sandbox.destroy();
  sandboxHost.remove();
});
