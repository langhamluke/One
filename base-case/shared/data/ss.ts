/**
 * Social Security parameters used for a simplified PIA estimate.
 * Sources: SSA Office of the Chief Actuary (bend points, COLA, FRA); 42 U.S.C. §415.
 * Verification pass 2026-11-03: 2026 bend points confirmed by SSA OACT (piaformula.html) and the Federal Register
 * notice of Nov 3, 2025 (2025-19763); 2027 bend points ($1,340 / $8,077) confirmed by SSA OACT bendpoints.html and the
 * Federal Register notice of Oct 26, 2026 (2026-21796). Family-maximum bend points 2027: $1,712 / $2,471 / $3,223.
 */
import { sourced } from '../lib/types';

export const SS_AS_OF = '2026-10';

export const BEND_POINTS: Record<number, ReturnType<typeof sourced<{ first: number; second: number }>>> = {
  2025: sourced({ first: 1226, second: 7391 }, 'SSA OACT bend points 2025', '2024-10', true),
  2026: sourced({ first: 1286, second: 7749 }, 'SSA OACT bend points 2026; Federal Register Nov 3, 2025 (2025-19763)', '2025-10', true, { url: 'https://www.ssa.gov/oact/cola/piaformula.html' }),
  2027: sourced({ first: 1340, second: 8077 }, 'SSA OACT bend points 2027; Federal Register Oct 26, 2026 (2026-21796)', '2026-10', true, { url: 'https://www.ssa.gov/oact/cola/bendpoints.html' }),
};

/** PIA formula percentages (statutory) */
export const PIA_FACTORS = { first: 0.9, second: 0.32, third: 0.15 };

export const COLA: Record<number, ReturnType<typeof sourced<number>>> = {
  2026: sourced(0.028, 'SSA COLA announcement Oct 2025', '2025-10', true),
  2027: sourced(0.036, 'SSA COLA announcement Oct 14, 2026', '2026-10', true, { url: 'https://www.ssa.gov/news/en/cola/index.html' }),
};

/** Full retirement age for people born 1960 or later */
export const FULL_RETIREMENT_AGE = 67;
export const EARLIEST_CLAIM_AGE = 62;
export const LATEST_CREDIT_AGE = 70;

/** Early-claiming reduction and delayed credits (statutory). */
export const CLAIM_ADJUSTMENT = {
  /** 5/9 of 1% per month for the first 36 months before FRA */
  earlyFirst36MonthsPerMonth: 5 / 9 / 100,
  /** 5/12 of 1% per month beyond 36 months */
  earlyBeyond36MonthsPerMonth: 5 / 12 / 100,
  /** 2/3 of 1% per month of delay after FRA (8%/yr) up to age 70 */
  delayedPerMonth: 2 / 3 / 100,
};

/** Retirement earnings test exempt amounts (2027) */
export const EARNINGS_TEST_2027 = {
  underFra: sourced(25560, 'SSA 2027 COLA fact sheet', '2026-10', true),
  yearReachingFra: sourced(67920, 'SSA 2027 COLA fact sheet', '2026-10', true),
};

/** Trust fund context shown to advisors (OASI depletion projected 2033 in the 2025 Trustees Report; ~77% payable thereafter). */
export const TRUST_FUND_NOTE = sourced(
  { depletionYear: 2033, payablePct: 0.77 },
  '2025 OASDI Trustees Report',
  '2025-06',
  false,
  { note: 'Context only; the model applies assumptions.ssHaircut if the advisor chooses' },
);
