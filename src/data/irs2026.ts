/**
 * 2026 IRS limits (IRS Notice 2025-67; HSA: Rev. Proc. 2025-19).
 * Update every November when the IRS publishes next year's COLAs.
 */
export const IRS_2026 = {
  year: 2026,
  /** §402(g) elective deferral limit */
  electiveDeferral: 24_500,
  /** Age 50+ catch-up */
  catchUp50: 8_000,
  /** SECURE 2.0 "super" catch-up for ages 60–63 (replaces the age-50 catch-up in those years) */
  catchUp60to63: 11_250,
  /** §415(c) total annual additions to a defined contribution plan (excludes catch-up) */
  annualAdditions415c: 72_000,
  /** §401(a)(17) compensation limit */
  compLimit401a17: 360_000,
  /** IRA contribution limit (under 50) */
  ira: 7_500,
  /** IRA age-50 catch-up */
  iraCatchUp: 1_100,
  rothPhaseOut: {
    single: { start: 153_000, end: 168_000 },
    mfj: { start: 242_000, end: 252_000 },
  },
  hsa: { self: 4_400, family: 8_750, catchUp55: 1_000 },
  /** Catch-up contributions must be Roth if prior-year FICA wages from the plan sponsor exceed this */
  rothCatchUpWageThreshold: 150_000,
} as const;

export const IRS_SOURCES = [
  { label: 'IRS Notice 2025-67 (2026 retirement plan limits)', url: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500' },
  { label: 'IRS Rev. Proc. 2025-19 (2026 HSA limits)', url: 'https://www.irs.gov/pub/irs-drop/rp-25-19.pdf' },
];
