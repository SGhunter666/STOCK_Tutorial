/**
 * Tool unlock rules. A locked tool can be inspected (name, purpose, requirements)
 * but its trading actions stay unavailable until the lesson requirement is met.
 */
import { isSectionRead, isUnitComplete } from './lessonEngine.js';

export const TOOL_DEFS = {
  'market.browse': {
    defaultUnlocked: true,
    titleKey: 'unlock.marketBrowse.title',
    descKey: 'unlock.marketBrowse.desc',
    categoryKey: 'unlock.category.market',
  },
  'market.inspect': {
    defaultUnlocked: true,
    titleKey: 'unlock.marketInspect.title',
    descKey: 'unlock.marketInspect.desc',
    categoryKey: 'unlock.category.market',
  },
  'trade.market': {
    defaultUnlocked: true,
    titleKey: 'unlock.tradeMarket.title',
    descKey: 'unlock.tradeMarket.desc',
    categoryKey: 'unlock.category.trading',
  },
  'order.limit': {
    rule: { unitId: 'u4', sectionId: 's3' },
    titleKey: 'unlock.limitOrder.title',
    descKey: 'unlock.limitOrder.desc',
    categoryKey: 'unlock.category.trading',
  },
  'trade.short': {
    rule: { unitId: 'u17', sectionId: 's1' },
    titleKey: 'unlock.short.title',
    descKey: 'unlock.short.desc',
    categoryKey: 'unlock.category.trading',
  },
  'trade.margin': {
    rule: { unitId: 'u18', sectionId: 's1' },
    titleKey: 'unlock.margin.title',
    descKey: 'unlock.margin.desc',
    categoryKey: 'unlock.category.trading',
  },
  'order.stop': {
    rule: { unitId: 'u19', sectionId: 's1' },
    titleKey: 'unlock.stop.title',
    descKey: 'unlock.stop.desc',
    categoryKey: 'unlock.category.trading',
  },
  'market.depth': {
    rule: { unitId: 'u20', sectionId: 's1' },
    titleKey: 'unlock.depth.title',
    descKey: 'unlock.depth.desc',
    categoryKey: 'unlock.category.market',
  },
  'options.trade': {
    rule: { unitId: 'u21', sectionId: 's1' },
    titleKey: 'unlock.options.title',
    descKey: 'unlock.options.desc',
    categoryKey: 'unlock.category.options',
  },
  'trade.futures': {
    phase: 5,
    titleKey: 'unlock.futures.title',
    descKey: 'unlock.futures.desc',
    categoryKey: 'unlock.category.futures',
  },
};

const PHASE_LABEL_KEYS = {
  2: 'unlock.phase.2',
  3: 'unlock.phase.3',
  4: 'unlock.phase.4',
  5: 'unlock.phase.5',
};

export function getToolDef(toolId) {
  return TOOL_DEFS[toolId] || null;
}

export function isToolUnlocked(state, toolId) {
  const def = TOOL_DEFS[toolId];
  if (!def) return false;
  if (def.defaultUnlocked) return true;
  if (def.phase) return false;
  if (def.rule) {
    if (def.rule.sectionId) {
      return isSectionRead(state, def.rule.unitId, def.rule.sectionId);
    }
    if (def.rule.unitId) {
      return isUnitComplete(state, def.rule.unitId);
    }
  }
  return false;
}

/** Structured requirement used by the UI to explain *why* something is locked. */
export function lockReason(state, toolId) {
  const def = TOOL_DEFS[toolId];
  if (!def) return { type: 'unknown', key: 'unlock.unknown' };
  if (isToolUnlocked(state, toolId)) return null;
  if (def.phase) {
    return {
      type: 'phase',
      phase: def.phase,
      key: PHASE_LABEL_KEYS[def.phase] || 'unlock.phase.later',
      titleKey: def.titleKey,
      descKey: def.descKey,
    };
  }
  if (def.rule?.sectionId) {
    return {
      type: 'section',
      unitId: def.rule.unitId,
      sectionId: def.rule.sectionId,
      key: 'unlock.requiresSection',
      params: { unitId: def.rule.unitId, sectionId: def.rule.sectionId },
      titleKey: def.titleKey,
      descKey: def.descKey,
    };
  }
  if (def.rule?.unitId) {
    return {
      type: 'unit',
      unitId: def.rule.unitId,
      key: 'unlock.requiresUnit',
      params: { unitId: def.rule.unitId },
      titleKey: def.titleKey,
      descKey: def.descKey,
    };
  }
  return { type: 'unknown', key: 'unlock.unknown' };
}

export function allTools() {
  return Object.keys(TOOL_DEFS);
}

export function lockedTools(state) {
  return allTools()
    .filter((id) => !isToolUnlocked(state, id))
    .map((id) => ({ id, ...TOOL_DEFS[id], reason: lockReason(state, id) }))
    .filter((tool) => tool.reason);
}
