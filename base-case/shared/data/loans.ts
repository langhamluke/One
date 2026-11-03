/**
 * Federal student loan rules after P.L. 119-21 (July 4, 2025), effective July 1, 2026, plus interest rates by award year.
 * Primary sources: 20 U.S.C. §1087e as amended; StudentAid.gov; Federal Register rate notices.
 * Secondary corroboration (this build could not fetch studentaid.gov directly): CRS IF13075, TICAS, NASFAA, Fidelity, CBS News.
 */
import { sourced } from '../lib/types';

export const LOANS_AS_OF = '2026-07';

/** Fixed rates for Direct Loans first disbursed July 1 - June 30 of the award year. */
export const FEDERAL_RATES: Record<string, { undergrad: number; grad: number; plus: number; source: string; verified: boolean }> = {
  '2023-24': { undergrad: 0.055, grad: 0.0705, plus: 0.0805, source: 'Federal Register, Direct Loan rates 2023-24', verified: true },
  '2024-25': { undergrad: 0.0653, grad: 0.0808, plus: 0.0908, source: 'Federal Register, Direct Loan rates 2024-25', verified: true },
  '2025-26': { undergrad: 0.0639, grad: 0.0794, plus: 0.0894, source: 'Federal Register, Direct Loan rates 2025-26', verified: true },
  '2026-27': { undergrad: 0.0652, grad: 0.0807, plus: 0.0907, source: 'ED announcement June 4, 2026 (10-yr Treasury auction May 12, 2026)', verified: true },
};

/** Statutory caps (HEA §455(b)(8)) */
export const FEDERAL_RATE_CAPS = { undergrad: 0.0825, grad: 0.095, plus: 0.105 };

/**
 * Repayment Assistance Plan (RAP). Payment = (tier % of whole AGI) / 12 - $50 per dependent, floor $10/month.
 * AGI <= $10,000 pays the $10 minimum ($120/yr). Tier applies to the WHOLE AGI (cliffs at each $10,000 boundary).
 * Unpaid interest is waived; principal is matched so it falls by at least $50/month on full on-time payments.
 * Remaining balance forgiven after 360 qualifying payments. Available to borrowers of any vintage (Direct Loans only).
 */
export const RAP = {
  tiers: sourced(
    [
      { agiUpTo: 10000, pct: 0 },
      { agiUpTo: 20000, pct: 0.01 },
      { agiUpTo: 30000, pct: 0.02 },
      { agiUpTo: 40000, pct: 0.03 },
      { agiUpTo: 50000, pct: 0.04 },
      { agiUpTo: 60000, pct: 0.05 },
      { agiUpTo: 70000, pct: 0.06 },
      { agiUpTo: 80000, pct: 0.07 },
      { agiUpTo: 90000, pct: 0.08 },
      { agiUpTo: 100000, pct: 0.09 },
      { agiUpTo: Infinity, pct: 0.1 },
    ],
    '20 U.S.C. §1087e(e) as added by P.L. 119-21 §82001; StudentAid.gov RAP page',
    '2026-07',
    true,
    { url: 'https://studentaid.gov/manage-loans/repayment/plans/repayment-assistance-plan' },
  ),
  minimumMonthly: sourced(10, 'P.L. 119-21 §82001', '2026-07', true),
  dependentReductionMonthly: sourced(50, 'P.L. 119-21 §82001', '2026-07', true),
  principalMatchMonthlyMax: sourced(50, 'P.L. 119-21 §82001', '2026-07', true),
  forgivenessPayments: sourced(360, 'P.L. 119-21 §82001', '2026-07', true),
  interestWaived: true,
};

/**
 * Tiered Standard Plan (new borrowers on/after July 1, 2026; also available to legacy borrowers).
 * Term depends on the total amount borrowed at entry into repayment.
 */
export const TIERED_STANDARD = sourced(
  [
    { borrowedUnder: 25000, years: 10 },
    { borrowedUnder: 50000, years: 15 },
    { borrowedUnder: 100000, years: 20 },
    { borrowedUnder: Infinity, years: 25 },
  ],
  'P.L. 119-21 §82001 (HEA §455(d)(7))',
  '2026-07',
  false,
  { note: 'Thresholds entered from the statute text as recalled; not corroborated by a second source in this build. Confirm on StudentAid.gov.' },
);

/** Legacy standard plan: 10-year level amortization. */
export const LEGACY_STANDARD_YEARS = 10;

/**
 * Amended IBR for legacy borrowers (loans before July 1, 2026): 15% of discretionary income (income above 150% of the
 * federal poverty guideline) for borrowers with loans before July 1, 2014; 10% for "new" borrowers on/after July 1, 2014.
 * Forgiveness after 25 / 20 years. P.L. 119-21 removed the partial-financial-hardship requirement.
 */
export const IBR = {
  pctOld: 0.15,
  pctNew: 0.1,
  forgivenessYearsOld: 25,
  forgivenessYearsNew: 20,
  povertyMultiple: 1.5,
  /** HHS poverty guideline, 48 contiguous states, 1-person household, 2026 */
  povertyGuideline2026: sourced(15960, 'HHS Poverty Guidelines 2026', '2026-01', false, { note: 'Entered from memory; verify at aspe.hhs.gov' }),
  povertyPerAdditionalPerson2026: sourced(5640, 'HHS Poverty Guidelines 2026', '2026-01', false, { note: 'Entered from memory; verify' }),
};

/** Borrowing limits for new borrowers whose program first disburses on/after July 1, 2026. */
export const LOAN_LIMITS_2026 = {
  graduate: { annual: sourced(20500, 'P.L. 119-21 §81001', '2026-07', true), aggregate: sourced(100000, 'P.L. 119-21 §81001', '2026-07', true) },
  professional: { annual: sourced(50000, 'P.L. 119-21 §81001', '2026-07', true), aggregate: sourced(200000, 'P.L. 119-21 §81001', '2026-07', true) },
  parentPlus: { annualPerStudent: sourced(20000, 'P.L. 119-21 §81001', '2026-07', true), lifetimePerStudent: sourced(65000, 'P.L. 119-21 §81001', '2026-07', true) },
  lifetimeAllFederal: sourced(257500, 'P.L. 119-21 §81001', '2026-07', true, { note: 'Excludes Parent PLUS; some sources describe scope differently' }),
  gradPlusEliminated: true,
  /** Students with a loan in the same program before July 1, 2026 keep prior limits for up to 3 academic years */
  legacyYears: 3,
};

/** SECURE 2.0 §110: employers may match qualified student loan payments as if they were deferrals (plan-optional). */
export const STUDENT_LOAN_MATCH = { enabledByLaw: true, since: 2024, note: 'Plan must adopt the feature; match formula follows the plan\'s regular match.' };
