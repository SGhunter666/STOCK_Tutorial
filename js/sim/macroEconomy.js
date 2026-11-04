/**
 * Phase 4 fictional macro economy for the simulated exchange.
 *
 * Indicators mean-revert slowly and are published on a fixed 21-day calendar.
 * Every release uses its own RNG stream (`macro:<seed>:<day>`) so macro news
 * never consumes the market or trader random sequence. The module only
 * produces state and events; the exchange engine applies the price impact.
 */
import { createRng } from '../core/rng.js';
import { detectSectorBubble } from './industryModel.js';

export const SIM_MACRO_INTERVAL = 21;
export const SIM_MACRO_EVENT_OFFSET = 7;
export const SIM_MACRO_EVENT_TYPES = Object.freeze([
  'cpi', 'payrolls', 'centralBank', 'gdp', 'energy',
]);

export const MACRO_BASELINE = Object.freeze({
  policyRate: 4.25,
  inflation: 2.6,
  unemployment: 4.2,
  gdpGrowth: 2.1,
  creditGrowth: 2.4,
  consumerConfidence: 98,
  businessInvestment: 100,
  energyPrice: 78,
  riskAppetite: 52,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function createMacroState() {
  return {
    ...MACRO_BASELINE,
    regime: 'normal',
    bubbleSector: null,
    lastEventDay: 0,
    events: [],
  };
}

export function isMacroEventDay(dayIndex) {
  return dayIndex >= SIM_MACRO_EVENT_OFFSET
    && (dayIndex - SIM_MACRO_EVENT_OFFSET) % SIM_MACRO_INTERVAL === 0;
}

export function macroEventIndexForDay(dayIndex) {
  return (dayIndex - SIM_MACRO_EVENT_OFFSET) / SIM_MACRO_INTERVAL;
}

export function macroEventTypeForDay(dayIndex) {
  if (!isMacroEventDay(dayIndex)) return null;
  const index = macroEventIndexForDay(dayIndex);
  return SIM_MACRO_EVENT_TYPES[index % SIM_MACRO_EVENT_TYPES.length];
}

/** Next scheduled release after `dayIndex` (never returns the current day). */
export function nextMacroEventDay(dayIndex) {
  if (dayIndex < SIM_MACRO_EVENT_OFFSET) return SIM_MACRO_EVENT_OFFSET;
  const index = Math.floor((dayIndex - SIM_MACRO_EVENT_OFFSET) / SIM_MACRO_INTERVAL) + 1;
  return SIM_MACRO_EVENT_OFFSET + index * SIM_MACRO_INTERVAL;
}

export function deriveMacroRegime(macro, previousRegime = 'normal', bubbleSector = null) {
  if (macro.creditGrowth < -1 && macro.riskAppetite < 26 && macro.gdpGrowth < 1.2) return 'crisis';
  if (macro.creditGrowth < 0.5 && macro.riskAppetite < 33) return 'liquidity';
  if (macro.gdpGrowth < 0.8 && macro.unemployment > 5.2) return 'recession';
  if (previousRegime === 'recession' && macro.gdpGrowth >= 1.4) return 'recovery';
  if (macro.inflation >= 4.2) return 'highVol';
  if (bubbleSector) return 'sectorBubble';
  if (macro.gdpGrowth >= 3 && macro.riskAppetite >= 62) return 'bull';
  if (macro.gdpGrowth <= 1.3 && macro.riskAppetite <= 40) return 'bear';
  return 'normal';
}

function buildEvent({ dayIndex, prev, next, rng }) {
  const type = macroEventTypeForDay(dayIndex);
  let forecast;
  let actual;
  let surprise = 0;
  let channels = {};

  if (type === 'cpi') {
    forecast = round(next.inflation);
    const diff = rng.normal() * 0.32;
    actual = round(clamp(forecast + diff, -1, 9));
    next.inflation = actual;
    surprise = clamp(diff / 0.32, -1.5, 1.5);
    channels = { rates: surprise, growth: -0.2 * surprise, risk: -0.6 * surprise };
  } else if (type === 'payrolls') {
    forecast = Math.round(140 + (next.gdpGrowth - 2) * 30);
    const diff = rng.normal() * 42;
    actual = Math.round(forecast + diff);
    next.unemployment = round(clamp(next.unemployment - diff / 700, 2.5, 12), 2);
    surprise = clamp(diff / 42, -1.5, 1.5);
    channels = { growth: surprise, rates: 0.35 * surprise, risk: 0.3 * surprise };
  } else if (type === 'centralBank') {
    forecast = round(prev.policyRate);
    const pressure = (next.inflation - 2.5) * 0.8
      + (next.gdpGrowth - 2) * 0.4
      + rng.normal() * 0.25;
    const decision = pressure > 0.55 ? 0.25 : pressure < -0.55 ? -0.25 : 0;
    actual = round(forecast + decision);
    next.policyRate = actual;
    surprise = clamp(decision / 0.25, -1.5, 1.5);
    channels = { rates: surprise, risk: -0.4 * surprise };
  } else if (type === 'gdp') {
    forecast = round(next.gdpGrowth);
    const diff = rng.normal() * 0.28;
    actual = round(clamp(forecast + diff, -3, 6));
    next.gdpGrowth = actual;
    surprise = clamp(diff / 0.28, -1.5, 1.5);
    channels = { growth: surprise, rates: 0.1 * surprise };
  } else {
    forecast = round(next.energyPrice);
    const changePct = rng.normal() * 0.09;
    actual = round(clamp(forecast * (1 + changePct), 20, 250));
    next.energyPrice = actual;
    surprise = clamp(changePct / 0.09, -1.5, 1.5);
    channels = { energy: surprise, growth: -0.15 * surprise, risk: -0.25 * surprise };
  }

  const direction = surprise > 0.05 ? 'positive' : surprise < -0.05 ? 'negative' : 'neutral';
  const marketTone = type === 'energy' ? 'neutral'
    : type === 'cpi' || type === 'centralBank'
      ? (surprise > 0.05 ? 'negative' : surprise < -0.05 ? 'positive' : 'neutral')
      : (surprise > 0.05 ? 'positive' : surprise < -0.05 ? 'negative' : 'neutral');
  return {
    id: `M${dayIndex}-${type}`,
    type,
    day: dayIndex,
    forecast: round(forecast),
    actual: round(actual),
    difference: round(actual - forecast),
    surprise: round(surprise, 4),
    channels,
    direction,
    marketTone,
  };
}

/**
 * Advances the macro world by one trading day. The event only describes what
 * was published today; future releases are never returned or stored early.
 */
export function advanceMacro({
  seed, dayIndex, macro, sectorPerformance = {},
} = {}) {
  const previous = macro || createMacroState();
  const rng = createRng(`macro:${seed}:${dayIndex}`);
  const next = {
    ...previous,
    events: [...(previous.events || [])].slice(-40),
  };

  next.inflation = round(clamp(
    previous.inflation + (2.6 - previous.inflation) * 0.04 + rng.normal() * 0.07, 0.4, 8,
  ));
  next.unemployment = round(clamp(
    previous.unemployment + (4.2 - previous.unemployment) * 0.02 + rng.normal() * 0.05, 2.5, 12,
  ));
  next.gdpGrowth = round(clamp(
    previous.gdpGrowth + (2.1 - previous.gdpGrowth) * 0.02 + rng.normal() * 0.045, -3, 6,
  ));
  next.creditGrowth = round(clamp(
    previous.creditGrowth + (2.4 - previous.creditGrowth) * 0.03 + rng.normal() * 0.1, -4, 8,
  ));
  next.consumerConfidence = round(clamp(
    previous.consumerConfidence + (98 - previous.consumerConfidence) * 0.03 + rng.normal() * 0.55,
    40, 140,
  ), 1);
  next.businessInvestment = round(clamp(
    previous.businessInvestment + (100 - previous.businessInvestment) * 0.03 + rng.normal() * 0.5,
    40, 160,
  ), 1);
  next.energyPrice = round(clamp(
    previous.energyPrice + (78 - previous.energyPrice) * 0.02 + rng.normal() * 0.9, 20, 250,
  ));

  const targetRisk = 50
    + (next.gdpGrowth - 2) * 10
    - (next.inflation - 2.5) * 4
    + (next.consumerConfidence - 98) * 0.35;
  next.riskAppetite = round(clamp(
    previous.riskAppetite + (targetRisk - previous.riskAppetite) * 0.05 + rng.normal() * 1.4,
    0, 100,
  ), 1);

  let event = null;
  if (isMacroEventDay(dayIndex)) {
    event = buildEvent({ dayIndex, prev: previous, next, rng });
    next.events.push(event);
    next.lastEventDay = dayIndex;
  }

  next.bubbleSector = detectSectorBubble({
    sectorPerformance,
    riskAppetite: next.riskAppetite,
  });
  next.regime = deriveMacroRegime(next, previous.regime, next.bubbleSector);
  return { macro: next, event };
}
