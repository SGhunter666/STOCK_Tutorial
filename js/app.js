/**
 * Application composition root.
 * Wires i18n, persistence, simulation, education engines, the UI shell and router.
 */
import { loadDictionaries, I18n, detectLocale } from './i18n/i18n.js';
import { createBus } from './core/bus.js';
import { createStore } from './core/store.js';
import {
  saveSnapshot, loadSnapshot, clearSnapshot, SAVE_KEY, SANDBOX_KEY,
} from './core/persistence.js';
import {
  createGameState, hydrateState, validateSave, serializeState, marketEngineFromState,
} from './game/gameState.js';
import { MarketClock } from './market/clock.js';
import { TICKS_PER_DAY } from './market/calendar.js';
import { payableDividends, applyDividends } from './market/dividends.js';
import {
  processOpenOrders, placeMarketOrder, placeLimitOrder, placeConditionalOrder,
  placeOcoOrder, cancelOrder, ORDER_STATUS,
} from './trading/orderEngine.js';
import {
  snapshotEquity, buyingPower, shortCapacity, availableCash,
} from './trading/account.js';
import { marginStatus, applyFinancing, forceLiquidation } from './trading/margin.js';
import { buildOptionChain, findContract } from './options/chains.js';
import {
  buyOption, sellOption, closeOption, markOptions, settleOptions, executeOptionLegs,
  assignEarlyOptions, optionCollateral, availableOptionCash, availableCoveredShares,
} from './options/optionsEngine.js';
import { buildStrategy } from './options/strategies.js';
import {
  buildFuturesChain, openFuture, closeFuture, markFutures, applyFuturesVariation,
  settleFutures, availableFuturesCash,
} from './futures/futuresEngine.js';
import { money } from './core/format.js';
import {
  markSectionRead, recordQuizResult,
} from './education/lessonEngine.js';
import { syncPractice, recordInspection } from './education/practiceEngine.js';
import {
  startChallenge, abandonChallenge, checkChallenge, challengeById,
} from './education/challenges.js';
import { gradeQuiz } from './education/quizEngine.js';
import { allTools, isToolUnlocked, TOOL_DEFS } from './education/unlockManager.js';
import { isCompanyUnlocked, newlyUnlockedSegments, segmentById } from './market/marketAccess.js';
import { evaluateAchievements, achievementById } from './education/progress.js';
import {
  careerProgress, promoteCareer, applyCareerSalary, careerRankByNumber,
  refreshResearchTasks, acceptResearchTask,
  submitInvestmentReport,
  evaluateCareerPerformance, syncCareerCertificates,
} from './education/career.js';
import {
  createFundState, setupFund, fundMetrics, fundBuy, fundSell,
  hireEmployee, fireEmployee, acceptClient, settleRedemption,
  advanceFundDay, withdrawCompanyCash,
} from './fund/fundEngine.js';
import {
  normalizeFundPlanConfig, buildFundPlan, executeFundPlan,
} from './fund/fundStrategy.js';
import { getUnit } from './education/curriculum.js';
import { getCompany } from './data/companies.js';
import { normalizeQuantConfig } from './quant/backtestEngine.js';
import { createShell } from './ui/shell.js';
import { Router } from './ui/router.js';
import { initComponents, toast, openLockedToolModal } from './ui/components.js';
import { viewSubscription } from './ui/dom.js';
import { createDashboardView } from './ui/views/dashboard.js';
import { createAcademyView } from './ui/views/academy.js';
import { createBranchesView } from './ui/views/branches.js';
import { createCareerView } from './ui/views/career.js';
import { createFundView } from './ui/views/fund.js';
import { createQuantView } from './ui/views/quant.js';
import { createLessonView } from './ui/views/lesson.js';
import { createQuizView } from './ui/views/quiz.js';
import { createPracticeView } from './ui/views/practice.js';
import { createMarketView } from './ui/views/market.js';
import { createTradeView } from './ui/views/trading.js';
import { createOptionsView } from './ui/views/options.js';
import { createFuturesView } from './ui/views/futures.js';
import { createPortfolioView } from './ui/views/portfolio.js';
import { createSandboxView } from './ui/views/sandbox.js';
import { createChallengesView } from './ui/views/challenges.js';
import { createBoundariesView } from './ui/views/boundaries.js';
import { createNewsView } from './ui/views/news.js';
import { createGlossaryView } from './ui/views/glossary.js';
import { createSettingsView } from './ui/views/settings.js';
import { createRoadmapView } from './ui/views/roadmap.js';
import { createHistoryListView, createHistoryScenarioView } from './ui/views/history.js';
import { showOnboarding } from './ui/onboarding.js';

const MODE_KEY = 'sma.mode';
const SANDBOX_CONFIG_KEY = 'sma.sandbox-config';
const bus = createBus();
let i18n = null;
let store = null;
let engine = null;
let clock = null;
let shell = null;
let router = null;
let currentView = null;
let currentUnsubscribe = null;
let saveTimer = null;
let blockSave = false;
let lastSimSaveAt = 0;
let saveState = { lastSavedAt: null, storage: 'indexeddb' };

function randomSeed() {
  return `academy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function readMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'sandbox' ? 'sandbox' : 'career';
  } catch {
    return 'career';
  }
}

const appMode = readMode();
const activeSaveKey = appMode === 'sandbox' ? SANDBOX_KEY : SAVE_KEY;

function readSandboxConfig() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SANDBOX_CONFIG_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  const rawCash = Number(stored.cash);
  const cash = Number.isFinite(rawCash) ? Math.min(10_000_000, Math.max(1_000, rawCash)) : 100_000;
  const difficulty = ['easy', 'normal', 'hard'].includes(stored.difficulty) ? stored.difficulty : 'normal';
  const seed = typeof stored.seed === 'string' && stored.seed.trim()
    ? stored.seed.trim().slice(0, 48)
    : randomSeed();
  const commission = difficulty === 'easy' ? 0 : difficulty === 'hard' ? 3 : 1;
  return { cash, seed, difficulty, commission };
}

function buildSandboxState(config, careerState, locale) {
  const state = createGameState({ locale, seed: config.seed, initialCash: config.cash });
  state.settings.commission = config.commission;
  state.sandbox = { ...config };
  state.fund = createFundState();
  if (careerState) {
    state.education = careerState.education;
    state.career = careerState.career;
    state.settings.layout = careerState.settings.layout;
    state.settings.reducedMotion = careerState.settings.reducedMotion;
    state.settings.theme = careerState.settings.theme;
  }
  return state;
}

function setRoute(container) {
  if (!container) return;
  container.innerHTML = '<div class="view-loading"><span class="spinner"></span></div>';
}

async function boot() {
  const appRoot = document.getElementById('app');
  appRoot.innerHTML = '<div class="boot-splash"><span class="boot-mark">SMA</span><span class="spinner"></span><span class="boot-text">Loading virtual market…</span></div>';

  let dictionaries;
  try {
    dictionaries = await loadDictionaries();
  } catch (err) {
    console.error('[boot] dictionaries failed', err);
    appRoot.innerHTML = `
      <div class="boot-error">
        <h1>Stock Market Academy</h1>
        <p>语言文件加载失败 / Failed to load locale files.</p>
        <p class="boot-error__hint">请通过本地 HTTP 服务器打开本游戏，而不是直接双击 index.html。<br>Serve the project with a local HTTP server instead of opening the file directly.</p>
        <pre>python3 -m http.server 8000</pre>
      </div>`;
    return;
  }

  i18n = new I18n(dictionaries);
  const loaded = await loadSnapshot(activeSaveKey);
  let state = null;
  let restored = false;

  if (loaded.data) {
    const validation = validateSave(loaded.data);
    if (validation.ok) {
      state = hydrateState(loaded.data);
      restored = true;
    } else {
      console.warn('[boot] save rejected:', validation.reason);
    }
  }
  if (!state && appMode === 'sandbox') {
    // A sandbox is free trading with an independent book. Course unlocks are
    // copied from the career save so the same tools are available.
    const config = readSandboxConfig();
    let careerState = null;
    const career = await loadSnapshot(SAVE_KEY);
    if (career.data) {
      const validation = validateSave(career.data);
      if (validation.ok) careerState = hydrateState(career.data);
    }
    const locale = (careerState && careerState.settings.locale)
      || (career.data && career.data.settings && career.data.settings.locale)
      || detectLocale();
    state = buildSandboxState(config, careerState, locale);
  }
  if (!state) {
    const locale = (loaded.data && loaded.data.settings && loaded.data.settings.locale) || detectLocale();
    const choice = await showOnboarding({ appRoot, i18n, initialLocale: locale });
    state = createGameState({ locale: choice.locale, seed: randomSeed() });
  }

  i18n.setLocale(state.settings.locale);
  document.documentElement.lang = state.settings.locale;
  document.documentElement.classList.toggle('reduced-motion', Boolean(state.settings.reducedMotion));
  document.documentElement.dataset.theme = state.settings.theme;

  store = createStore({ bus, initialState: state });
  engine = marketEngineFromState(state);
  saveState = {
    lastSavedAt: restored ? Date.now() : null,
    storage: loaded.storage || 'indexeddb',
  };

  router = new Router({ onRoute: (route) => renderRoute(route) });
  initComponents({ i18n, store, bus, router, actions });

  clock = new MarketClock({
    onTick: handleTick,
    onFastForward: handleFastForward,
  });
  shell = createShell({
    i18n, store, bus, clock, router, actions, sandbox: appMode === 'sandbox',
  });

  i18n.onChange(() => {
    if (shell) shell.refresh();
    if (router) router.rerender();
  });

  shell.mount(appRoot);

  bus.on('achievement:unlocked', ({ id }) => {
    const def = achievementById(id);
    if (!def) return;
    toast(`${i18n.t('toast.achievement')} ${i18n.t(def.titleKey)}`, 'success', 4200);
    if (shell) shell.onState();
  });
  bus.on('unit:completed', ({ unitId }) => {
    const unit = getUnit(unitId);
    toast(i18n.t('toast.unitComplete', { unit: unit ? i18n.t(unit.titleKey) : unitId }), 'success', 4200);
  });
  bus.on('practice:completed', () => {
    toast(i18n.t('toast.practiceComplete'), 'success');
  });
  bus.on('progress:updated', () => {
    announceUnlocks();
    announceMarketSegments();
  });
  bus.on('tool:unlocked', ({ tools }) => {
    for (const toolId of tools) {
      const def = TOOL_DEFS[toolId];
      if (def) toast(i18n.t('toast.toolUnlocked', { tool: i18n.t(def.titleKey) }), 'info', 4200);
    }
  });
  bus.on('challenge:started', ({ id }) => {
    const challenge = challengeById(id);
    if (challenge) toast(i18n.t('toast.challengeStarted', { challenge: i18n.t(challenge.titleKey) }), 'info', 4200);
  });
  bus.on('challenge:completed', ({ id, xpGained }) => {
    const challenge = challengeById(id);
    const title = challenge ? i18n.t(challenge.titleKey) : id;
    toast(i18n.t('toast.challengeCompleted', { challenge: title, xp: xpGained }), 'success', 5200);
  });
  bus.on('challenge:failed', ({ id }) => {
    const challenge = challengeById(id);
    const title = challenge ? i18n.t(challenge.titleKey) : id;
    toast(i18n.t('toast.challengeFailed', { challenge: title }), 'warning', 5200);
  });
  bus.on('career:promoted', ({ rank, xpGained }) => {
    const def = careerRankByNumber(rank);
    toast(i18n.t('toast.careerPromoted', {
      rank: i18n.t(def.titleKey),
      xp: xpGained,
    }), 'success', 5600);
  });

  store.subscribe((stateNow, meta = {}) => {
    if (meta.type !== 'market:tick') shell.onState();
    const shouldPersist = !meta.noPersist
      && (meta.type !== 'market:tick' || Boolean(meta.fills) || Boolean(meta.dayClosed));
    if (shouldPersist) scheduleSave();
  });

  document.addEventListener('visibilitychange', () => {
    if (!clock) return;
    if (document.hidden) clock.suspend();
    else clock.resume();
  });

  window.addEventListener('pagehide', () => {
    flushSave();
  });

  evaluateAchievements(store.get());
  announceUnlocks(true);
  announceMarketSegments(true);
  syncPractice(store, bus);
  checkChallenge(store, bus);
  if (restored) {
    toast(i18n.t('toast.saveRestored'), 'success');
  } else {
    toast(i18n.t('toast.welcome'), 'info', 5000);
  }

  if (state.settings.speed === 0) clock.pause();
  else clock.setSpeed(state.settings.speed);

  router.start();

  if (loaded.storage === 'localstorage' && !window.__SMA_OFFLINE__) {
    toast(i18n.t('toast.storageFallback'), 'warning', 5000);
  }

  if (window.__SMA_OFFLINE__) {
    const probeKey = 'sma.storage-probe';
    let storageOk = false;
    try {
      localStorage.setItem(probeKey, 'ok');
      storageOk = localStorage.getItem(probeKey) === 'ok';
      localStorage.removeItem(probeKey);
    } catch {
      storageOk = false;
    }
    if (!storageOk) {
      toast(i18n.t('toast.offlineNoStorage'), 'warning', 8000);
    }
  }

  // Old saves are valid only for this version; explain rather than silently reset.
  if (loaded.data && !restored) {
    toast(i18n.t('toast.saveIncompatible'), 'warning', 6000);
  }
}

function announceAchievements() {
  const unlocked = evaluateAchievements(store.get());
  for (const id of unlocked) bus.emit('achievement:unlocked', { id });
}

function announceMarketSegments(silent = false) {
  const state = store.get();
  if (!state.education.seenSegments) state.education.seenSegments = ['core'];
  const fresh = newlyUnlockedSegments(state, state.education.seenSegments);
  if (!fresh.length) return;
  state.education.seenSegments = [...state.education.seenSegments, ...fresh];
  if (!silent) {
    for (const id of fresh) {
      const segment = segmentById(id);
      if (!segment) continue;
      toast(i18n.t('toast.marketSegmentUnlocked', {
        segment: i18n.t(segment.nameKey),
        count: segment.tickers.length,
      }), 'success', 4600);
    }
    bus.emit('market:segmentUnlocked', { segments: fresh });
  }
  store.update(() => {}, { type: 'education:segments', silentView: true });
  scheduleSave();
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

function launchChallenge(id) {
  return startChallenge(store, bus, id);
}

function haltChallenge() {
  return abandonChallenge(store, bus);
}

function advanceCareer() {
  return promoteCareer(store, bus);
}

const actions = {
  setLocale(locale) {
    if (!i18n) return;
    if (locale === i18n.locale) return;
    const state = store.get();
    state.education.languageSwitched = true;
    state.settings.locale = locale;
    store.update(() => {}, { type: 'locale', silentView: true, noPersist: true });
    i18n.setLocale(locale);
    document.documentElement.lang = locale;
    announceAchievements();
    scheduleSave();
  },
  toggleClock() {
    clock.toggle();
    shell.syncClock();
  },
  setSpeed(speed) {
    const next = Number(speed);
    clock.setSpeed(next === 0 ? 0 : next);
    store.get().settings.speed = next;
    store.update(() => {}, { type: 'settings', silentView: true, noPersist: true });
    shell.syncClock();
    scheduleSave();
  },
  nextDay() {
    handleFastForward();
    shell.syncClock();
  },
  setLayout(layout) {
    const state = store.get();
    if (state.settings.layout === layout) return;
    state.settings.layout = layout;
    store.update(() => {}, { type: 'settings' });
    scheduleSave();
  },
  setReducedMotion(enabled) {
    const state = store.get();
    state.settings.reducedMotion = Boolean(enabled);
    document.documentElement.classList.toggle('reduced-motion', Boolean(enabled));
    store.update(() => {}, { type: 'settings' });
    scheduleSave();
  },
  setTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    const state = store.get();
    if (state.settings.theme === value) return;
    state.settings.theme = value;
    document.documentElement.dataset.theme = value;
    store.update(() => {}, { type: 'settings' });
    scheduleSave();
  },
  inspectTicker(ticker) {
    if (!isCompanyUnlocked(store.get(), ticker)) return;
    recordInspection(store, bus, ticker, 'market');
  },
  completeDemo(demoId) {
    const state = store.get();
    if (!state.education.demoRuns) state.education.demoRuns = [];
    if (state.education.demoRuns.includes(demoId)) return;
    state.education.demoRuns.push(demoId);
    store.update(() => {}, { type: 'education:demo', demoId });
    syncPractice(store, bus);
  },
  submitOrder(input) {
    const state = store.get();
    const quote = state.market.quotes[input.ticker];
    if (!quote) {
      toast(i18n.t('error.unknownTicker'), 'error');
      return { ok: false, error: 'error.unknownTicker' };
    }
    if (!isCompanyUnlocked(state, input.ticker)) {
      toast(i18n.t('error.marketLocked'), 'error');
      return { ok: false, error: 'error.marketLocked' };
    }
    if ((input.side === 'short' || input.side === 'cover') && !isToolUnlocked(state, 'trade.short')) {
      toast(i18n.t('error.shortLocked'), 'error');
      return { ok: false, error: 'error.shortLocked' };
    }
    if (['stop', 'trailing', 'stop-limit', 'oco'].includes(input.type)
      && !isToolUnlocked(state, 'order.stop')) {
      toast(i18n.t('error.stopLocked'), 'error');
      return { ok: false, error: 'error.stopLocked' };
    }
    if (input.type === 'oco' && !isToolUnlocked(state, 'order.limit')) {
      toast(i18n.t('error.limitLocked'), 'error');
      return { ok: false, error: 'error.limitLocked' };
    }
    const fee = state.settings.commission;
    const marginEnabled = isToolUnlocked(state, 'trade.margin');
    const args = {
      account: state.account,
      orders: state.orders,
      input,
      quote,
      fee,
      day: state.market.day,
      tick: state.market.tick,
      seq: state.orderSeq,
      buyingPower: buyingPower(state.account, state.market.quotes, {
        marginEnabled, fee, orders: state.orders,
      }),
      shortCapacity: shortCapacity(state.account, state.market.quotes, quote.bid),
      allowDebit: marginEnabled,
    };
    let result;
    if (input.type === 'market') result = placeMarketOrder(args);
    else if (input.type === 'limit') result = placeLimitOrder(args);
    else if (input.type === 'oco') result = placeOcoOrder(args);
    else result = placeConditionalOrder(args);
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }

    const placedOrders = result.orders || [result.order];
    store.update((s) => {
      s.account = result.account;
      s.orders = [...placedOrders, ...s.orders].slice(0, 120);
      s.orderSeq += placedOrders.length;
    }, { type: 'order:placed' });
    scheduleSave();
    announceAchievements();

    if (result.order.status === ORDER_STATUS.filled) {
      toast(i18n.t('toast.orderFilled', {
        side: i18n.t(`trade.${input.side}`),
        qty: input.qty,
        ticker: input.ticker,
        price: money(result.order.fillPrice, i18n.locale),
      }), 'success');
      bus.emit('trade:filled', { trade: result.trade, order: result.order });
    } else {
      toast(i18n.t('toast.orderPlaced', { ticker: input.ticker, qty: input.qty }), 'info');
    }
    syncPractice(store, bus);
    return result;
  },
  cancelOrder(orderId) {
    const state = store.get();
    const result = cancelOrder(state.orders, orderId);
    if (!result.ok) return;
    store.update((s) => {
      s.orders = result.orders;
    }, { type: 'order:cancelled' });
    toast(i18n.t('toast.orderCancelled'), 'info');
    scheduleSave();
  },
  buyOptionContract({ ticker, type, strike, expiryDay, qty }) {
    const state = store.get();
    if (!isToolUnlocked(state, 'options.trade')) {
      toast(i18n.t('error.optionsLocked'), 'error');
      return { ok: false, error: 'error.optionsLocked' };
    }
    if (!isCompanyUnlocked(state, ticker)) {
      toast(i18n.t('error.marketLocked'), 'error');
      return { ok: false, error: 'error.marketLocked' };
    }
    const company = getCompany(ticker);
    const quote = state.market.quotes[ticker];
    if (!company || !quote) return { ok: false, error: 'error.unknownTicker' };
    const contract = findContract(buildOptionChain(company, quote, state.market.day), {
      type, strike, expiryDay,
    });
    if (!contract) {
      toast(i18n.t('error.contractNotFound'), 'error');
      return { ok: false, error: 'error.contractNotFound' };
    }
    const result = buyOption(state.account, {
      contract,
      qty,
      fee: state.settings.commission,
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'option:bought' });
    toast(i18n.t('toast.optionBought', {
      type: i18n.t(`options.${type}`),
      strike: money(strike, i18n.locale),
      qty,
    }), 'success', 3600);
    scheduleSave();
    syncPractice(store, bus);
    announceAchievements();
    return result;
  },
  sellOptionContract({ ticker, type, strike, expiryDay, qty }) {
    const state = store.get();
    if (!isToolUnlocked(state, 'options.trade')) {
      toast(i18n.t('error.optionsLocked'), 'error');
      return { ok: false, error: 'error.optionsLocked' };
    }
    if (!isToolUnlocked(state, 'options.sell')) {
      toast(i18n.t('error.optionsSellLocked'), 'error');
      return { ok: false, error: 'error.optionsSellLocked' };
    }
    if (!isCompanyUnlocked(state, ticker)) {
      toast(i18n.t('error.marketLocked'), 'error');
      return { ok: false, error: 'error.marketLocked' };
    }
    const company = getCompany(ticker);
    const quote = state.market.quotes[ticker];
    if (!company || !quote) return { ok: false, error: 'error.unknownTicker' };
    const contract = findContract(buildOptionChain(company, quote, state.market.day), {
      type, strike, expiryDay,
    });
    if (!contract) {
      toast(i18n.t('error.contractNotFound'), 'error');
      return { ok: false, error: 'error.contractNotFound' };
    }
    const fee = state.settings.commission;
    const cashRoom = availableOptionCash(state.account, state.market.quotes, {
      fee, orders: state.orders,
    });
    if (type === 'put' && strike * 100 * qty > cashRoom + 1e-9) {
      toast(i18n.t('error.insufficientOptionCollateral'), 'error');
      return { ok: false, error: 'error.insufficientOptionCollateral' };
    }
    if (type === 'call') {
      const coveredShares = availableCoveredShares(state.account, ticker, state.orders);
      const nakedQty = Math.max(0, qty - Math.floor(coveredShares / 100));
      if (nakedQty * quote.last * 100 * 0.2 > cashRoom + 1e-9) {
        toast(i18n.t('error.insufficientOptionCollateral'), 'error');
        return { ok: false, error: 'error.insufficientOptionCollateral' };
      }
    }
    const result = sellOption(state.account, {
      contract, qty, fee, day: state.market.day, tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'option:sold' });
    toast(i18n.t('toast.optionSold', {
      type: i18n.t(`options.${type}`),
      strike: money(strike, i18n.locale),
      qty,
    }), 'success', 3600);
    scheduleSave();
    syncPractice(store, bus);
    announceAchievements();
    return result;
  },
  openOptionStrategy(strategyId, { ticker, expiryDays, qty }) {
    const state = store.get();
    if (!isToolUnlocked(state, 'options.trade') || !isToolUnlocked(state, 'options.sell')) {
      return { ok: false, error: 'error.optionsSellLocked' };
    }
    if (!isCompanyUnlocked(state, ticker)) {
      toast(i18n.t('error.marketLocked'), 'error');
      return { ok: false, error: 'error.marketLocked' };
    }
    const company = getCompany(ticker);
    const quote = state.market.quotes[ticker];
    if (!company || !quote) return { ok: false, error: 'error.unknownTicker' };
    const quantity = Math.max(1, Math.floor(Number(qty) || 1));
    const strategy = buildStrategy(
      strategyId,
      buildOptionChain(company, quote, state.market.day),
      expiryDays,
      quantity,
    );
    if (!strategy) {
      toast(i18n.t('error.contractNotFound'), 'error');
      return { ok: false, error: 'error.contractNotFound' };
    }
    const fee = state.settings.commission;
    const cashRoom = availableOptionCash(state.account, state.market.quotes, {
      fee, orders: state.orders,
    });
    if (strategyId === 'coveredCall') {
      const coveredShares = availableCoveredShares(state.account, ticker, state.orders);
      if (coveredShares < 100 * quantity) {
        toast(i18n.t('error.needCoveredShares'), 'error');
        return { ok: false, error: 'error.needCoveredShares' };
      }
    } else if (strategyId === 'cashSecuredPut') {
      const put = strategy.legs[0].contract;
      if (put.strike * 100 * quantity > cashRoom + 1e-9) {
        toast(i18n.t('error.insufficientOptionCollateral'), 'error');
        return { ok: false, error: 'error.insufficientOptionCollateral' };
      }
    } else {
      const cashNeeded = Math.max(0, strategy.netCost) + fee * strategy.legs.length;
      if (cashNeeded > availableCash(state.account, state.orders, fee) + 1e-9) {
        toast(i18n.t('error.insufficientCash'), 'error');
        return { ok: false, error: 'error.insufficientCash' };
      }
    }
    const ordered = [...strategy.legs].sort((a, b) => (a.side === 'sell' ? -1 : 1) - (b.side === 'sell' ? -1 : 1));
    const result = executeOptionLegs(state.account, ordered, {
      fee, day: state.market.day, tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'option:strategy' });
    toast(i18n.t('toast.strategyOpened', {
      strategy: i18n.t(strategy.def.nameKey),
      qty: quantity,
    }), 'success', 4200);
    scheduleSave();
    syncPractice(store, bus);
    announceAchievements();
    return result;
  },
  closeOptionContract(key, qty) {
    const state = store.get();
    const result = closeOption(state.account, {
      key,
      qty,
      fee: state.settings.commission,
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'option:closed' });
    toast(i18n.t('toast.optionClosed', {
      pnl: money(result.trade.realized, i18n.locale),
    }), 'info', 3600);
    scheduleSave();
    syncPractice(store, bus);
    return result;
  },
  openFutureContract({ ticker, expiryDays, side, qty }) {
    const state = store.get();
    if (!isToolUnlocked(state, 'trade.futures')) {
      toast(i18n.t('error.futuresLocked'), 'error');
      return { ok: false, error: 'error.futuresLocked' };
    }
    if (!isCompanyUnlocked(state, ticker)) {
      toast(i18n.t('error.marketLocked'), 'error');
      return { ok: false, error: 'error.marketLocked' };
    }
    const quote = state.market.quotes[ticker];
    if (!quote) return { ok: false, error: 'error.unknownTicker' };
    const chain = buildFuturesChain(quote, state.market.day);
    const contract = chain.expiries.find((entry) => entry.days === expiryDays);
    if (!contract) return { ok: false, error: 'error.contractNotFound' };
    const quantity = Math.max(0, Math.floor(Number(qty) || 0));
    const fee = state.settings.commission;
    const margin = contract.margin * quantity;
    if (margin > availableFuturesCash(state.account, { fee, orders: state.orders }) + 1e-9) {
      toast(i18n.t('error.insufficientFuturesMargin'), 'error');
      return { ok: false, error: 'error.insufficientFuturesMargin' };
    }
    const result = openFuture(state.account, {
      contract, side, qty: quantity, fee, day: state.market.day, tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'future:open' });
    toast(i18n.t('toast.futureOpened', {
      side: i18n.t(`futures.${side}`),
      qty: quantity,
      ticker,
      margin: money(margin, i18n.locale),
    }), 'success', 3800);
    scheduleSave();
    syncPractice(store, bus);
    announceAchievements();
    return result;
  },
  closeFutureContract(key, qty) {
    const state = store.get();
    const result = closeFuture(state.account, {
      key,
      qty,
      fee: state.settings.commission,
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }
    store.update((s) => {
      s.account = result.account;
    }, { type: 'future:close' });
    toast(i18n.t('toast.futureClosed', {
      pnl: money(result.trade.realized, i18n.locale),
    }), 'info', 3600);
    scheduleSave();
    syncPractice(store, bus);
    return result;
  },
  markSectionRead(unitId, sectionId) {
    const result = markSectionRead(store, bus, unitId, sectionId);
    if (result?.ok && result.xpGained) {
      toast(`+${result.xpGained} XP`, 'info', 2200);
    }
    syncPractice(store, bus);
    scheduleSave();
    return result;
  },
  submitQuiz(unitId, session, answers, { placement = false } = {}) {
    const result = gradeQuiz(session, answers);
    const record = recordQuizResult(store, bus, unitId, result, { placement });
    if (result.passed) {
      toast(i18n.t('toast.quizPassed', { score: result.score }), 'success');
    } else {
      toast(i18n.t('toast.quizFailed', { score: result.score }), 'warning', 4200);
    }
    syncPractice(store, bus);
    scheduleSave();
    return { result, record };
  },
  async saveNow() {
    await flushSave(true);
    toast(i18n.t('toast.saved'), 'success');
    return saveState;
  },
  getSaveInfo() {
    return { ...saveState };
  },
  exportSave() {
    const data = serializeState(store.get());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `stock-market-academy-save-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(i18n.t('toast.exported'), 'success');
  },
  async importSave(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateSave(parsed);
      if (!validation.ok) {
        toast(i18n.t('toast.importInvalid', { reason: validation.reason }), 'error', 5000);
        return;
      }
      blockSave = true;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      await saveChain.catch(() => {});
      await saveSnapshot(activeSaveKey, parsed);
      toast(i18n.t('toast.importOk'), 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      console.error('[import] failed', err);
      blockSave = false;
      toast(i18n.t('toast.importInvalid', { reason: 'parse-error' }), 'error', 5000);
    }
  },
  async resetGame() {
    blockSave = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveChain.catch(() => {});
    await clearSnapshot(activeSaveKey);
    window.location.hash = '#/dashboard';
    window.location.reload();
  },
  startChallenge(id) {
    const result = launchChallenge(id);
    if (!result.ok) toast(i18n.t(result.error), 'warning');
    scheduleSave();
    return result;
  },
  abandonChallenge() {
    const result = haltChallenge();
    scheduleSave();
    return result;
  },
  promoteCareer() {
    const result = advanceCareer();
    if (!result.ok) toast(i18n.t(result.error), 'warning');
    else if (result.certificates?.length) {
      toast(i18n.t('toast.certificateEarned', {
        names: result.certificates.map((entry) => i18n.t(entry.titleKey)).join(' · '),
      }), 'success', 6200);
    }
    scheduleSave();
    return result;
  },
  acceptResearchTask(taskId) {
    const result = acceptResearchTask(store, bus, taskId);
    if (!result.ok) toast(i18n.t(result.error), 'warning');
    scheduleSave();
    return result;
  },
  submitInvestmentReport(input) {
    const result = submitInvestmentReport(store, bus, input);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
    } else {
      toast(i18n.t('toast.reportGraded', {
        grade: result.report.grade,
        score: result.report.score,
        xp: result.xpGained,
      }), result.passed ? 'success' : 'warning', 6200);
    }
    scheduleSave();
    return result;
  },
  getCareerProgress() {
    return careerProgress(store.get());
  },
  setQuantConfig(config) {
    const state = store.get();
    state.quant = normalizeQuantConfig(config);
    store.update(() => {}, { type: 'quant:config' });
    scheduleSave();
    return state.quant;
  },
  createFund(input) {
    if (appMode !== 'career') {
      toast(i18n.t('fund.errorCareerOnly'), 'warning');
      return { ok: false, error: 'fund.errorCareerOnly' };
    }
    const state = store.get();
    const result = setupFund(state, input, state.market.day);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:created' });
    scheduleSave();
    toast(i18n.t('toast.fundCreated', { name: result.fund.name }), 'success', 4600);
    return { ok: true, fund: result.fund };
  },
  fundBuy(input) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    if (!state.fund || state.fund.status !== 'active') {
      toast(i18n.t('fund.errorNotActive'), 'warning');
      return { ok: false, error: 'fund.errorNotActive' };
    }
    if (!isCompanyUnlocked(state, input.ticker)) {
      toast(i18n.t('error.marketLocked'), 'warning');
      return { ok: false, error: 'error.marketLocked' };
    }
    const result = fundBuy(state.fund, state.market.quotes, {
      ...input,
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:trade' });
    scheduleSave();
    return result;
  },
  fundSell(input) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    if (!state.fund || state.fund.status !== 'active') {
      toast(i18n.t('fund.errorNotActive'), 'warning');
      return { ok: false, error: 'fund.errorNotActive' };
    }
    const result = fundSell(state.fund, state.market.quotes, {
      ...input,
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:trade' });
    scheduleSave();
    return result;
  },
  fundHire(roleId) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const result = hireEmployee(state.fund, roleId);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:team' });
    scheduleSave();
    toast(i18n.t('toast.fundHired', { role: i18n.t(result.employee.nameKey) }), 'success', 4200);
    return result;
  },
  fundFire(roleId) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const result = fireEmployee(state.fund, roleId);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:team' });
    scheduleSave();
    toast(i18n.t('toast.fundFired'), 'info');
    return result;
  },
  fundAcceptClient(candidateId) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const metrics = { ...fundMetrics(state.fund, state), day: state.market.day };
    const result = acceptClient(state.fund, candidateId, metrics);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:client' });
    scheduleSave();
    toast(i18n.t('toast.fundClientJoined', { name: result.client.name }), 'success', 4400);
    return result;
  },
  fundSettleRedemption(clientId) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const metrics = { ...fundMetrics(state.fund, state), day: state.market.day };
    const result = settleRedemption(state.fund, clientId, metrics);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => { s.fund = result.fund; }, { type: 'fund:redemption' });
    scheduleSave();
    toast(i18n.t('toast.fundRedemptionPaid', { amount: money(result.amount, i18n.locale) }), 'success', 4200);
    return result;
  },
  fundWithdrawCompanyCash() {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const result = withdrawCompanyCash(state.fund, state.account);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    store.update((s) => {
      s.fund = result.fund;
      s.account = result.account;
    }, { type: 'fund:withdraw' });
    scheduleSave();
    toast(i18n.t('toast.fundCashWithdrawn', { amount: money(result.amount, i18n.locale) }), 'success', 4200);
    return result;
  },
  fundSetStrategy(input) {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    if (!state.fund || state.fund.status !== 'active') {
      return { ok: false, error: 'fund.errorNotActive' };
    }
    const next = normalizeFundPlanConfig({
      ...state.fund.quantPlan,
      ...input,
      plan: null,
      lastPlanDay: null,
    });
    state.fund = { ...state.fund, quantPlan: next };
    store.update(() => {}, { type: 'fund:strategy' });
    scheduleSave();
    return { ok: true, config: next };
  },
  fundGeneratePlan() {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const result = buildFundPlan(state.fund, state, state.fund?.quantPlan);
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    state.fund = {
      ...state.fund,
      quantPlan: {
        ...result.config,
        plan: result.plan,
        lastPlanDay: state.market.day,
      },
    };
    store.update(() => {}, { type: 'fund:plan' });
    scheduleSave();
    return result;
  },
  fundApplyPlan() {
    if (appMode !== 'career') return { ok: false, error: 'fund.errorCareerOnly' };
    const state = store.get();
    const plan = state.fund?.quantPlan?.plan;
    const result = executeFundPlan(state.fund, state.market.quotes, plan, {
      day: state.market.day,
      tick: state.market.tick,
    });
    if (!result.ok) {
      toast(i18n.t(result.error), 'warning');
      return result;
    }
    state.fund = {
      ...result.fund,
      quantPlan: { ...state.fund.quantPlan, plan: null, lastPlanDay: state.market.day },
    };
    store.update(() => {}, { type: 'fund:plan-executed' });
    scheduleSave();
    toast(i18n.t('toast.fundPlanApplied', {
      applied: result.applied.length,
      failed: result.failures.length,
    }), result.failures.length ? 'warning' : 'success', 5200);
    return result;
  },
  getAppMode() {
    return appMode;
  },
  getSandboxConfig() {
    const state = store.get();
    return state.sandbox || readSandboxConfig();
  },
  startSandbox({ cash, seed, difficulty }) {
    const config = {
      cash: Math.min(10_000_000, Math.max(1_000, Number(cash) || 100_000)),
      seed: String(seed || '').trim().slice(0, 48) || randomSeed(),
      difficulty: ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal',
    };
    config.commission = config.difficulty === 'easy' ? 0 : config.difficulty === 'hard' ? 3 : 1;
    try {
      localStorage.setItem(MODE_KEY, 'sandbox');
      localStorage.setItem(SANDBOX_CONFIG_KEY, JSON.stringify(config));
    } catch {
      toast(i18n.t('sandbox.storageUnavailable'), 'error');
      return { ok: false };
    }
    blockSave = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    clearSnapshot(SANDBOX_KEY).finally(() => window.location.reload());
    return { ok: true, config };
  },
  restartSandbox() {
    blockSave = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    clearSnapshot(SANDBOX_KEY).finally(() => window.location.reload());
  },
  async exitSandbox() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveChain.catch(() => {});
    await flushSave();
    blockSave = true;
    try {
      localStorage.setItem(MODE_KEY, 'career');
    } catch {
      // ignore
    }
    window.location.reload();
  },
  navigate(path) {
    router.go(path);
  },
};

/* -------------------------------------------------------------------------- */
/* Simulation loop                                                             */
/* -------------------------------------------------------------------------- */

function applyFillsEmails(fills) {
  for (const fill of fills) {
    bus.emit('trade:filled', fill);
    toast(i18n.t('toast.limitFilled', {
      ticker: fill.order.ticker,
      qty: fill.order.qty,
      price: money(fill.order.fillPrice, i18n.locale),
    }), 'success');
  }
  if (fills.length) announceAchievements();
}

function runSimulation(ticks) {
  const state = store.get();
  let account = state.account;
  let orders = state.orders;
  let career = state.career;
  let careerSalary = 0;
  let careerEvaluation = null;
  let careerCertificatesEarned = [];
  let fund = state.fund;
  let fundEvents = [];
  let fills = [];
  let dividends = [];
  let optionSettlements = [];
  let earlyAssignments = [];
  let futuresVariation = 0;
  let futuresSettlements = [];
  let financing = 0;
  let marginCall = null;
  let dayClosed = false;
  const fee = state.settings.commission;
  const allowDebit = isToolUnlocked(state, 'trade.margin');

  for (let i = 0; i < ticks; i += 1) {
    const prevDay = state.market.day;
    const prevTick = state.market.tick;
    const tickResult = engine.tick();
    const processed = processOpenOrders({
      account,
      orders,
      quotes: state.market.quotes,
      fee,
      day: prevDay,
      tick: prevTick,
      allowDebit,
    });
    account = processed.account;
    orders = processed.orders;
    fills = [...fills, ...processed.fills];
    account = markOptions(account, state.market.quotes, state.market.day);
    account = markFutures(account, state.market.quotes, state.market.day);
    if (tickResult.dayClosed) {
      dayClosed = true;
      const financed = applyFinancing(account, prevDay);
      account = financed.account;
      financing += financed.charge;
      const applied = applyDividends(account, payableDividends(account, prevDay));
      account = applied.account;
      dividends = [...dividends, ...applied.dividends];
      const settled = settleOptions(account, state.market.quotes, Math.max(0, prevDay));
      account = settled.account;
      optionSettlements = [...optionSettlements, ...settled.settlements];
      const assigned = assignEarlyOptions(account, state.market.quotes, Math.max(0, prevDay));
      account = assigned.account;
      earlyAssignments = [...earlyAssignments, ...assigned.assignments];
      const varied = applyFuturesVariation(account);
      account = varied.account;
      futuresVariation += varied.variation;
      const futuresSettled = settleFutures(account, state.market.quotes, Math.max(0, prevDay));
      account = futuresSettled.account;
      futuresSettlements = [...futuresSettlements, ...futuresSettled.settlements];
      if (appMode === 'career') {
        const salary = applyCareerSalary(account, career, Math.max(0, prevDay));
        account = salary.account;
        career = salary.career;
        careerSalary += salary.amount;
        if (fund && fund.status === 'active') {
          const advancedFund = advanceFundDay(fund, {
            day: Math.max(0, prevDay),
            quotes: state.market.quotes,
            seed: state.seed,
            marketHistory: state.market.history,
          });
          fund = advancedFund.fund;
          fundEvents = [...fundEvents, ...advancedFund.events];
        }
      }
      if (allowDebit || (account.positions && Object.keys(account.positions).length)) {
        const status = marginStatus(account, state.market.quotes);
        if (status.breached) {
          const liquidation = forceLiquidation(account, state.market.quotes, {
            fee, day: Math.max(0, prevDay), tick: prevTick,
          });
          account = liquidation.account;
          marginCall = liquidation;
          orders = orders.map((order) => (
            order.status === ORDER_STATUS.open ? { ...order, status: ORDER_STATUS.cancelled } : order
          ));
          fills = [...fills, ...liquidation.trades.map((trade) => ({
            order: {
              ticker: trade.ticker,
              qty: trade.qty,
              fillPrice: trade.price,
              side: trade.side,
            },
            trade,
            liquidation: true,
          }))];
        }
      }
      account = {
        ...account,
        equityHistory: snapshotEquity(account, state.market.quotes, Math.max(0, prevDay)),
      };
      if (appMode === 'career') {
        const day = Math.max(0, prevDay);
        const careerState = {
          ...state, account, career, fund,
        };
        career = refreshResearchTasks(careerState, day);
        const evaluated = evaluateCareerPerformance({ ...careerState, career }, day);
        career = evaluated.career;
        if (evaluated.due) {
          careerEvaluation = evaluated.evaluation;
        }
        const synced = syncCareerCertificates({ ...careerState, career }, day);
        career = synced.career;
        if (synced.newlyEarned.length) {
          careerCertificatesEarned = [...careerCertificatesEarned, ...synced.newlyEarned];
        }
      }
    }
  }

  store.update((s) => {
    s.account = account;
    s.orders = orders;
    s.career = career;
    s.fund = fund;
  }, {
    type: 'market:tick',
    fills: fills.length,
    dayClosed,
  });
  checkChallenge(store, bus);

  if (fills.length) {
    applyFillsEmails(fills.filter((fill) => !fill.liquidation));
    syncPractice(store, bus);
  }
  if (dividends.length) {
    const total = dividends.reduce((sum, row) => sum + row.amount, 0);
    if (total >= 0) {
      toast(i18n.t('toast.dividendPaid', {
        amount: money(total, i18n.locale),
        count: dividends.length,
      }), 'success', 4200);
    } else {
      toast(i18n.t('toast.dividendOwed', {
        amount: money(-total, i18n.locale),
        count: dividends.length,
      }), 'warning', 4200);
    }
    announceAchievements();
  }
  if (financing > 0) {
    toast(i18n.t('toast.financingCharged', { amount: money(financing, i18n.locale) }), 'warning', 3600);
  }
  if (careerSalary > 0) {
    toast(i18n.t('toast.careerSalary', {
      amount: money(careerSalary, i18n.locale),
      rank: i18n.t(careerRankByNumber(career.rank).titleKey),
    }), 'success', 4600);
  }
  if (careerEvaluation) {
    toast(i18n.t('toast.careerEvaluation', {
      grade: careerEvaluation.grade,
      score: careerEvaluation.score,
    }), ['A', 'B'].includes(careerEvaluation.grade) ? 'success' : 'warning', 5200);
  }
  if (careerCertificatesEarned.length) {
    toast(i18n.t('toast.certificateEarned', {
      names: careerCertificatesEarned.map((entry) => i18n.t(entry.titleKey)).join(' · '),
    }), 'success', 6200);
  }
  if (fundEvents.length) {
    const closed = fundEvents.find((event) => event.type === 'closed');
    if (closed) {
      toast(i18n.t('toast.fundClosed', {
        reason: i18n.t(`fund.closeReason.${closed.reason}`),
      }), 'warning', 6200);
    } else {
      const request = fundEvents.find((event) => event.type === 'redemptionRequest');
      if (request) {
        toast(i18n.t('toast.fundRedemptionRequest', { name: request.name }), 'warning', 5200);
      }
      if (fundEvents.some((event) => event.type === 'payrollShort')) {
        toast(i18n.t('toast.fundPayrollShort', {
          amount: money(fund.payrollDue || 0, i18n.locale),
        }), 'warning', 5200);
      }
    }
  }
  if (optionSettlements.length) {
    const pnl = optionSettlements.reduce((sum, row) => sum + row.realized, 0);
    toast(i18n.t('toast.optionSettled', {
      count: optionSettlements.length,
      amount: money(pnl, i18n.locale),
    }), pnl >= 0 ? 'success' : 'warning', 4200);
    announceAchievements();
  }
  if (earlyAssignments.length) {
    toast(i18n.t('toast.optionAssignedEarly', {
      count: earlyAssignments.length,
      ticker: earlyAssignments[0].ticker,
    }), 'warning', 5200);
  }
  if (futuresVariation !== 0) {
    toast(i18n.t('toast.futuresVariation', {
      amount: money(futuresVariation, i18n.locale),
    }), futuresVariation > 0 ? 'success' : 'warning', 3600);
  }
  if (futuresSettlements.length) {
    const pnl = futuresSettlements.reduce((sum, row) => sum + row.realized, 0);
    toast(i18n.t('toast.futuresSettled', {
      count: futuresSettlements.length,
      amount: money(pnl, i18n.locale),
    }), pnl >= 0 ? 'success' : 'warning', 4200);
    announceAchievements();
  }
  if (marginCall) {
    toast(i18n.t('toast.marginCall', { count: marginCall.closed.length }), 'error', 5200);
    syncPractice(store, bus);
  }
}

function handleTick() {
  if (router && router.current && router.current.startsWith('/history/')) {
    if (currentView && currentView.onClockTick) {
      currentView.onClockTick();
      return;
    }
    return;
  }
  runSimulation(1);
  if (shell) shell.onTick();
  if (Date.now() - lastSimSaveAt > 8000) {
    lastSimSaveAt = Date.now();
    scheduleSave();
  }
}

function handleFastForward() {
  if (router && router.current && router.current.startsWith('/history/')) {
    if (currentView && currentView.onClockFastForward) {
      currentView.onClockFastForward();
    }
    return;
  }
  const state = store.get();
  const remaining = state.market.tick === 0 ? TICKS_PER_DAY : TICKS_PER_DAY - state.market.tick;
  runSimulation(Math.max(1, remaining));
  if (shell) shell.onTick();
  lastSimSaveAt = Date.now();
  scheduleSave();
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

function scheduleSave() {
  // Debounce without letting a continuously running clock postpone saving forever.
  if (saveTimer) return;
  const delay = (typeof window !== 'undefined' && window.__SMA_OFFLINE__) ? 1400 : 700;
  saveTimer = setTimeout(() => flushSave(false), delay);
}

let saveChain = Promise.resolve();

async function flushSave(force = false) {
  if (!store || blockSave) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // Serialise writes so a slower, older snapshot can never overwrite a newer one.
  const snapshot = serializeState(store.get());
  saveChain = saveChain.then(async () => {
    const result = await saveSnapshot(activeSaveKey, snapshot);
    if (result.ok) {
      saveState = { lastSavedAt: Date.now(), storage: result.storage };
    } else {
      console.error('[save] failed', result.error);
      if (force) toast(i18n.t('toast.saveFailed'), 'error');
    }
  }).catch((err) => {
    console.error('[save] chain failed', err);
  });
  await saveChain;
}

/* -------------------------------------------------------------------------- */
/* Unlock announcements                                                        */
/* -------------------------------------------------------------------------- */

function announceUnlocks(silent = false) {
  const state = store.get();
  if (!state.education.unlockedSeen) state.education.unlockedSeen = [];
  const nowUnlocked = allTools().filter((id) => isToolUnlocked(state, id));
  const fresh = nowUnlocked.filter((id) => !state.education.unlockedSeen.includes(id));
  if (!fresh.length) return;
  state.education.unlockedSeen = nowUnlocked;
  store.update(() => {}, { type: 'education:unlocks', silentView: true });
  if (!silent) bus.emit('tool:unlocked', { tools: fresh });
  scheduleSave();
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

function renderRoute(route) {
  if (!shell) return;
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  if (currentView && currentView.destroy) {
    try {
      currentView.destroy();
    } catch (err) {
      console.error('[route] destroy failed', err);
    }
  }
  const segments = route.segments || [];
  const section = segments[0] || 'dashboard';
  const viewEl = shell.viewEl;
  if (!viewEl) return;
  viewEl.innerHTML = '';

  let view = null;
  const ctx = {
    i18n, store, bus, router, actions, toast, clock, openLockedToolModal, appMode,
  };

  switch (section) {
    case 'dashboard':
      view = createDashboardView(ctx);
      break;
    case 'academy': {
      if (segments.length === 1) {
        view = createAcademyView(ctx);
      } else {
        const unitId = segments[1];
        const sub = segments[2];
        if (sub === 'quiz') view = createQuizView(ctx, { unitId, mode: 'quiz' });
        else if (sub === 'testout') view = createQuizView(ctx, { unitId, mode: 'testout' });
        else if (sub === 'practice') view = createPracticeView(ctx, { unitId });
        else view = createLessonView(ctx, { unitId, sectionId: sub || null });
      }
      break;
    }
    case 'branches':
      view = createBranchesView(ctx);
      break;
    case 'career':
      view = createCareerView(ctx);
      break;
    case 'fund':
      view = createFundView(ctx);
      break;
    case 'quant':
      view = createQuantView(ctx);
      break;
    case 'market':
      view = createMarketView(ctx);
      break;
    case 'trade':
    case 'trading':
      view = createTradeView(ctx, { ticker: segments[1] });
      break;
    case 'portfolio':
      view = createPortfolioView(ctx);
      break;
    case 'sandbox':
      view = createSandboxView(ctx);
      break;
    case 'news':
      view = createNewsView(ctx);
      break;
    case 'glossary':
      view = createGlossaryView(ctx);
      break;
    case 'settings':
      view = createSettingsView(ctx);
      break;
    case 'roadmap':
      view = createRoadmapView(ctx);
      break;
    case 'history':
      view = segments[1]
        ? createHistoryScenarioView(ctx, segments[1])
        : createHistoryListView(ctx);
      break;
    case 'options':
      view = createOptionsView(ctx);
      break;
    case 'futures':
      view = createFuturesView(ctx);
      break;
    case 'challenges':
      view = createChallengesView(ctx);
      break;
    case 'boundaries':
      view = createBoundariesView(ctx);
      break;
    default:
      view = createDashboardView(ctx);
  }

  try {
    view.mount(viewEl);
  } catch (err) {
    console.error('[route] view failed', err);
    viewEl.innerHTML = `<div class="view-error"><h2>${i18n.t('error.viewFailed')}</h2><p>${i18n.t('error.viewFailedText')}</p></div>`;
    return;
  }
  currentView = view;
  currentUnsubscribe = viewSubscription(store, view);
  if (shell) shell.updateNavActive();
}

window.addEventListener('error', (event) => {
  console.error('[app] unhandled error', event.error || event.message);
});

boot().catch((err) => {
  console.error('[boot] fatal', err);
  const appRoot = document.getElementById('app');
  if (appRoot) {
    appRoot.innerHTML = `<div class="boot-error"><h1>Stock Market Academy</h1><p>启动失败 / Failed to start.</p><pre>${String(err && err.message ? err.message : err)}</pre></div>`;
  }
});
