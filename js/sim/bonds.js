/**
 * Phase 5 corporate bonds for the simulated exchange. Bonds are dealer-quoted
 * from a policy-rate curve plus a credit spread, pay quarterly coupons and use
 * the same cash account and ledger as stocks, ETFs and options.
 */
import { dateForTradingDay } from '../market/calendar.js';
import { SIM_COMPANY_BY_TICKER } from './companies50.js';

export const SIM_BOND_FACE = 100;
export const SIM_BOND_FEE_BPS = 10;
export const SIM_BOND_COUPON_DAYS = 63;

export const SIM_BONDS = Object.freeze([
  {
    id: 'APLA5', issuer: 'APLA', years: 5, coupon: 4.2, rating: 'A', spreadBps: 70,
  },
  {
    id: 'NVDO10', issuer: 'NVDO', years: 10, coupon: 4.8, rating: 'AA', spreadBps: 45,
  },
  {
    id: 'NCRT5', issuer: 'NCRT', years: 5, coupon: 6.2, rating: 'BB', spreadBps: 240,
  },
  {
    id: 'TSLO5', issuer: 'TSLO', years: 5, coupon: 4.0, rating: 'A', spreadBps: 90,
  },
  {
    id: 'NGRD10', issuer: 'NGRD', years: 10, coupon: 4.4, rating: 'BBB', spreadBps: 140,
  },
  {
    id: 'TDFU5', issuer: 'TDFU', years: 5, coupon: 8.1, rating: 'B', spreadBps: 420,
  },
]);

export const SIM_BOND_BY_ID = Object.freeze(
  Object.fromEntries(SIM_BONDS.map((bond) => [bond.id, bond])),
);

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function bondName(bond) {
  const issuer = SIM_COMPANY_BY_TICKER[bond.issuer];
  return `${issuer?.name || bond.issuer} ${bond.years}Y ${bond.coupon}%`;
}

export function bondYield(state, bond) {
  const policy = Number(state.macro?.policyRate) || 4;
  const termPremium = Math.max(0, bond.years - 2) * 0.035;
  return round(Math.max(0.5, policy + termPremium + bond.spreadBps / 100), 4);
}

/** Clean price per 100 face, semi-annual present value. */
export function bondPrice(state, bond) {
  const y = bondYield(state, bond) / 100;
  const periods = Math.max(1, Math.round(bond.years * 2));
  const coupon = SIM_BOND_FACE * (bond.coupon / 100) / 2;
  const discount = 1 + y / 2;
  let value = 0;
  for (let period = 1; period <= periods; period += 1) {
    value += coupon / (discount ** period);
  }
  value += SIM_BOND_FACE / (discount ** periods);
  return round(value, 2);
}

export function bondQuote(state, bond) {
  const mid = bondPrice(state, bond);
  const width = bond.rating === 'B' ? 1.2 : bond.rating === 'BB' ? 0.8 : 0.35;
  return {
    id: bond.id,
    issuer: bond.issuer,
    name: bondName(bond),
    years: bond.years,
    coupon: bond.coupon,
    rating: bond.rating,
    yieldPct: bondYield(state, bond),
    mid,
    bid: round(Math.max(1, mid - width / 2), 2),
    ask: round(mid + width / 2, 2),
  };
}

export function bondQuotes(state) {
  return SIM_BONDS.map((bond) => bondQuote(state, bond));
}

function positionFor(state, id) {
  return state.account.bonds?.[id] || null;
}

function pushBondTrade(state, trade) {
  state.account.trades.push({
    asset: 'bond',
    date: dateForTradingDay(state.dayIndex).toISOString().slice(0, 10),
    day: state.dayIndex,
    second: state.second,
    ...trade,
  });
  if (state.account.trades.length > 500) state.account.trades.splice(0, state.account.trades.length - 500);
}

export function buyBond(state, id, qty, { availableCash = null } = {}) {
  const bond = SIM_BOND_BY_ID[id];
  const quantity = Math.floor(Number(qty) || 0);
  if (!bond || quantity <= 0) return { ok: false, error: 'bond.invalid' };
  const issuer = state.companies[bond.issuer];
  if (issuer?.delisted) return { ok: false, error: 'bond.delisted' };
  const quote = bondQuote(state, bond);
  const gross = round(quote.ask * quantity, 2);
  const fee = round(gross * SIM_BOND_FEE_BPS / 10_000, 2);
  const cost = round(gross + fee, 2);
  const budget = availableCash === null ? state.account.cash : availableCash;
  if (cost > budget + 1e-9) return { ok: false, error: 'bond.insufficientCash' };
  const existing = positionFor(state, id);
  const nextQty = (existing?.qty || 0) + quantity;
  const nextBasis = round((existing?.costBasis || 0) + cost, 2);
  const position = {
    id,
    issuer: bond.issuer,
    qty: nextQty,
    costBasis: nextBasis,
    avgPrice: round(nextBasis / nextQty, 4),
    coupon: bond.coupon,
    lastCouponDay: existing?.lastCouponDay ?? state.dayIndex,
    purchaseDay: existing?.purchaseDay ?? state.dayIndex,
  };
  state.account.bonds = { ...(state.account.bonds || {}), [id]: position };
  state.account.cash = round(state.account.cash - cost, 2);
  state.account.fees += fee;
  pushBondTrade(state, {
    ticker: id,
    side: 'buy',
    qty: quantity,
    price: quote.ask,
    fee,
    ytm: quote.yieldPct,
    realized: 0,
  });
  return { ok: true, quote, qty: quantity, cost, fee };
}

export function sellBond(state, id, qty) {
  const bond = SIM_BOND_BY_ID[id];
  const position = positionFor(state, id);
  const quantity = Math.floor(Number(qty) || 0);
  if (!bond || !position) return { ok: false, error: 'bond.noPosition' };
  if (quantity <= 0) return { ok: false, error: 'bond.invalid' };
  if (quantity > position.qty) return { ok: false, error: 'bond.insufficient' };
  const quote = bondQuote(state, bond);
  const gross = round(quote.bid * quantity, 2);
  const fee = round(gross * SIM_BOND_FEE_BPS / 10_000, 2);
  const proceeds = round(gross - fee, 2);
  const basisPart = round(position.costBasis * quantity / position.qty, 2);
  const realized = round(proceeds - basisPart, 2);
  const remaining = position.qty - quantity;
  if (remaining > 0) {
    state.account.bonds = {
      ...state.account.bonds,
      [id]: {
        ...position,
        qty: remaining,
        costBasis: round(position.costBasis - basisPart, 2),
        avgPrice: round((position.costBasis - basisPart) / remaining, 4),
      },
    };
  } else {
    const next = { ...state.account.bonds };
    delete next[id];
    state.account.bonds = next;
  }
  state.account.cash = round(state.account.cash + proceeds, 2);
  state.account.fees += fee;
  state.account.realizedPnl = round(state.account.realizedPnl + realized, 2);
  pushBondTrade(state, {
    ticker: id,
    side: 'sell',
    qty: quantity,
    price: quote.bid,
    fee,
    ytm: quote.yieldPct,
    realized,
  });
  return { ok: true, quote, qty: quantity, proceeds, realized, fee };
}

/** Pays one quarterly coupon per position every 63 trading days. */
export function accrueBondCoupons(state) {
  const positions = state.account.bonds || {};
  if (!Object.keys(positions).length) return { total: 0, entries: [] };
  let total = 0;
  const entries = [];
  const next = {};
  for (const [id, position] of Object.entries(positions)) {
    const last = Number.isFinite(position.lastCouponDay) ? position.lastCouponDay : state.dayIndex;
    if (state.dayIndex - last >= SIM_BOND_COUPON_DAYS) {
      const amount = round(position.qty * (position.coupon || 0) / 4, 2);
      total = round(total + amount, 2);
      entries.push({ id, issuer: position.issuer, qty: position.qty, amount, day: state.dayIndex });
      next[id] = { ...position, lastCouponDay: state.dayIndex };
    } else {
      next[id] = position;
    }
  }
  if (total > 0) {
    state.account.cash = round(state.account.cash + total, 2);
    state.account.coupons = [
      ...entries,
      ...(state.account.coupons || []),
    ].slice(0, 120);
    state.account.bonds = next;
  }
  return { total, entries };
}

export function bondMarketValue(state) {
  return round(Object.entries(state.account.bonds || {}).reduce((sum, [id, position]) => {
    const bond = SIM_BOND_BY_ID[id];
    return sum + (bond ? bondQuote(state, bond).mid * position.qty : 0);
  }, 0), 2);
}

export function bondRows(state) {
  return Object.entries(state.account.bonds || {}).map(([id, position]) => {
    const bond = SIM_BOND_BY_ID[id];
    if (!bond) return null;
    const quote = bondQuote(state, bond);
    const marketValue = round(quote.mid * position.qty, 2);
    return {
      id,
      issuer: bond.issuer,
      name: quote.name,
      qty: position.qty,
      avgPrice: position.avgPrice,
      bid: quote.bid,
      ask: quote.ask,
      mid: quote.mid,
      yieldPct: quote.yieldPct,
      coupon: bond.coupon,
      rating: bond.rating,
      marketValue,
      unrealized: round(marketValue - position.costBasis, 2),
      lastCouponDay: position.lastCouponDay,
    };
  }).filter(Boolean).sort((a, b) => b.marketValue - a.marketValue);
}
