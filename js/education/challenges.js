/**
 * Challenge mode: goal-based trading runs evaluated against the real account.
 * A challenge records its starting equity and sequence numbers, so progress is
 * measured only from the moment the player starts it.
 */
import { equity } from '../trading/account.js';
import { isUnitComplete } from './lessonEngine.js';
import { awardXp, evaluateAchievements } from './progress.js';

export const CHALLENGES = [
  {
    id: 'firstProfit',
    titleKey: 'challenges.firstProfit.title',
    descKey: 'challenges.firstProfit.desc',
    xp: 120,
    days: 15,
    unlockUnit: 'u3',
    checks: [{ kind: 'return', target: 3 }, { kind: 'trades', target: 2 }],
  },
  {
    id: 'riskManager',
    titleKey: 'challenges.riskManager.title',
    descKey: 'challenges.riskManager.desc',
    xp: 180,
    days: 30,
    unlockUnit: 'u15',
    checks: [
      { kind: 'return', target: 2 },
      { kind: 'drawdownMax', target: 6 },
      { kind: 'trades', target: 8 },
    ],
  },
  {
    id: 'hedger',
    titleKey: 'challenges.hedger.title',
    descKey: 'challenges.hedger.desc',
    xp: 220,
    days: 20,
    unlockUnit: 'u30',
    checks: [{ kind: 'hedge' }],
  },
  {
    id: 'incomeDesk',
    titleKey: 'challenges.incomeDesk.title',
    descKey: 'challenges.incomeDesk.desc',
    xp: 240,
    days: 20,
    unlockUnit: 'u26',
    checks: [{ kind: 'income' }],
  },
  {
    id: 'volatilityDesk',
    titleKey: 'challenges.volatilityDesk.title',
    descKey: 'challenges.volatilityDesk.desc',
    xp: 260,
    days: 25,
    unlockUnit: 'u28',
    checks: [{ kind: 'volatility' }],
  },
  {
    id: 'allRound',
    titleKey: 'challenges.allRound.title',
    descKey: 'challenges.allRound.desc',
    xp: 320,
    days: 40,
    unlockUnit: 'u32',
    checks: [{ kind: 'return', target: 5 }, { kind: 'allRound' }],
  },
];

export function ensureChallenges(state) {
  if (!state.challenges) {
    state.challenges = { active: null, completed: [], failed: [] };
  }
  if (!Array.isArray(state.challenges.completed)) state.challenges.completed = [];
  if (!Array.isArray(state.challenges.failed)) state.challenges.failed = [];
  return state.challenges;
}

export function challengeById(id) {
  return CHALLENGES.find((challenge) => challenge.id === id) || null;
}

export function isChallengeUnlocked(state, challenge) {
  return isUnitComplete(state, challenge.unlockUnit);
}

function positionShares(state, ticker) {
  const position = state.account.positions && state.account.positions[ticker];
  return position && position.qty > 0 ? position.qty : 0;
}

function hasIncomeStrategy(state) {
  const options = state.account.options || [];
  const shortCall = options.find((position) => position.type === 'call' && position.qty < 0);
  const covered = shortCall
    && positionShares(state, shortCall.ticker) >= -shortCall.qty * 100;
  const shortPut = options.find((position) => (
    position.type === 'put' && position.qty < 0
    && state.account.cash >= position.strike * 100 * -position.qty
  ));
  return Boolean(covered || shortPut);
}

function hasVolatilityLong(state) {
  const byExpiry = new Map();
  for (const position of state.account.options || []) {
    if (position.qty <= 0) continue;
    const entry = byExpiry.get(position.expiryDay) || new Set();
    entry.add(position.type);
    byExpiry.set(position.expiryDay, entry);
  }
  return [...byExpiry.values()].some((types) => types.has('call') && types.has('put'));
}

function hasHedge(state) {
  const longStock = Object.values(state.account.positions || {}).some((position) => position.qty > 0);
  const shortFuture = (state.account.futures || []).some((position) => position.side === 'short');
  return longStock && shortFuture;
}

function countSince(items, startSeq) {
  if (!Array.isArray(items) || !Number.isFinite(startSeq)) return 0;
  return items.filter((item) => Number.isFinite(item.id) && item.id >= startSeq).length;
}

function drawdownSince(state, active, currentEquity) {
  const history = (state.account.equityHistory || [])
    .filter((entry) => Number.isFinite(entry.day) && entry.day >= active.startDay)
    .map((entry) => entry.equity);
  history.push(currentEquity);
  let peak = -Infinity;
  let worst = 0;
  for (const value of history) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.max(worst, ((peak - value) / peak) * 100);
  }
  return Math.max(0, worst);
}

function metricValues(state, active) {
  const currentEquity = equity(state.account, state.market.quotes);
  const startEquity = active.startEquity || currentEquity;
  const returnPct = startEquity > 0 ? ((currentEquity - startEquity) / startEquity) * 100 : 0;
  const stockTrades = countSince(state.account.trades, active.startTradeSeq);
  const optionTrades = countSince(state.account.optionTrades, active.startOptionSeq);
  const futuresTrades = countSince(state.account.futuresTrades, active.startFuturesSeq);
  return {
    currentEquity,
    return: returnPct,
    drawdownMax: drawdownSince(state, active, currentEquity),
    trades: stockTrades,
    optionTrades,
    futuresTrades,
    hedge: hasHedge(state) ? 1 : 0,
    income: hasIncomeStrategy(state) ? 1 : 0,
    volatility: hasVolatilityLong(state) ? 1 : 0,
    allRound: stockTrades > 0 && optionTrades > 0 && futuresTrades > 0 ? 1 : 0,
  };
}

function checkValue(values, check) {
  const value = Number(values[check.kind] || 0);
  if (!check.target) return value > 0;
  if (check.kind === 'drawdownMax') return value <= check.target;
  return value >= check.target;
}

export function challengeProgress(state, challenge) {
  ensureChallenges(state);
  const active = state.challenges.active;
  if (!active || active.id !== challenge.id) return null;
  const values = metricValues(state, active);
  const checks = challenge.checks.map((check) => ({
    kind: check.kind,
    target: check.target,
    current: values[check.kind] || 0,
    done: checkValue(values, check),
  }));
  const remaining = Math.max(0, challenge.days - (state.market.day - active.startDay));
  return {
    active,
    values,
    checks,
    remaining,
    done: checks.every((check) => check.done),
  };
}

export function challengeSummary(state) {
  ensureChallenges(state);
  const active = state.challenges.active;
  if (!active) return null;
  const challenge = challengeById(active.id);
  if (!challenge) return null;
  return { challenge, ...challengeProgress(state, challenge) };
}

export function startChallenge(store, bus, id) {
  const state = store.get();
  const challenge = challengeById(id);
  if (!challenge) return { ok: false, error: 'challenges.errorUnknown' };
  ensureChallenges(state);
  if (!isChallengeUnlocked(state, challenge)) {
    return { ok: false, error: 'challenges.errorLocked' };
  }
  if (state.challenges.active) {
    return { ok: false, error: 'challenges.errorActive' };
  }
  state.challenges.active = {
    id,
    startDay: state.market.day,
    startTick: state.market.tick,
    startEquity: equity(state.account, state.market.quotes),
    startTradeSeq: state.account.tradeSeq,
    startOptionSeq: state.account.optionSeq,
    startFuturesSeq: state.account.futuresSeq,
    startedAt: Date.now(),
  };
  store.update(() => {}, { type: 'challenge:start', challengeId: id });
  if (bus) bus.emit('challenge:started', { id });
  return { ok: true, challenge };
}

export function abandonChallenge(store, bus) {
  const state = store.get();
  ensureChallenges(state);
  if (!state.challenges.active) return { ok: false };
  const id = state.challenges.active.id;
  state.challenges.active = null;
  store.update(() => {}, { type: 'challenge:abandon', challengeId: id });
  if (bus) bus.emit('challenge:abandoned', { id });
  return { ok: true };
}

export function checkChallenge(store, bus) {
  const state = store.get();
  ensureChallenges(state);
  const active = state.challenges.active;
  if (!active) return null;
  const challenge = challengeById(active.id);
  if (!challenge) {
    state.challenges.active = null;
    return null;
  }
  const progress = challengeProgress(state, challenge);
  if (!progress) return null;

  if (progress.done) {
    state.challenges.active = null;
    if (!state.challenges.completed.includes(challenge.id)) {
      state.challenges.completed.push(challenge.id);
    }
    const xpGained = awardXp(state.education, `challenge:${challenge.id}`, challenge.xp);
    evaluateAchievements(state);
    store.update(() => {}, { type: 'challenge:complete', challengeId: challenge.id });
    if (bus) bus.emit('challenge:completed', { id: challenge.id, xpGained });
    return { status: 'completed', id: challenge.id, xpGained };
  }

  if (state.market.day - active.startDay > challenge.days) {
    state.challenges.active = null;
    if (!state.challenges.failed.includes(challenge.id)) {
      state.challenges.failed.push(challenge.id);
    }
    store.update(() => {}, { type: 'challenge:failed', challengeId: challenge.id });
    if (bus) bus.emit('challenge:failed', { id: challenge.id });
    return { status: 'failed', id: challenge.id };
  }
  return { status: 'active', id: challenge.id };
}
