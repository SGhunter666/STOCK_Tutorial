/**
 * Predefined option strategies for the strategy lab and multi-leg tickets.
 * Each preset resolves to concrete legs on the current chain so the UI, practice
 * checks and payoff chart all use the same contracts.
 */
import { CONTRACT_SIZE } from './pricing.js';

export const STRATEGY_DEFS = [
  {
    id: 'coveredCall',
    nameKey: 'strategies.coveredCall.name',
    descKey: 'strategies.coveredCall.desc',
    riskKey: 'strategies.coveredCall.risk',
    requires: 'shares',
  },
  {
    id: 'cashSecuredPut',
    nameKey: 'strategies.cashSecuredPut.name',
    descKey: 'strategies.cashSecuredPut.desc',
    riskKey: 'strategies.cashSecuredPut.risk',
    requires: 'cash',
  },
  {
    id: 'bullCallSpread',
    nameKey: 'strategies.bullCallSpread.name',
    descKey: 'strategies.bullCallSpread.desc',
    riskKey: 'strategies.bullCallSpread.risk',
    requires: 'debit',
  },
  {
    id: 'bearPutSpread',
    nameKey: 'strategies.bearPutSpread.name',
    descKey: 'strategies.bearPutSpread.desc',
    riskKey: 'strategies.bearPutSpread.risk',
    requires: 'debit',
  },
  {
    id: 'longStraddle',
    nameKey: 'strategies.longStraddle.name',
    descKey: 'strategies.longStraddle.desc',
    riskKey: 'strategies.longStraddle.risk',
    requires: 'debit',
  },
  {
    id: 'longStrangle',
    nameKey: 'strategies.longStrangle.name',
    descKey: 'strategies.longStrangle.desc',
    riskKey: 'strategies.longStrangle.risk',
    requires: 'debit',
  },
];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function atmIndex(chain) {
  let best = 0;
  for (let index = 1; index < chain.strikes.length; index += 1) {
    if (Math.abs(chain.strikes[index] - chain.spot) < Math.abs(chain.strikes[best] - chain.spot)) best = index;
  }
  return best;
}

function findLegContract(chain, expiryDay, type, strike) {
  return chain.contracts.find((contract) => (
    contract.type === type && contract.strike === strike && contract.expiryDay === expiryDay
  ));
}

/**
 * Resolve a preset into concrete legs. Returns null when the chain is too short
 * for the required strikes.
 */
export function buildStrategy(strategyId, chain, expiryDays, qty = 1) {
  const def = STRATEGY_DEFS.find((entry) => entry.id === strategyId);
  const expiry = chain && chain.expiries.find((entry) => entry.days === expiryDays);
  if (!def || !expiry) return null;
  const index = atmIndex(chain);
  const step = chain.strikes[1] - chain.strikes[0];
  const at = (offset, type) => {
    const strike = chain.strikes[index + offset];
    if (strike === undefined) return null;
    const contract = findLegContract(chain, expiry.expiryDay, type, strike);
    return contract ? { contract, side: 'buy' } : null;
  };
  const legs = [];
  let stockLegs = 0;
  switch (strategyId) {
    case 'coveredCall': {
      const call = at(1, 'call');
      if (!call) return null;
      legs.push({ contract: call.contract, side: 'sell', qty });
      stockLegs = 100 * qty;
      break;
    }
    case 'cashSecuredPut': {
      const put = at(-1, 'put');
      if (!put) return null;
      legs.push({ contract: put.contract, side: 'sell', qty });
      break;
    }
    case 'bullCallSpread': {
      const lower = at(0, 'call');
      const upper = at(2, 'call');
      if (!lower || !upper) return null;
      legs.push({ contract: lower.contract, side: 'buy', qty });
      legs.push({ contract: upper.contract, side: 'sell', qty });
      break;
    }
    case 'bearPutSpread': {
      const upper = at(0, 'put');
      const lower = at(-2, 'put');
      if (!upper || !lower) return null;
      legs.push({ contract: upper.contract, side: 'buy', qty });
      legs.push({ contract: lower.contract, side: 'sell', qty });
      break;
    }
    case 'longStraddle': {
      const call = at(0, 'call');
      const put = at(0, 'put');
      if (!call || !put) return null;
      legs.push({ contract: call.contract, side: 'buy', qty });
      legs.push({ contract: put.contract, side: 'buy', qty });
      break;
    }
    case 'longStrangle': {
      const call = at(2, 'call');
      const put = at(-2, 'put');
      if (!call || !put) return null;
      legs.push({ contract: call.contract, side: 'buy', qty });
      legs.push({ contract: put.contract, side: 'buy', qty });
      break;
    }
    default:
      return null;
  }
  const economics = strategyEconomics({ id: strategyId, legs, stockLegs, qty }, chain);
  return {
    id: strategyId,
    def,
    legs,
    stockLegs,
    expiryDay: expiry.expiryDay,
    expiryDays,
    qty,
    step,
    ...economics,
  };
}

export function strategyEconomics(strategy, chain) {
  let debit = 0;
  let credit = 0;
  for (const leg of strategy.legs) {
    const premium = leg.contract.premium * CONTRACT_SIZE * leg.qty;
    if (leg.side === 'buy') debit += premium;
    else credit += premium;
  }
  const quantity = strategy.qty || (strategy.legs[0] && strategy.legs[0].qty) || 1;
  const netCost = round2(debit - credit);
  let maxLoss = Math.max(0, netCost);
  let maxProfit = null;
  if (strategy.id === 'cashSecuredPut') {
    const put = strategy.legs[0].contract;
    maxLoss = round2(Math.max(0, (put.strike - put.premium) * CONTRACT_SIZE * quantity));
    maxProfit = round2(put.premium * CONTRACT_SIZE * quantity);
  } else if (strategy.id === 'coveredCall') {
    const call = strategy.legs[0].contract;
    maxProfit = round2((call.strike - chain.spot + call.premium) * CONTRACT_SIZE * quantity);
    maxLoss = round2((chain.spot - call.premium) * CONTRACT_SIZE * quantity);
  } else if (strategy.id === 'bullCallSpread') {
    const lower = strategy.legs[0].contract;
    const upper = strategy.legs[1].contract;
    maxLoss = Math.max(0, netCost);
    maxProfit = round2((upper.strike - lower.strike) * CONTRACT_SIZE * quantity - netCost);
  } else if (strategy.id === 'bearPutSpread') {
    const upper = strategy.legs[0].contract;
    const lower = strategy.legs[1].contract;
    maxLoss = Math.max(0, netCost);
    maxProfit = round2((upper.strike - lower.strike) * CONTRACT_SIZE * quantity - netCost);
  } else if (strategy.id === 'longStraddle' || strategy.id === 'longStrangle') {
    maxLoss = Math.max(0, netCost);
    maxProfit = null;
  }
  return { debit: round2(debit), credit: round2(credit), netCost, maxLoss, maxProfit };
}

/** P&L of the whole strategy at an expiry price. */
export function strategyPayoff(strategy, spot) {
  let pnl = 0;
  for (const leg of strategy.legs) {
    const intrinsic = leg.contract.type === 'call'
      ? Math.max(0, spot - leg.contract.strike)
      : Math.max(0, leg.contract.strike - spot);
    const sign = leg.side === 'buy' ? 1 : -1;
    pnl += sign * (intrinsic - leg.contract.premium) * CONTRACT_SIZE * leg.qty;
  }
  if (strategy.stockLegs) {
    pnl += (spot - strategy.legs[0].contract.spot) * strategy.stockLegs;
  }
  return round2(pnl);
}
