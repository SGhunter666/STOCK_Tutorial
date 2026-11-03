/**
 * Replay actions write into state.historyRuns so scenario progress survives reloads.
 * This account is completely separate from the academy trading account.
 */
import {
  ensureHistoryRun, createHistoryRun, advanceRun, advanceToNextEvent, tradeAtTick,
  advanceHistoryTick, applySplitsThrough,
} from './replayEngine.js';

export function runFor(state, scenarioId) {
  return state.historyRuns ? state.historyRuns[scenarioId] : null;
}

export function ensureRunInStore(store, scenarioId, dataset) {
  const state = store.get();
  if (!state.historyRuns) state.historyRuns = {};
  const existing = state.historyRuns[scenarioId];
  if (existing && existing.account) {
    const normalized = ensureHistoryRun(existing, scenarioId, dataset);
    const withSplits = applySplitsThrough(normalized, dataset, normalized.dayIndex);
    if (
      withSplits.dayIndex !== existing.dayIndex
      || withSplits.startIndex !== existing.startIndex
      || withSplits.tick !== existing.tick
      || withSplits !== normalized
    ) {
      store.update((draft) => {
        draft.historyRuns[scenarioId] = withSplits;
      }, { type: 'history:run-normalized', scenarioId });
    }
    return withSplits;
  }
  const run = createHistoryRun(scenarioId);
  store.update((draft) => {
    if (!draft.historyRuns) draft.historyRuns = {};
    draft.historyRuns[scenarioId] = run;
  }, { type: 'history:run-created', scenarioId });
  return run;
}

export function advanceHistory(store, scenarioId, dataset, scenario, { days = 1, toNextEvent = false } = {}) {
  const state = store.get();
  const current = ensureRunInStore(store, scenarioId, dataset);
  const advanced = toNextEvent
    ? advanceToNextEvent(current, dataset, scenario)
    : advanceRun(current, dataset, days);
  const next = applySplitsThrough(advanced, dataset, advanced.dayIndex);
  store.update((draft) => {
    draft.historyRuns[scenarioId] = next;
  }, { type: 'history:advance', scenarioId, days });
  return next;
}

export function tickHistory(store, scenarioId, dataset) {
  const current = ensureRunInStore(store, scenarioId, dataset);
  const rawResult = advanceHistoryTick(current, dataset);
  const next = applySplitsThrough(rawResult.run, dataset, rawResult.run.dayIndex);
  const result = next === rawResult.run ? rawResult : { ...rawResult, run: next };
  if (next !== current) {
    store.update((draft) => {
      draft.historyRuns[scenarioId] = next;
    }, {
      type: 'history:tick',
      scenarioId,
      dayClosed: result.dayClosed,
      reachedEnd: result.reachedEnd,
      noPersist: !result.dayClosed && !result.reachedEnd,
    });
  }
  return result;
}

export function tradeHistory(store, scenarioId, dataset, payload) {
  const current = ensureRunInStore(store, scenarioId, dataset);
  const result = tradeAtTick(current, dataset, payload);
  if (!result.ok) return result;
  store.update((draft) => {
    draft.historyRuns[scenarioId] = result.run;
  }, { type: 'history:trade', scenarioId });
  return result;
}

export function resetHistory(store, scenarioId) {
  const run = createHistoryRun(scenarioId);
  store.update((draft) => {
    if (!draft.historyRuns) draft.historyRuns = {};
    draft.historyRuns[scenarioId] = run;
  }, { type: 'history:reset', scenarioId });
  return run;
}

export function selectTicker(store, scenarioId, symbol) {
  const state = store.get();
  if (!state.historyRuns || !state.historyRuns[scenarioId]) return;
  store.update((draft) => {
    draft.historyRuns[scenarioId].selectedTicker = symbol;
  }, { type: 'history:select', scenarioId, symbol });
}
