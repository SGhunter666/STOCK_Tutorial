/**
 * Commodity teaching engine. Prices are deterministic functions of the date,
 * seed and macro backdrop: metals respond to real rates and risk appetite,
 * energy and copper respond to growth. Positions share the stock cash account.
 */
export const COMMODITY_DEFS = [
  {
    id: 'gold',
    nameKey: 'commodity.gold.name',
    unitKey: 'commodity.gold.unit',
    kind: 'metal',
    base: 235,
    amplitude: 0.05,
    period: 170,
    phase: 0.3,
  },
  {
    id: 'silver',
    nameKey: 'commodity.silver.name',
    unitKey: 'commodity.silver.unit',
    kind: 'metal',
    base: 28,
    amplitude: 0.08,
    period: 145,
    phase: 0.9,
  },
  {
    id: 'oil',
    nameKey: 'commodity.oil.name',
    unitKey: 'commodity.oil.unit',
    kind: 'energy',
    base: 78,
    amplitude: 0.11,
    period: 95,
    phase: 1.1,
  },
  {
    id: 'copper',
    nameKey: 'commodity.copper.name',
    unitKey: 'commodity.copper.unit',
    kind: 'industrial',
    base: 4.2,
    amplitude: 0.07,
    period: 130,
    phase: 0.2,
  },
  {
    id: 'natgas',
    nameKey: 'commodity.natgas.name',
    unitKey: 'commodity.natgas.unit',
    kind: 'energy',
    base: 2.6,
    amplitude: 0.16,
    period: 80,
    phase: 1.6,
  },
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

function roundPrice(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Math.max(0.01, value) * factor) / factor;
}

export function commodityDef(id) {
  return COMMODITY_DEFS.find((entry) => entry.id === id) || null;
}

/** Deterministic commodity price with a macro tilt. */
export function commodityPrice(definition, day, seed = '', macro = null) {
  if (!definition) return 0;
  const phase = seedPhase(seed);
  const realRate = Number(macro?.realRate) || 0;
  const growth = Number.isFinite(macro?.growth) ? macro.growth : 2.1;
  const risk = Number.isFinite(macro?.riskAppetite) ? macro.riskAppetite : 50;
  let tilt = 0;
  if (definition.kind === 'metal') {
    tilt = -((realRate - 1.5) * 0.025) + ((risk - 50) / 100) * 0.02;
  } else if (definition.id === 'copper') {
    tilt = (growth - 2.1) * 0.05 + ((risk - 50) / 100) * 0.03;
  } else {
    tilt = (growth - 2.1) * 0.03 + ((50 - risk) / 100) * 0.02;
  }
  const drift = wave(day, definition.period, phase + definition.phase) * definition.amplitude;
  return roundPrice(definition.base * (1 + drift + tilt), definition.base < 10 ? 3 : 2);
}

export function commodityQuotes(day, seed = '', macro = null) {
  return COMMODITY_DEFS.map((definition) => {
    const price = commodityPrice(definition, day, seed, macro);
    const previous = commodityPrice(definition, day - 1, seed, macro);
    return {
      ...definition,
      price,
      previousPrice: previous,
      changePct: previous > 0 ? Math.round(((price / previous) - 1) * 10000) / 100 : 0,
    };
  });
}

export function commodityValue(account) {
  return (account?.commodities || []).reduce((sum, position) => (
    sum + (position.qty || 0) * (position.currentPrice || position.entryPrice || 0)
  ), 0);
}

export function commodityUnrealized(account) {
  return (account?.commodities || []).reduce((sum, position) => (
    sum + (position.qty || 0) * (position.currentPrice || position.entryPrice || 0)
    - (position.costBasis || 0)
  ), 0);
}

export function buyCommodity(account, commodityId, price, { qty, fee = 0, day = 0 }) {
  const definition = commodityDef(commodityId);
  if (!definition) return { ok: false, error: 'commodity.errorUnknown' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'error.priceInvalid' };
  const cost = quantity * price + fee;
  if (cost > account.cash + 1e-9) return { ok: false, error: 'error.insufficientCash' };
  const existing = (account.commodities || []).find((position) => position.id === commodityId);
  const commodities = existing
    ? account.commodities.map((position) => (position.id === commodityId
      ? {
        ...position,
        qty: position.qty + quantity,
        costBasis: Math.round((position.costBasis + cost) * 100) / 100,
        currentPrice: price,
      }
      : position))
    : [...(account.commodities || []), {
      id: commodityId,
      qty: quantity,
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
      commodities,
    },
    definition,
    price,
    qty: quantity,
  };
}

export function sellCommodity(account, commodityId, price, { qty, fee = 0 }) {
  const position = (account.commodities || []).find((entry) => entry.id === commodityId);
  if (!position) return { ok: false, error: 'commodity.errorNoPosition' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (quantity > position.qty) return { ok: false, error: 'commodity.errorInsufficient' };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'error.priceInvalid' };
  const proceeds = quantity * price - fee;
  const costPortion = position.qty > 0 ? position.costBasis * (quantity / position.qty) : 0;
  const commodities = account.commodities
    .map((entry) => (entry.id === commodityId
      ? {
        ...entry,
        qty: entry.qty - quantity,
        costBasis: Math.max(0, Math.round((entry.costBasis - costPortion) * 100) / 100),
        currentPrice: price,
      }
      : entry))
    .filter((entry) => entry.qty > 0);
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash + proceeds) * 100) / 100,
      commodities,
    },
    price,
    qty: quantity,
    realized: Math.round((proceeds - costPortion) * 100) / 100,
  };
}

export function markCommodities(account, prices) {
  if (!account?.commodities?.length) return account;
  return {
    ...account,
    commodities: account.commodities.map((position) => ({
      ...position,
      currentPrice: prices[position.id] || position.currentPrice,
    })),
  };
}
