/**
 * Simplified margin account: financing interest on a debit balance, a maintenance
 * requirement, and forced liquidation when equity falls below it. All figures are
 * derived from the player's own cash, positions and quotes.
 */
import {
  equity, maintenanceRequirement, shortMarketValue, grossExposure,
  cover, sell,
} from './account.js';

export const ANNUAL_FINANCING_RATE = 8;
export const TRADING_DAYS = 252;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function financingCharge(account, annualRate = ANNUAL_FINANCING_RATE, days = TRADING_DAYS) {
  const debit = Math.max(0, -(account.cash || 0));
  if (debit <= 0) return 0;
  return round2(debit * (annualRate / 100) / days);
}

/** Deducts one day of margin interest. The ledger total is kept for the UI. */
export function applyFinancing(account, day = 0, annualRate = ANNUAL_FINANCING_RATE) {
  const charge = financingCharge(account, annualRate);
  if (charge <= 0) return { account, charge: 0 };
  return {
    account: {
      ...account,
      cash: round2(account.cash - charge),
      financingPaid: round2((account.financingPaid || 0) + charge),
      financingDay: day,
    },
    charge,
  };
}

export function marginStatus(account, quotes) {
  const value = equity(account, quotes);
  const requirement = maintenanceRequirement(account, quotes);
  const gross = grossExposure(account, quotes);
  const shortValue = shortMarketValue(account, quotes);
  return {
    equity: value,
    requirement,
    gross,
    shortValue,
    debt: Math.max(0, -(account.cash || 0)),
    ratio: requirement > 0 ? value / requirement : null,
    breached: requirement > 0 && value < requirement,
    leveraged: account.cash < 0 || shortValue > 0,
  };
}

/**
 * Closes every position at the current quote. Shorts are covered first, then longs
 * are sold. The liquidation is recorded in `account.marginCalls` so the UI and the
 * tests can verify that a call really happened.
 */
export function forceLiquidation(account, quotes, { fee = 0, day = 0, tick = 0 } = {}) {
  let next = account;
  const trades = [];
  const closed = [];
  const status = marginStatus(account, quotes);
  const tickers = Object.keys(account.positions || {});

  for (const ticker of tickers) {
    const pos = next.positions[ticker];
    const quote = quotes[ticker];
    if (!pos || !quote) continue;
    if (pos.qty < 0) {
      const result = cover(next, {
        ticker, qty: -pos.qty, price: quote.ask, fee, day, tick, allowDebit: true,
      });
      if (result.ok) {
        next = result.account;
        trades.push(result.trade);
        closed.push({ ticker, side: 'cover', qty: -pos.qty });
      }
    }
  }

  for (const ticker of tickers) {
    const pos = next.positions[ticker];
    const quote = quotes[ticker];
    if (!pos || !quote) continue;
    if (pos.qty > 0) {
      const result = sell(next, {
        ticker, qty: pos.qty, price: quote.bid, fee, day, tick,
      });
      if (result.ok) {
        next = result.account;
        trades.push(result.trade);
        closed.push({ ticker, side: 'sell', qty: pos.qty });
      }
    }
  }

  const record = {
    day,
    equity: round2(status.equity),
    requirement: round2(status.requirement),
    closed: closed.length,
  };
  return {
    account: {
      ...next,
      marginCalls: [...(account.marginCalls || []), record].slice(-20),
    },
    trades,
    closed,
    record,
  };
}
