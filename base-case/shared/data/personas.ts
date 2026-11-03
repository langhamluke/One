/**
 * Demo personas (fictional pseudonyms; no real people). Each exercises a different alert or what-if.
 * Every persona is a full PlanState built from defaultPlanState() with overrides. Occupation codes and metro keys
 * reference shared/data/careers.ts; state codes reference shared/data/states.ts; federal loan rates come from
 * shared/data/loans.ts FEDERAL_RATES (by award year of first disbursement).
 *
 * Balance sheets, spending and goals are illustrative client inputs (origin 'user'), not data points.
 */
import { defaultBenefits, defaultCareerPath, defaultPlanState, defaultSavings, defaultWhatIf, type CareerPath, type PlanState } from '../lib/inputs';
import { FEDERAL_RATES } from './loans';

export interface Persona {
  key: string;
  name: string;
  tagline: string;
  /** Demo login email used by the seed script */
  email: string;
  state: PlanState;
}

function path(id: string, name: string, overrides: Partial<CareerPath>): CareerPath {
  return { ...defaultCareerPath(id), name, ...overrides };
}

// ---------------------------------------------------------------------------------------------
// a) Maya - RN in Denver with three legacy federal loans (RAP vs standard) and a first-home goal
// ---------------------------------------------------------------------------------------------
function maya(): PlanState {
  const s = defaultPlanState();
  s.profile = {
    ...s.profile,
    nickname: 'Maya',
    age: 23,
    stateCode: 'CO',
    metro: 'denver',
    livingExpenses: 40000,
    housingCost: 19200,
    graduationYear: 2026,
    degree: 'bachelor',
    fieldOfStudy: 'Nursing (BSN)',
  };
  s.balanceSheet = { cash: 6000, taxable: 0, preTax: 1500, roth: 2000, hsa: 0, otherAssets: 9000 };
  s.debts = [
    {
      id: 'fed-2023',
      name: 'Direct Unsubsidized 2023-24',
      kind: 'federal_student',
      balance: 12000,
      originalBalance: 12000,
      rate: FEDERAL_RATES['2023-24'].undergrad,
      federalPlan: 'rap',
      legacyBorrower: true,
      graceMonths: 0,
    },
    {
      id: 'fed-2024',
      name: 'Direct Unsubsidized 2024-25',
      kind: 'federal_student',
      balance: 11000,
      originalBalance: 11000,
      rate: FEDERAL_RATES['2024-25'].undergrad,
      termMonths: 120,
      federalPlan: 'standard',
      legacyBorrower: true,
      graceMonths: 0,
    },
    {
      id: 'fed-2025',
      name: 'Direct Unsubsidized 2025-26',
      kind: 'federal_student',
      balance: 11000,
      originalBalance: 11000,
      rate: FEDERAL_RATES['2025-26'].undergrad,
      termMonths: 120,
      federalPlan: 'standard',
      legacyBorrower: true,
      graceMonths: 0,
    },
  ];
  s.benefits = {
    ...defaultBenefits(),
    matchRate: 0.5,
    matchCapPct: 0.06,
    disabilityCoverage: true,
    lifeCoverageMultiple: 1,
  };
  s.savings = { ...defaultSavings(), deferralPct: 0.06, deferralType: 'roth', iraContribution: 3000, iraType: 'roth' };
  s.goals = [
    {
      id: 'home',
      name: 'First home (condo) down payment',
      kind: 'home',
      targetAmount: 55000,
      targetYear: 2032,
      priority: 1,
      fundedSoFar: 2000,
      home: { price: 450000, downPct: 0.1, mortgageRate: 0.0625, termYears: 30, propertyTaxPct: 0.0055, maintenancePct: 0.01 },
    },
  ];
  s.insurance = { disability: true, life: false, health: 'employer', renters: false };
  // Risk: 3+3+3+3+3+1 = 16 (Moderate). Horizon: 6+5+5+3 = 19 (Long-term).
  s.answers = { q1: 2, q2: 2, q3: 2, q4: 2, q5: 2, q6: 0, q7: 3, q8: 3, q9: 3, q10: 2 };
  s.portfolioAmount = 20000;
  // Very stable industry, no bonus, employer LTD yes, no second income.
  s.supplement = { s1: 0, s2: 0, s3: 0, s4: 1 };
  s.careerPaths = [
    path('rn-denver', 'RN, Denver (hospital)', { occupationCode: 'registered_nurse', metro: 'denver', track: 'mid', startLevelIndex: 0 }),
    path('np-after-msn', 'NP after MSN (start in 3 yrs)', { occupationCode: 'nurse_practitioner', metro: 'denver', track: 'mid', startLevelIndex: 0, startYearOffset: 3, preStartIncome: 80000 }),
    path('rn-dallas', 'RN, Dallas (no state income tax)', { occupationCode: 'registered_nurse', metro: 'dallas', track: 'mid', startLevelIndex: 0 }),
  ];
  s.activePathId = 'rn-denver';
  s.notes = 'Night-shift differential not modelled in base pay. Wants to buy a condo in about six years and is deciding whether the 2023-24 loan should stay on RAP.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// b) Devin - software developer in San Jose with RSUs, ESPP, HSA and aggressive risk answers
// ---------------------------------------------------------------------------------------------
function devin(): PlanState {
  const s = defaultPlanState();
  s.profile = {
    ...s.profile,
    nickname: 'Devin',
    age: 22,
    stateCode: 'CA',
    metro: 'sanjose',
    livingExpenses: 58000,
    housingCost: 30000,
    graduationYear: 2026,
    degree: 'bachelor',
    fieldOfStudy: 'Computer Science',
  };
  s.balanceSheet = { cash: 15000, taxable: 8000, preTax: 0, roth: 7000, hsa: 0, otherAssets: 0 };
  s.debts = [];
  s.benefits = {
    ...defaultBenefits(),
    matchRate: 0.5,
    matchCapPct: 0.06,
    hsaEligible: true,
    employerHsaContribution: 1000,
    equityComp: { annualRsuValue: 35000, esppDiscount: 0.15, esppContribPct: 0.1 },
    disabilityCoverage: true,
    lifeCoverageMultiple: 2,
  };
  s.savings = {
    ...defaultSavings(),
    deferralPct: 0.1,
    deferralType: 'split',
    rothSplit: 0.5,
    hsaContribution: 3400,
    iraContribution: 7500,
    iraType: 'roth',
    taxableContribution: 6000,
  };
  s.goals = [{ id: 'car', name: 'Car (used EV)', kind: 'car', targetAmount: 35000, targetYear: 2028, priority: 1, fundedSoFar: 5000 }];
  s.insurance = { disability: true, life: false, health: 'employer', renters: true };
  // Risk: 5+4+4+4+5+3 = 25 (Aggressive). Horizon: 6+5+5+4 = 20 (Long-term).
  s.answers = { q1: 4, q2: 3, q3: 3, q4: 3, q5: 4, q6: 2, q7: 3, q8: 3, q9: 3, q10: 3 };
  s.portfolioAmount = 30000;
  // Volatile industry, bonus < 20%, employer LTD yes, no second income.
  s.supplement = { s1: 2, s2: 1, s3: 0, s4: 1 };
  s.careerPaths = [
    path('swe-sanjose', 'Software engineer, San Jose (big tech)', { occupationCode: 'software_developer', metro: 'sanjose', track: 'high', startLevelIndex: 0 }),
    path('swe-seattle', 'Software engineer, Seattle (no state income tax)', { occupationCode: 'software_developer', metro: 'seattle', track: 'mid', startLevelIndex: 0 }),
    path('ds-sf', 'Data scientist, San Francisco', { occupationCode: 'data_scientist', metro: 'sf', track: 'mid', startLevelIndex: 0 }),
  ];
  s.activePathId = 'swe-sanjose';
  s.notes = 'RSU vests of about $35k/yr; the Roth IRA phase-out and the HSA triple advantage are the teaching points. Rent is $2,500/month.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// c) Priya - secondary teacher in Texas with a TRS-style pension (outside Social Security) and a new-borrower loan
// ---------------------------------------------------------------------------------------------
function priya(): PlanState {
  const s = defaultPlanState();
  s.profile = {
    ...s.profile,
    nickname: 'Priya',
    age: 23,
    stateCode: 'TX',
    metro: 'dallas',
    livingExpenses: 36000,
    housingCost: 15600,
    graduationYear: 2026,
    degree: 'bachelor',
    fieldOfStudy: 'Secondary education (mathematics)',
  };
  s.balanceSheet = { cash: 4000, taxable: 0, preTax: 0, roth: 1000, hsa: 0, otherAssets: 7000 };
  s.debts = [
    {
      id: 'fed-2026',
      name: 'Direct Unsubsidized 2026-27 (first disbursed July 2026)',
      kind: 'federal_student',
      balance: 18000,
      originalBalance: 18000,
      rate: FEDERAL_RATES['2026-27'].undergrad,
      federalPlan: 'tiered_standard',
      legacyBorrower: false,
      graceMonths: 2,
    },
  ];
  s.benefits = {
    ...defaultBenefits(),
    matchRate: 0,
    matchCapPct: 0,
    pension: {
      enabled: true,
      multiplier: 0.023,
      employeeContribPct: 0.0825,
      vestingYears: 5,
      normalRetirementAge: 65,
      coveredBySocialSecurity: false,
    },
    disabilityCoverage: false,
    lifeCoverageMultiple: 1,
  };
  s.savings = { ...defaultSavings(), deferralPct: 0.03, deferralType: 'roth', iraContribution: 2000, iraType: 'roth' };
  s.goals = [{ id: 'wedding', name: 'Wedding', kind: 'wedding', targetAmount: 20000, targetYear: 2029, priority: 1, fundedSoFar: 2500 }];
  s.insurance = { disability: false, life: false, health: 'employer', renters: true };
  // Risk: 3+3+2+2+3+2 = 15 (Moderate). Horizon: 6+5+3+3 = 17 (Long-term).
  s.answers = { q1: 2, q2: 2, q3: 1, q4: 1, q5: 2, q6: 1, q7: 3, q8: 3, q9: 2, q10: 2 };
  s.portfolioAmount = 10000;
  // Very stable industry, no bonus, employer LTD yes (district plan), no second income.
  s.supplement = { s1: 0, s2: 0, s3: 0, s4: 1 };
  s.careerPaths = [
    path('teacher-dallas', 'High-school teacher, Dallas ISD', { occupationCode: 'secondary_teacher', metro: 'dallas', track: 'mid', startLevelIndex: 0 }),
    path('teacher-austin', 'High-school teacher, Austin', { occupationCode: 'secondary_teacher', metro: 'austin', track: 'mid', startLevelIndex: 0 }),
    path('hr-dallas', 'Switch to HR specialist (corporate), Dallas', { occupationCode: 'hr_specialist', metro: 'dallas', track: 'mid', startLevelIndex: 0, startYearOffset: 2, preStartIncome: 62000 }),
  ];
  s.activePathId = 'teacher-dallas';
  s.notes = 'TRS-style pension: 2.3% multiplier, 8.25% employee contribution, not covered by Social Security (WEP/GPO were repealed by the Social Security Fairness Act). Loan first disbursed after July 1, 2026, so only RAP or the tiered standard plan apply.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// d) Marcus - financial analyst in Chicago weighing an MBA, with a private loan and a credit-card balance
// ---------------------------------------------------------------------------------------------
function marcus(): PlanState {
  const s = defaultPlanState();
  s.profile = {
    ...s.profile,
    nickname: 'Marcus',
    age: 24,
    stateCode: 'IL',
    metro: 'chicago',
    livingExpenses: 45000,
    housingCost: 21600,
    graduationYear: 2024,
    degree: 'bachelor',
    fieldOfStudy: 'Finance',
  };
  s.balanceSheet = { cash: 7000, taxable: 3000, preTax: 6000, roth: 0, hsa: 0, otherAssets: 12000 };
  s.debts = [
    { id: 'private-loan', name: 'Private student loan', kind: 'private_student', balance: 12000, rate: 0.095, termMonths: 120 },
    { id: 'card', name: 'Credit card', kind: 'credit_card', balance: 4000, rate: 0.24, payment: 150 },
  ];
  s.benefits = { ...defaultBenefits(), matchRate: 1, matchCapPct: 0.04, disabilityCoverage: true, lifeCoverageMultiple: 1 };
  s.savings = { ...defaultSavings(), deferralPct: 0.05, deferralType: 'pretax' };
  s.goals = [{ id: 'mba', name: 'MBA (unfinanced 30% of two years)', kind: 'gradschool', targetAmount: 48000, targetYear: 2029, priority: 1, fundedSoFar: 3000 }];
  s.insurance = { disability: true, life: false, health: 'employer', renters: true };
  // Risk: 2+2+2+3+2+2 = 13 (Moderate, conservative-leaning). Horizon: 6+5+3+3 = 17 (Long-term).
  s.answers = { q1: 1, q2: 1, q3: 1, q4: 2, q5: 1, q6: 1, q7: 3, q8: 3, q9: 2, q10: 2 };
  s.portfolioAmount = 15000;
  // Somewhat stable industry, bonus < 20%, not sure about LTD, no second income.
  s.supplement = { s1: 1, s2: 1, s3: 2, s4: 1 };
  s.whatIf = {
    ...defaultWhatIf(),
    gradSchool: {
      enabled: true,
      startYearOffset: 3,
      years: 2,
      annualCost: 80000,
      financedPct: 0.7,
      loanRate: FEDERAL_RATES['2026-27'].grad,
      incomeDuring: 15000,
      postOccupationCode: 'management_analyst',
      postLevelIndex: 1,
      postPremium: 0.2,
    },
  };
  s.careerPaths = [
    path('fa-chicago', 'Financial analyst, Chicago', { occupationCode: 'financial_analyst', metro: 'chicago', track: 'mid', startLevelIndex: 0 }),
    path('fa-nyc', 'Financial analyst, New York', { occupationCode: 'financial_analyst', metro: 'nyc', track: 'mid', startLevelIndex: 0 }),
    path('consult-chicago', 'Consulting now (no MBA), Chicago', { occupationCode: 'management_analyst', metro: 'chicago', track: 'mid', startLevelIndex: 0 }),
  ];
  s.activePathId = 'fa-chicago';
  s.notes = 'Two-year MBA starting in 3 years at $80k/yr, 70% financed at the 2026-27 graduate rate; the new $20,500/yr and $100,000 aggregate graduate loan caps bind. Pay off the 24% card first.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// e) Sam - union electrician apprentice in Phoenix, no degree, no debt; single-income early-career supplement
// ---------------------------------------------------------------------------------------------
function sam(): PlanState {
  const s = defaultPlanState();
  s.profile = {
    ...s.profile,
    nickname: 'Sam',
    age: 21,
    stateCode: 'AZ',
    metro: 'phoenix',
    livingExpenses: 30000,
    housingCost: 13200,
    graduationYear: 2023,
    degree: 'trade',
    fieldOfStudy: 'IBEW inside-wireman apprenticeship',
  };
  s.balanceSheet = { cash: 6000, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 15000 };
  s.debts = [];
  s.benefits = {
    ...defaultBenefits(),
    matchRate: 0,
    matchCapPct: 0,
    nonElectivePct: 0.05,
    pension: {
      enabled: true,
      multiplier: 0.015,
      employeeContribPct: 0,
      vestingYears: 5,
      normalRetirementAge: 62,
      coveredBySocialSecurity: true,
    },
    disabilityCoverage: false,
    lifeCoverageMultiple: 0,
  };
  s.savings = { ...defaultSavings(), deferralPct: 0.04, deferralType: 'roth', iraContribution: 1500, iraType: 'roth', emergencyFundMonthsOverride: 12 };
  s.goals = [
    { id: 'truck', name: 'Work truck', kind: 'car', targetAmount: 30000, targetYear: 2028, priority: 1, fundedSoFar: 2000 },
    {
      id: 'house',
      name: 'First house down payment',
      kind: 'home',
      targetAmount: 40000,
      targetYear: 2031,
      priority: 2,
      fundedSoFar: 0,
      home: { price: 400000, downPct: 0.1, mortgageRate: 0.0625, termYears: 30, propertyTaxPct: 0.006, maintenancePct: 0.012 },
    },
  ];
  s.insurance = { disability: false, life: false, health: 'employer', renters: false };
  // Risk: 3+3+3+1+3+3 = 16 (Moderate). Horizon: 6+5+5+4 = 20 (Long-term).
  s.answers = { q1: 2, q2: 2, q3: 2, q4: 0, q5: 2, q6: 2, q7: 3, q8: 3, q9: 3, q10: 3 };
  s.portfolioAmount = 5000;
  // Somewhat stable (construction cycle), no bonus, no LTD, no second income -> single-income, early-career supplement.
  s.supplement = { s1: 1, s2: 0, s3: 1, s4: 1 };
  s.careerPaths = [
    path('elec-phoenix', 'Electrician, Phoenix (union apprenticeship)', { occupationCode: 'electrician', metro: 'phoenix', track: 'mid', startLevelIndex: 0, yearsOverrides: { 0: 4 } }),
    path('elec-denver', 'Electrician, Denver', { occupationCode: 'electrician', metro: 'denver', track: 'mid', startLevelIndex: 0, yearsOverrides: { 0: 4 } }),
    path('hvac-phoenix', 'HVAC technician, Phoenix', { occupationCode: 'hvac_mechanic', metro: 'phoenix', track: 'mid', startLevelIndex: 0 }),
  ];
  s.activePathId = 'elec-phoenix';
  s.notes = 'Union pension and annuity fund (employer-paid 5% modelled as a non-elective contribution). Wants a truck in two years and a house in five; emergency fund target overridden to 12 months (single income, cyclical trade).';
  return s;
}

export const PERSONAS: Persona[] = [
  { key: 'nurse', name: 'Maya', tagline: 'RN in Denver: three federal loans (RAP vs standard), first home in six years', email: 'maya@demo.basecase.local', state: maya() },
  { key: 'engineer', name: 'Devin', tagline: 'Software developer in San Jose: RSUs, ESPP, HSA, aggressive investor', email: 'devin@demo.basecase.local', state: devin() },
  { key: 'teacher', name: 'Priya', tagline: 'Texas teacher: state pension outside Social Security, new-borrower loan rules', email: 'priya@demo.basecase.local', state: priya() },
  { key: 'analyst', name: 'Marcus', tagline: 'Chicago financial analyst weighing an MBA, with a private loan and card debt', email: 'marcus@demo.basecase.local', state: marcus() },
  { key: 'electrician', name: 'Sam', tagline: 'Phoenix union apprentice: no degree, no debt, truck and house goals, 12-month fund', email: 'sam@demo.basecase.local', state: sam() },
];

export function personaByKey(key: string): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}
