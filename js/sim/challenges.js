/**
 * Phase 6 exchange challenges. A challenge is a bounded scoring run on the
 * simulated exchange: a return target, a drawdown limit, position caps and an
 * allowed-asset list. All checks read the same account and price state as the
 * trading engine, so no separate ledger is introduced.
 */

export const SIM_CHALLENGES = Object.freeze([
  {
    id: 'sprint',
    days: 10,
    targetReturn: 0.03,
    maxDrawdown: 0.06,
    maxPositionWeight: 0.4,
    allowShort: false,
    allowOptions: false,
    allowMargin: false,
    allowedAssets: ['stock', 'etf', 'bond'],
  },
  {
    id: 'hedge',
    days: 20,
    targetReturn: 0.06,
    maxDrawdown: 0.1,
    maxPositionWeight: 0.35,
    allowShort: true,
    allowOptions: true,
    allowMargin: true,
    allowedAssets: ['stock', 'etf', 'bond', 'option'],
  },
  {
    id: 'marathon',
    days: 40,
    targetReturn: 0.1,
    maxDrawdown: 0.15,
    maxPositionWeight: 0.3,
    allowShort: true,
    allowOptions: true,
    allowMargin: true,
    allowedAssets: ['stock', 'etf', 'bond', 'option'],
  },
]);

export const SIM_CHALLENGE_BY_ID = Object.freeze(
  Object.fromEntries(SIM_CHALLENGES.map((challenge) => [challenge.id, challenge])),
);

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function createChallengeState() {
  return { active: null, history: [] };
}

export function challengeById(id) {
  return SIM_CHALLENGE_BY_ID[id] || null;
}

function ruleError(code) {
  return { ok: false, error: `challenge.${code}` };
}

/** Starts a scoring run from the current account and equity. */
export function startChallenge(state, id, equityValue) {
  const def = challengeById(id);
  if (!def) return ruleError('invalid');
  if (state.challenge?.active) return ruleError('active');
  const startEquity = round(equityValue, 2);
  if (!Number.isFinite(startEquity) || startEquity <= 0) return ruleError('invalid');
  state.challenge = {
    active: {
      id: def.id,
      startDay: state.dayIndex,
      endDay: state.dayIndex + def.days,
      startEquity,
      peakEquity: startEquity,
      maxDrawdown: 0,
      status: 'active',
      progress: [{
        day: state.dayIndex,
        equity: startEquity,
        returnPct: 0,
        drawdown: 0,
      }],
    },
    history: state.challenge?.history || [],
  };
  return { ok: true, active: state.challenge.active, definition: def };
}

export function abandonChallenge(state) {
  const active = state.challenge?.active;
  if (!active) return ruleError('none');
  const closed = { ...active, status: 'abandoned', closedDay: state.dayIndex };
  state.challenge.history.unshift(closed);
  if (state.challenge.history.length > 20) state.challenge.history.length = 20;
  state.challenge.active = null;
  return { ok: true, challenge: closed };
}

/** Applies asset / side / margin / concentration rules before a new exposure. */
export function challengeGuard(state, {
  asset, action, gross = 0, fee = 0, positionValue = 0, equityValue = 0,
}) {
  const active = state.challenge?.active;
  if (!active) return { ok: true };
  const def = challengeById(active.id);
  if (!def) return { ok: true };
  if (!def.allowedAssets.includes(asset)) {
    return { ok: false, error: `challenge.assetBlocked.${asset}` };
  }
  if (action === 'openShort' && !def.allowShort) {
    return { ok: false, error: 'challenge.shortBlocked' };
  }
  if (action === 'openLong' && !def.allowMargin
    && gross + fee > state.account.cash + 1e-9) {
    return { ok: false, error: 'challenge.marginBlocked' };
  }
  if (positionValue > 0 && equityValue > 0
    && positionValue > def.maxPositionWeight * equityValue + 1e-9) {
    return { ok: false, error: 'challenge.positionLimit' };
  }
  return { ok: true };
}

export function challengeSnapshot(state, equityValue) {
  const active = state.challenge?.active;
  if (!active) {
    return {
      active: false,
      history: state.challenge?.history || [],
      challenges: SIM_CHALLENGES,
    };
  }
  const def = challengeById(active.id) || {};
  const returnPct = active.startEquity > 0
    ? (equityValue - active.startEquity) / active.startEquity
    : 0;
  const drawdown = active.peakEquity > 0
    ? (active.peakEquity - equityValue) / active.peakEquity
    : 0;
  return {
    active: true,
    id: active.id,
    definition: def,
    startEquity: active.startEquity,
    equity: round(equityValue, 2),
    returnPct,
    drawdown,
    maxDrawdown: active.maxDrawdown,
    daysLeft: Math.max(0, active.endDay - state.dayIndex),
    daysElapsed: Math.max(0, state.dayIndex - active.startDay),
    progress: active.progress || [],
    status: active.status,
    history: state.challenge?.history || [],
    challenges: SIM_CHALLENGES,
  };
}

function scoreFor({ returnPct, maxDrawdown, def, trades }) {
  const returnScore = Math.max(0, Math.min(60, (returnPct / def.targetReturn) * 60));
  const ddScore = Math.max(0, Math.min(30, (1 - maxDrawdown / def.maxDrawdown) * 30));
  const activityScore = Math.min(10, Math.max(0, trades));
  return Math.round(returnScore + ddScore + activityScore);
}

function gradeFor(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

/**
 * Marks equity at each day open, tracks drawdown and settles the run when the
 * deadline passes or the drawdown limit is breached.
 */
export function updateChallenge(state, equityValue) {
  const active = state.challenge?.active;
  if (!active || active.status !== 'active') return { changed: false };
  const def = challengeById(active.id);
  if (!def) return { changed: false };
  const equityNow = round(equityValue, 2);
  active.peakEquity = Math.max(active.peakEquity, equityNow);
  const drawdown = active.peakEquity > 0
    ? (active.peakEquity - equityNow) / active.peakEquity
    : 0;
  active.maxDrawdown = Math.max(active.maxDrawdown, drawdown);
  const returnPct = active.startEquity > 0
    ? (equityNow - active.startEquity) / active.startEquity
    : 0;
  const last = active.progress[active.progress.length - 1];
  if (!last || last.day !== state.dayIndex) {
    active.progress.push({
      day: state.dayIndex,
      equity: equityNow,
      returnPct: round(returnPct, 6),
      drawdown: round(drawdown, 6),
    });
    if (active.progress.length > 80) active.progress.shift();
  }
  if (drawdown > def.maxDrawdown + 1e-9) {
    return finishChallenge(state, 'failed', 'drawdown', equityNow, def);
  }
  if (state.dayIndex >= active.endDay) {
    const passed = returnPct >= def.targetReturn;
    return finishChallenge(state, passed ? 'passed' : 'failed',
      passed ? 'target' : 'targetMissed', equityNow, def);
  }
  return { changed: true, status: 'active' };
}

function finishChallenge(state, status, reason, equityNow, def) {
  const active = state.challenge.active;
  const returnPct = active.startEquity > 0
    ? (equityNow - active.startEquity) / active.startEquity
    : 0;
  const trades = (state.account.trades || []).filter(
    (trade) => trade.day >= active.startDay,
  ).length;
  const score = scoreFor({
    returnPct, maxDrawdown: active.maxDrawdown, def, trades,
  });
  const closed = {
    ...active,
    status,
    reason,
    closedDay: state.dayIndex,
    endEquity: round(equityNow, 2),
    returnPct: round(returnPct, 6),
    score,
    grade: gradeFor(score),
  };
  state.challenge.history.unshift(closed);
  if (state.challenge.history.length > 20) state.challenge.history.length = 20;
  state.challenge.active = null;
  return { changed: true, status, closed };
}
