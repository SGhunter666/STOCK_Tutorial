/**
 * Portfolio helpers shared by Dashboard and Portfolio views.
 * Keeps allocation math away from the UI layer.
 */
import { positionRows, equity, marketValue, unrealizedPnl, totalPnl, returnPct } from './account.js';

export function portfolioSummary(account, quotes) {
  const rows = positionRows(account, quotes);
  const holdingsValue = marketValue(account, quotes);
  const total = equity(account, quotes);
  const unrealized = unrealizedPnl(account, quotes);

  const withWeights = rows.map((row) => ({
    ...row,
    weight: total > 0 ? (Math.abs(row.value) / total) * 100 : 0,
  }));

  return {
    rows: withWeights,
    holdingsValue,
    total,
    cash: account.cash,
    cashWeight: total > 0 ? (account.cash / total) * 100 : 0,
    unrealized,
    realized: account.realizedPnl,
    totalPnl: totalPnl(account, quotes),
    returnPct: returnPct(account, quotes),
    feesPaid: account.feesPaid,
    positionsCount: withWeights.length,
  };
}

export function sectorAllocation(rows, companiesByTicker) {
  const map = new Map();
  for (const row of rows) {
    const company = companiesByTicker[row.ticker];
    const sector = company ? company.sector : 'unknown';
    const entry = map.get(sector) || { sector, value: 0, weight: 0 };
    entry.value += Math.abs(row.value);
    entry.weight += row.weight;
    map.set(sector, entry);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}
