/**
 * Capital-market assumptions (illustrative, advisor-editable) and a fixed correlation matrix for Monte Carlo.
 * These are NOT forecasts and are not sourced from a single vendor; they sit between widely published long-run
 * assumptions and are flagged as assumptions in the data-quality ledger. Cash is set near the Nov 2026 fed funds range (3.75-4.00%).
 */
import { ASSET_CLASSES, type AssetClass } from '../lib/types';
import type { CMAEntry } from '../lib/inputs';

export const CMA_AS_OF = '2026-11';

export const CMA_DEFAULT: Record<AssetClass, CMAEntry> = {
  uslc: { ret: 0.07, vol: 0.16 },
  ussmid: { ret: 0.075, vol: 0.2 },
  intl: { ret: 0.072, vol: 0.17 },
  em: { ret: 0.08, vol: 0.23 },
  bonds: { ret: 0.045, vol: 0.055 },
  tips: { ret: 0.042, vol: 0.06 },
  cash: { ret: 0.035, vol: 0.01 },
};

export const INFLATION_DEFAULT = 0.025;

/** Correlation matrix in ASSET_CLASSES order: uslc, ussmid, intl, em, bonds, tips, cash. Symmetric, positive definite. */
export const CORRELATION: number[][] = [
  // uslc  ussmid intl   em     bonds  tips   cash
  [1.0, 0.9, 0.85, 0.75, 0.15, 0.1, 0.0], // uslc
  [0.9, 1.0, 0.8, 0.72, 0.1, 0.08, 0.0], // ussmid
  [0.85, 0.8, 1.0, 0.8, 0.15, 0.1, 0.0], // intl
  [0.75, 0.72, 0.8, 1.0, 0.1, 0.1, 0.0], // em
  [0.15, 0.1, 0.15, 0.1, 1.0, 0.7, 0.2], // bonds
  [0.1, 0.08, 0.1, 0.1, 0.7, 1.0, 0.15], // tips
  [0.0, 0.0, 0.0, 0.0, 0.2, 0.15, 1.0], // cash
];

export function correlationIndex(a: AssetClass): number {
  return ASSET_CLASSES.indexOf(a);
}

/** Market context shown on the Data page (not used in math). */
export const MARKET_CONTEXT = {
  fedFundsTarget: { lo: 0.0375, hi: 0.04, source: 'FOMC statement Oct 28, 2026', asOf: '2026-10', verified: true },
  /** WSJ prime = fed funds upper bound + 3 points; HELOCs price off prime */
  primeRate: { value: 0.07, source: 'Inferred: fed funds upper bound 4.00% (FOMC Oct 28, 2026) + 3.00 points (WSJ convention)', asOf: '2026-10', verified: false },
  tenYearTreasury: { value: 0.0475, source: 'Late Aug 2026 market reports (approx.)', asOf: '2026-08', verified: false },
};
