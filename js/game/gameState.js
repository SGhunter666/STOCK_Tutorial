/**
 * Game state factory + serialization/migration. Phase 1 saves everything needed to
 * restore market, account, orders and learning progress exactly.
 */
import { MarketEngine } from '../market/marketEngine.js';
import { createAccount } from '../trading/account.js';
import { ALL_UNITS } from '../education/curriculum.js';
import { ensureUnitProgress } from '../education/lessonEngine.js';

export const SAVE_VERSION = 2;
export const DEFAULT_CASH = 10000;
export const DEFAULT_SEED = 'academy-2026';

export function createGameState({ locale = 'en', seed = DEFAULT_SEED, initialCash = DEFAULT_CASH } = {}) {
  const engine = MarketEngine.create(seed);
  const state = {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    seed,
    settings: {
      locale,
      speed: 1,
      commission: 1,
      layout: 'beginner',
      reducedMotion: false,
      theme: 'dark',
    },
    market: engine.serialize(),
    account: { ...createAccount(initialCash), equityHistory: [{ day: -1, equity: initialCash }] },
    orders: [],
    orderSeq: 1,
    historyRuns: {},
    education: {
      units: {},
      inspectedTickers: [],
      glossaryOpened: [],
      demoRuns: [],
      xp: 0,
      xpAwards: {},
      achievements: [],
      languageSwitched: false,
      lastUnit: 'u1',
      unlockedSeen: ['market.browse', 'market.inspect', 'trade.market', 'portfolio.basic'],
      seenSegments: ['core'],
    },
  };

  for (const unit of ALL_UNITS.filter((entry) => entry.implemented)) ensureUnitProgress(state, unit.id);
  return state;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSave(saved) {
  if (!isPlainObject(saved)) return { ok: false, reason: 'not-an-object' };
  if (saved.version !== 1 && saved.version !== SAVE_VERSION) return { ok: false, reason: 'version-mismatch' };
  if (!isPlainObject(saved.market) || !isPlainObject(saved.market.quotes)) return { ok: false, reason: 'market-missing' };
  if (!isPlainObject(saved.account) || !Number.isFinite(saved.account.cash)) return { ok: false, reason: 'account-missing' };
  if (!Array.isArray(saved.orders)) return { ok: false, reason: 'orders-missing' };
  if (!isPlainObject(saved.education)) return { ok: false, reason: 'education-missing' };
  if (!isPlainObject(saved.settings)) return { ok: false, reason: 'settings-missing' };
  const quoteKeys = Object.keys(saved.market.quotes);
  if (quoteKeys.length === 0) return { ok: false, reason: 'quotes-empty' };

  // Basic numeric sanity: corrupted prices must never reach the simulation.
  for (const [ticker, quote] of Object.entries(saved.market.quotes)) {
    if (!Number.isFinite(quote.last) || quote.last <= 0 || !Number.isFinite(quote.bid) || !Number.isFinite(quote.ask)) {
      return { ok: false, reason: `bad-quote-${ticker}` };
    }
  }
  if (!Number.isFinite(saved.account.cash) || saved.account.cash < -1e6) return { ok: false, reason: 'bad-cash' };
  return { ok: true };
}

/** Normalises a loaded save: fills optional fields without dropping player progress. */
export function hydrateState(saved) {
  const state = saved;
  state.version = SAVE_VERSION;
  state.settings = {
    locale: state.settings.locale === 'zh-CN' ? 'zh-CN' : 'en',
    speed: [0, 1, 5, 20].includes(state.settings.speed) ? state.settings.speed : 1,
    commission: Number.isFinite(state.settings.commission) ? state.settings.commission : 1,
    layout: state.settings.layout === 'advanced' ? 'advanced' : 'beginner',
    reducedMotion: Boolean(state.settings.reducedMotion),
    theme: state.settings.theme === 'light' ? 'light' : 'dark',
  };
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  state.orderSeq = Number.isFinite(state.orderSeq) ? state.orderSeq : (state.orders.length + 1);
  state.historyRuns = isPlainObject(state.historyRuns) ? state.historyRuns : {};
  state.education = {
    units: isPlainObject(state.education.units) ? state.education.units : {},
    inspectedTickers: Array.isArray(state.education.inspectedTickers) ? state.education.inspectedTickers : [],
    glossaryOpened: Array.isArray(state.education.glossaryOpened) ? state.education.glossaryOpened : [],
    xp: Number.isFinite(state.education.xp) ? state.education.xp : 0,
    xpAwards: isPlainObject(state.education.xpAwards) ? state.education.xpAwards : {},
    achievements: Array.isArray(state.education.achievements) ? state.education.achievements : [],
    languageSwitched: Boolean(state.education.languageSwitched),
    lastUnit: typeof state.education.lastUnit === 'string' ? state.education.lastUnit : 'u1',
    unlockedSeen: Array.isArray(state.education.unlockedSeen)
      ? state.education.unlockedSeen
      : ['market.browse', 'market.inspect', 'trade.market', 'portfolio.basic'],
    demoRuns: Array.isArray(state.education.demoRuns) ? state.education.demoRuns : [],
    seenSegments: Array.isArray(state.education.seenSegments)
      ? state.education.seenSegments
      : ['core'],
  };
  state.account = {
    ...state.account,
    positions: state.account.positions || {},
    trades: Array.isArray(state.account.trades) ? state.account.trades : [],
    dividends: Array.isArray(state.account.dividends) ? state.account.dividends : [],
    equityHistory: Array.isArray(state.account.equityHistory) ? state.account.equityHistory : [],
    realizedPnl: Number.isFinite(state.account.realizedPnl) ? state.account.realizedPnl : 0,
    feesPaid: Number.isFinite(state.account.feesPaid) ? state.account.feesPaid : 0,
    financingPaid: Number.isFinite(state.account.financingPaid) ? state.account.financingPaid : 0,
    marginCalls: Array.isArray(state.account.marginCalls) ? state.account.marginCalls : [],
    options: Array.isArray(state.account.options) ? state.account.options : [],
    optionTrades: Array.isArray(state.account.optionTrades) ? state.account.optionTrades : [],
    optionSeq: Number.isFinite(state.account.optionSeq) ? state.account.optionSeq : 1,
    optionRealized: Number.isFinite(state.account.optionRealized) ? state.account.optionRealized : 0,
    futures: Array.isArray(state.account.futures) ? state.account.futures : [],
    futuresTrades: Array.isArray(state.account.futuresTrades) ? state.account.futuresTrades : [],
    futuresSeq: Number.isFinite(state.account.futuresSeq) ? state.account.futuresSeq : 1,
    futuresRealized: Number.isFinite(state.account.futuresRealized) ? state.account.futuresRealized : 0,
    futuresPnl: Number.isFinite(state.account.futuresPnl) ? state.account.futuresPnl : 0,
    initialCash: Number.isFinite(state.account.initialCash) ? state.account.initialCash : state.account.cash,
    tradeSeq: Number.isFinite(state.account.tradeSeq) ? state.account.tradeSeq : 1,
  };
  for (const unit of ALL_UNITS.filter((entry) => entry.implemented)) {
    ensureUnitProgress(state, unit.id);
    const progress = state.education.units[unit.id];
    progress.sectionsRead = isPlainObject(progress.sectionsRead) ? progress.sectionsRead : {};
    progress.quizAttempts = Number.isFinite(progress.quizAttempts) ? progress.quizAttempts : 0;
    progress.quizBest = Number.isFinite(progress.quizBest) ? progress.quizBest : null;
    progress.practiceDone = Boolean(progress.practiceDone);
    progress.placedOut = Boolean(progress.placedOut);
  }
  // Migration: v1 saves only contain the core 8 companies.
  const engine = new MarketEngine(state.market);
  engine.ensureUniverse();
  return state;
}

export function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function marketEngineFromState(state) {
  const engine = new MarketEngine(state.market);
  // Migration: older saves contain only the core segment. Fill in the rest.
  engine.ensureUniverse();
  return engine;
}
