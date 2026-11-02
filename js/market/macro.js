/**
 * Simplified macro cycle for Stage 4. Values are deterministic functions of the
 * simulated day and seed, so the same save always shows the same macro picture.
 * They are teaching indicators, not a forecast of any real economy.
 */
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

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function macroSnapshot(day, seed = '') {
  const phase = seedPhase(seed);
  const policyRate = round1(2.6 + 1.6 * wave(day, 240, phase) + 0.7 * wave(day, 60, phase + 1));
  const inflation = round1(2.3 + 1.1 * wave(day, 150, phase + 0.6) + 0.4 * wave(day, 45, phase));
  const growth = round1(2.1 + 1.3 * wave(day, 300, phase + 1.2));
  const unemployment = round1(5.1 - 0.9 * wave(day, 200, phase + 0.3));
  const realRate = round1(policyRate - inflation);
  const regime = growth >= 2.6 ? 'expansion'
    : growth <= 1.2 ? 'slowdown'
      : inflation >= 3.2 ? 'inflation' : 'neutral';
  return {
    policyRate,
    inflation,
    growth,
    unemployment,
    realRate,
    regime,
  };
}

export function regimeKey(regime) {
  return `macro.regime.${regime}`;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function eventSurprise(seed, date, type) {
  let hash = 0;
  const text = `${seed}:${date}:${type}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 10000;
  }
  return (hash / 10000 - 0.5) * 2;
}

/** Extended deterministic macro picture used by the Economy page. */
export function macroWorld(day, seed = '') {
  const snapshot = macroSnapshot(day, seed);
  const phase = seedPhase(seed);
  const confidence = round1(
    100 + snapshot.growth * 7 - snapshot.unemployment * 2.2 - Math.max(0, snapshot.realRate) * 1.8
    + wave(day, 90, phase + 0.4) * 2,
  );
  const yield2 = round2(snapshot.policyRate + 0.15 + wave(day, 120, phase) * 0.1);
  const yield10 = round2(
    snapshot.policyRate + 0.55 + snapshot.growth * 0.18 - snapshot.inflation * 0.08
    + wave(day, 180, phase + 0.9) * 0.12,
  );
  const curve = round2(yield10 - yield2);
  const creditSpread = round2(
    1.15 + Math.max(0, 2.1 - snapshot.growth) * 1.1 + Math.max(0, snapshot.realRate) * 0.35,
  );
  const riskAppetite = Math.round(Math.max(0, Math.min(100,
    50 + snapshot.growth * 12 - snapshot.inflation * 6 - Math.max(0, snapshot.realRate) * 5
    + (snapshot.regime === 'expansion' ? 8 : snapshot.regime === 'slowdown' ? -8 : 0),
  )));
  return {
    ...snapshot,
    confidence,
    yield2,
    yield10,
    curve,
    creditSpread,
    riskAppetite,
  };
}

const CALENDAR_TYPES = ['cpi', 'payrolls', 'gdp', 'pmi', 'centralBank'];
const CALENDAR_INTERVAL = 21;

/** Recent and upcoming deterministic macro releases with forecasts and surprises. */
export function macroCalendar(day, seed = '', { past = 3, future = 3 } = {}) {
  const phase = seedPhase(seed);
  const events = [];
  const first = Math.floor((day - past * CALENDAR_INTERVAL) / CALENDAR_INTERVAL) * CALENDAR_INTERVAL;
  for (let date = first; date <= day + future * CALENDAR_INTERVAL; date += CALENDAR_INTERVAL) {
    if (date < 0) continue;
    const type = CALENDAR_TYPES[Math.abs(Math.floor(date / CALENDAR_INTERVAL)) % CALENDAR_TYPES.length];
    const snapshot = macroSnapshot(Math.max(0, date), seed);
    let forecast = 50;
    let sensitivity = 0.2;
    let positiveWhen = 1;
    if (type === 'cpi') {
      forecast = round1(snapshot.inflation);
      sensitivity = 0.45;
      positiveWhen = -1;
    } else if (type === 'payrolls') {
      forecast = Math.round(120 + snapshot.growth * 35 + wave(date, 90, phase) * 28);
      sensitivity = 0.03;
    } else if (type === 'gdp') {
      forecast = round1(snapshot.growth);
      sensitivity = 0.35;
    } else if (type === 'pmi') {
      forecast = round1(50 + (snapshot.growth - 2.1) * 3.5);
      sensitivity = 0.22;
    } else {
      forecast = round2(snapshot.policyRate);
      sensitivity = 0.55;
      positiveWhen = -1;
    }
    const surprise = eventSurprise(seed, date, type);
    const actual = type === 'payrolls'
      ? Math.round(forecast + surprise * 55)
      : round2(forecast + surprise * (type === 'centralBank' ? 0.35 : type === 'cpi' ? 0.7 : 0.6));
    const diff = round2(actual - forecast);
    const impactPct = round2(diff * sensitivity * positiveWhen);
    events.push({
      day: date,
      type,
      forecast,
      actual,
      surprise: diff,
      impactPct,
      released: date <= day,
    });
  }
  return events.filter((event) => event.day >= day - past * CALENDAR_INTERVAL
    && event.day <= day + future * CALENDAR_INTERVAL).slice(0, past + future + 2);
}

const REGIONS = [
  { id: 'us', nameKey: 'macro.region.us', base: 1000, period: 260, coupling: 1, phase: 0 },
  { id: 'europe', nameKey: 'macro.region.europe', base: 760, period: 240, coupling: 0.78, phase: 0.6 },
  { id: 'asia', nameKey: 'macro.region.asia', base: 880, period: 220, coupling: 0.62, phase: 1.1 },
  { id: 'em', nameKey: 'macro.region.em', base: 640, period: 200, coupling: 0.48, phase: 1.7 },
];

/** Global market proxies; US uses the simulated index, other regions link to it. */
export function globalMarkets(state, day, seed = '') {
  const phase = seedPhase(seed);
  const usLevel = Number.isFinite(state?.market?.index?.value) ? state.market.index.value : 1000;
  const usPrev = state?.market?.index?.prevClose || usLevel;
  const usChange = usPrev > 0 ? ((usLevel / usPrev) - 1) * 100 : 0;
  return REGIONS.map((region) => {
    if (region.id === 'us') {
      return {
        id: 'us',
        nameKey: region.nameKey,
        level: round2(usLevel),
        changePct: round2(usChange),
        coupling: 1,
      };
    }
    const local = wave(day, region.period, phase + region.phase) * 6;
    const level = round2(region.base * (1 + wave(day, region.period, phase + region.phase) * 0.09));
    const prev = region.base * (1 + wave(day - 1, region.period, phase + region.phase) * 0.09);
    return {
      id: region.id,
      nameKey: region.nameKey,
      level,
      changePct: round2(usChange * region.coupling + local / region.period),
      local: round2(local / region.period),
      coupling: region.coupling,
      previousLevel: round2(prev),
    };
  });
}
