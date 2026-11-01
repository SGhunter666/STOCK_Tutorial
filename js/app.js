/**
 * Application composition root.
 * Wires i18n, persistence, simulation, education engines, the UI shell and router.
 */
import { loadDictionaries, I18n, detectLocale } from './i18n/i18n.js';
import { createBus } from './core/bus.js';
import { createStore } from './core/store.js';
import { saveSnapshot, loadSnapshot, clearSnapshot, SAVE_KEY } from './core/persistence.js';
import {
  createGameState, hydrateState, validateSave, serializeState, marketEngineFromState,
} from './game/gameState.js';
import { MarketClock } from './market/clock.js';
import { TICKS_PER_DAY } from './market/calendar.js';
import { payableDividends, applyDividends } from './market/dividends.js';
import {
  processOpenOrders, placeMarketOrder, placeLimitOrder, cancelOrder, ORDER_STATUS,
} from './trading/orderEngine.js';
import { snapshotEquity } from './trading/account.js';
import { money } from './core/format.js';
import {
  markSectionRead, recordQuizResult,
} from './education/lessonEngine.js';
import { syncPractice, recordInspection } from './education/practiceEngine.js';
import { gradeQuiz } from './education/quizEngine.js';
import { allTools, isToolUnlocked, TOOL_DEFS } from './education/unlockManager.js';
import { isCompanyUnlocked, newlyUnlockedSegments, segmentById } from './market/marketAccess.js';
import { evaluateAchievements, achievementById } from './education/progress.js';
import { getUnit } from './education/curriculum.js';
import { createShell } from './ui/shell.js';
import { Router } from './ui/router.js';
import { initComponents, toast, openLockedToolModal } from './ui/components.js';
import { viewSubscription } from './ui/dom.js';
import { createDashboardView } from './ui/views/dashboard.js';
import { createAcademyView } from './ui/views/academy.js';
import { createLessonView } from './ui/views/lesson.js';
import { createQuizView } from './ui/views/quiz.js';
import { createPracticeView } from './ui/views/practice.js';
import { createMarketView } from './ui/views/market.js';
import { createTradeView } from './ui/views/trading.js';
import { createPortfolioView } from './ui/views/portfolio.js';
import { createNewsView } from './ui/views/news.js';
import { createGlossaryView } from './ui/views/glossary.js';
import { createSettingsView } from './ui/views/settings.js';
import { createRoadmapView, createLockedFeatureView } from './ui/views/roadmap.js';
import { createHistoryListView, createHistoryScenarioView } from './ui/views/history.js';
import { showOnboarding } from './ui/onboarding.js';

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
  const loaded = await loadSnapshot(SAVE_KEY);
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
  shell = createShell({ i18n, store, bus, clock, router, actions });

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
    const fee = state.settings.commission;
    const args = {
      account: state.account,
      orders: state.orders,
      input,
      quote,
      fee,
      day: state.market.day,
      tick: state.market.tick,
      seq: state.orderSeq,
    };
    const result = input.type === 'market' ? placeMarketOrder(args) : placeLimitOrder(args);
    if (!result.ok) {
      toast(i18n.t(result.error), 'error');
      return result;
    }

    store.update((s) => {
      s.account = result.account;
      s.orders = [result.order, ...s.orders].slice(0, 120);
      s.orderSeq += 1;
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
      await saveSnapshot(SAVE_KEY, parsed);
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
    await clearSnapshot(SAVE_KEY);
    window.location.hash = '#/dashboard';
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
  let fills = [];
  let dividends = [];
  let dayClosed = false;
  const fee = state.settings.commission;

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
    });
    account = processed.account;
    orders = processed.orders;
    fills = [...fills, ...processed.fills];
    if (tickResult.dayClosed) {
      dayClosed = true;
      const applied = applyDividends(account, payableDividends(account, prevDay));
      account = applied.account;
      dividends = [...dividends, ...applied.dividends];
      account = {
        ...account,
        equityHistory: snapshotEquity(account, state.market.quotes, Math.max(0, prevDay)),
      };
    }
  }

  store.update((s) => {
    s.account = account;
    s.orders = orders;
  }, {
    type: 'market:tick',
    fills: fills.length,
    dayClosed,
  });

  if (fills.length) {
    applyFillsEmails(fills);
    syncPractice(store, bus);
  }
  if (dividends.length) {
    const total = dividends.reduce((sum, row) => sum + row.amount, 0);
    toast(i18n.t('toast.dividendPaid', {
      amount: money(total, i18n.locale),
      count: dividends.length,
    }), 'success', 4200);
    announceAchievements();
  }
}

function handleTick() {
  runSimulation(1);
  if (shell) shell.onTick();
  if (Date.now() - lastSimSaveAt > 8000) {
    lastSimSaveAt = Date.now();
    scheduleSave();
  }
}

function handleFastForward() {
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
    const result = await saveSnapshot(SAVE_KEY, snapshot);
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
  const ctx = { i18n, store, bus, router, actions, toast, openLockedToolModal };

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
      view = createLockedFeatureView(ctx, 'options');
      break;
    case 'challenges':
      view = createLockedFeatureView(ctx, 'challenges');
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
