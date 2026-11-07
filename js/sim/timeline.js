/**
 * Phase 6 time-travel review. The engine stores a compact snapshot at every day
 * open, so a player can rewind to an earlier session and replay it as a new
 * branch. Snapshots are capped to keep the save file small.
 */

export const SIM_TIMELINE_LIMIT = 20;

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function createTimelineState() {
  return { snapshots: [], branches: [] };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactAccount(account) {
  if (!account) return account;
  const margin = account.margin || {};
  return {
    cash: account.cash,
    initialCash: account.initialCash,
    positions: clone(account.positions),
    shorts: clone(account.shorts),
    options: clone(account.options || []),
    optionSettlements: clone((account.optionSettlements || []).slice(0, 20)),
    bonds: clone(account.bonds || {}),
    coupons: clone((account.coupons || []).slice(0, 20)),
    margin: {
      accruedInterest: margin.accruedInterest || 0,
      accruedBorrowFees: margin.accruedBorrowFees || 0,
      lastAccrualDay: margin.lastAccrualDay || 0,
      call: clone(margin.call),
      calls: clone((margin.calls || []).slice(-10)),
      charges: clone((margin.charges || []).slice(-10)),
      forcedLiquidations: clone((margin.forcedLiquidations || []).slice(-10)),
    },
    realizedPnl: account.realizedPnl,
    fees: account.fees,
    trades: clone((account.trades || []).slice(-40)),
    dividends: clone((account.dividends || []).slice(-20)),
  };
}

export function captureSnapshot(state, equityValue) {
  const prices = {};
  for (const [ticker, cs] of Object.entries(state.companies)) {
    prices[ticker] = {
      last: cs.last,
      fairValue: cs.fairValue,
      prevClose: cs.prevClose,
      open: cs.open,
      high: cs.high,
      low: cs.low,
      volume: cs.volume,
      trades: cs.trades,
      inventory: cs.inventory,
      ema: cs.ema,
      splitFactor: cs.splitFactor,
      capitalFactor: cs.capitalFactor,
      haltedUntilDay: cs.haltedUntilDay,
      delisted: cs.delisted,
      lastReportQuarter: cs.lastReportQuarter,
    };
  }
  return {
    day: state.dayIndex,
    second: state.second,
    equity: round(equityValue, 2),
    prices,
    account: compactAccount(state.account),
    challenge: clone(state.challenge),
    macro: clone(state.macro),
    lastNewsDay: state.lastNewsDay,
    lastMacroDay: state.lastMacroDay,
    marketFactor: state.marketFactor,
    sectorFactors: clone(state.sectorFactors),
    rngState: clone(state.rngState),
    stats: clone(state.stats),
  };
}

/** Records the day open once; replaces an existing snapshot for the same day. */
export function recordTimeline(state, equityValue) {
  if (!state.timeline) state.timeline = createTimelineState();
  const snapshots = state.timeline.snapshots;
  const snapshot = captureSnapshot(state, equityValue);
  const index = snapshots.findIndex((item) => item.day === snapshot.day);
  if (index >= 0) snapshots[index] = snapshot;
  else snapshots.push(snapshot);
  snapshots.sort((a, b) => a.day - b.day);
  while (snapshots.length > SIM_TIMELINE_LIMIT) snapshots.shift();
  return snapshot;
}

export function timelineRows(state) {
  const snapshots = state.timeline?.snapshots || [];
  const first = snapshots[0];
  return snapshots.map((snapshot) => ({
    day: snapshot.day,
    equity: snapshot.equity,
    returnPct: first && first.equity > 0
      ? (snapshot.equity - first.equity) / first.equity
      : 0,
    positionsCount: Object.keys(snapshot.account?.positions || {}).length
      + Object.keys(snapshot.account?.shorts || {}).length,
    branches: (state.timeline?.branches || []).filter(
      (branch) => branch.fromDay === snapshot.day,
    ).length,
  })).sort((a, b) => b.day - a.day);
}

export function findSnapshot(state, day) {
  const snapshots = state.timeline?.snapshots || [];
  return snapshots.find((snapshot) => snapshot.day === day) || null;
}

export function truncateTimeline(state, day) {
  if (!state.timeline) return;
  state.timeline.snapshots = state.timeline.snapshots.filter(
    (snapshot) => snapshot.day <= day,
  );
}

export function recordBranch(state, fromDay, reason = 'rewind') {
  if (!state.timeline) state.timeline = createTimelineState();
  state.timeline.branches.unshift({
    fromDay,
    day: state.dayIndex,
    reason,
    createdAt: { day: state.dayIndex, second: state.second },
  });
  if (state.timeline.branches.length > 20) state.timeline.branches.length = 20;
}
