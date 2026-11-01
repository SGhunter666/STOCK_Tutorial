/**
 * Simplified financial statements derived from each company's fundamental
 * fields. The numbers are coherent (assets = liabilities + equity) and clearly
 * labelled as simulated data in the UI.
 */
function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function financialsFor(company) {
  if (!company) return null;
  const shares = company.sharesOutstanding;
  const equity = round(company.bookValuePerShare * shares);
  const debt = round(company.revenue * 0.35);
  const assets = equity + debt;
  const grossProfit = round(company.revenue * 0.52);
  const operatingIncome = round(company.netIncome * 1.25);
  const cash = round(Math.min(assets * 0.2, company.revenue * 0.15));
  const freeCashFlow = round(company.netIncome * 0.78);
  const eps = company.netIncome / shares;
  const netMargin = company.netIncome / company.revenue;
  return {
    shares,
    revenue: company.revenue,
    grossProfit,
    operatingIncome,
    netIncome: company.netIncome,
    eps,
    netMargin,
    cash,
    debt,
    assets,
    liabilities: debt,
    equity,
    freeCashFlow,
  };
}
