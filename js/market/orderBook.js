/**
 * Deterministic Level-2 depth for teaching liquidity and slippage. The ladder is
 * derived from the current quote and ticker hash so it stays stable between ticks
 * and never uses hidden randomness.
 */

function tickerHash(ticker) {
  let hash = 0;
  for (let index = 0; index < (ticker || '').length; index += 1) {
    hash = (hash * 31 + ticker.charCodeAt(index)) % 100000;
  }
  return hash;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function levelSize(seed, level, side) {
  const base = 200 + (seed % 9) * 50;
  return Math.max(50, Math.round((base * (1 + level * 0.35) + ((seed >> (level % 12)) % 7) * 25)
    + (side === 'ask' ? 40 : 0)));
}

export function buildOrderBook(quote, { levels = 6 } = {}) {
  if (!quote) return { bids: [], asks: [], step: 0.01 };
  const seed = tickerHash(quote.ticker);
  const step = quote.last >= 100 ? 0.05 : 0.01;
  const bids = [];
  const asks = [];
  for (let level = 0; level < levels; level += 1) {
    bids.push({
      price: round2(Math.max(0.01, quote.bid - level * step)),
      size: levelSize(seed, level, 'bid'),
    });
    asks.push({
      price: round2(quote.ask + level * step),
      size: levelSize(seed, level, 'ask'),
    });
  }
  return { bids, asks, step, ticker: quote.ticker, last: quote.last };
}

/**
 * Walks the ladder for a market order. Returns the volume-weighted fill price,
 * how much of the order the visible book could absorb, and slippage versus the
 * best quote.
 */
export function estimateMarketFill(book, side, qty) {
  const buys = side === 'buy' || side === 'cover';
  const ladder = buys ? book.asks : book.bids;
  let remaining = Math.max(0, Math.floor(qty));
  let filled = 0;
  let spent = 0;
  let worst = null;
  for (const level of ladder) {
    if (remaining <= 0) break;
    const take = Math.min(level.size, remaining);
    filled += take;
    spent += take * level.price;
    remaining -= take;
    worst = level.price;
  }
  const best = ladder.length ? ladder[0].price : 0;
  const avgPrice = filled > 0 ? spent / filled : 0;
  const slippagePct = best > 0 && filled > 0 ? Math.abs(avgPrice - best) / best * 100 : 0;
  return {
    filledQty: filled,
    remaining,
    avgPrice: round2(avgPrice),
    gross: round2(spent),
    bestPrice: best,
    worstPrice: worst,
    slippagePct,
    complete: remaining === 0,
  };
}
