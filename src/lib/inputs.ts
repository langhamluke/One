import { PATHS, type AirlineId, type PathId } from '../data/airlines';
import type { CMA } from '../data/cma';
import type { Answers, SupplementAnswers } from './scoring';
import type { AssetClass, ExcessHandling, Stage } from './types';

export interface Milestones {
  /** CFI/student: years until regional hire */
  toRegional: number;
  /** Years from regional hire to regional CA upgrade */
  regionalCaUpgrade: number;
  /** Years from regional hire to major/flow */
  toMajor: number;
  /** Years from major hire to major CA upgrade */
  majorCaUpgrade: number;
  /** Years from major CA upgrade to widebody CA (0 = stay narrowbody) */
  widebody: number;
}

export interface Profile {
  name: string;
  age: number;
  retireAge: number;
  marital: 'single' | 'married';
  spouseIncome: number;
  kids: number[];
  domicile: string;
  stateOfResidence: string;
  stateTaxId: string;
  stateCustomRate: number;

  stage: Stage;
  hours: number;
  employer: AirlineId | 'none';
  yearsAtEmployer: number;
  targetPaths: PathId[];
  /** Advisor overrides of per-path milestone defaults (from airlines.ts PATHS) */
  milestones: Partial<Record<PathId, Partial<Milestones>>>;
  creditHours: number;

  cash: number;
  retirementAccounts: number;
  /** Portion of retirement accounts in pre-tax IRAs (affects backdoor Roth pro-rata) */
  pretaxIra: number;
  taxable: number;
  schoolDebt: number;
  schoolRate: number;
  otherDebt: number;
  otherRate: number;
  monthlyExpenses: number;

  lifeInsurance: number;
  ltd: boolean;
  ltdMonthly: number;
  lol: boolean;
  lolMonthly: number;

  deferralPct: number;
  rothPct: number;
  rothIra: boolean;
  hsaEligible: boolean;
  monthlyTaxable: number;
}

export interface Assumptions {
  inflation: number;
  payGrowthAfterContract: number;
  profitSharingOn: boolean;
  profitSharingPct: number;
  landingEquity: number;
  glideYears: number;
  cma: Record<AssetClass, CMA>;
  targetIncomePct: number;
  socialSecurity: number; // today's $ per year
  ssStartAge: number;
  planToAge: number;
  seed: number;
  nSims: number;
  excessOverrides: Partial<Record<AirlineId, ExcessHandling>>;
  envoyCaRateRule: boolean;
  fedexOption: 'legacy' | 'mbcb';
  /** Redirect debt payments to taxable investing once loans are paid off */
  snowball: boolean;
  /** Amortization term (years) for flight-school & other debt */
  debtTermYears: number;
  /** Effective tax rate on retirement withdrawals (grosses up the income need) */
  retirementTaxRate: number;
}

export interface WhatIf {
  upgradeDelay: number;
  furloughYears: number;
  retireAt60: boolean;
  pathOverride: PathId | null;
  deferralBump: number;
}

export interface PlanState {
  profile: Profile;
  answers: Answers;
  portfolioAmount: number;
  supplement: SupplementAnswers;
  assumptions: Assumptions;
  whatIf: WhatIf;
  selectedPaths: PathId[];
  activePath: PathId;
}


export const STAY_DEFAULTS: Milestones = { toRegional: 1, regionalCaUpgrade: 3, toMajor: 0, majorCaUpgrade: 8, widebody: 6 };

export function milestonesFor(profile: Profile, pathId: PathId): Milestones {
  const base = pathId === 'stay' ? STAY_DEFAULTS : PATHS[pathId].defaults;
  return { ...base, ...(profile.milestones[pathId] ?? {}) };
}
