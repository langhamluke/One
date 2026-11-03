/**
 * IRS retirement-plan and related limits. Tax year 2026 unless noted.
 * Primary sources: IRS Notice 2025-67 (Nov 13, 2025); Rev. Proc. 2025-32 (Oct 9, 2025); Rev. Proc. 2025-19 (HSA 2026);
 * Rev. Proc. 2026-24 (HSA 2027, May 29, 2026); IRS Notice 2026-48 (Saver's Match, Aug 2026).
 * 2027 retirement-plan limits had NOT been published by the IRS as of 2026-11-03 (expected mid-November 2026).
 * See docs/DATA_UPDATES.md for the yearly update checklist and shared/data/sources.md for every URL.
 */
import { sourced, type Sourced } from '../lib/types';

const N67 = 'IRS Notice 2025-67';
const N67_URL = 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500';
const RP32 = 'Rev. Proc. 2025-32';
const RP32_URL = 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf';

export const IRS_YEAR = 2026;
export const IRS_AS_OF = '2025-11';

export const LIMITS_2026 = {
  /** §402(g) elective deferral limit (401(k)/403(b)/TSP) */
  electiveDeferral: sourced(24500, N67, '2025-11', true, { url: N67_URL }),
  /** §414(v) catch-up, age 50+ */
  catchUp50: sourced(8000, N67, '2025-11', true, { url: N67_URL }),
  /** SECURE 2.0 "super" catch-up, ages 60-63 (replaces, not in addition to, the age-50 catch-up) */
  catchUp60to63: sourced(11250, N67, '2025-11', true, { url: N67_URL }),
  /** §415(c) annual additions limit (employee + employer; catch-ups sit outside it) */
  annualAdditions415c: sourced(72000, N67, '2025-11', true, { url: N67_URL }),
  /** §401(a)(17) compensation limit */
  compensationCap401a17: sourced(360000, N67, '2025-11', true, { url: N67_URL }),
  /** IRA contribution limit (traditional + Roth combined) */
  ira: sourced(7500, N67, '2025-11', true, { url: N67_URL }),
  /** IRA catch-up, age 50+ (indexed under SECURE 2.0) */
  iraCatchUp50: sourced(1100, N67, '2025-11', true, { url: N67_URL }),
  /** Roth IRA MAGI phase-out (contribution reduced linearly inside the range) */
  rothPhaseOut: {
    single: sourced({ lo: 153000, hi: 168000 }, N67, '2025-11', true, { url: N67_URL }),
    hoh: sourced({ lo: 153000, hi: 168000 }, N67, '2025-11', true, { url: N67_URL, note: 'Head of household uses the single range' }),
    mfj: sourced({ lo: 242000, hi: 252000 }, N67, '2025-11', true, { url: N67_URL }),
  },
  /** Traditional IRA deduction phase-out when covered by a workplace plan */
  tradIraDeductionPhaseOut: {
    single: sourced({ lo: 81000, hi: 91000 }, N67, '2025-11', true, { url: N67_URL }),
    hoh: sourced({ lo: 81000, hi: 91000 }, N67, '2025-11', true, { url: N67_URL }),
    mfj: sourced({ lo: 129000, hi: 149000 }, N67, '2025-11', true, { url: N67_URL, note: 'Contributing spouse covered by a plan' }),
  },
  /** §414(v)(7): catch-ups must be Roth when prior-year FICA wages exceed this */
  rothCatchUpWageThreshold: sourced(150000, N67, '2025-11', true, { url: N67_URL, note: 'Based on 2025 FICA wages for 2026' }),
  /** Partial Roth IRA contributions are rounded up to the next $10 with a $200 minimum (IRS Pub. 590-A) */
  rothRounding: { step: 10, minimum: 200 },
  /** HSA (Rev. Proc. 2025-19) */
  hsa: {
    self: sourced(4400, 'Rev. Proc. 2025-19', '2025-05', true),
    family: sourced(8750, 'Rev. Proc. 2025-19', '2025-05', true),
    catchUp55: sourced(1000, 'IRC §223(b)(3)', '2025-05', true, { note: 'Statutory, not indexed' }),
    hdhpMinDeductible: { self: sourced(1700, 'Rev. Proc. 2025-19', '2025-05', true), family: sourced(3400, 'Rev. Proc. 2025-19', '2025-05', true) },
  },
  /** FSA health salary reduction limit */
  fsaHealth: sourced(3400, RP32, '2025-10', true, { url: RP32_URL }),
  /** §127 employer educational assistance (incl. student-loan payments) excludable per year; made permanent and indexed from 2027 by P.L. 119-21 */
  educationalAssistance127: sourced(5250, 'IRC §127 as amended by P.L. 119-21 §70412', '2025-07', true),
  /** Student loan interest deduction (§221) */
  studentLoanInterest: {
    max: sourced(2500, 'IRC §221', '2025-10', true),
    phaseOut: {
      single: sourced({ lo: 85000, hi: 100000 }, RP32, '2025-10', true, { url: RP32_URL }),
      hoh: sourced({ lo: 85000, hi: 100000 }, RP32, '2025-10', true, { url: RP32_URL }),
      mfj: sourced({ lo: 175000, hi: 205000 }, RP32, '2025-10', true, { url: RP32_URL, note: 'Secondary sources agree on $175k-$205k; confirm against Rev. Proc. 2025-32 §3.19' }),
    },
  },
  /** Annual gift tax exclusion and estate/gift basic exclusion amount */
  giftExclusion: sourced(19000, RP32, '2025-10', true, { url: RP32_URL }),
  estateExclusion: sourced(15000000, 'P.L. 119-21 §70106 / ' + RP32, '2025-10', true, { url: RP32_URL }),
  /** Long-term capital gains 0%/15%/20% taxable-income thresholds */
  ltcg: {
    single: sourced({ zeroTo: 49450, fifteenTo: 545500 }, RP32, '2025-10', true, { url: RP32_URL }),
    hoh: sourced({ zeroTo: 66200, fifteenTo: 579600 }, RP32, '2025-10', false, { url: RP32_URL, note: 'HoH 0% ceiling not corroborated by a second source; confirm' }),
    mfj: sourced({ zeroTo: 98900, fifteenTo: 613700 }, RP32, '2025-10', true, { url: RP32_URL }),
  },
  /** Net investment income tax (statutory, not indexed) */
  niit: { rate: 0.038, threshold: { single: 200000, hoh: 200000, mfj: 250000 } },
  /** SECURE 2.0 Saver's Match: starts with 2027 contributions, paid in 2028. 50% of up to $2,000 (max $1,000). */
  saversMatch2027: {
    rate: 0.5,
    maxContribution: 2000,
    phaseOut: {
      single: sourced({ lo: 20500, hi: 35500 }, 'IRS Notice 2026-48', '2026-08', true),
      hoh: sourced({ lo: 30750, hi: 53250 }, 'IRS Notice 2026-48', '2026-08', false, { note: 'Inferred as 1.5x single; confirm in the notice' }),
      mfj: sourced({ lo: 41000, hi: 71000 }, 'IRS Notice 2026-48', '2026-08', false, { note: 'Upper limit confirmed ($71,000); lower limit inferred as 2x single' }),
    },
  },
};

/** 2027 figures that ARE published (as of 2026-11-03). Retirement-plan limits for 2027 are not yet released. */
export const LIMITS_2027_PUBLISHED = {
  hsa: {
    self: sourced(4500, 'Rev. Proc. 2026-24', '2026-05', true),
    family: sourced(9000, 'Rev. Proc. 2026-24', '2026-05', true),
    catchUp55: sourced(1000, 'IRC §223(b)(3)', '2026-05', true),
    hdhpMinDeductible: { self: sourced(1750, 'Rev. Proc. 2026-24', '2026-05', true), family: sourced(3500, 'Rev. Proc. 2026-24', '2026-05', true) },
  },
  /** Unofficial projections only (Milliman / Bloomberg Tax); NOT verified. Shown to advisors as a heads-up, never used in math. */
  projectedElectiveDeferral: sourced(25500, 'Milliman projection (Oct 15, 2026) - IRS notice not yet published', '2026-10', false, {
    note: 'Projection; replace with IRS Notice 2026-xx when issued (expected mid-November 2026).',
  }),
};

export type Limits = typeof LIMITS_2026;

/** Collect every Sourced value in a limits object for the data-quality ledger. */
export function walkSourced(obj: unknown, prefix: string, out: { key: string; s: Sourced<unknown> }[] = []): { key: string; s: Sourced<unknown> }[] {
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if ('value' in o && 'source' in o && 'asOf' in o && 'verified' in o) {
      out.push({ key: prefix, s: o as unknown as Sourced<unknown> });
      return out;
    }
    for (const [k, v] of Object.entries(o)) walkSourced(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}
