/**
 * Deterministic option chains for the fictional market. Strikes are centred on
 * the current spot and priced with a volatility smile derived from the company's
 * simulated daily volatility.
 */
import { CONTRACT_SIZE, RISK_FREE_RATE, blackScholes } from './pricing.js';

export const EXPIRY_DAYS = [30, 60, 90];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function annualVolatility(company) {
  const daily = Number(company && company.dailyVol) || 0.03;
  return Math.max(0.12, Math.min(1.2, daily * Math.sqrt(252)));
}

export function smileVol(baseVol, spot, strike) {
  const moneyness = Math.abs(Math.log(Math.max(0.01, strike) / Math.max(0.01, spot)));
  return Math.max(0.1, baseVol * (1 + 0.18 * moneyness));
}

export function strikeStep(spot) {
  if (spot < 20) return 1;
  if (spot < 60) return 2.5;
  if (spot < 150) return 5;
  return 10;
}

export function strikeGrid(spot, levels = 3) {
  const step = strikeStep(spot);
  const base = Math.floor(spot / step) * step;
  const strikes = [];
  for (let index = -levels; index <= levels; index += 1) {
    const strike = round2(base + index * step);
    if (strike > 0) strikes.push(strike);
  }
  return strikes.sort((a, b) => a - b);
}

export function buildOptionChain(company, quote, day) {
  const spot = quote.last;
  const baseVol = annualVolatility(company);
  const strikes = strikeGrid(spot);
  const expiries = EXPIRY_DAYS.map((days) => ({ days, expiryDay: day + days }));
  const contracts = [];
  for (const expiry of expiries) {
    const years = expiry.days / 252;
    for (const strike of strikes) {
      for (const type of ['call', 'put']) {
        const vol = smileVol(baseVol, spot, strike);
        const greeks = blackScholes({ type, spot, strike, years, vol, rate: RISK_FREE_RATE });
        contracts.push({
          ticker: quote.ticker,
          type,
          strike,
          expiryDay: expiry.expiryDay,
          days: expiry.days,
          vol,
          premium: greeks.price,
          intrinsic: greeks.intrinsic,
          timeValue: greeks.timeValue,
          delta: greeks.delta,
          gamma: greeks.gamma,
          theta: greeks.theta,
          vega: greeks.vega,
          rho: greeks.rho,
          spot,
          contractSize: CONTRACT_SIZE,
        });
      }
    }
  }
  return {
    ticker: quote.ticker,
    spot,
    vol: baseVol,
    expiries,
    strikes,
    contracts,
  };
}

export function findContract(chain, { type, strike, expiryDay }) {
  return chain.contracts.find((contract) => (
    contract.type === type
    && Math.abs(contract.strike - strike) < 1e-6
    && contract.expiryDay === expiryDay
  )) || null;
}

export function chainRows(chain, expiryDay) {
  const rows = chain.strikes.map((strike) => {
    const call = findContract(chain, { type: 'call', strike, expiryDay });
    const put = findContract(chain, { type: 'put', strike, expiryDay });
    return { strike, call, put };
  });
  return rows;
}
