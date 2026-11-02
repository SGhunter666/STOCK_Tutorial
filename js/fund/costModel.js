/**
 * Teaching transaction-cost model for fund plans. Execution already pays the
 * bid/ask spread; plans additionally reserve a deterministic market-impact
 * estimate and report commission, spread and impact separately.
 */
import { getCompany } from '../data/companies.js';

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function estimateTradeCost(ticker, quote, side, qty, fee = 1) {
  if (!quote) return null;
  const mid = (quote.ask + quote.bid) / 2;
  const price = side === 'sell' ? quote.bid : quote.ask;
  const notional = Math.max(0, qty) * price;
  if (!Number.isFinite(notional) || notional <= 0 || mid <= 0) return null;
  const company = getCompany(ticker);
  const averageVolume = Math.max(1, Number(company?.avgVolume) || 1);
  const participation = clamp(notional / (averageVolume * mid), 0, 1, 0);
  const impactPct = Math.min(0.35, Math.round(5 * Math.sqrt(participation) * 100) / 100);
  const spreadPct = Math.round(Math.max(0, (quote.ask - quote.bid) / mid * 50) * 100) / 100;
  return {
    notional: Math.round(notional * 100) / 100,
    participation,
    impactPct,
    spreadPct,
    impactCost: Math.round(notional * impactPct / 100 * 100) / 100,
    spreadCost: Math.round(notional * spreadPct / 100 * 100) / 100,
    commission: fee,
  };
}

/** Quantity that keeps a buy at the target value after impact slippage. */
export function targetBuyQuantity(ticker, quote, targetValue, fee = 1) {
  if (!quote || !(targetValue > 0)) return 0;
  const baseQty = Math.floor(targetValue / Math.max(0.01, quote.ask));
  if (baseQty <= 0) return 0;
  const estimate = estimateTradeCost(ticker, quote, 'buy', baseQty, fee);
  const effectivePrice = Math.round(quote.ask * (1 + (estimate?.impactPct || 0) / 100) * 100) / 100;
  return Math.max(0, Math.floor(targetValue / Math.max(0.01, effectivePrice)));
}

export function summarizePlanCosts(trades, nav = 0) {
  const totals = trades.reduce((sum, trade) => ({
    commission: sum.commission + (trade.commission || 0),
    spread: sum.spread + (trade.spreadCost || 0),
    impact: sum.impact + (trade.impactCost || 0),
  }), { commission: 0, spread: 0, impact: 0 });
  const total = totals.commission + totals.spread + totals.impact;
  return {
    commission: Math.round(totals.commission * 100) / 100,
    spread: Math.round(totals.spread * 100) / 100,
    impact: Math.round(totals.impact * 100) / 100,
    total: Math.round(total * 100) / 100,
    totalPct: nav > 0 ? Math.round(total / nav * 10000) / 100 : 0,
  };
}
