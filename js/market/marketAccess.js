/**
 * Market segmentation and access rules. The exchange starts with a core segment
 * and unlocks further segments as Stage 1 units are completed.
 */
import { COMPANIES, getCompany } from '../data/companies.js';
import { isUnitComplete } from '../education/lessonEngine.js';

const SEGMENT_DEFS = [
  {
    id: 'core',
    nameKey: 'market.segment.core.name',
    descKey: 'market.segment.core.desc',
    unlockUnit: null,
  },
  {
    id: 'growth',
    nameKey: 'market.segment.growth.name',
    descKey: 'market.segment.growth.desc',
    unlockUnit: 'u1',
  },
  {
    id: 'consumer',
    nameKey: 'market.segment.consumer.name',
    descKey: 'market.segment.consumer.desc',
    unlockUnit: 'u2',
  },
  {
    id: 'industry',
    nameKey: 'market.segment.industry.name',
    descKey: 'market.segment.industry.desc',
    unlockUnit: 'u3',
  },
  {
    id: 'frontier',
    nameKey: 'market.segment.frontier.name',
    descKey: 'market.segment.frontier.desc',
    unlockUnit: 'u4',
  },
];

export const MARKET_SEGMENTS = SEGMENT_DEFS.map((segment) => ({
  ...segment,
  tickers: COMPANIES.filter((company) => company.segmentId === segment.id).map((company) => company.ticker),
}));

export function segmentById(segmentId) {
  return MARKET_SEGMENTS.find((segment) => segment.id === segmentId) || null;
}

export function companySegment(ticker) {
  const company = getCompany(ticker);
  return company ? segmentById(company.segmentId) : null;
}

export function isSegmentUnlocked(state, segmentId) {
  const segment = segmentById(segmentId);
  if (!segment) return false;
  if (!segment.unlockUnit) return true;
  return isUnitComplete(state, segment.unlockUnit);
}

export function isCompanyUnlocked(state, ticker) {
  const company = getCompany(ticker);
  if (!company) return false;
  return isSegmentUnlocked(state, company.segmentId);
}

export function unlockedTickers(state) {
  return COMPANIES.filter((company) => isCompanyUnlocked(state, company.ticker)).map((company) => company.ticker);
}

export function unlockedCompanies(state) {
  return COMPANIES.filter((company) => isCompanyUnlocked(state, company.ticker));
}

export function segmentStats(state) {
  return MARKET_SEGMENTS.map((segment) => ({
    ...segment,
    count: segment.tickers.length,
    unlocked: isSegmentUnlocked(state, segment.id),
  }));
}

export function newlyUnlockedSegments(state, seenSegmentIds = []) {
  return MARKET_SEGMENTS
    .filter((segment) => isSegmentUnlocked(state, segment.id) && !seenSegmentIds.includes(segment.id))
    .map((segment) => segment.id);
}

export function allSegmentIds() {
  return MARKET_SEGMENTS.map((segment) => segment.id);
}
