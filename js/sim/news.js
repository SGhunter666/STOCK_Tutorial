/**
 * Deterministic simulated news for the Phase 4 exchange.
 *
 * News is generated from a separate RNG stream so adding news never changes
 * the market/trader RNG sequence. Each item has a scope, a template key and a
 * signed price impact; the engine applies it at the start of the trading day.
 */
import { createRng, hashSeed } from '../core/rng.js';

const COMPANY_TEMPLATES = [
  { id: 'productLaunch', sentiment: 'positive', impact: [0.010, 0.026] },
  { id: 'analystUpgrade', sentiment: 'positive', impact: [0.006, 0.018] },
  { id: 'buyback', sentiment: 'positive', impact: [0.005, 0.015] },
  { id: 'contractWin', sentiment: 'positive', impact: [0.008, 0.020] },
  { id: 'analystDowngrade', sentiment: 'negative', impact: [0.006, 0.018] },
  { id: 'lawsuit', sentiment: 'negative', impact: [0.010, 0.026] },
  { id: 'recall', sentiment: 'negative', impact: [0.008, 0.022] },
  { id: 'ceoExit', sentiment: 'negative', impact: [0.006, 0.018] },
];

const SECTOR_TEMPLATES = [
  { id: 'sectorDemand', sentiment: 'positive', impact: [0.004, 0.012] },
  { id: 'sectorPolicy', sentiment: 'positive', impact: [0.003, 0.010] },
  { id: 'sectorRegulation', sentiment: 'negative', impact: [0.004, 0.012] },
  { id: 'sectorInputCost', sentiment: 'negative', impact: [0.003, 0.010] },
];

const MARKET_TEMPLATES = [
  { id: 'rateCut', sentiment: 'positive', impact: [0.003, 0.009] },
  { id: 'riskAppetite', sentiment: 'positive', impact: [0.002, 0.007] },
  { id: 'rateHike', sentiment: 'negative', impact: [0.003, 0.009] },
  { id: 'riskOff', sentiment: 'negative', impact: [0.002, 0.008] },
];

function magnitude(rng, range, negative) {
  const value = range[0] + (range[1] - range[0]) * rng.next();
  return negative ? -value : value;
}

function pickTemplate(rng, templates) {
  return templates[rng.int(0, templates.length - 1)];
}

export function newsForDay({ seed, dayIndex, companies }) {
  if (!companies.length || dayIndex <= 0) return [];
  const rng = createRng(`news:${seed}:${dayIndex}`);
  const count = 1 + rng.int(0, 1);
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const roll = rng.next();
    const scope = roll < 0.6 ? 'company' : roll < 0.85 ? 'sector' : 'market';
    const sentimentRoll = rng.next();
    let template;
    let params = {};
    let ticker = null;
    let sector = null;
    if (scope === 'company') {
      const templates = sentimentRoll < 0.5
        ? COMPANY_TEMPLATES.filter((item) => item.sentiment === 'positive')
        : COMPANY_TEMPLATES.filter((item) => item.sentiment === 'negative');
      template = pickTemplate(rng, templates);
      const company = companies[rng.int(0, companies.length - 1)];
      ticker = company.ticker;
      params = { ticker: company.ticker, name: company.name };
    } else if (scope === 'sector') {
      const templates = sentimentRoll < 0.5
        ? SECTOR_TEMPLATES.filter((item) => item.sentiment === 'positive')
        : SECTOR_TEMPLATES.filter((item) => item.sentiment === 'negative');
      template = pickTemplate(rng, templates);
      const sectors = [...new Set(companies.map((company) => company.sector))].sort();
      sector = sectors[rng.int(0, sectors.length - 1)];
    } else {
      const templates = sentimentRoll < 0.5
        ? MARKET_TEMPLATES.filter((item) => item.sentiment === 'positive')
        : MARKET_TEMPLATES.filter((item) => item.sentiment === 'negative');
      template = pickTemplate(rng, templates);
    }
    const impact = magnitude(rng, template.impact, template.sentiment === 'negative');
    events.push({
      id: `N${dayIndex}-${index + 1}-${hashSeed(`${template.id}:${ticker || sector || 'market'}`)}`,
      day: dayIndex,
      scope,
      ticker,
      sector,
      template: template.id,
      sentiment: template.sentiment,
      impact,
      params,
    });
  }
  return events;
}
