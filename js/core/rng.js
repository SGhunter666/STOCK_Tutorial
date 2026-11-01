/**
 * Deterministic pseudo random numbers (mulberry32) plus a Box-Muller normal sampler.
 * The whole market simulation is driven by this so a save file can be replayed exactly.
 */
export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed) || 1;
  let spare = null;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function normal() {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  }

  function range(min, max) {
    return min + (max - min) * next();
  }

  function int(min, max) {
    return Math.floor(range(min, max + 1));
  }

  function pick(items) {
    return items[Math.floor(next() * items.length)];
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function getState() {
    return { state, spare };
  }

  function setState(next) {
    if (!next) return;
    state = next.state >>> 0;
    spare = typeof next.spare === 'number' ? next.spare : null;
  }

  return { next, normal, range, int, pick, shuffle, getState, setState };
}

/** Stable random stream for quiz variants: same seed + attempt => same question numbers. */
export function seededQuizzes(seedText) {
  return createRng(`quiz:${seedText}`);
}
