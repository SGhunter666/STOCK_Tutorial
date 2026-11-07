/**
 * Phase 5 margin trading and short selling for the simulated exchange.
 * The module is pure: it reads engine state (quotes, positions, short book and
 * live orders) and never imports the engine, so the engine can own execution
 * while all risk maths stays in one place.
 */

import { optionMarketValue, optionCollateral, optionRows } from './options.js';
import { bondMarketValue } from './bonds.js';

export const SIM_MARGIN_CONFIG = Object.freeze({
  initialLong: 0.5,
  initialShort: 0.5,
  maintenanceLong: 0.25,
  maintenanceShort: 0.3,
  marginInterestRate: 0.065,
  borrowFeeRate: 0.03,
  accrualDays: 252,
  callGraceDays: 1,
});

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function createMarginState() {
  return {
    accruedInterest: 0,
    accruedBorrowFees: 0,
    lastAccrualDay: 0,
    call: null,
    calls: [],
    charges: [],
    forcedLiquidations: [],
  };
}

/** Adds the Phase 5 fields to older saves without touching existing data. */
export function normalizeAccount(account) {
  if (!account) return account;
  if (!account.shorts || typeof account.shorts !== 'object') account.shorts = {};
  if (!Array.isArray(account.options)) account.options = [];
  for (const position of account.options) {
    if (!position.style) position.style = 'european';
  }
  if (!Array.isArray(account.optionSettlements)) account.optionSettlements = [];
  if (!account.bonds || typeof account.bonds !== 'object') account.bonds = {};
  if (!Array.isArray(account.coupons)) account.coupons = [];
  if (!account.margin) account.margin = createMarginState();
  const margin = account.margin;
  margin.accruedInterest = Number.isFinite(margin.accruedInterest) ? margin.accruedInterest : 0;
  margin.accruedBorrowFees = Number.isFinite(margin.accruedBorrowFees)
    ? margin.accruedBorrowFees : 0;
  margin.lastAccrualDay = Number.isFinite(margin.lastAccrualDay) ? margin.lastAccrualDay : 0;
  margin.call = margin.call || null;
  margin.calls = Array.isArray(margin.calls) ? margin.calls : [];
  margin.charges = Array.isArray(margin.charges) ? margin.charges : [];
  margin.forcedLiquidations = Array.isArray(margin.forcedLiquidations)
    ? margin.forcedLiquidations : [];
  for (const [ticker, short] of Object.entries(account.shorts)) {
    const qty = Math.floor(Number(short.qty) || 0);
    if (qty <= 0) {
      delete account.shorts[ticker];
      continue;
    }
    short.qty = qty;
    short.avgPrice = Number.isFinite(short.avgPrice) ? short.avgPrice : 0;
    short.openedDay = Number.isFinite(short.openedDay) ? short.openedDay : 0;
  }
  return account;
}

export function isLiveOrder(order) {
  if (!order || order.active === false) return false;
  if (order.status === 'pending') return true;
  return order.type === 'limit' && ['open', 'partiallyFilled'].includes(order.status);
}

function orderPrice(state, order) {
  if (order.type === 'limit') return order.limitPrice;
  return order.side === 'buy' || order.side === 'cover'
    ? state.quotes[order.ticker]?.ask || 0
    : state.quotes[order.ticker]?.bid || 0;
}

/** Initial-margin requirement still reserved by working player orders. */
export function reservedRequirement(state, excludeOrderId = null) {
  let total = 0;
  for (const order of state.orders || []) {
    if (order.owner !== 'player' || !isLiveOrder(order)) continue;
    if (order.id === excludeOrderId) continue;
    const action = order.action || (order.side === 'buy' ? 'openLong' : 'closeLong');
    const ratio = action === 'openShort'
      ? SIM_MARGIN_CONFIG.initialShort
      : action === 'openLong' ? SIM_MARGIN_CONFIG.initialLong : 0;
    if (!ratio) continue;
    const remaining = order.qty - (order.filledQty || 0);
    const price = orderPrice(state, order);
    if (remaining > 0 && price > 0) total += remaining * price * ratio;
  }
  return round(total, 2);
}

/**
 * Full risk picture. Equity is cash plus long value minus the cost of buying
 * back every borrowed share; borrowed cash is simply negative cash.
 */
export function marginSnapshot(state, { excludeOrderId = null } = {}) {
  const account = state.account;
  let longMarketValue = 0;
  let shortMarketValue = 0;
  for (const [ticker, position] of Object.entries(account.positions || {})) {
    if (!position || position.qty <= 0) continue;
    longMarketValue += position.qty * (state.quotes[ticker]?.last || 0);
  }
  for (const [ticker, short] of Object.entries(account.shorts || {})) {
    if (!short || short.qty <= 0) continue;
    shortMarketValue += short.qty * (state.quotes[ticker]?.last || 0);
  }
  const cash = account.cash;
  const options = optionMarketValue(state);
  const optionRequirement = optionCollateral(state);
  const bonds = bondMarketValue(state);
  const equity = round(cash + longMarketValue - shortMarketValue + options + bonds, 2);
  const baseInitial = SIM_MARGIN_CONFIG.initialLong * longMarketValue
    + SIM_MARGIN_CONFIG.initialShort * shortMarketValue + optionRequirement;
  const reserved = reservedRequirement(state, excludeOrderId);
  const initialRequirement = round(baseInitial + reserved, 2);
  const maintenanceRequirement = round(
    SIM_MARGIN_CONFIG.maintenanceLong * longMarketValue
    + SIM_MARGIN_CONFIG.maintenanceShort * shortMarketValue + optionRequirement, 2,
  );
  const maintenanceExcess = round(equity - maintenanceRequirement, 2);
  const borrowedCash = round(Math.max(0, -cash), 2);
  const call = account.margin?.call || null;
  const status = equity <= 0 ? 'liquidation' : maintenanceExcess < 0 ? 'call' : 'ok';
  return {
    cash: round(cash, 2),
    longMarketValue: round(longMarketValue, 2),
    shortMarketValue: round(shortMarketValue, 2),
    optionMarketValue: options,
    optionRequirement,
    bondMarketValue: bonds,
    equity,
    baseInitialRequirement: round(baseInitial, 2),
    reservedRequirement: reserved,
    initialRequirement,
    maintenanceRequirement,
    maintenanceExcess,
    buyingPower: round(Math.max(0, (equity - initialRequirement) / SIM_MARGIN_CONFIG.initialLong), 2),
    shortPower: round(Math.max(0, (equity - initialRequirement) / SIM_MARGIN_CONFIG.initialShort), 2),
    borrowedCash,
    accruedInterest: round(account.margin?.accruedInterest || 0, 2),
    accruedBorrowFees: round(account.margin?.accruedBorrowFees || 0, 2),
    status,
    call,
  };
}

/** True when a new opening trade leaves enough initial margin. */
export function canOpenPosition(state, { action, gross, fee = 0, excludeOrderId = null }) {
  const snapshot = marginSnapshot(state, { excludeOrderId });
  const ratio = action === 'openShort'
    ? SIM_MARGIN_CONFIG.initialShort : SIM_MARGIN_CONFIG.initialLong;
  return snapshot.equity - fee >= snapshot.initialRequirement + ratio * gross + 1e-9;
}

export function shortRows(state) {
  return Object.entries(state.account.shorts || {}).map(([ticker, short]) => {
    const last = state.quotes[ticker]?.last || 0;
    const marketValue = round(short.qty * last, 2);
    const unrealized = round((short.avgPrice - last) * short.qty, 2);
    return {
      ticker,
      name: state.companies[ticker]?.company.name || ticker,
      qty: short.qty,
      avgPrice: round(short.avgPrice, 4),
      last,
      marketValue,
      unrealized,
      openedDay: short.openedDay,
    };
  }).sort((a, b) => b.marketValue - a.marketValue);
}

/** Charges interest on debit cash and a borrow fee on short market value. */
export function accrueMarginCharges(state, days = 1) {
  const account = normalizeAccount(state.account);
  const margin = account.margin;
  const elapsed = Math.max(0, Math.floor(days));
  if (elapsed <= 0) return { interest: 0, borrowFee: 0, total: 0 };
  const snapshot = marginSnapshot(state);
  const interestBase = Math.max(0, -account.cash);
  const interest = round(
    interestBase * SIM_MARGIN_CONFIG.marginInterestRate * elapsed
    / SIM_MARGIN_CONFIG.accrualDays, 2,
  );
  const borrowFee = round(
    snapshot.shortMarketValue * SIM_MARGIN_CONFIG.borrowFeeRate * elapsed
    / SIM_MARGIN_CONFIG.accrualDays, 2,
  );
  const total = round(interest + borrowFee, 2);
  if (interest > 0) {
    margin.accruedInterest = round(margin.accruedInterest + interest, 2);
    margin.charges.push({
      day: state.dayIndex,
      type: 'interest',
      amount: -interest,
      basis: round(interestBase, 2),
    });
  }
  if (borrowFee > 0) {
    margin.accruedBorrowFees = round(margin.accruedBorrowFees + borrowFee, 2);
    margin.charges.push({
      day: state.dayIndex,
      type: 'borrowFee',
      amount: -borrowFee,
      basis: snapshot.shortMarketValue,
    });
  }
  if (total > 0) account.cash = round(account.cash - total, 2);
  if (margin.charges.length > 240) margin.charges.splice(0, margin.charges.length - 240);
  margin.lastAccrualDay = state.dayIndex;
  return { interest, borrowFee, total };
}

/**
 * Raises or clears a margin call. A severe breach (equity <= 0) is liquidated
 * immediately; otherwise the player gets a one-day grace period.
 */
export function evaluateMarginCall(state) {
  const account = normalizeAccount(state.account);
  const margin = account.margin;
  const snapshot = marginSnapshot(state);
  if (snapshot.equity >= snapshot.maintenanceRequirement) {
    if (margin.call && margin.call.status === 'open') {
      margin.call.status = 'met';
      margin.call.closedDay = state.dayIndex;
      margin.call.closedSecond = state.second;
      const historic = margin.calls.find((item) => item.id === margin.call.id);
      if (historic) Object.assign(historic, margin.call);
      margin.call = null;
    }
    return { status: 'ok', snapshot, liquidate: false, call: null };
  }
  if (!margin.call || margin.call.status !== 'open') {
    const dueDay = state.dayIndex + (snapshot.equity <= 0 ? 0 : SIM_MARGIN_CONFIG.callGraceDays);
    margin.call = {
      id: `M${margin.calls.length + 1}`,
      day: state.dayIndex,
      second: state.second,
      dueDay,
      deficit: round(-snapshot.maintenanceExcess, 2),
      status: 'open',
    };
    margin.calls.push({ ...margin.call });
    if (margin.calls.length > 60) margin.calls.splice(0, margin.calls.length - 60);
  } else {
    margin.call.deficit = round(-snapshot.maintenanceExcess, 2);
  }
  const liquidate = snapshot.equity <= 0 || state.dayIndex >= margin.call.dueDay;
  return { status: liquidate ? 'liquidation' : 'call', snapshot, liquidate, call: margin.call };
}

/** Largest position that can be closed to restore maintenance margin. */
export function nextLiquidationTarget(state) {
  const snapshot = marginSnapshot(state);
  if (snapshot.maintenanceExcess >= 0) return null;
  const longs = Object.entries(state.account.positions || {})
    .filter(([, position]) => position && position.qty > 0)
    .map(([ticker, position]) => ({
      ticker,
      action: 'closeLong',
      qty: position.qty,
      value: position.qty * (state.quotes[ticker]?.last || 0),
    }));
  const shorts = Object.entries(state.account.shorts || {})
    .filter(([, short]) => short && short.qty > 0)
    .map(([ticker, short]) => ({
      ticker,
      action: 'closeShort',
      qty: short.qty,
      value: short.qty * (state.quotes[ticker]?.last || 0),
    }));
  const shortOptions = optionRows(state)
    .filter((position) => position.qty < 0)
    .map((position) => ({
      ticker: position.ticker,
      action: 'closeShortOption',
      key: position.key,
      qty: position.absQty,
      value: Math.abs(position.marketValue),
    }));
  const candidates = [...longs, ...shorts, ...shortOptions].sort((a, b) => b.value - a.value);
  const target = candidates[0];
  if (!target) return null;
  return {
    ticker: target.ticker,
    action: target.action,
    qty: target.qty,
    key: target.key || null,
  };
}

export function recordForcedLiquidation(state, entry) {
  const account = normalizeAccount(state.account);
  const margin = account.margin;
  const reason = account.margin.call ? 'maintenance' : 'negativeEquity';
  margin.forcedLiquidations.push({
    day: state.dayIndex,
    second: state.second,
    reason,
    ...entry,
  });
  if (margin.forcedLiquidations.length > 120) {
    margin.forcedLiquidations.splice(0, margin.forcedLiquidations.length - 120);
  }
}

export function closeMarginCall(state, status = 'liquidated') {
  const account = normalizeAccount(state.account);
  const margin = account.margin;
  if (!margin.call) return;
  margin.call.status = status;
  margin.call.closedDay = state.dayIndex;
  margin.call.closedSecond = state.second;
  const historic = margin.calls.find((item) => item.id === margin.call.id);
  if (historic) Object.assign(historic, margin.call);
  margin.call = null;
}
