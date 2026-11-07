/**
 * Price-level order book with a market-maker ladder and persistent resting
 * orders. Matching is price-priority; each price level can fill only the size
 * that actually exists, so partial fills are unavoidable for large orders.
 */

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function tickFor(price) {
  return price >= 100 ? 0.05 : 0.01;
}

export class SimOrderBook {
  constructor(ticker, { levels = 6 } = {}) {
    this.ticker = ticker;
    this.levels = levels;
    this.mmBids = [];
    this.mmAsks = [];
    this.resting = [];
  }

  setMarketMaker({ bid, ask, size, levels = this.levels }) {
    const tick = tickFor(bid || ask || 1);
    for (let level = 0; level < levels; level += 1) {
      const bidPrice = round(Math.max(tick, bid - level * tick), 2);
      const askPrice = round(ask + level * tick, 2);
      const levelSize = Math.max(1, Math.round(size * (1 + level * 0.35)));
      if (this.mmBids[level]) {
        this.mmBids[level].price = bidPrice;
        this.mmBids[level].size = levelSize;
      } else {
        this.mmBids[level] = { price: bidPrice, size: levelSize };
      }
      if (this.mmAsks[level]) {
        this.mmAsks[level].price = askPrice;
        this.mmAsks[level].size = levelSize;
      } else {
        this.mmAsks[level] = { price: askPrice, size: levelSize };
      }
    }
    if (this.mmBids.length > levels) this.mmBids.length = levels;
    if (this.mmAsks.length > levels) this.mmAsks.length = levels;
  }

  addResting(order) {
    this.resting.push({ ...order });
  }

  removeOrder(id) {
    const index = this.resting.findIndex((order) => order.id === id);
    if (index >= 0) this.resting.splice(index, 1);
  }

  bestBid() {
    let best = null;
    for (const level of this.mmBids) {
      if (level.size > 0 && (best === null || level.price > best)) best = level.price;
    }
    for (const order of this.resting) {
      if (order.side === 'buy' && order.remaining > 0 && (best === null || order.price > best)) {
        best = order.price;
      }
    }
    return best;
  }

  bestAsk() {
    let best = null;
    for (const level of this.mmAsks) {
      if (level.size > 0 && (best === null || level.price < best)) best = level.price;
    }
    for (const order of this.resting) {
      if (order.side === 'sell' && order.remaining > 0 && (best === null || order.price < best)) {
        best = order.price;
      }
    }
    return best;
  }

  _askLiquidity(excludeId) {
    const levels = this.mmAsks.map((level, index) => ({
      price: level.price, size: level.size, type: 'mm', index,
    }));
    this.resting.forEach((order) => {
      if (order.id === excludeId || order.side !== 'sell' || order.remaining <= 0) return;
      levels.push({ price: order.price, size: order.remaining, type: 'order', order });
    });
    return levels.sort((a, b) => a.price - b.price);
  }

  _bidLiquidity(excludeId) {
    const levels = this.mmBids.map((level, index) => ({
      price: level.price, size: level.size, type: 'mm', index,
    }));
    this.resting.forEach((order) => {
      if (order.id === excludeId || order.side !== 'buy' || order.remaining <= 0) return;
      levels.push({ price: order.price, size: order.remaining, type: 'order', order });
    });
    return levels.sort((a, b) => b.price - a.price);
  }

  /**
   * Matches an order against the book. Returns fills with real sizes and the
   * unfilled remainder. The caller decides whether to rest the remainder.
   */
  match(order) {
    const buys = order.side === 'buy';
    const liquidity = buys ? this._askLiquidity(order.id) : this._bidLiquidity(order.id);
    const limit = order.type === 'market'
      ? (buys ? Infinity : -Infinity)
      : Number(order.limitPrice);
    const available = Number.isFinite(Number(order.remaining))
      ? Number(order.remaining)
      : Number(order.qty) || 0;
    let remaining = Math.max(0, Math.floor(available));
    const fills = [];
    for (const level of liquidity) {
      if (remaining <= 0) break;
      if (buys && level.price > limit + 1e-9) break;
      if (!buys && level.price < limit - 1e-9) break;
      const qty = Math.min(remaining, level.size);
      if (qty <= 0) continue;
      fills.push({
        price: level.price,
        qty,
        counterparty: level.type,
        orderId: level.order ? level.order.id : null,
      });
      remaining -= qty;
      if (level.type === 'mm') {
        const bookLevel = buys ? this.mmAsks[level.index] : this.mmBids[level.index];
        bookLevel.size -= qty;
      } else {
        level.order.remaining -= qty;
        if (level.order.remaining <= 0) this.removeOrder(level.order.id);
      }
    }
    return { fills, remaining };
  }

  /** Matches any resting orders that now cross the market-maker ladder. */
  matchResting() {
    if (this.resting.length === 0) return [];
    const results = [];
    for (const order of [...this.resting]) {
      if (order.remaining <= 0) continue;
      const result = this.match(order);
      if (!result.fills.length) continue;
      results.push({ order, ...result });
      if (result.remaining > 0) {
        order.remaining = result.remaining;
      } else {
        this.removeOrder(order.id);
      }
    }
    return results;
  }

  snapshot(levels = this.levels) {
    const merge = (base, orders, side) => {
      const map = new Map();
      for (const level of base) {
        map.set(level.price, (map.get(level.price) || 0) + level.size);
      }
      for (const order of orders) {
        if (order.side !== side || order.remaining <= 0) continue;
        map.set(order.price, (map.get(order.price) || 0) + order.remaining);
      }
      return [...map.entries()]
        .filter(([, size]) => size > 0)
        .map(([price, size]) => ({ price: round(price, 2), size }))
        .sort((a, b) => (side === 'buy' ? b.price - a.price : a.price - b.price))
        .slice(0, levels);
    };
    return {
      ticker: this.ticker,
      bids: merge(this.mmBids, this.resting, 'buy'),
      asks: merge(this.mmAsks, this.resting, 'sell'),
    };
  }
}
