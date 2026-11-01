/**
 * Localised labels for companies, sectors and units.
 */
export function companyName(ctx, ticker, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, `company.${ticker}.name`);
}

export function companyDesc(ctx, ticker, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, `company.${ticker}.desc`);
}

export function sectorLabel(ctx, sector, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, `sector.${sector}`);
}

export function unitLabel(ctx, unit, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, unit.titleKey);
}

export function unitSummary(ctx, unit, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, unit.summaryKey);
}

export function sectionLabel(ctx, section, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, section.titleKey);
}

export function stageLabel(ctx, stage, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, stage.titleKey);
}

export function stageSummary(ctx, stage, locale = ctx.i18n.locale) {
  return ctx.i18n.translate(locale, stage.summaryKey);
}

export const POSITION_COLORS = ['#5eead4', '#7c9cff', '#f5b750', '#f472b6', '#60a5fa', '#34d399', '#c084fc', '#fb923c'];
