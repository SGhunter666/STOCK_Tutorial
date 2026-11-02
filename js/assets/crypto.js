/**
 * Crypto teaching engine with fractional units. Quotes are deterministic and
 * far more volatile than equities, driven by the macro risk appetite and
 * independent long cycles. Positions settle in USD on the shared cash account.
 */
export const CRYPTO_DEFS = [
  {
    id: 'BTC',
    nameKey: 'crypto.BTC.name',
    base: 68000,
    amplitude: 0.22,
    period: 72,
    phase: 0.4,
  },
  {
    id: 'ETH',
    nameKey: 'crypto.ETH.name',
    base: 3500,
    amplitude: 0.26,
    period: 64,
    phase: 1.2,
  },
  {
    id: 'SOL',
    nameKey: 'crypto.SOL.name',
    base: 160,
    amplitude: 0.32,
    period: 58,
    phase: 2.1,
  },
];

const UNIT_PRECISION = 1e6;

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

function roundPrice(value) {
  return Math.round(Math.max(0.01, value) * 100) / 100;
}

function roundUnits(value) {
  return Math.round(value * UNIT_PRECISION) / UNIT_PRECISION;
}

export function cryptoDef(id) {
  return CRYPTO_DEFS.find((entry) => entry.id === id) || null;
}

export function cryptoPrice(definition, day, seed = '', macro = null) {
  if (!definition) return 0;
  const phase = seedPhase(seed);
  const risk = Number.isFinite(macro?.riskAppetite) ? macro.riskAppetite : 50;
  const realRate = Number(macro?.realRate) || 0;
  const drift = wave(day, definition.period, phase + definition.phase) * definition.amplitude
    + wave(day, definition.period * 2.6, phase + definition.phase * 1.7) * definition.amplitude * 0.45;
  const tilt = ((risk - 50) / 100) * 0.18 - Math.max(0, realRate - 1.5) * 0.03;
  return roundPrice(definition.base * (1 + drift + tilt));
}

export function cryptoQuotes(day, seed = '', macro = null) {
  return CRYPTO_DEFS.map((definition) => {
    const price = cryptoPrice(definition, day, seed, macro);
    const previous = cryptoPrice(definition, day - 1, seed, macro);
    return {
      ...definition,
      price,
      previousPrice: previous,
      changePct: previous > 0 ? Math.round(((price / previous) - 1) * 10000) / 100 : 0,
    };
  });
}

export function cryptoValue(account) {
  return (account?.crypto || []).reduce((sum, position) => (
    sum + (position.units || 0) * (position.currentPrice || position.entryPrice || 0)
  ), 0);
}

export function cryptoUnrealized(account) {
  return (account?.crypto || []).reduce((sum, position) => (
    sum + (position.units || 0) * (position.currentPrice || position.entryPrice || 0)
    - (position.costBasis || 0)
  ), 0);
}

function validUnits(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const rounded = roundUnits(quantity);
  return rounded > 0 ? rounded : null;
}

export function buyCrypto(account, cryptoId, price, { qty, fee = 0, day = 0 }) {
  const definition = cryptoDef(cryptoId);
  if (!definition) return { ok: false, error: 'crypto.errorUnknown' };
  const units = validUnits(qty);
  if (!units) return { ok: false, error: 'crypto.errorQtyInvalid' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'error.priceInvalid' };
  const cost = units * price + fee;
  if (cost > account.cash + 1e-9) return { ok: false, error: 'error.insufficientCash' };
  const existing = (account.crypto || []).find((position) => position.id === cryptoId);
  const crypto = existing
    ? account.crypto.map((position) => (position.id === cryptoId
      ? {
        ...position,
        units: roundUnits(position.units + units),
        costBasis: Math.round((position.costBasis + cost) * 100) / 100,
        currentPrice: price,
      }
      : position))
    : [...(account.crypto || []), {
      id: cryptoId,
      units,
      costBasis: Math.round(cost * 100) / 100,
      entryPrice: price,
      currentPrice: price,
      purchaseDay: day,
    }];
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash - cost) * 100) / 100,
      crypto,
    },
    definition,
    price,
    units,
  };
}

export function sellCrypto(account, cryptoId, price, { qty, fee = 0 }) {
  const position = (account.crypto || []).find((entry) => entry.id === cryptoId);
  if (!position) return { ok: false, error: 'crypto.errorNoPosition' };
  const units = validUnits(qty);
  if (!units) return { ok: false, error: 'crypto.errorQtyInvalid' };
  if (units > position.units + 1e-9) return { ok: false, error: 'crypto.errorInsufficient' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'error.priceInvalid' };
  const proceeds = units * price - fee;
  const costPortion = position.units > 0 ? position.costBasis * (units / position.units) : 0;
  const crypto = account.crypto
    .map((entry) => (entry.id === cryptoId
      ? {
        ...entry,
        units: roundUnits(entry.units - units),
        costBasis: Math.max(0, Math.round((entry.costBasis - costPortion) * 100) / 100),
        currentPrice: price,
      }
      : entry))
    .filter((entry) => entry.units > 1e-9);
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash + proceeds) * 100) / 100,
      crypto,
    },
    price,
    units,
    realized: Math.round((proceeds - costPortion) * 100) / 100,
  };
}

export function markCrypto(account, prices) {
  if (!account?.crypto?.length) return account;
  return {
    ...account,
    crypto: account.crypto.map((position) => ({
      ...position,
      currentPrice: prices[position.id] || position.currentPrice,
    })),
  };
}
