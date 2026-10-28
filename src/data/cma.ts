import type { AssetClass } from '../lib/types';

/**
 * Illustrative long-term capital market assumptions (nominal, annual, arithmetic).
 * NOT a forecast. Shown and editable in Advisor Mode.
 */
export interface CMA { mean: number; vol: number }

export const CMA_DEFAULT: Record<AssetClass, CMA> = {
  usLarge:    { mean: 0.070, vol: 0.160 },
  usSmallMid: { mean: 0.075, vol: 0.200 },
  intlDev:    { mean: 0.072, vol: 0.170 },
  emerging:   { mean: 0.080, vol: 0.230 },
  usAgg:      { mean: 0.045, vol: 0.055 },
  tips:       { mean: 0.042, vol: 0.060 },
  cash:       { mean: 0.030, vol: 0.010 },
};

/** Order: usLarge, usSmallMid, intlDev, emerging, usAgg, tips, cash */
export const CORRELATION: number[][] = [
  [1.00, 0.88, 0.80, 0.70, 0.10, 0.05, 0.00],
  [0.88, 1.00, 0.75, 0.68, 0.05, 0.03, 0.00],
  [0.80, 0.75, 1.00, 0.80, 0.12, 0.08, 0.00],
  [0.70, 0.68, 0.80, 1.00, 0.10, 0.10, 0.00],
  [0.10, 0.05, 0.12, 0.10, 1.00, 0.70, 0.20],
  [0.05, 0.03, 0.08, 0.10, 0.70, 1.00, 0.15],
  [0.00, 0.00, 0.00, 0.00, 0.20, 0.15, 1.00],
];

export const INFLATION_DEFAULT = 0.025;
