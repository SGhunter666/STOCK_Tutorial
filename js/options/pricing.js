/**
 * European option pricing with Black-Scholes and the five common Greeks.
 * Rates and volatilities are teaching assumptions derived from the simulated
 * company, never real market data.
 */
export const RISK_FREE_RATE = 0.04;
export const CONTRACT_SIZE = 100;
export const TRADING_DAYS = 252;

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Abramowitz & Stegun approximation, accurate to ~1e-7. */
export function normCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Returns the theoretical premium and Greeks. `theta` is per calendar trading
 * day, `vega` is per 1 volatility point (1%), `rho` per 1 rate point (1%).
 */
export function blackScholes({
  type, spot, strike, years, vol, rate = RISK_FREE_RATE,
}) {
  const isCall = type === 'call';
  const safeSpot = Math.max(0.01, Number(spot) || 0);
  const safeStrike = Math.max(0.01, Number(strike) || 0);
  const safeVol = Math.max(0.0001, Number(vol) || 0);
  const safeYears = Math.max(0, Number(years) || 0);
  const intrinsic = isCall
    ? Math.max(0, safeSpot - safeStrike)
    : Math.max(0, safeStrike - safeSpot);

  if (safeYears <= 0) {
    return {
      price: round2(intrinsic),
      intrinsic: round2(intrinsic),
      timeValue: 0,
      delta: isCall ? (safeSpot >= safeStrike ? 1 : 0) : (safeSpot <= safeStrike ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const sqrtT = Math.sqrt(safeYears);
  const d1 = (Math.log(safeSpot / safeStrike) + (rate + 0.5 * safeVol * safeVol) * safeYears) / (safeVol * sqrtT);
  const d2 = d1 - safeVol * sqrtT;
  const discount = Math.exp(-rate * safeYears);
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const pdf = normPdf(d1);

  const price = isCall
    ? safeSpot * nd1 - safeStrike * discount * nd2
    : safeStrike * discount * normCdf(-d2) - safeSpot * normCdf(-d1);
  const delta = isCall ? nd1 : nd1 - 1;
  const gamma = pdf / (safeSpot * safeVol * sqrtT);
  const theta = (isCall
    ? -safeSpot * pdf * safeVol / (2 * sqrtT) - rate * safeStrike * discount * nd2
    : -safeSpot * pdf * safeVol / (2 * sqrtT) + rate * safeStrike * discount * normCdf(-d2)) / TRADING_DAYS;
  const vega = safeSpot * pdf * sqrtT / 100;
  const rho = (isCall ? 1 : -1) * safeStrike * safeYears * discount * (isCall ? nd2 : normCdf(-d2)) / 100;

  return {
    price: round2(Math.max(0.01, price)),
    intrinsic: round2(intrinsic),
    timeValue: round2(Math.max(0, price - intrinsic)),
    delta,
    gamma,
    theta,
    vega,
    rho,
  };
}

export function payoffAtExpiry({ type, spot, strike, premium, qty = 1 }) {
  const intrinsic = type === 'call'
    ? Math.max(0, spot - strike)
    : Math.max(0, strike - spot);
  const gross = intrinsic * CONTRACT_SIZE * qty;
  const cost = premium * CONTRACT_SIZE * qty;
  return {
    intrinsic,
    gross,
    cost,
    pnl: gross - cost,
    breakeven: type === 'call' ? strike + premium : strike - premium,
    maxLoss: cost,
  };
}
