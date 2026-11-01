/**
 * Account mathematics. All functions are pure: they receive an account object and
 * return a new account plus the trade that was produced. Fees are included in the
 * cost basis for buys so total P&L always reconciles with equity.
 */
export const TRADE_LOG_LIMIT = 250;

export function createAccount(initialCash = 10000) {
  return {
    initialCash,
    cash: initialCash,
    positions: {},
    realizedPnl: 0,
    feesPaid: 0,
    trades: [],
    tradeSeq: 1,
    dividends: [],
    equityHistory: [],
  };
}

export function positionOf(account, ticker) {
  const pos = account.positions[ticker];
  if (!pos || pos.qty <= 0) return { ticker, qty: 0, costBasis: 0, avgCost: 0 };
  return { ticker, qty: pos.qty, costBasis: pos.costBasis, avgCost: pos.costBasis / pos.qty };
}

function pushTrade(account, trade) {
  const next = {
    ...trade,
    id: account.tradeSeq,
  };
  account.tradeSeq += 1;
  account.trades = [next, ...account.trades].slice(0, TRADE_LOG_LIMIT);
  return next;
}

export function buy(account, { ticker, qty, price, fee, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const total = gross + safeFee;
  if (total > account.cash + 1e-9) {
    return { ok: false, error: 'error.insufficientCash' };
  }

  const existing = account.positions[ticker];
  const nextPos = existing
    ? { qty: existing.qty + quantity, costBasis: existing.costBasis + total }
    : { qty: quantity, costBasis: total };

  const draft = {
    ...account,
    cash: account.cash - total,
    positions: { ...account.positions, [ticker]: nextPos },
    feesPaid: account.feesPaid + safeFee,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'buy',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized: 0,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

export function sell(account, { ticker, qty, price, fee, day = 0, tick = 0 }) {
  const quantity = Math.floor(qty);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'error.qtyInvalid' };
  }
  const pos = account.positions[ticker];
  if (!pos || pos.qty < quantity) {
    return { ok: false, error: 'error.insufficientShares' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'error.priceInvalid' };
  }
  const safeFee = Math.max(0, Number(fee) || 0);
  const gross = quantity * price;
  const proceeds = gross - safeFee;
  const costPart = (pos.costBasis / pos.qty) * quantity;
  const realized = proceeds - costPart;
  const remainingQty = pos.qty - quantity;

  const nextPositions = { ...account.positions };
  if (remainingQty > 0) {
    nextPositions[ticker] = { qty: remainingQty, costBasis: Math.max(0, pos.costBasis - costPart) };
  } else {
    delete nextPositions[ticker];
  }

  const draft = {
    ...account,
    cash: account.cash + proceeds,
    positions: nextPositions,
    feesPaid: account.feesPaid + safeFee,
    realizedPnl: account.realizedPnl + realized,
    trades: account.trades,
  };
  const trade = pushTrade(draft, {
    ticker,
    side: 'sell',
    qty: quantity,
    price,
    fee: safeFee,
    gross,
    realized,
    day,
    tick,
  });
  return { ok: true, account: draft, trade };
}

export function marketValue(account, quotes) {
  let value = 0;
  for (const [ticker, pos] of Object.entries(account.positions)) {
    if (!pos || pos.qty <= 0) continue;
    const quote = quotes[ticker];
    const last = quote ? quote.last : 0;
    value += pos.qty * last;
  }
  return value;
}

export function unrealizedPnl(account, quotes) {
  let pnl = 0;
  for (const [ticker, pos] of Object.entries(account.positions)) {
    if (!pos || pos.qty <= 0) continue;
    const quote = quotes[ticker];
    const last = quote ? quote.last : 0;
    pnl += pos.qty * last - pos.costBasis;
  }
  return pnl;
}

export function equity(account, quotes) {
  return account.cash + marketValue(account, quotes);
}

export function totalPnl(account, quotes) {
  return equity(account, quotes) - account.initialCash;
}

export function returnPct(account, quotes) {
  if (!account.initialCash) return 0;
  return (totalPnl(account, quotes) / account.initialCash) * 100;
}

export function positionRows(account, quotes) {
  return Object.entries(account.positions)
    .filter(([, pos]) => pos && pos.qty > 0)
    .map(([ticker, pos]) => {
      const quote = quotes[ticker] || { last: 0 };
      const last = quote.last || 0;
      const avgCost = pos.costBasis / pos.qty;
      const value = pos.qty * last;
      const pnl = value - pos.costBasis;
      const pnlPct = pos.costBasis > 0 ? (pnl / pos.costBasis) * 100 : 0;
      return {
        ticker,
        qty: pos.qty,
        avgCost,
        last,
        value,
        costBasis: pos.costBasis,
        pnl,
        pnlPct,
        changePct: quote.changePct || 0,
        weight: 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/** Cash already committed to resting buy limit orders. */
export function reservedCash(orders, fee = 0) {
  return orders
    .filter((o) => o.status === 'open' && o.side === 'buy')
    .reduce((sum, o) => sum + o.qty * o.limitPrice + fee, 0);
}

/** Shares already committed to resting sell limit orders. */
export function reservedShares(orders, ticker) {
  return orders
    .filter((o) => o.status === 'open' && o.side === 'sell' && o.ticker === ticker)
    .reduce((sum, o) => sum + o.qty, 0);
}

export function availableCash(account, orders, fee = 0) {
  return Math.max(0, account.cash - reservedCash(orders, fee));
}

export function availableShares(account, orders, ticker) {
  const pos = account.positions[ticker];
  if (!pos) return 0;
  return Math.max(0, pos.qty - reservedShares(orders, ticker));
}

export function snapshotEquity(account, quotes, day) {
  const value = equity(account, quotes);
  const last = account.equityHistory[account.equityHistory.length - 1];
  if (last && last.day === day) {
    last.equity = value;
    return account.equityHistory;
  }
  const next = [...account.equityHistory, { day, equity: value }].slice(-400);
  return next;
}
