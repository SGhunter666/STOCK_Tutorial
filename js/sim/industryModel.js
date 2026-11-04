/**
 * Phase 4 industry model: macro sensitivities and cross-sector links.
 *
 * Each sector has an explainable response to growth, rates, energy and market
 * risk. Links create second-order correlation between related industries,
 * without forcing every stock to move together.
 */

const DEFAULT_SENSITIVITY = { growth: 0.8, rates: -0.5, energy: -0.2, risk: 0.6 };

export const SECTOR_MACRO_SENSITIVITY = Object.freeze({
  technology: { growth: 1.0, rates: -1.2, energy: -0.25, risk: 1.1 },
  communication: { growth: 0.8, rates: -1.0, energy: -0.2, risk: 1.0 },
  consumer: { growth: 1.1, rates: -0.45, energy: -1.0, risk: 0.8 },
  financials: { growth: 0.9, rates: 0.4, energy: 0, risk: 0.9 },
  healthcare: { growth: 0.5, rates: -0.35, energy: -0.25, risk: 0.5 },
  energy: { growth: 0.7, rates: -0.25, energy: 1.3, risk: 0.8 },
  industrials: { growth: 1.2, rates: -0.45, energy: -0.65, risk: 0.9 },
  utilities: { growth: 0.25, rates: -0.9, energy: -0.5, risk: 0.35 },
  materials: { growth: 0.95, rates: -0.3, energy: 0.35, risk: 0.7 },
  realestate: { growth: 0.7, rates: -1.3, energy: -0.15, risk: 0.6 },
  telecom: { growth: 0.4, rates: -0.65, energy: -0.3, risk: 0.45 },
});

/** Symmetric explanatory links used for sector-news spillovers. */
export const SECTOR_LINKS = Object.freeze({
  technology: { communication: 0.45, industrials: 0.2, consumer: 0.15 },
  communication: { technology: 0.45, consumer: 0.3, telecom: 0.18 },
  consumer: { industrials: 0.25, financials: 0.18, communication: 0.3 },
  financials: { realestate: 0.35, consumer: 0.18 },
  healthcare: { technology: 0.18 },
  energy: { materials: 0.32, utilities: 0.18, industrials: 0.15 },
  industrials: { materials: 0.3, energy: 0.15, consumer: 0.25, technology: 0.2 },
  utilities: { telecom: 0.2, energy: 0.18 },
  materials: { energy: 0.32, industrials: 0.3 },
  realestate: { financials: 0.35, consumer: 0.15 },
  telecom: { communication: 0.18, utilities: 0.2 },
});

const REGIME_DRIFT = {
  normal: 0,
  bull: 0.0004,
  bear: -0.0004,
  highVol: -0.0002,
  crisis: -0.001,
  liquidity: -0.0007,
  sectorBubble: 0.0002,
  recession: -0.0006,
  recovery: 0.0005,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function sectorSensitivity(sector) {
  return SECTOR_MACRO_SENSITIVITY[sector] || DEFAULT_SENSITIVITY;
}

/** Direct or reverse link weight; 0 means sectors are not explicitly linked. */
export function sectorLinkWeight(origin, target) {
  if (!origin || !target || origin === target) return 0;
  const direct = SECTOR_LINKS[origin]?.[target];
  if (Number.isFinite(direct)) return direct;
  const reverse = SECTOR_LINKS[target]?.[origin];
  return Number.isFinite(reverse) ? reverse : 0;
}

/** Linked sectors and signed weights for a sector-news spillover. */
export function sectorSpillovers(origin) {
  return Object.entries(SECTOR_LINKS[origin] || {})
    .map(([sector, weight]) => ({ sector, weight }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

/**
 * Translates a macro event into a price impact for one company. The event
 * carries signed channels (growth / rates / energy / risk); sector sensitivities
 * turn those channels into an explainable cross-section.
 */
export function macroImpactForCompany({ event, company } = {}) {
  if (!event || !company) return 0;
  const channels = event.channels || {};
  const sens = sectorSensitivity(company.sector);
  const beta = Number.isFinite(company.beta) ? company.beta : 1;
  const weighted = sens.growth * (channels.growth || 0)
    + sens.rates * (channels.rates || 0)
    + sens.energy * (channels.energy || 0)
    + sens.risk * (channels.risk || 0) * 0.5;
  const impact = weighted * 0.013 * (0.7 + 0.3 * beta);
  return clamp(impact, -0.06, 0.06);
}

/** Small overnight drift from the current macro level; never a fixed winner. */
export function macroDriftForCompany({ macro, company } = {}) {
  if (!macro || !company) return 0;
  const sens = sectorSensitivity(company.sector);
  const beta = Number.isFinite(company.beta) ? company.beta : 1;
  const growthGap = macro.gdpGrowth - 2;
  const rateGap = macro.policyRate - 4.25;
  const energyGap = (macro.energyPrice - 78) / 78;
  const riskGap = (macro.riskAppetite - 50) / 50;
  const drift = 0.00045 * (sens.growth * growthGap
    + sens.rates * rateGap * 0.5
    + sens.energy * energyGap)
    + 0.00035 * riskGap * beta
    + (REGIME_DRIFT[macro.regime] || 0);
  return clamp(drift, -0.004, 0.004);
}

/** Best-performing sector when risk appetite is high enough to call a bubble. */
export function detectSectorBubble({ sectorPerformance, riskAppetite } = {}) {
  if (!sectorPerformance || riskAppetite < 60) return null;
  let best = null;
  let bestRatio = 1.35;
  for (const [sector, ratio] of Object.entries(sectorPerformance)) {
    if (Number.isFinite(ratio) && ratio > bestRatio) {
      best = sector;
      bestRatio = ratio;
    }
  }
  return best;
}
