import type { Allocation, AssetClass, HorizonCategory, RiskCategory } from '../lib/types';

/**
 * 4 (risk) × 3 (horizon) model allocations, in percent. Each row sums to 100.
 * Generic asset classes only — no tickers or fund brands. Advisor-editable.
 */
export const ASSET_CLASSES: { id: AssetClass; label: string; short: string; equity: boolean }[] = [
  { id: 'usLarge', label: 'US Large Cap', short: 'US LC', equity: true },
  { id: 'usSmallMid', label: 'US Small/Mid Cap', short: 'US SMID', equity: true },
  { id: 'intlDev', label: 'International Developed', short: 'INTL DEV', equity: true },
  { id: 'emerging', label: 'Emerging Markets', short: 'EM', equity: true },
  { id: 'usAgg', label: 'US Aggregate Bonds', short: 'US AGG', equity: false },
  { id: 'tips', label: 'TIPS', short: 'TIPS', equity: false },
  { id: 'cash', label: 'Cash', short: 'CASH', equity: false },
];

export const EQUITY_CLASSES: AssetClass[] = ['usLarge', 'usSmallMid', 'intlDev', 'emerging'];
export const FIXED_CLASSES: AssetClass[] = ['usAgg', 'tips', 'cash'];

const A = (usLarge: number, usSmallMid: number, intlDev: number, emerging: number, usAgg: number, tips: number, cash: number): Allocation =>
  ({ usLarge, usSmallMid, intlDev, emerging, usAgg, tips, cash });

export const MODELS: Record<RiskCategory, Record<HorizonCategory, Allocation>> = {
  Conservative: {
    'Short-term':   A(14, 3, 5, 0, 48, 15, 15), // 22% equity
    Intermediate:   A(19, 4, 7, 0, 47, 15, 8),  // 30%
    'Long-term':    A(24, 6, 8, 2, 43, 12, 5),  // 40%
  },
  Moderate: {
    'Short-term':   A(21, 5, 7, 2, 42, 13, 10), // 35%
    Intermediate:   A(28, 7, 11, 4, 36, 10, 4), // 50%
    'Long-term':    A(33, 8, 14, 5, 30, 7, 3),  // 60%
  },
  Assertive: {
    'Short-term':   A(28, 7, 11, 4, 36, 9, 5),  // 50%
    Intermediate:   A(36, 9, 14, 6, 26, 6, 3),  // 65%
    'Long-term':    A(43, 11, 18, 8, 15, 3, 2), // 80%
  },
  Aggressive: {
    'Short-term':   A(33, 9, 13, 5, 28, 7, 5),  // 60%
    Intermediate:   A(43, 11, 18, 8, 15, 3, 2), // 80%
    'Long-term':    A(50, 14, 21, 10, 4, 0, 1), // 95%
  },
};

export function equityPct(a: Allocation): number {
  return EQUITY_CLASSES.reduce((s, k) => s + a[k], 0);
}
