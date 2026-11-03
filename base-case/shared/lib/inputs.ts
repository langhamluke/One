/**
 * Plan inputs (what the client / advisor enters) and defaults.
 * Pure TypeScript. Every money figure is annual nominal dollars unless the name says otherwise.
 * Rates are fractions (0.04 = 4%).
 */
import type { AssetClass, FilingStatus, Sourced } from './types';

export const PLAN_STATE_VERSION = 1;

export interface Profile {
  /** First name or nickname only. No full legal names, SSNs, DOBs, or account numbers. */
  nickname: string;
  age: number;
  retirementAge: number;
  filingStatus: FilingStatus;
  /** Two-letter state code, or 'CUSTOM' with customStateRate */
  stateCode: string;
  customStateRate?: number;
  /** Metro key from shared/data/careers.ts (e.g. 'denver'), or 'national' */
  metro: string;
  dependents: number;
  /** Annual wages of a spouse/partner that are part of the household plan (0 if none) */
  spouseIncome: number;
  /** Annual spending excluding debt payments, payroll deductions and savings (today's dollars) */
  livingExpenses: number;
  /** Annual housing cost included in livingExpenses (used for rent-vs-buy and goal context) */
  housingCost: number;
  /** Graduation / plan start context */
  graduationYear: number;
  degree: 'associate' | 'bachelor' | 'master' | 'professional' | 'doctoral' | 'trade' | 'none';
  fieldOfStudy?: string;
}

export interface BalanceSheet {
  /** Checking + savings (emergency fund lives here) */
  cash: number;
  taxable: number;
  /** 401(k)/403(b)/traditional IRA balances */
  preTax: number;
  roth: number;
  hsa: number;
  /** Non-invested assets (car, etc.) counted in net worth only */
  otherAssets: number;
}

export type DebtKind =
  | 'federal_student'
  | 'private_student'
  | 'credit_card'
  | 'auto'
  | 'personal'
  | 'medical'
  /** Home equity line of credit: variable (prime-based), secured by the home; modelled as amortizing (default 20 yrs) */
  | 'heloc'
  /** Securities-based line of credit: variable (SOFR + spread), demand loan secured by a taxable portfolio; interest-only */
  | 'sbloc'
  | 'other';

/**
 * Federal repayment plans after the July 1, 2026 changes (P.L. 119-21):
 *  - 'standard'        legacy 10-year standard (loans disbursed before July 1, 2026)
 *  - 'tiered_standard' new standard plan; term depends on amount borrowed (10/15/20/25 yrs)
 *  - 'rap'             Repayment Assistance Plan; payment = tiered % of AGI minus $50/dependent, $10/mo min
 *  - 'ibr'             amended IBR (legacy borrowers only; modelled as % of discretionary income)
 *  - 'custom'          user-entered monthly payment
 */
export type FederalPlan = 'standard' | 'tiered_standard' | 'rap' | 'ibr' | 'custom';

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  balance: number;
  /** Annual interest rate as a fraction */
  rate: number;
  /** Amortization term in months for standard amortization (ignored for RAP/IBR) */
  termMonths?: number;
  /** Monthly payment override. If absent, derived from term (or plan rules). */
  payment?: number;
  /** Extra monthly payment the client commits to */
  extraPayment?: number;
  /** Federal student loan fields */
  federalPlan?: FederalPlan;
  /** True if first federal loan was disbursed before July 1, 2026 (legacy plan eligibility) */
  legacyBorrower?: boolean;
  /** Original amount borrowed (tiered standard term selection); defaults to balance */
  originalBalance?: number;
  /** Months of deferment / grace remaining before payments start */
  graceMonths?: number;
}

export interface Pension {
  enabled: boolean;
  /** Benefit multiplier per year of service (e.g. 0.02 = 2% of final average salary per year) */
  multiplier: number;
  /** Employee contribution as a fraction of pay */
  employeeContribPct: number;
  /** Years to vest */
  vestingYears: number;
  /** Earliest unreduced retirement age under the plan */
  normalRetirementAge: number;
  /** Does the employer participate in Social Security? (many public pensions do not) */
  coveredBySocialSecurity: boolean;
}

export interface EquityComp {
  /** Expected annual RSU vest value at the start of the career; scales with pay (raises and promotions) */
  annualRsuValue: number;
  /** ESPP discount (0.15 = 15%) */
  esppDiscount: number;
  /** ESPP contribution as a fraction of pay (0..0.15) */
  esppContribPct: number;
}

export interface Benefits {
  /** Employer match rate on employee deferrals (1.0 = dollar for dollar) */
  matchRate: number;
  /** Match applies to deferrals up to this fraction of pay (0.04 = first 4%) */
  matchCapPct: number;
  /** Non-elective employer contribution as a fraction of pay (0.03 = 3% regardless of deferral) */
  nonElectivePct: number;
  /** Has an HSA-eligible high-deductible plan */
  hsaEligible: boolean;
  /** Employer HSA seed money per year */
  employerHsaContribution: number;
  /** Employer matches qualified student-loan payments into the 401(k) (SECURE 2.0 §110) */
  studentLoanMatch: boolean;
  /** Employer educational-assistance / loan repayment benefit per year (IRC §127, up to $5,250 excludable) */
  employerLoanRepayment: number;
  pension: Pension;
  equityComp: EquityComp;
  /** Employer-provided long-term disability coverage */
  disabilityCoverage: boolean;
  /** Employer-provided life insurance as a multiple of salary (0 if none) */
  lifeCoverageMultiple: number;
}

export interface Savings {
  /** Employee 401(k) deferral as a fraction of pay */
  deferralPct: number;
  deferralType: 'pretax' | 'roth' | 'split';
  /** Fraction routed to Roth when deferralType is 'split' */
  rothSplit: number;
  /** Planned employee HSA contribution per year (payroll) */
  hsaContribution: number;
  /** Planned IRA contribution per year */
  iraContribution: number;
  iraType: 'roth' | 'traditional';
  /** Planned taxable brokerage investing per year */
  taxableContribution: number;
  /** Override the computed emergency-fund months target */
  emergencyFundMonthsOverride?: number;
}

export type GoalKind = 'home' | 'car' | 'wedding' | 'gradschool' | 'travel' | 'other';

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  /** Today's dollars */
  targetAmount: number;
  /** Calendar year the money is needed */
  targetYear: number;
  /** 1 = highest */
  priority: number;
  /** Already set aside */
  fundedSoFar: number;
  /** For 'home': price assumptions used by rent-vs-buy */
  home?: { price: number; downPct: number; mortgageRate: number; termYears: number; propertyTaxPct: number; maintenancePct: number };
}

export interface Insurance {
  disability: boolean;
  life: boolean;
  health: 'employer' | 'parent' | 'marketplace' | 'none';
  renters: boolean;
}

/** One rung of a career ladder. Salary bands are Sourced so VERIFY tags can be rendered. */
export interface SalaryBand {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface LadderLevel {
  title: string;
  /** Default years spent in this level before promotion (last level: until retirement) */
  years: number;
  /** Annual salary band for this level (national, today's dollars) */
  band: Sourced<SalaryBand>;
  /** Typical bonus as a fraction of salary */
  bonusPct: number;
}

export type Track = 'low' | 'mid' | 'high';

export interface CareerPath {
  id: string;
  name: string;
  /** Key into OCCUPATIONS in shared/data/careers.ts, or 'custom' */
  occupationCode: string;
  /** Metro key or 'national' */
  metro: string;
  /** Position within the band: low = p25, mid = p50, high = p75 */
  track: Track;
  /** Level index the person starts at */
  startLevelIndex: number;
  /** Override years in level (index -> years) */
  yearsOverrides: Record<number, number>;
  /** Custom ladder when occupationCode === 'custom' (self-reported, flagged as user data) */
  customLevels?: LadderLevel[];
  /**
   * Annual within-level raise, NOMINAL (default 0.03, i.e. roughly inflation + 0.5% real). Promotions provide the real
   * jumps between level bands; real pay within a level plateaus at the level band's p90 (a pay-scale maximum).
   */
  meritRaise: number;
  /** Bonus override as a fraction of salary; undefined = use level default */
  bonusPctOverride?: number;
  /** Years from now until this path starts paying (0 = already working; 1 = graduates next year) */
  startYearOffset: number;
  /** Annual income before the path starts (internship, part-time) */
  preStartIncome: number;
  /** Optional REAL drift of the whole occupation's bands beyond inflation (industry wage growth); 0 = bands keep pace with inflation */
  industryDrift: number;
}

export interface GradSchoolWhatIf {
  enabled: boolean;
  /** Years from now when school starts */
  startYearOffset: number;
  years: number;
  /** Annual tuition + fees (today's dollars) */
  annualCost: number;
  /** Fraction financed with loans */
  financedPct: number;
  /** Loan rate for financed portion */
  loanRate: number;
  /** Income during school (stipend / part-time) */
  incomeDuring: number;
  /** After school: switch to this occupation (optional) and start at this level */
  postOccupationCode?: string;
  postLevelIndex: number;
  /** Salary premium after school as a fraction (e.g. 0.25) when staying in same occupation */
  postPremium: number;
}

export interface WhatIf {
  /** Push every promotion later by N years */
  promotionDelayYears: number;
  /** Insert a zero-income gap of N months starting at layoffYearOffset */
  layoffGapMonths: number;
  layoffYearOffset: number;
  gradSchool: GradSchoolWhatIf;
  /** Additional savings rate applied to taxable investing (fraction of pay) */
  extraSavingsRatePct: number;
  /** Retire earlier/later than profile.retirementAge */
  retireAtOverride?: number;
  /** Spend this much less per year (today's dollars) */
  spendingCut: number;
}

export interface CMAEntry {
  /** Expected arithmetic nominal return */
  ret: number;
  /** Annual volatility (standard deviation) */
  vol: number;
}

export interface Assumptions {
  inflation: number;
  cma: Record<AssetClass, CMAEntry>;
  /** Years before retirement at which the glide path starts declining */
  glideYears: number;
  /** Equity fraction at retirement ("landing") */
  landingEquity: number;
  /** Equity fraction override (bypasses the model matrix) */
  equityOverride?: number;
  mcSims: number;
  seed: number;
  /** Retirement income target as a fraction of final-year take-home */
  incomeReplacement: number;
  /** Override: retirement spending in today's dollars (recommended near retirement) */
  retirementSpendingOverride?: number;
  ssClaimAge: number;
  /** Override Social Security annual benefit (today's dollars), e.g. from an SSA statement */
  ssOverrideAnnual?: number;
  /** Haircut applied to the estimated SS benefit (0.23 = model the trust-fund shortfall) */
  ssHaircut: number;
  /** Gross-up for taxes on retirement withdrawals */
  taxGrossUp: number;
  lifeExpectancy: number;
  emergencyMonthsDefault: number;
  /** Yield on cash / emergency fund */
  cashYield: number;
  /** Real growth of living expenses beyond inflation (lifestyle creep), e.g. 0.005 */
  lifestyleCreep: number;
  /** Bracket and limit indexing rate (defaults to inflation) */
  indexing?: number;
}

export interface PlanState {
  version: number;
  profile: Profile;
  balanceSheet: BalanceSheet;
  debts: Debt[];
  benefits: Benefits;
  savings: Savings;
  goals: Goal[];
  insurance: Insurance;
  /** Questionnaire answers: option index per question id 'q1'..'q10'; null = unanswered */
  answers: Record<string, number | null>;
  /** Portfolio amount substituted into Q5 ranges */
  portfolioAmount: number;
  /** Supplement answers 's1'..'s4' */
  supplement: Record<string, number | null>;
  careerPaths: CareerPath[];
  activePathId: string;
  whatIf: WhatIf;
  assumptions: Assumptions;
  /** Free-text client notes (no sensitive identifiers) */
  notes: string;
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

export const CURRENT_YEAR = 2026;

export function defaultAssumptions(): Assumptions {
  return {
    inflation: 0.025,
    cma: {
      uslc: { ret: 0.07, vol: 0.16 },
      ussmid: { ret: 0.075, vol: 0.2 },
      intl: { ret: 0.072, vol: 0.17 },
      em: { ret: 0.08, vol: 0.23 },
      bonds: { ret: 0.045, vol: 0.055 },
      tips: { ret: 0.042, vol: 0.06 },
      cash: { ret: 0.035, vol: 0.01 },
    },
    glideYears: 25,
    landingEquity: 0.45,
    mcSims: 1000,
    seed: 20261103,
    incomeReplacement: 0.7,
    ssClaimAge: 67,
    ssHaircut: 0,
    taxGrossUp: 0.15,
    lifeExpectancy: 95,
    emergencyMonthsDefault: 6,
    cashYield: 0.035,
    lifestyleCreep: 0,
  };
}

export function defaultWhatIf(): WhatIf {
  return {
    promotionDelayYears: 0,
    layoffGapMonths: 0,
    layoffYearOffset: 3,
    gradSchool: {
      enabled: false,
      startYearOffset: 3,
      years: 2,
      annualCost: 40000,
      financedPct: 0.75,
      loanRate: 0.0807,
      incomeDuring: 0,
      postLevelIndex: 1,
      postPremium: 0.2,
    },
    extraSavingsRatePct: 0,
    spendingCut: 0,
  };
}

export function defaultBenefits(): Benefits {
  return {
    matchRate: 1.0,
    matchCapPct: 0.04,
    nonElectivePct: 0,
    hsaEligible: false,
    employerHsaContribution: 0,
    studentLoanMatch: false,
    employerLoanRepayment: 0,
    pension: {
      enabled: false,
      multiplier: 0.02,
      employeeContribPct: 0.08,
      vestingYears: 5,
      normalRetirementAge: 65,
      coveredBySocialSecurity: true,
    },
    equityComp: { annualRsuValue: 0, esppDiscount: 0, esppContribPct: 0 },
    disabilityCoverage: false,
    lifeCoverageMultiple: 0,
  };
}

export function defaultSavings(): Savings {
  return {
    deferralPct: 0.06,
    deferralType: 'pretax',
    rothSplit: 0.5,
    hsaContribution: 0,
    iraContribution: 0,
    iraType: 'roth',
    taxableContribution: 0,
  };
}

export function defaultCareerPath(id = 'path-1'): CareerPath {
  return {
    id,
    name: 'Path 1',
    occupationCode: 'software_developer',
    metro: 'national',
    track: 'mid',
    startLevelIndex: 0,
    yearsOverrides: {},
    meritRaise: 0.03,
    startYearOffset: 0,
    preStartIncome: 0,
    industryDrift: 0,
  };
}

export function emptyAnswers(): Record<string, number | null> {
  const a: Record<string, number | null> = {};
  for (let i = 1; i <= 10; i++) a[`q${i}`] = null;
  return a;
}

export function emptySupplement(): Record<string, number | null> {
  return { s1: null, s2: null, s3: null, s4: null };
}

export function defaultPlanState(): PlanState {
  return {
    version: PLAN_STATE_VERSION,
    profile: {
      nickname: '',
      age: 22,
      retirementAge: 67,
      filingStatus: 'single',
      stateCode: 'CO',
      metro: 'national',
      dependents: 0,
      spouseIncome: 0,
      livingExpenses: 42000,
      housingCost: 18000,
      graduationYear: CURRENT_YEAR,
      degree: 'bachelor',
    },
    balanceSheet: { cash: 3000, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 },
    debts: [],
    benefits: defaultBenefits(),
    savings: defaultSavings(),
    goals: [],
    insurance: { disability: false, life: false, health: 'employer', renters: false },
    answers: emptyAnswers(),
    portfolioAmount: 100000,
    supplement: emptySupplement(),
    careerPaths: [defaultCareerPath('path-1')],
    activePathId: 'path-1',
    whatIf: defaultWhatIf(),
    assumptions: defaultAssumptions(),
    notes: '',
  };
}

// ---------------------------------------------------------------------------------------------
// Merge / hydrate: layer saved data over defaults so older saves keep working.
// ---------------------------------------------------------------------------------------------

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(patch)) return base;
  if (!isObj(base)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const b = (base as Record<string, unknown>)[k];
    if (isObj(b) && isObj(v)) out[k] = deepMerge(b, v);
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Hydrate a possibly-partial / older PlanState over current defaults. Arrays are taken whole from the save. */
export function mergePlanState(saved: unknown): PlanState {
  const base = defaultPlanState();
  if (!isObj(saved)) return base;
  const merged = deepMerge(base, saved);
  // Arrays: take from save when present (deepMerge would keep base arrays for non-object values; ensure arrays copy)
  const s = saved as Partial<PlanState>;
  if (Array.isArray(s.debts)) merged.debts = s.debts;
  if (Array.isArray(s.goals)) merged.goals = s.goals;
  if (Array.isArray(s.careerPaths) && s.careerPaths.length > 0) {
    merged.careerPaths = s.careerPaths.map((p) => deepMerge(defaultCareerPath(p.id), p));
  }
  if (!merged.careerPaths.some((p) => p.id === merged.activePathId)) {
    merged.activePathId = merged.careerPaths[0].id;
  }
  merged.version = PLAN_STATE_VERSION;
  return merged;
}

/** Wrapper used for JSON export/import. */
export interface PlanExport {
  app: 'base-case';
  version: number;
  exported: string;
  state: PlanState;
}

export function exportPlan(state: PlanState): PlanExport {
  return { app: 'base-case', version: PLAN_STATE_VERSION, exported: new Date().toISOString(), state };
}

export function importPlan(json: unknown): PlanState {
  if (!isObj(json) || json.app !== 'base-case' || !isObj(json.state)) {
    throw new Error('Not a Base Case plan file');
  }
  return mergePlanState(json.state);
}
