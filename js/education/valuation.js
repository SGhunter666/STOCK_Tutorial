/**
 * Discounted cash flow valuation. All rates are percentages (8 means 8%).
 * The model is deliberately simple and transparent: explicit FCF projections,
 * a Gordon-growth terminal value, net debt adjustment and per-share value.
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function dcf({
  fcf,
  growthRate = 6,
  years = 5,
  discountRate = 9,
  terminalGrowth = 2.5,
  shares = 1,
  netDebt = 0,
}) {
  const inputs = [fcf, growthRate, years, discountRate, terminalGrowth, shares, netDebt];
  if (!inputs.every((value) => Number.isFinite(value))) return null;
  if (fcf <= 0 || shares <= 0 || years < 1 || years > 20) return null;
  if (discountRate <= terminalGrowth) return null;

  const growth = growthRate / 100;
  const discount = discountRate / 100;
  const terminal = terminalGrowth / 100;
  const projections = [];
  let pvExplicit = 0;
  let current = fcf;
  for (let year = 1; year <= years; year += 1) {
    current = current * (1 + growth);
    const present = current / ((1 + discount) ** year);
    projections.push({ year, fcf: round2(current), presentValue: round2(present) });
    pvExplicit += present;
  }
  const terminalValue = current * (1 + terminal) / (discount - terminal);
  const pvTerminal = terminalValue / ((1 + discount) ** years);
  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  return {
    projections,
    pvExplicit: round2(pvExplicit),
    terminalValue: round2(terminalValue),
    pvTerminal: round2(pvTerminal),
    enterpriseValue: round2(enterpriseValue),
    equityValue: round2(equityValue),
    perShare: round2(equityValue / shares),
    terminalShare: round2(pvTerminal / enterpriseValue * 100),
  };
}
