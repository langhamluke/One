/**
 * Federal income tax (tax year 2026) and FICA parameters.
 * Sources: Rev. Proc. 2025-32 (brackets, standard deduction, as amended by P.L. 119-21);
 * SSA 2026 and 2027 fact sheets (wage base); IRC §3101 (Medicare rates).
 * Verification pass 2026-11-03: standard deductions and single/MFJ brackets re-confirmed (IRS bulletin, Journal of
 * Accountancy, CPA Practice Advisor). Head-of-household 24% ceiling corrected from $201,775 to $201,750 (two sources
 * citing Rev. Proc. 2025-32 Table 2: Bradford Tax Institute, TaxSlayer Pro); $201,775 is the SINGLE ceiling.
 */
import { sourced } from '../lib/types';
import type { FilingStatus } from '../lib/types';

const RP32 = 'Rev. Proc. 2025-32';
const RP32_URL = 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf';

export interface Bracket {
  /** Upper bound of taxable income for this rate (Infinity for the top bracket) */
  upTo: number;
  rate: number;
}

export const TAX_YEAR = 2026;

export const STANDARD_DEDUCTION_2026: Record<FilingStatus, ReturnType<typeof sourced<number>>> = {
  single: sourced(16100, RP32, '2025-10', true, { url: RP32_URL }),
  mfj: sourced(32200, RP32, '2025-10', true, { url: RP32_URL }),
  hoh: sourced(24150, RP32, '2025-10', true, { url: RP32_URL }),
};

export const BRACKETS_2026: Record<FilingStatus, ReturnType<typeof sourced<Bracket[]>>> = {
  single: sourced(
    [
      { upTo: 12400, rate: 0.1 },
      { upTo: 50400, rate: 0.12 },
      { upTo: 105700, rate: 0.22 },
      { upTo: 201775, rate: 0.24 },
      { upTo: 256225, rate: 0.32 },
      { upTo: 640600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    RP32,
    '2025-10',
    true,
    { url: RP32_URL },
  ),
  mfj: sourced(
    [
      { upTo: 24800, rate: 0.1 },
      { upTo: 100800, rate: 0.12 },
      { upTo: 211400, rate: 0.22 },
      { upTo: 403550, rate: 0.24 },
      { upTo: 512450, rate: 0.32 },
      { upTo: 768700, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    RP32,
    '2025-10',
    true,
    { url: RP32_URL },
  ),
  hoh: sourced(
    [
      { upTo: 17700, rate: 0.1 },
      { upTo: 67450, rate: 0.12 },
      { upTo: 105700, rate: 0.22 },
      { upTo: 201750, rate: 0.24 },
      { upTo: 256200, rate: 0.32 },
      { upTo: 640600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    RP32,
    '2025-10',
    true,
    { url: RP32_URL, note: 'Corroborated by Bradford Tax Institute and TaxSlayer Pro tables citing Rev. Proc. 2025-32 Table 2 (24% ceiling $201,750; one outlier shows $201,775, which is the single-filer figure)' },
  ),
};

export const FICA = {
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  /** Additional Medicare thresholds are statutory and not indexed */
  additionalMedicareThreshold: { single: 200000, hoh: 200000, mfj: 250000 } as Record<FilingStatus, number>,
  wageBase: {
    2025: sourced(176100, 'SSA 2025 fact sheet', '2024-10', true),
    2026: sourced(184500, 'SSA 2026 fact sheet (Oct 2025)', '2025-10', true, { url: 'https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf' }),
    2027: sourced(192300, 'SSA 2027 COLA announcement (Oct 14, 2026)', '2026-10', true, { url: 'https://www.ssa.gov/news/en/cola/index.html' }),
  } as Record<number, ReturnType<typeof sourced<number>>>,
};

/** Statutory, not indexed */
export const SELF_EMPLOYMENT_TAX = { rate: 0.153, deductibleHalf: true };
