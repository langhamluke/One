import type { FilingStatus } from '../lib/types';

/** Federal brackets & standard deduction for 2026 (IRS Rev. Proc. 2025-32, post-OBBBA). */
export interface Bracket { upTo: number; rate: number }

export const FEDERAL_2026: Record<FilingStatus, { standardDeduction: number; brackets: Bracket[] }> = {
  single: {
    standardDeduction: 16_100,
    brackets: [
      { upTo: 12_400, rate: 0.10 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
  mfj: {
    standardDeduction: 32_200,
    brackets: [
      { upTo: 24_800, rate: 0.10 },
      { upTo: 100_800, rate: 0.12 },
      { upTo: 211_400, rate: 0.22 },
      { upTo: 403_550, rate: 0.24 },
      { upTo: 512_450, rate: 0.32 },
      { upTo: 768_700, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
};

/** FICA 2026 (SSA, Oct 2025). Additional Medicare thresholds are statutory and not indexed. */
export const FICA_2026 = {
  ssRate: 0.062,
  ssWageBase: 184_500,
  medicareRate: 0.0145,
  addlMedicareRate: 0.009,
  addlMedicareThreshold: { single: 200_000, mfj: 250_000 } as Record<FilingStatus, number>,
};

/** State income tax is modelled as a selectable assumption. */
export interface StateTaxOption { id: string; label: string; rate: number; note: string }
export const STATE_TAX_OPTIONS: StateTaxOption[] = [
  { id: 'none', label: 'No state income tax (TX, FL, NV, TN, WA, AK, SD, WY, NH)', rate: 0, note: 'Texas has no personal income tax.' },
  { id: 'flat-low', label: 'Flat ~3% (approximation)', rate: 0.03, note: 'Illustrative effective rate.' },
  { id: 'flat-mid', label: 'Flat ~5% (approximation)', rate: 0.05, note: 'Illustrative effective rate.' },
  { id: 'flat-high', label: 'High-tax state ~8% (approximation)', rate: 0.08, note: 'Illustrative effective rate (e.g., CA/NY/NJ high earners).' },
  { id: 'custom', label: 'Custom flat rate', rate: 0.05, note: 'Advisor-entered effective rate applied to federal taxable income.' },
];

export const TAX_SOURCES = [
  { label: 'IRS Rev. Proc. 2025-32 — 2026 inflation adjustments (brackets, standard deduction)', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill' },
  { label: 'SSA — 2026 COLA fact sheet ($184,500 wage base)', url: 'https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf' },
];
