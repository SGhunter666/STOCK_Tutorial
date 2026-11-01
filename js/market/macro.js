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
