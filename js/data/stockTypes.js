/**
 * Stock style tags used by Stage 2 Unit 6. Each fictional company is classified
 * once; the tag is descriptive and never changes the price model.
 */
export const STOCK_STYLES = {
  growth: ['AURA', 'HLIX', 'QYRA', 'VELT', 'NIMB', 'SRIN', 'KAIN', 'LUMO', 'ARCA', 'VIVD', 'PULS', 'HOME', 'LITH', 'VOLT', 'SPRK'],
  dividend: ['VRDN', 'LUMX', 'FERR', 'NOVA', 'BRWN', 'FRES', 'ALTA', 'CRST', 'MERI', 'SOLR', 'WIND', 'AQUA'],
  value: ['ZENI', 'TLLY', 'MEDX', 'CARA', 'STYL', 'FERO', 'COPR'],
  cyclical: ['ORBT', 'FRTL', 'AXLE', 'GRID', 'CYCL', 'MACH'],
};

export const STYLE_IDS = ['growth', 'value', 'dividend', 'cyclical'];

const STYLE_BY_TICKER = Object.entries(STOCK_STYLES).reduce((acc, [style, tickers]) => {
  for (const ticker of tickers) acc[ticker] = style;
  return acc;
}, {});

export function styleOf(ticker) {
  return STYLE_BY_TICKER[ticker] || null;
}

export function styleLabelKey(style) {
  return `stockStyle.${style}`;
}

export function styleDescKey(style) {
  return `stockStyle.${style}Desc`;
}

export function tickersByStyle(style) {
  return STOCK_STYLES[style] || [];
}
