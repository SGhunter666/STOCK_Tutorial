/**
 * Phase 5 European options for the simulated exchange. Contracts are quoted by
 * a deterministic dealer from Black-Scholes, trade against the same cash account
 * as stocks and ETFs, and cash-settle at expiry. No early assignment is modelled.
 */
import { dateForTradingDay } from '../market/calendar.js';
import { CONTRACT_SIZE, blackScholes } from '../options/pricing.js';

export const SIM_OPTION_TENORS = Object.freeze([7, 30, 90]);
export const SIM_OPTION_STRIKE_LEVELS = 2;
export const SIM_OPTION_FEE_BPS = 1;

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function optionExpiryLabel(dayIndex) {
  return dateForTradingDay(dayIndex).toISOString().slice(0, 10);
}

export function optionBaseVol(company) {
  const daily = Number(company?.vol) || 0.02;
  return Math.max(0.15, Math.min(1.2, daily * Math.sqrt(252)));
}

export function optionSmileVol(baseVol, spot, strike) {
  const moneyness = Math.abs(Math.log(Math.max(0.01, strike) / Math.max(0.01, spot)));
  return Math.max(0.12, baseVol * (1 + 0.18 * moneyness));
}

export function optionStrikeStep(spot) {
  if (spot < 20) return 1;
  if (spot < 60) return 2.5;
  if (spot < 150) return 5;
  return 10;
}

export function optionStrikeGrid(spot, levels = SIM_OPTION_STRIKE_LEVELS) {
  const step = optionStrikeStep(spot);
  const base = Math.floor(spot / step) * step;
  const strikes = [];
  for (let index = -levels; index <= levels; index += 1) {
    const strike = round(base + index * step, 2);
    if (strike > 0) strikes.push(strike);
  }
  return strikes;
}

export function optionKey({ ticker, type, strike, expiryDay }) {
  return `${ticker}:${type}:${Number(strike)}:${expiryDay}`;
}

export function optionYears(state, expiryDay) {
  return Math.max(0, (Number(expiryDay) - state.dayIndex) / 252);
}

export function optionContract(state, { ticker, type, strike, expiryDay }) {
  const symbol = String(ticker || '').toUpperCase();
  const cs = state.companies[symbol];
  const quote = state.quotes[symbol];
  if (!cs || !quote || !['call', 'put'].includes(type)) return null;
  const spot = quote.last;
  const safeStrike = Number(strike);
  if (!Number.isFinite(safeStrike) || safeStrike <= 0) return null;
  const baseVol = optionBaseVol(cs.company);
  const vol = optionSmileVol(baseVol, spot, safeStrike);
  const years = optionYears(state, expiryDay);
  const rate = Math.max(0, Math.min(0.25, (Number(state.macro?.policyRate) || 4) / 100));
  const greeks = blackScholes({
    type, spot, strike: safeStrike, years, vol, rate,
  });
  const premium = Math.max(0.01, greeks.price);
  const bid = round(Math.max(0.01, premium * 0.985), 2);
  const ask = round(Math.max(bid + 0.01, premium * 1.015), 2);
  return {
    ticker: symbol,
    type,
    strike: safeStrike,
    expiryDay: Number(expiryDay),
    days: Math.max(0, Number(expiryDay) - state.dayIndex),
    expiryLabel: optionExpiryLabel(Number(expiryDay)),
    spot: round(spot, 2),
    vol: round(vol, 4),
    rate,
    premium: round(premium, 2),
    bid,
    ask,
    intrinsic: greeks.intrinsic,
    timeValue: greeks.timeValue,
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    rho: greeks.rho,
    contractSize: CONTRACT_SIZE,
  };
}

export function buildOptionChain(state, ticker, expiryDays = 30, levels = SIM_OPTION_STRIKE_LEVELS) {
  const symbol = String(ticker || '').toUpperCase();
  const quote = state.quotes[symbol];
  const cs = state.companies[symbol];
  if (!quote || !cs) {
    return { ticker: symbol, spot: 0, vol: 0, expiries: [], strikes: [], contracts: [] };
  }
  const spot = quote.last;
  const expiries = SIM_OPTION_TENORS.map((days) => ({
    days,
    expiryDay: state.dayIndex + days,
    label: optionExpiryLabel(state.dayIndex + days),
  }));
  const activeExpiry = expiries.find((item) => item.days === Number(expiryDays)) || expiries[1];
  const strikes = optionStrikeGrid(spot, levels);
  const contracts = [];
  for (const strike of strikes) {
    for (const type of ['call', 'put']) {
      const contract = optionContract(state, {
        ticker: symbol, type, strike, expiryDay: activeExpiry.expiryDay,
      });
      if (contract) contracts.push(contract);
    }
  }
  return {
    ticker: symbol,
    spot: round(spot, 2),
    vol: round(optionBaseVol(cs.company), 4),
    expiries,
    strikes,
    contracts,
  };
}

export function optionChainRow(state, chain, strike) {
  return {
    strike,
    call: chain.contracts.find((contract) => contract.type === 'call'
      && Math.abs(contract.strike - strike) < 1e-9) || null,
    put: chain.contracts.find((contract) => contract.type === 'put'
      && Math.abs(contract.strike - strike) < 1e-9) || null,
  };
}

function positionFor(state, key) {
  return (state.account.options || []).find((position) => position.key === key) || null;
}

function pushOptionTrade(state, trade) {
  const account = state.account;
  account.trades.push({
    asset: 'option',
    date: dateForTradingDay(state.dayIndex).toISOString().slice(0, 10),
    day: state.dayIndex,
    second: state.second,
    ...trade,
  });
  if (account.trades.length > 500) account.trades.splice(0, account.trades.length - 500);
}

function optionPosition(state, contract, qty, costBasis, openedDay) {
  return {
    key: optionKey(contract),
    ticker: contract.ticker,
    type: contract.type,
    strike: contract.strike,
    expiryDay: contract.expiryDay,
    qty,
    costBasis: round(costBasis, 2),
    vol: contract.vol,
    openedDay,
  };
}

/** Buy to open or add to a long option position. Cash must cover the premium. */
export function buyOption(state, { contract, qty, fee = 0 }) {
  const quantity = Math.floor(Number(qty) || 0);
  if (!contract || quantity <= 0) return { ok: false, error: 'option.invalid' };
  const key = optionKey(contract);
  const existing = positionFor(state, key);
  if (existing && existing.qty < 0) return { ok: false, error: 'option.positionConflict' };
  const gross = contract.ask * CONTRACT_SIZE * quantity;
  const cost = round(gross + fee, 2);
  if (cost > state.account.cash + 1e-9) return { ok: false, error: 'option.insufficientCash' };
  const basis = round((existing?.costBasis || 0) + cost, 2);
  const position = existing
    ? { ...existing, qty: existing.qty + quantity, costBasis: basis, vol: contract.vol }
    : optionPosition(state, contract, quantity, cost, state.dayIndex);
  if (existing) position.costBasis = basis;
  const options = existing
    ? state.account.options.map((item) => (item.key === key ? position : item))
    : [...(state.account.options || []), position];
  state.account.options = options;
  state.account.cash = round(state.account.cash - cost, 2);
  state.account.fees += fee;
  pushOptionTrade(state, {
    ticker: contract.ticker,
    side: 'buy',
    optionType: contract.type,
    strike: contract.strike,
    expiryDay: contract.expiryDay,
    qty: quantity,
    premium: contract.ask,
    fee,
    amount: -cost,
  });
  return { ok: true, contract, qty: quantity, cost };
}

/** Sell to open a short option position. Margin is checked by the caller. */
export function sellOption(state, { contract, qty, fee = 0 }) {
  const quantity = Math.floor(Number(qty) || 0);
  if (!contract || quantity <= 0) return { ok: false, error: 'option.invalid' };
  const key = optionKey(contract);
  const existing = positionFor(state, key);
  if (existing && existing.qty > 0) return { ok: false, error: 'option.positionConflict' };
  const gross = contract.bid * CONTRACT_SIZE * quantity;
  const proceeds = round(gross - fee, 2);
  const basis = round((existing?.costBasis || 0) + proceeds, 2);
  const position = existing
    ? { ...existing, qty: existing.qty - quantity, costBasis: basis, vol: contract.vol }
    : optionPosition(state, contract, -quantity, proceeds, state.dayIndex);
  if (existing) position.costBasis = basis;
  const options = existing
    ? state.account.options.map((item) => (item.key === key ? position : item))
    : [...(state.account.options || []), position];
  state.account.options = options;
  state.account.cash = round(state.account.cash + proceeds, 2);
  state.account.fees += fee;
  pushOptionTrade(state, {
    ticker: contract.ticker,
    side: 'sell',
    optionType: contract.type,
    strike: contract.strike,
    expiryDay: contract.expiryDay,
    qty: quantity,
    premium: contract.bid,
    fee,
    amount: proceeds,
  });
  return { ok: true, contract, qty: quantity, proceeds };
}

/** Close all or part of an existing long / short contract at the dealer quote. */
export function closeOption(state, key, qty) {
  const position = positionFor(state, key);
  if (!position) return { ok: false, error: 'option.noPosition' };
  const quantity = Math.floor(Number(qty) || 0);
  if (quantity <= 0) return { ok: false, error: 'option.invalid' };
  const absQty = Math.abs(position.qty);
  if (quantity > absQty) return { ok: false, error: 'option.insufficientContracts' };
  const contract = optionContract(state, position);
  if (!contract) return { ok: false, error: 'option.invalid' };
  const isLong = position.qty > 0;
  const quote = isLong ? contract.bid : contract.ask;
  const gross = quote * CONTRACT_SIZE * quantity;
  const fee = round(gross * SIM_OPTION_FEE_BPS / 10_000, 2);
  const basisPart = round(position.costBasis * quantity / absQty, 2);
  const cashDelta = isLong ? gross - fee : -(gross + fee);
  const realized = isLong ? cashDelta - basisPart : basisPart - (gross + fee);
  const remaining = position.qty - (isLong ? quantity : -quantity);
  state.account.options = remaining === 0
    ? state.account.options.filter((item) => item.key !== key)
    : state.account.options.map((item) => (item.key === key
      ? { ...item, qty: remaining, costBasis: round(item.costBasis - basisPart, 2) }
      : item));
  state.account.cash = round(state.account.cash + cashDelta, 2);
  state.account.fees += fee;
  state.account.realizedPnl = round(state.account.realizedPnl + realized, 2);
  pushOptionTrade(state, {
    ticker: position.ticker,
    side: isLong ? 'close' : 'buyToClose',
    optionType: position.type,
    strike: position.strike,
    expiryDay: position.expiryDay,
    qty: quantity,
    premium: quote,
    fee,
    amount: cashDelta,
    realized,
  });
  return { ok: true, contract, qty: quantity, price: quote, realized, fee };
}

/** Cash-settle every contract that reached its expiry day. */
export function settleExpiredOptions(state) {
  const positions = state.account.options || [];
  const expiring = positions.filter((position) => position.expiryDay < state.dayIndex);
  if (!expiring.length) return { settlements: [] };
  const settlements = [];
  for (const position of expiring) {
    const quote = state.quotes[position.ticker];
    const spot = quote?.last || 0;
    const intrinsic = position.type === 'call'
      ? Math.max(0, spot - position.strike)
      : Math.max(0, position.strike - spot);
    const quantity = Math.abs(position.qty);
    const gross = round(intrinsic * CONTRACT_SIZE * quantity, 2);
    const isLong = position.qty > 0;
    const cashDelta = isLong ? gross : -gross;
    const realized = isLong
      ? round(gross - position.costBasis, 2)
      : round(position.costBasis - gross, 2);
    state.account.cash = round(state.account.cash + cashDelta, 2);
    state.account.realizedPnl = round(state.account.realizedPnl + realized, 2);
    pushOptionTrade(state, {
      ticker: position.ticker,
      side: isLong ? 'expire' : 'assigned',
      optionType: position.type,
      strike: position.strike,
      expiryDay: position.expiryDay,
      qty: quantity,
      premium: round(intrinsic, 2),
      fee: 0,
      amount: cashDelta,
      realized,
      source: 'expiry',
    });
    settlements.push({
      ...position,
      spot: round(spot, 2),
      intrinsic: round(intrinsic, 2),
      cashDelta,
      realized,
      day: state.dayIndex,
    });
  }
  state.account.options = positions.filter((position) => position.expiryDay >= state.dayIndex);
  state.account.optionSettlements = [
    ...settlements,
    ...(state.account.optionSettlements || []),
  ].slice(0, 120);
  return { settlements };
}

export function optionPositionMark(state, position) {
  const contract = optionContract(state, position);
  if (!contract) return 0;
  return contract.premium;
}

export function optionMarketValue(state) {
  return round((state.account.options || []).reduce((sum, position) => {
    const mark = optionPositionMark(state, position);
    return sum + mark * CONTRACT_SIZE * position.qty;
  }, 0), 2);
}

export function optionRows(state) {
  return (state.account.options || []).map((position) => {
    const mark = optionPositionMark(state, position);
    const marketValue = round(mark * CONTRACT_SIZE * position.qty, 2);
    const pnl = position.qty > 0
      ? round(marketValue - position.costBasis, 2)
      : round(position.costBasis + marketValue, 2);
    const intrinsic = position.type === 'call'
      ? Math.max(0, (state.quotes[position.ticker]?.last || 0) - position.strike)
      : Math.max(0, position.strike - (state.quotes[position.ticker]?.last || 0));
    return {
      ...position,
      absQty: Math.abs(position.qty),
      side: position.qty > 0 ? 'long' : 'short',
      mark: round(mark, 2),
      marketValue,
      pnl,
      intrinsic: round(intrinsic, 2),
      moneyness: position.type === 'call' ? 'call' : 'put',
      daysLeft: Math.max(0, position.expiryDay - state.dayIndex),
      expiryLabel: optionExpiryLabel(position.expiryDay),
    };
  }).sort((a, b) => a.expiryDay - b.expiryDay || a.strike - b.strike);
}

/**
 * Cash collateral for short calls and puts. Covered calls can use stock or long
 * calls; covered puts can use long puts. Long options need no collateral.
 */
export function optionCollateral(state, extraPositions = []) {
  const positions = [...(state.account.options || []), ...extraPositions];
  if (!positions.length) return 0;
  let collateral = 0;
  const tickers = new Set(positions.map((position) => position.ticker));
  for (const ticker of tickers) {
    const spot = state.quotes[ticker]?.last || 0;
    if (!spot) continue;
    const byType = (type, sign) => positions
      .filter((position) => position.ticker === ticker && position.type === type
        && (sign > 0 ? position.qty > 0 : position.qty < 0))
      .reduce((sum, position) => sum + Math.abs(position.qty), 0);
    const shortCalls = byType('call', -1);
    const longCalls = byType('call', 1);
    const shortPuts = byType('put', -1);
    const longPuts = byType('put', 1);
    const shares = state.account.positions[ticker]?.qty || 0;
    const coveredCalls = Math.min(shortCalls, Math.floor(shares / CONTRACT_SIZE) + longCalls);
    const nakedCalls = Math.max(0, shortCalls - coveredCalls);
    collateral += nakedCalls * spot * CONTRACT_SIZE * 0.2;
    let coveredPuts = Math.min(shortPuts, longPuts);
    for (const position of positions) {
      if (position.ticker !== ticker || position.type !== 'put' || position.qty >= 0) continue;
      const quantity = -position.qty;
      const covered = Math.min(quantity, coveredPuts);
      coveredPuts -= covered;
      collateral += (quantity - covered) * position.strike * CONTRACT_SIZE;
    }
  }
  return round(collateral, 2);
}
