/**
 * Read-only performance review for the simulated exchange. It folds recorded
 * fills, open positions and saved session snapshots into the statistics shown
 * on the exchange page; nothing here mutates engine state.
 */
import { optionRows } from './options.js';
import { bondRows } from './bonds.js';

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/** Realized and unrealized P&L grouped by underlying ticker or bond id. */
export function reviewAttribution(state) {
  const map = new Map();
  const add = (ticker, realized, unrealized) => {
    if (!ticker) return;
    const row = map.get(ticker) || { ticker, realized: 0, unrealized: 0 };
    row.realized += realized;
    row.unrealized += unrealized;
    map.set(ticker, row);
  };
  for (const trade of state.account?.trades || []) {
    if (Number.isFinite(trade.realized)) add(trade.ticker, trade.realized, 0);
  }
  for (const [ticker, position] of Object.entries(state.account?.positions || {})) {
    const last = state.quotes[ticker]?.last || 0;
    add(ticker, 0, (last - position.avgCost) * position.qty);
  }
  for (const [ticker, short] of Object.entries(state.account?.shorts || {})) {
    const last = state.quotes[ticker]?.last || 0;
    add(ticker, 0, (short.avgPrice - last) * short.qty);
  }
  for (const row of optionRows(state)) add(row.ticker, 0, row.pnl);
  for (const row of bondRows(state)) add(row.id, 0, row.unrealized);
  return [...map.values()]
    .map((row) => {
      const realized = round(row.realized, 2);
      const unrealized = round(row.unrealized, 2);
      return {
        ticker: row.ticker, realized, unrealized, total: round(realized + unrealized, 2),
      };
    })
    .filter((row) => Math.abs(row.realized) > 1e-9 || Math.abs(row.unrealized) > 1e-9)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/**
 * Session statistics. `equityValue` is the live mark-to-market equity so the
 * card reflects the same number as the rest of the exchange page without
 * importing the engine back into this module.
 */
export function reviewSummary(state, equityValue = 0) {
  const account = state.account || {};
  const trades = account.trades || [];
  const closed = trades.filter((trade) => Number.isFinite(trade.realized));
  const wins = closed.filter((trade) => trade.realized > 0);
  const losses = closed.filter((trade) => trade.realized < 0);
  const grossWin = sum(wins.map((trade) => trade.realized));
  const grossLoss = sum(losses.map((trade) => trade.realized));

  const rows = reviewAttribution(state);
  const unrealized = round(sum(rows.map((row) => row.unrealized)), 2);
  const history = (state.timeline?.snapshots || [])
    .map((snapshot) => snapshot.equity)
    .filter((value) => Number.isFinite(value));
  history.push(equityValue);
  let peak = history[0] ?? equityValue;
  let maxDrawdown = 0;
  for (const value of history) {
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
  }

  const initialCash = Number.isFinite(account.initialCash) ? account.initialCash : 0;
  return {
    equity: round(equityValue, 2),
    initialCash,
    returnPct: initialCash > 0 ? (equityValue - initialCash) / initialCash : 0,
    realized: round(Number(account.realizedPnl) || 0, 2),
    unrealized,
    fees: round(Number(account.fees) || 0, 2),
    financing: round(
      (Number(account.margin?.accruedInterest) || 0)
      + (Number(account.margin?.accruedBorrowFees) || 0), 2,
    ),
    dividends: round(sum((account.dividends || []).map((item) => item.amount || 0)), 2),
    coupons: round(sum((account.coupons || []).map((item) => item.amount || 0)), 2),
    tradeCount: trades.length,
    closedCount: wins.length + losses.length,
    winRate: wins.length + losses.length ? wins.length / (wins.length + losses.length) : null,
    profitFactor: losses.length ? round(grossWin / Math.abs(grossLoss), 2) : null,
    maxDrawdown,
    rows,
  };
}
