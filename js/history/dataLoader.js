/**
 * Loads real historical bars. The offline single-file build embeds the datasets
 * on window.__SMA_HISTORY_DATA__, so no network or server is required.
 */
const cache = new Map();
const embedded = (typeof window !== 'undefined' && window.__SMA_HISTORY_DATA__) || null;

export async function loadHistoryDataset(scenario) {
  if (!scenario) throw new Error('Unknown history scenario');
  if (embedded && embedded[scenario.id]) return embedded[scenario.id];
  if (cache.has(scenario.id)) return cache.get(scenario.id);

  const path = `./data/history/${scenario.fileName}`;
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  const dataset = await response.json();
  cache.set(scenario.id, dataset);
  return dataset;
}

export function cachedHistoryDataset(scenarioId) {
  if (embedded && embedded[scenarioId]) return embedded[scenarioId];
  return cache.get(scenarioId) || null;
}
