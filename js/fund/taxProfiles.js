/**
 * Simplified fund tax profiles for teaching. These are deliberately generic
 * flat-rate profiles, not advice or a claim about any real jurisdiction.
 */
export const FUND_TAX_PROFILES = [
  {
    id: 'none',
    nameKey: 'fund.taxProfile.none',
    descKey: 'fund.taxProfile.noneDesc',
    capitalGainsRate: 0,
    levyRate: 0,
  },
  {
    id: 'flat15',
    nameKey: 'fund.taxProfile.flat15',
    descKey: 'fund.taxProfile.flat15Desc',
    capitalGainsRate: 0.15,
    levyRate: 0,
  },
  {
    id: 'flat25Levy',
    nameKey: 'fund.taxProfile.flat25Levy',
    descKey: 'fund.taxProfile.flat25LevyDesc',
    capitalGainsRate: 0.25,
    levyRate: 0.001,
  },
];

export function taxProfileById(id) {
  return FUND_TAX_PROFILES.find((entry) => entry.id === id) || FUND_TAX_PROFILES[0];
}
