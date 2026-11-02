/**
 * Synthetic FX teaching engine. Quotes are USD per one foreign unit, derived
 * deterministically from the macro seed; positions are marked in USD.
 */
export const FX_PAIRS = [
  { id: 'EURUSD', base: 1.08, period: 180, phase: 0.2, nameKey: 'fx.EURUSD.name' },
  { id: 'GBPUSD', base: 1.27, period: 210, phase: 0.9, nameKey: 'fx.GBPUSD.name' },
  { id: 'AUDUSD', base: 0.66, period: 160, phase: 1.4, nameKey: 'fx.AUDUSD.name' },
  { id: 'CADUSD', base: 0.74, period: 190, phase: 0.5, nameKey: 'fx.CADUSD.name' },
];

function wave(day, period, phase) {
  return Math.sin((day / period) * Math.PI * 2 + phase);
}

function seedPhase(seed) {
  let hash = 0;
  const text = String(seed || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 1000;
  }
  return (hash / 1000) * Math.PI * 2;
}

export function fxPair(id) {
  return FX_PAIRS.find((pair) => pair.id === id) || null;
}

export function fxRate(pairId, day, seed = '', macro = null) {
  const pair = fxPair(pairId);
  if (!pair) return 0;
  const phase = seedPhase(seed);
  const dollarTilt = macro
    ? -((Number(macro.realRate) || 0) - 1.5) * 0.008
    : 0;
  const value = pair.base * (1 + wave(day, pair.period, phase + pair.phase) * 0.075 + dollarTilt);
  return Math.round(Math.max(0.01, value) * 10000) / 10000;
}

export function fxRates(day, seed = '', macro = null) {
  const out = {};
  for (const pair of FX_PAIRS) out[pair.id] = fxRate(pair.id, day, seed, macro);
  return out;
}

export function fxValue(account, rates = null) {
  return (account?.fx || []).reduce((sum, position) => (
    sum + (position.units || 0) * ((rates && rates[position.id]) || position.currentRate || position.entryRate || 0)
  ), 0);
}

export function fxUnrealized(account, rates = null) {
  return (account?.fx || []).reduce((sum, position) => {
    const rate = (rates && rates[position.id]) || position.currentRate || position.entryRate || 0;
    return sum + (position.units || 0) * rate - (position.costBasis || 0);
  }, 0);
}

export function buyFx(account, pairId, rates, { units, fee = 0, day = 0 }) {
  const pair = fxPair(pairId);
  if (!pair) return { ok: false, error: 'fx.errorUnknown' };
  const quantity = Math.floor(Number(units));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  const rate = rates[pairId];
  if (!rate) return { ok: false, error: 'error.priceInvalid' };
  const cost = quantity * rate + fee;
  if (cost > account.cash + 1e-9) return { ok: false, error: 'error.insufficientCash' };
  const existing = (account.fx || []).find((position) => position.id === pairId);
  const fx = existing
    ? account.fx.map((position) => (position.id === pairId
      ? {
        ...position,
        units: position.units + quantity,
        costBasis: position.costBasis + cost,
        currentRate: rate,
      }
      : position))
    : [...(account.fx || []), {
      id: pairId,
      units: quantity,
      costBasis: cost,
      entryRate: rate,
      currentRate: rate,
      purchaseDay: day,
    }];
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash - cost) * 100) / 100,
      fx,
    },
    pair,
    rate,
    units: quantity,
  };
}

export function sellFx(account, pairId, rates, { units, fee = 0 }) {
  const position = (account.fx || []).find((entry) => entry.id === pairId);
  if (!position) return { ok: false, error: 'fx.errorNoPosition' };
  const quantity = Math.floor(Number(units));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (quantity > position.units) return { ok: false, error: 'fx.errorInsufficient' };
  const rate = rates[pairId];
  const proceeds = quantity * rate - fee;
  const costPortion = position.units > 0 ? position.costBasis * (quantity / position.units) : 0;
  const fx = account.fx
    .map((entry) => (entry.id === pairId
      ? {
        ...entry,
        units: entry.units - quantity,
        costBasis: entry.costBasis - costPortion,
        currentRate: rate,
      }
      : entry))
    .filter((entry) => entry.units > 0);
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash + proceeds) * 100) / 100,
      fx,
    },
    rate,
    units: quantity,
    realized: Math.round((proceeds - costPortion) * 100) / 100,
  };
}

export function markFx(account, rates) {
  if (!account?.fx?.length) return account;
  return {
    ...account,
    fx: account.fx.map((position) => ({
      ...position,
      currentRate: rates[position.id] || position.currentRate,
    })),
  };
}
