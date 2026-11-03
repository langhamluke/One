/**
 * Engine outputs. The UI reads ONE memoized Derived object; all math lives in shared/lib.
 */
import type { ActionItem, Alert, Allocation, DataQualityItem, HorizonCategory, RiskCategory } from './types';

export type Stage = 'pre-start' | 'working' | 'gap' | 'grad-school' | 'retired';

export interface YearRow {
  /** 0 = first projection year (CURRENT_YEAR) */
  yearIndex: number;
  year: number;
  age: number;
  stage: Stage;
  levelTitle: string;
  // Income (nominal $)
  wages: number;
  bonus: number;
  equityComp: number;
  spouseWages: number;
  pensionIncome: number;
  socialSecurity: number;
  grossIncome: number;
  // Payroll
  employeePretax401k: number;
  employeeRoth401k: number;
  employer401k: number;
  employerLoanMatch401k: number;
  hsaEmployee: number;
  hsaEmployer: number;
  esppContribution: number;
  // Taxes
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  fica: number;
  takeHome: number;
  // Spending & debt
  livingExpenses: number;
  debtService: number;
  debtInterest: number;
  loanForgiven: number;
  // Order-of-operations allocation of surplus
  emergencyTopUp: number;
  iraContribution: number;
  taxableContribution: number;
  goalFunding: number;
  unallocated: number;
  /** takeHome - living - debt service - planned savings (negative = shortfall) */
  cashFlow: number;
  // Balances at end of year (nominal $)
  balances: { cash: number; preTax: number; roth: number; hsa: number; taxable: number; goals: number };
  debtBalance: number;
  investable: number;
  netWorth: number;
  // Investment
  equityPct: number;
  expectedReturn: number;
  // Readouts
  savingsRate: number;
  savingsRateWithEmployer: number;
  limits: { deferralCapped: boolean; s415cCapped: boolean; rothIra: 'full' | 'partial' | 'none'; rothIraAllowed: number };
  flags: string[];
}

export interface Waypoint {
  yearIndex: number;
  age: number;
  label: string;
  pay: number;
  kind: 'start' | 'promotion' | 'gap' | 'school' | 'retire' | 'event';
}

export interface PathResult {
  pathId: string;
  name: string;
  rows: YearRow[];
  waypoints: Waypoint[];
  lifetimeEarnings: number;
  startingSalary: number;
  peakSalary: number;
  netWorthAtRetirement: number;
  /** Age at which all debts are paid off (null if never within projection) */
  debtFreeAge: number | null;
  firstIncomeYearIndex: number;
}

export interface MonteCarloResult {
  ages: number[];
  /** Nominal $ bands */
  p10: number[];
  p50: number[];
  p90: number[];
  /** Today's $ bands */
  p10Real: number[];
  p50Real: number[];
  p90Real: number[];
  successProbability: number;
  medianAtRetirement: number;
  medianAtRetirementReal: number;
  /** Annual retirement income target in today's $ (before SS offset) */
  targetIncomeReal: number;
  /** Deterministic path at expected returns (nominal) */
  deterministic: number[];
  sims: number;
  seed: number;
  retirementAge: number;
}

export interface RiskProfile {
  riskScore: number | null;
  horizonScore: number | null;
  risk: RiskCategory;
  horizon: HorizonCategory;
  /** True when the questionnaire is incomplete and a provisional profile is used */
  provisional: boolean;
  answered: number;
  total: number;
}

export interface GlidePoint {
  age: number;
  equity: number;
}

export interface TaxSummary {
  year: number;
  gross: number;
  pretaxDeductions: number;
  standardDeduction: number;
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  fica: number;
  totalTax: number;
  effectiveRate: number;
  marginalFederalRate: number;
  takeHome: number;
}

export interface EmergencyFund {
  monthsTarget: number;
  monthlyEssentials: number;
  target: number;
  current: number;
  monthsCovered: number;
  reason: string;
}

export interface SocialSecurityEstimate {
  /** Annual benefit at claim age, today's dollars */
  annualAtClaim: number;
  claimAge: number;
  aime: number;
  pia: number;
  method: 'override' | 'estimated' | 'none';
  note: string;
}

export interface DebtSummary {
  totalBalance: number;
  monthlyPayment: number;
  highestRate: number;
  highInterestBalance: number;
  studentLoanBalance: number;
  payoffAge: number | null;
  totalInterest: number;
  forgivenTotal: number;
}

export interface Headline {
  netWorth: number;
  savingsRate: number;
  savingsRateWithEmployer: number;
  successProbability: number;
  medianAtRetirementReal: number;
  emergencyMonthsCovered: number;
  debtFreeAge: number | null;
  year1TakeHome: number;
  year1CashFlow: number;
}

export interface Derived {
  profile: RiskProfile;
  allocation: Allocation;
  modelEquity: number;
  glidePath: GlidePoint[];
  paths: PathResult[];
  active: PathResult;
  mc: MonteCarloResult;
  alerts: Alert[];
  actions: ActionItem[];
  emergency: EmergencyFund;
  tax: TaxSummary;
  ss: SocialSecurityEstimate;
  debt: DebtSummary;
  dataQuality: { unverifiedCount: number; userProvidedCount: number; items: DataQualityItem[] };
  headline: Headline;
  /** Milliseconds spent computing (diagnostics) */
  computeMs: number;
}
