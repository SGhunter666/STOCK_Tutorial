/**
 * Simplified cash dividends for the fictional market.
 *
 * Each dividend-paying company distributes a fixed quarterly cash amount per
 * share on a deterministic ex-date every 63 trading days. The amount is derived
 * from the company's annual dividend yield at its designed start price, so the
 * quoted yield drifts with the share price just like in the real market.
 *
 * Payments are recorded in an account ledger keyed by (day, ticker) so a reload
 * or repeated day-close can never pay the same dividend twice.
 */
import { getCompany } from '../data/companies.js';

export const DIVIDEND_CYCLE = 63;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function tickerHash(ticker) {
  let hash = 0;
  for (let index = 0; index < ticker.length; index += 1) {
    hash = (hash * 31 + ticker.charCodeAt(index)) % 100000;
  }
  return hash;
}

export function dividendOffset(company) {
  return tickerHash(company.ticker) % DIVIDEND_CYCLE;
}

export function dividendPerShare(company) {
  if (!company || !company.dividendYield) return 0;
  return round2(company.startPrice * (company.dividendYield / 100) / 4);
}

export function isDividendDay(company, day) {
  if (!company || dividendPerShare(company) <= 0) return false;
  return ((day % DIVIDEND_CYCLE) + DIVIDEND_CYCLE) % DIVIDEND_CYCLE === dividendOffset(company);
}

export function nextDividendDay(company, day) {
  if (!company || dividendPerShare(company) <= 0) return null;
  const offset = dividendOffset(company);
  const remainder = ((day % DIVIDEND_CYCLE) + DIVIDEND_CYCLE) % DIVIDEND_CYCLE;
  const wait = (offset - remainder + DIVIDEND_CYCLE) % DIVIDEND_CYCLE || DIVIDEND_CYCLE;
  return day + wait;
}

/** Dividends owed on `day` for the positions held at that close. */
export function payableDividends(account, day) {
  const rows = [];
  const positions = account.positions || {};
  for (const [ticker, position] of Object.entries(positions)) {
    if (!position || position.qty <= 0) continue;
    const company = getCompany(ticker);
    if (!company || !isDividendDay(company, day)) continue;
    const perShare = dividendPerShare(company);
    rows.push({
      day,
      ticker,
      qty: position.qty,
      perShare,
      amount: round2(position.qty * perShare),
    });
  }
  return rows;
}

export function applyDividends(account, rows) {
  const ledger = Array.isArray(account.dividends) ? account.dividends : [];
  const paid = new Set(ledger.map((entry) => `${entry.day}:${entry.ticker}`));
  const fresh = (rows || []).filter((row) => row.amount > 0 && !paid.has(`${row.day}:${row.ticker}`));
  if (!fresh.length) return { account, dividends: [], total: 0 };
  const total = round2(fresh.reduce((sum, row) => sum + row.amount, 0));
  return {
    account: {
      ...account,
      cash: round2(account.cash + total),
      dividends: [...fresh, ...ledger].slice(0, 160),
    },
    dividends: fresh,
    total,
  };
}

export function dividendIncome(account) {
  return round2((account.dividends || []).reduce((sum, row) => sum + row.amount, 0));
}
