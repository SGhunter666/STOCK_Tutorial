/**
 * Fixed income teaching engine: deterministic yields from the macro curve,
 * semi-annual present-value pricing, purchases, sales, coupons and marking.
 */
export const BOND_FACE = 1000;

export const BOND_DEFS = [
  {
    id: 'gov2',
    nameKey: 'bond.gov2.name',
    issuerKey: 'bond.govIssuer',
    kind: 'government',
    years: 2,
    coupon: 2.4,
    spreadBps: 0,
  },
  {
    id: 'gov5',
    nameKey: 'bond.gov5.name',
    issuerKey: 'bond.govIssuer',
    kind: 'government',
    years: 5,
    coupon: 2.9,
    spreadBps: 0,
  },
  {
    id: 'gov10',
    nameKey: 'bond.gov10.name',
    issuerKey: 'bond.govIssuer',
    kind: 'government',
    years: 10,
    coupon: 3.3,
    spreadBps: 0,
  },
  {
    id: 'gov30',
    nameKey: 'bond.gov30.name',
    issuerKey: 'bond.govIssuer',
    kind: 'government',
    years: 30,
    coupon: 3.8,
    spreadBps: 0,
  },
  {
    id: 'corpA5',
    nameKey: 'bond.corpA5.name',
    issuerKey: 'bond.corpIssuer',
    kind: 'corporate',
    years: 5,
    coupon: 4.6,
    spreadBps: 90,
    rating: 'A',
  },
  {
    id: 'corpBBB10',
    nameKey: 'bond.corpBBB10.name',
    issuerKey: 'bond.corpIssuer',
    kind: 'corporate',
    years: 10,
    coupon: 5.4,
    spreadBps: 180,
    rating: 'BBB',
  },
  {
    id: 'corpHY5',
    nameKey: 'bond.corpHY5.name',
    issuerKey: 'bond.corpIssuer',
    kind: 'corporate',
    years: 5,
    coupon: 7.2,
    spreadBps: 360,
    rating: 'BB',
  },
  {
    id: 'muni10',
    nameKey: 'bond.muni10.name',
    issuerKey: 'bond.muniIssuer',
    kind: 'municipal',
    years: 10,
    coupon: 3.0,
    spreadBps: 55,
    rating: 'AA',
  },
];

export function bondDef(id) {
  return BOND_DEFS.find((bond) => bond.id === id) || null;
}

/** Government curve interpolation plus a credit spread. */
export function bondYield(bond, macro) {
  if (!bond || !macro) return 0;
  const two = Number(macro.yield2) || 0;
  const ten = Number(macro.yield10) || 0;
  let base = two;
  if (bond.years <= 2) base = two;
  else if (bond.years >= 10) base = ten + (bond.years - 10) * 0.035;
  else base = two + (ten - two) * ((bond.years - 2) / 8);
  return Math.max(0.01, base + (bond.spreadBps || 0) / 100);
}

/** Semi-annual coupon bond present value per face unit. */
export function bondPrice(bond, macro) {
  if (!bond) return 0;
  const yieldPct = bondYield(bond, macro);
  const y = yieldPct / 100;
  const periods = Math.max(1, Math.round(bond.years * 2));
  const coupon = BOND_FACE * (bond.coupon / 100) / 2;
  const discount = 1 + y / 2;
  let price = 0;
  for (let period = 1; period <= periods; period += 1) {
    price += coupon / (discount ** period);
  }
  price += BOND_FACE / (discount ** periods);
  return Math.round(price * 100) / 100;
}

export function bondQuoteRows(macro) {
  return BOND_DEFS.map((bond) => ({
    ...bond,
    yieldPct: Math.round(bondYield(bond, macro) * 100) / 100,
    price: bondPrice(bond, macro),
    duration: bond.years,
  }));
}

export function bondValue(account) {
  return (account?.bonds || []).reduce((sum, position) => (
    sum + (position.qty || 0) * (position.currentPrice || position.entryPrice || 0)
  ), 0);
}

export function bondUnrealized(account) {
  return (account?.bonds || []).reduce((sum, position) => (
    sum + (position.qty || 0) * (position.currentPrice || 0) - (position.costBasis || 0)
  ), 0);
}

export function buyBond(account, bond, macro, { qty, fee = 0, day = 0 }) {
  if (!bond) return { ok: false, error: 'bond.errorUnknown' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  const price = bondPrice(bond, macro);
  const cost = quantity * price + fee;
  if (cost > account.cash + 1e-9) return { ok: false, error: 'error.insufficientCash' };
  const existing = (account.bonds || []).find((position) => position.id === bond.id);
  const bonds = existing
    ? account.bonds.map((position) => (position.id === bond.id
      ? {
        ...position,
        qty: position.qty + quantity,
        costBasis: position.costBasis + cost,
        currentPrice: price,
      }
      : position))
    : [...(account.bonds || []), {
      id: bond.id,
      qty: quantity,
      costBasis: cost,
      entryPrice: price,
      currentPrice: price,
      purchaseDay: day,
      lastCouponDay: day,
      couponRate: bond.coupon,
    }];
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash - cost) * 100) / 100,
      bonds,
    },
    bond,
    price,
    qty: quantity,
  };
}

export function sellBond(account, bondId, macro, { qty, fee = 0 }) {
  const position = (account.bonds || []).find((entry) => entry.id === bondId);
  if (!position) return { ok: false, error: 'bond.errorNoPosition' };
  const quantity = Math.floor(Number(qty));
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, error: 'error.qtyInvalid' };
  if (quantity > position.qty) return { ok: false, error: 'bond.errorInsufficient' };
  const bond = bondDef(bondId);
  const price = bondPrice(bond, macro);
  const proceeds = quantity * price - fee;
  const costPortion = position.qty > 0 ? position.costBasis * (quantity / position.qty) : 0;
  const bonds = account.bonds
    .map((entry) => (entry.id === bondId
      ? {
        ...entry,
        qty: entry.qty - quantity,
        costBasis: entry.costBasis - costPortion,
        currentPrice: price,
      }
      : entry))
    .filter((entry) => entry.qty > 0);
  return {
    ok: true,
    account: {
      ...account,
      cash: Math.round((account.cash + proceeds) * 100) / 100,
      bonds,
    },
    price,
    qty: quantity,
    realized: Math.round((proceeds - costPortion) * 100) / 100,
  };
}

export function markBonds(account, macro) {
  if (!account?.bonds?.length) return account;
  return {
    ...account,
    bonds: account.bonds.map((position) => {
      const bond = bondDef(position.id);
      return bond ? { ...position, currentPrice: bondPrice(bond, macro) } : position;
    }),
  };
}

/** Pays one quarterly coupon per position after 63 trading days. */
export function applyBondCoupons(account, macro, day) {
  if (!account?.bonds?.length) return { account, total: 0 };
  let total = 0;
  const bonds = account.bonds.map((position) => {
    if (day - (position.lastCouponDay ?? position.purchaseDay ?? 0) < 63) return position;
    const coupon = position.qty * BOND_FACE * ((position.couponRate || 0) / 100) / 4;
    total += coupon;
    return { ...position, lastCouponDay: day };
  });
  if (total <= 0) return { account, total: 0 };
  return {
    account: {
      ...account,
      cash: Math.round((account.cash + total) * 100) / 100,
      bonds,
    },
    total: Math.round(total * 100) / 100,
  };
}
