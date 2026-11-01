/**
 * Bilingual financial glossary. Each term carries its own explanation in both
 * languages and links back to the lesson unit where it is taught.
 */
export const GLOSSARY_TERMS = [
  { id: 'stock', unitId: 'u1', related: ['shareholder', 'marketCap', 'ticker'] },
  { id: 'shareholder', unitId: 'u1', related: ['stock', 'ticker'] },
  { id: 'ticker', unitId: 'u1', related: ['stock', 'exchange'] },
  { id: 'marketCap', unitId: 'u1', related: ['stock', 'sharePrice'] },
  { id: 'sharePrice', unitId: 'u1', related: ['marketCap', 'bid', 'ask'] },
  { id: 'exchange', unitId: 'u1', related: ['ticker', 'liquidity'] },
  { id: 'broker', unitId: 'u2', related: ['marketOrder', 'limitOrder'] },
  { id: 'bid', unitId: 'u2', related: ['ask', 'spread'] },
  { id: 'ask', unitId: 'u2', related: ['bid', 'spread'] },
  { id: 'spread', unitId: 'u2', related: ['bid', 'ask', 'liquidity'] },
  { id: 'marketOrder', unitId: 'u2', related: ['limitOrder', 'slippage'] },
  { id: 'limitOrder', unitId: 'u4', related: ['marketOrder', 'liquidity'] },
  { id: 'costBasis', unitId: 'u3', related: ['unrealizedPnl', 'realizedPnl'] },
  { id: 'unrealizedPnl', unitId: 'u3', related: ['realizedPnl', 'costBasis'] },
  { id: 'realizedPnl', unitId: 'u3', related: ['unrealizedPnl', 'commission'] },
  { id: 'returnRate', unitId: 'u3', related: ['realizedPnl', 'costBasis'] },
  { id: 'commission', unitId: 'u3', related: ['spread', 'realizedPnl'] },
  { id: 'liquidity', unitId: 'u4', related: ['spread', 'slippage'] },
  { id: 'slippage', unitId: 'u4', related: ['marketOrder', 'liquidity'] },
  { id: 'dividend', unitId: 'u5', related: ['dividendYield', 'exDividendDate', 'payoutRatio'] },
  { id: 'dividendYield', unitId: 'u5', related: ['dividend', 'sharePrice'] },
  { id: 'exDividendDate', unitId: 'u5', related: ['dividend', 'dividendYield'] },
  { id: 'payoutRatio', unitId: 'u5', related: ['dividend', 'dividendYield'] },
  { id: 'growthStock', unitId: 'u6', related: ['valueStock', 'cyclicalStock'] },
  { id: 'valueStock', unitId: 'u6', related: ['growthStock', 'cyclicalStock'] },
  { id: 'cyclicalStock', unitId: 'u6', related: ['valueStock', 'growthStock'] },
  { id: 'etf', unitId: 'u7', related: ['diversification', 'liquidity'] },
  { id: 'diversification', unitId: 'u7', related: ['etf', 'growthStock'] },
  { id: 'compounding', unitId: 'u8', related: ['returnRate', 'dividend'] },
  { id: 'candle', unitId: 'u9', related: ['sma', 'rsi'] },
  { id: 'sma', unitId: 'u10', related: ['candle', 'rsi'] },
  { id: 'rsi', unitId: 'u10', related: ['sma', 'candle'] },
  { id: 'incomeStatement', unitId: 'u11', related: ['balanceSheet', 'freeCashFlow'] },
  { id: 'balanceSheet', unitId: 'u11', related: ['incomeStatement', 'freeCashFlow'] },
  { id: 'freeCashFlow', unitId: 'u11', related: ['incomeStatement', 'dcf'] },
  { id: 'dcf', unitId: 'u12', related: ['freeCashFlow', 'returnRate'] },
  { id: 'gdp', unitId: 'u13', related: ['inflation', 'interestRate'] },
  { id: 'inflation', unitId: 'u13', related: ['gdp', 'interestRate'] },
  { id: 'interestRate', unitId: 'u13', related: ['inflation', 'dcf'] },
  { id: 'assetAllocation', unitId: 'u14', related: ['diversification', 'drawdown'] },
  { id: 'positionSizing', unitId: 'u15', related: ['drawdown', 'assetAllocation'] },
  { id: 'drawdown', unitId: 'u15', related: ['positionSizing', 'assetAllocation'] },
  { id: 'momentum', unitId: 'u16', related: ['valueStock', 'growthStock'] },
  { id: 'shortSelling', unitId: 'u17', related: ['margin', 'stopOrder'] },
  { id: 'margin', unitId: 'u18', related: ['marginCall', 'shortSelling'] },
  { id: 'marginCall', unitId: 'u18', related: ['margin', 'drawdown'] },
  { id: 'stopOrder', unitId: 'u19', related: ['trailingStop', 'limitOrder'] },
  { id: 'trailingStop', unitId: 'u19', related: ['stopOrder', 'drawdown'] },
  { id: 'orderBook', unitId: 'u20', related: ['liquidity', 'spread'] },
  { id: 'optionContract', unitId: 'u21', related: ['callOption', 'putOption', 'strikePrice'] },
  { id: 'callOption', unitId: 'u21', related: ['putOption', 'strikePrice', 'optionPremium'] },
  { id: 'putOption', unitId: 'u21', related: ['callOption', 'strikePrice', 'optionPremium'] },
  { id: 'strikePrice', unitId: 'u21', related: ['optionContract', 'optionPremium', 'callOption'] },
  { id: 'optionPremium', unitId: 'u21', related: ['strikePrice', 'impliedVolatility', 'greeks'] },
  { id: 'impliedVolatility', unitId: 'u24', related: ['optionPremium', 'greeks'] },
  { id: 'greeks', unitId: 'u24', related: ['optionPremium', 'impliedVolatility', 'callOption'] },
  { id: 'assignment', unitId: 'u25', related: ['optionContract', 'margin'] },
  { id: 'coveredCall', unitId: 'u26', related: ['callOption', 'assignment', 'optionPremium'] },
  { id: 'cashSecuredPut', unitId: 'u26', related: ['putOption', 'optionPremium', 'margin'] },
  { id: 'verticalSpread', unitId: 'u27', related: ['callOption', 'putOption', 'strikePrice'] },
  { id: 'straddle', unitId: 'u28', related: ['callOption', 'putOption', 'impliedVolatility'] },
  { id: 'strangle', unitId: 'u28', related: ['straddle', 'optionPremium', 'impliedVolatility'] },
  { id: 'futuresContract', unitId: 'u29', related: ['margin', 'basis', 'hedge'] },
  { id: 'basis', unitId: 'u29', related: ['futuresContract', 'interestRate'] },
  { id: 'hedge', unitId: 'u30', related: ['futuresContract', 'diversification', 'drawdown'] },
  { id: 'systemicRisk', unitId: 'u31', related: ['drawdown', 'marginCall', 'liquidity'] },
];

export function getGlossaryTerm(termId) {
  return GLOSSARY_TERMS.find((term) => term.id === termId) || null;
}

export function termKey(termId, field) {
  return `glossary.terms.${termId}.${field}`;
}

export function relatedTerms(termId) {
  const term = getGlossaryTerm(termId);
  return term ? term.related : [];
}

export function glossaryCount() {
  return GLOSSARY_TERMS.length;
}
