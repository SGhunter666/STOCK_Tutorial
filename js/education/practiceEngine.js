/**
 * Practice engine: verifies that the player actually performed the required action.
 * Tasks are evaluated against real simulation state (trades, orders, inspections),
 * never against a "task complete" button.
 */
import { ALL_UNITS } from './curriculum.js';
import { getCompany } from '../data/companies.js';
import { styleOf } from '../data/stockTypes.js';
import { ensureUnitProgress, recordPracticeCompletion } from './lessonEngine.js';

export function evaluatePractice(state, unit) {
  const task = unit.practice;
  if (!task) return { done: false, current: 0, target: 0 };
  const education = state.education;
  const trades = state.account.trades || [];
  const orders = state.orders || [];

  switch (task.check) {
    case 'inspect-companies': {
      const current = (education.inspectedTickers || []).length;
      return { done: current >= task.target, current: Math.min(current, task.target), target: task.target };
    }
    case 'buy-under-budget': {
      const match = trades.find((t) => t.side === 'buy' && t.gross > 0 && t.gross <= task.target);
      return { done: Boolean(match), current: match ? 1 : 0, target: 1 };
    }
    case 'round-trip': {
      const match = trades.find((t) => t.side === 'sell');
      return { done: Boolean(match), current: match ? 1 : 0, target: 1 };
    }
    case 'limit-fill': {
      const match = orders.find((o) => (
        o.status === 'filled'
        && o.type === 'limit'
        && o.side === 'buy'
        && o.refPrice
        && o.limitPrice < o.refPrice
      ));
      return {
        done: Boolean(match),
        current: match ? 1 : 0,
        target: 1,
        resting: orders.some((o) => o.status === 'open' && o.type === 'limit' && o.side === 'buy'),
      };
    }
    case 'inspect-dividend': {
      const tickers = education.inspectedTickers || [];
      const current = tickers.filter((ticker) => {
        const company = getCompany(ticker);
        return company && company.dividendYield > 0;
      }).length;
      return { done: current >= task.target, current: Math.min(current, task.target), target: task.target };
    }
    case 'inspect-styles': {
      const styles = new Set((education.inspectedTickers || []).map((ticker) => styleOf(ticker)).filter(Boolean));
      return { done: styles.size >= task.target, current: Math.min(styles.size, task.target), target: task.target };
    }
    case 'diversify-sectors': {
      const sectors = new Set();
      for (const [ticker, position] of Object.entries(state.account.positions || {})) {
        if (!position || position.qty <= 0) continue;
        const company = getCompany(ticker);
        if (company) sectors.add(company.sector);
      }
      return { done: sectors.size >= task.target, current: Math.min(sectors.size, task.target), target: task.target };
    }
    case 'hold-days': {
      const day = state.market.day;
      let longest = 0;
      for (const trade of trades) {
        if (trade.side !== 'buy') continue;
        const position = state.account.positions[trade.ticker];
        if (!position || position.qty <= 0) continue;
        longest = Math.max(longest, day - trade.day);
      }
      return { done: longest >= task.target, current: Math.min(longest, task.target), target: task.target };
    }
    case 'demo': {
      const runs = education.demoRuns || [];
      return { done: runs.includes(task.demoId), current: runs.includes(task.demoId) ? 1 : 0, target: 1 };
    }
    case 'advanced-inspect': {
      const advanced = state.settings.layout === 'advanced';
      const current = (education.inspectedTickers || []).length;
      return {
        done: advanced && current >= task.target,
        current: advanced ? Math.min(current, task.target) : 0,
        target: task.target,
        needsAdvanced: !advanced,
      };
    }
    default:
      return { done: false, current: 0, target: 1 };
  }
}

/** Re-evaluates every implemented practice task. Returns units completed by this call. */
export function syncPractice(store, bus) {
  const state = store.get();
  const completed = [];
  for (const unit of ALL_UNITS) {
    if (!unit.implemented || !unit.practice) continue;
    const progress = ensureUnitProgress(state, unit.id);
    if (progress.practiceDone) continue;
    const result = evaluatePractice(state, unit);
    if (result.done) {
      const outcome = recordPracticeCompletion(store, bus, unit.id);
      completed.push({ unitId: unit.id, ...result, outcome });
    }
  }
  return completed;
}

export function recordInspection(store, bus, ticker, source = 'market') {
  const state = store.get();
  if (!state.education.inspectedTickers) state.education.inspectedTickers = [];
  if (!state.education.inspectedTickers.includes(ticker)) {
    state.education.inspectedTickers.push(ticker);
    store.update(() => {}, { type: 'education:inspect', ticker });
    if (bus) bus.emit('market:inspected', { ticker, source });
    syncPractice(store, bus);
  }
}

export function recordGlossaryVisit(store, bus, termId) {
  const state = store.get();
  if (!state.education.glossaryOpened) state.education.glossaryOpened = [];
  if (!state.education.glossaryOpened.includes(termId)) {
    state.education.glossaryOpened.push(termId);
    store.update(() => {}, { type: 'education:glossary', termId, silentView: true });
    if (bus) bus.emit('glossary:opened', { termId });
  }
}
