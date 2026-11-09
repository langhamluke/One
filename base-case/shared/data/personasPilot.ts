/**
 * Flight Plan demo personas: the five pilots shipped with the original Flight Plan build, mapped onto PlanState.
 * Fictional pseudonyms; the Denver flight student is a real test client under the pseudonym he chose ("Steve Jobs").
 *
 * Mapping notes (Flight Plan -> Base Case): flight-school loans become private student loans on a 10-year term;
 * "other debt" becomes a personal loan; monthly expenses x 12 = living expenses; Roth share of deferrals sets the
 * deferral type (100% Roth / 0% pre-tax / otherwise split); supplement answers are stored as option VALUES with the
 * Flight Plan meaning (see PILOT_SUPPLEMENT). Balance sheets and spending are illustrative client inputs (origin 'user').
 */
import { defaultAirlinePath, defaultPlanStateFor, type CareerPath, type PlanState } from '../lib/inputs';
import type { AirlinePathChoice, Milestones } from './airlines';
import type { Persona } from './personas';

const DOMAIN = 'demo.flightplan.local';

function airlinePath(id: string, name: string, pathId: AirlinePathChoice, milestones: Partial<Milestones> = {}, extra: Partial<NonNullable<CareerPath['airline']>> = {}): CareerPath {
  const p = defaultAirlinePath(id, pathId, name);
  p.airline = { ...p.airline!, ...extra, milestones };
  return p;
}

function deferral(s: PlanState, pct: number, rothPct: number): void {
  s.savings.deferralPct = pct;
  if (rothPct >= 1) s.savings.deferralType = 'roth';
  else if (rothPct <= 0) s.savings.deferralType = 'pretax';
  else {
    s.savings.deferralType = 'split';
    s.savings.rothSplit = rothPct;
  }
}

// ---------------------------------------------------------------------------------------------
// a) Jordan - fresh CFI, 23, $95k of flight-school debt at 9%, four paths to compare
// ---------------------------------------------------------------------------------------------
function jordan(): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile = {
    ...s.profile,
    nickname: 'Jordan',
    age: 23,
    retirementAge: 65,
    filingStatus: 'single',
    stateCode: 'TX',
    livingExpenses: 2800 * 12,
    housingCost: 14400,
    graduationYear: 2025,
    degree: 'bachelor',
    fieldOfStudy: 'Aviation',
    pilot: { stage: 'cfi', employer: 'none', hours: 600, yearsAtEmployer: 0, creditHours: 80, domicile: 'DFW (instructing in Denton, TX)' },
  };
  s.balanceSheet = { cash: 6000, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [{ id: 'flight-school', name: 'Flight-school loan', kind: 'private_student', balance: 95000, rate: 0.09, termMonths: 120 }];
  s.benefits.hsaEligible = false;
  s.benefits.disabilityCoverage = false;
  deferral(s, 0.06, 1);
  s.savings.iraContribution = 7500;
  s.savings.iraType = 'roth';
  s.insurance = { disability: false, life: false, health: 'parent', renters: false, lossOfLicense: false };
  // Risk 3+3+3+4+4+4 = 21 (Assertive). Horizon 4+2+3+1 = 10 (Intermediate).
  s.answers = { q1: 3, q2: 2, q3: 2, q4: 3, q5: 3, q6: 3, q7: 3, q8: 1, q9: 3, q10: 0 };
  s.supplement = { s1: 2, s2: 0, s3: 0, s4: 0 };
  s.careerPaths = [
    airlinePath('envoy-aa', 'Envoy → American', 'envoy-aa', { toRegional: 1 }),
    airlinePath('regional-swa', 'Regional → Southwest', 'regional-swa'),
    airlinePath('regional-fdx', 'Regional → FedEx', 'regional-fdx'),
    airlinePath('regional-ual', 'Regional → United (ref)', 'regional-ual'),
  ];
  s.activePathId = 'envoy-aa';
  s.notes = 'Time-building CFI, 600 hours. Single income, high exposure as a junior pilot: 12-month emergency fund. The 9% flight-school loan beats the expected portfolio return, so it ranks right after the company match.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// b) Taylor - regional FO, 27, one year in; comparing four majors with LTD and loss-of-license in place
// ---------------------------------------------------------------------------------------------
function taylor(): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile = {
    ...s.profile,
    nickname: 'Taylor',
    age: 27,
    retirementAge: 65,
    filingStatus: 'single',
    stateCode: 'TX',
    livingExpenses: 3500 * 12,
    housingCost: 18000,
    graduationYear: 2021,
    degree: 'bachelor',
    fieldOfStudy: 'Aeronautical science',
    pilot: { stage: 'regional_fo', employer: 'regional', hours: 1800, yearsAtEmployer: 1, creditHours: 80, domicile: 'DFW' },
  };
  s.balanceSheet = { cash: 15000, taxable: 0, preTax: 25000, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [{ id: 'flight-school', name: 'Flight-school loan', kind: 'private_student', balance: 30000, rate: 0.068, termMonths: 120 }];
  s.benefits.hsaEligible = true;
  s.benefits.disabilityCoverage = true;
  deferral(s, 0.1, 0.5);
  s.savings.hsaContribution = 2000;
  s.savings.iraContribution = 7500;
  s.savings.iraType = 'roth';
  s.savings.taxableContribution = 200 * 12;
  s.insurance = { disability: true, life: true, health: 'employer', renters: true, lossOfLicense: true };
  // Risk 3+3+4+5+4+4 = 23 (Assertive). Horizon 4+3+3+2 = 12 (Intermediate).
  s.answers = { q1: 3, q2: 2, q3: 3, q4: 4, q5: 3, q6: 3, q7: 3, q8: 2, q9: 3, q10: 1 };
  s.supplement = { s1: 1, s2: 0, s3: 2, s4: 0 };
  s.careerPaths = [
    airlinePath('regional-swa', 'Regional → Southwest', 'regional-swa'),
    airlinePath('regional-fdx', 'Regional → FedEx', 'regional-fdx'),
    airlinePath('envoy-aa', 'Envoy → American', 'envoy-aa'),
    airlinePath('regional-dal', 'Regional → Delta (ref)', 'regional-dal'),
  ];
  s.activePathId = 'regional-swa';
  s.notes = 'Regional FO one year in, 1,800 hours. Has LTD and a small loss-of-license policy. Southwest path is the base case; FedEx compares the cargo pension alternative.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// c) Morgan - FedEx FO, 34, married with two kids; the 2027 pension election and the §415(c) cap
// ---------------------------------------------------------------------------------------------
function morgan(): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile = {
    ...s.profile,
    nickname: 'Morgan',
    age: 34,
    retirementAge: 65,
    filingStatus: 'mfj',
    stateCode: 'TX',
    dependents: 2,
    spouseIncome: 55000,
    livingExpenses: 7500 * 12,
    housingCost: 36000,
    graduationYear: 2014,
    degree: 'bachelor',
    fieldOfStudy: 'Aviation management',
    pilot: { stage: 'cargo_fo', employer: 'fedex', hours: 7500, yearsAtEmployer: 3, creditHours: 80, domicile: 'MEM (lives near Fort Worth Alliance, commutes)' },
  };
  s.balanceSheet = { cash: 35000, taxable: 40000, preTax: 210000, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [{ id: 'auto', name: 'Car loan', kind: 'auto', balance: 18000, rate: 0.06, termMonths: 60 }];
  s.benefits.hsaEligible = true;
  s.benefits.disabilityCoverage = true;
  s.benefits.lifeCoverageMultiple = 0;
  deferral(s, 0.12, 0.3);
  s.savings.hsaContribution = 4000;
  s.savings.iraContribution = 7500;
  s.savings.iraType = 'roth';
  s.savings.taxableContribution = 1000 * 12;
  s.insurance = { disability: true, life: true, health: 'employer', renters: false, lossOfLicense: true };
  // Risk 3+3+4+4+3+4 = 21 (Assertive). Horizon 4+3+3+3 = 13 (Intermediate).
  s.answers = { q1: 3, q2: 2, q3: 3, q4: 3, q5: 2, q6: 3, q7: 3, q8: 2, q9: 3, q10: 2 };
  s.supplement = { s1: 0, s2: 1, s3: 1, s4: 2 };
  s.careerPaths = [
    airlinePath('stay-legacy', 'Stay at FedEx (legacy pension)', 'stay', { majorCaUpgrade: 10, widebody: 0 }, { fedexOption: 'legacy' }),
    airlinePath('stay-mbcb', 'Stay at FedEx (switch to MBCB)', 'stay', { majorCaUpgrade: 10, widebody: 0 }, { fedexOption: 'mbcb' }),
  ];
  s.activePathId = 'stay-legacy';
  s.notes = 'FedEx FO three years in, married with two kids (4 and 7). Two paths compare the irrevocable 2027 retirement election: keep the legacy pension or switch to the market-based cash balance plan from 2028.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// d) Dale - senior American captain, 59, retiring at 60 with $3.85M invested; actual spending, not 70% replacement
// ---------------------------------------------------------------------------------------------
function dale(): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile = {
    ...s.profile,
    nickname: 'Dale',
    age: 59,
    retirementAge: 60,
    filingStatus: 'mfj',
    stateCode: 'TX',
    dependents: 0,
    spouseIncome: 0,
    livingExpenses: 12000 * 12,
    housingCost: 48000,
    graduationYear: 1989,
    degree: 'bachelor',
    pilot: { stage: 'major_ca', employer: 'american', hours: 24000, yearsAtEmployer: 26, creditHours: 80, domicile: 'DFW' },
  };
  s.balanceSheet = { cash: 120000, taxable: 650000, preTax: 3200000, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [];
  s.benefits.hsaEligible = true;
  s.benefits.disabilityCoverage = true;
  deferral(s, 0.1, 0);
  s.savings.hsaContribution = 5000;
  s.savings.iraContribution = 7500;
  s.savings.iraType = 'roth';
  s.savings.taxableContribution = 2000 * 12;
  s.insurance = { disability: true, life: true, health: 'employer', renters: true, lossOfLicense: true };
  // Risk 2+2+4+4+2+1 = 15 (Moderate). Horizon 2+2+1+3 = 8 (Intermediate).
  s.answers = { q1: 2, q2: 1, q3: 3, q4: 3, q5: 1, q6: 0, q7: 1, q8: 1, q9: 0, q10: 2 };
  s.supplement = { s1: 0, s2: 1, s3: 1, s4: 0 };
  s.careerPaths = [airlinePath('stay', 'Stay at American to 60', 'stay', { majorCaUpgrade: 10, widebody: 8 })];
  s.activePathId = 'stay';
  s.assumptions.incomeReplacement = 0.45;
  s.assumptions.ssOverrideAnnual = 45000;
  s.notes = 'Senior widebody captain retiring at 60, one year out. Income replacement set to 45% because the 70% default overstates spending at this income; Social Security from the SSA statement ($45k at 67).';
  return s;
}

// ---------------------------------------------------------------------------------------------
// e) "Steve Jobs" - Denver flight student (pseudonym), 21, 220 hours, three years to a regional
// ---------------------------------------------------------------------------------------------
function student(): PlanState {
  const s = defaultPlanStateFor('flight-plan');
  s.profile = {
    ...s.profile,
    nickname: 'Steve Jobs',
    age: 21,
    retirementAge: 65,
    filingStatus: 'single',
    stateCode: 'CO',
    livingExpenses: 2000 * 12,
    housingCost: 10800,
    graduationYear: 2027,
    degree: 'bachelor',
    fieldOfStudy: 'Aviation',
    pilot: { stage: 'cfi', employer: 'none', hours: 220, yearsAtEmployer: 0, creditHours: 80, domicile: 'DEN (open to any base)' },
  };
  s.balanceSheet = { cash: 5000, taxable: 3000, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [{ id: 'personal', name: 'Personal loan', kind: 'personal', balance: 11000, rate: 0.05, termMonths: 36 }];
  s.benefits.hsaEligible = false;
  s.benefits.disabilityCoverage = false;
  deferral(s, 0, 1);
  s.savings.iraContribution = 0;
  s.insurance = { disability: false, life: false, health: 'parent', renters: false, lossOfLicense: false };
  // Risk 3+2+3+4+2+2 = 16 (Moderate). Horizon 4+2+3+1 = 10 (Intermediate).
  s.answers = { q1: 2, q2: 1, q3: 2, q4: 3, q5: 1, q6: 1, q7: 3, q8: 1, q9: 3, q10: 0 };
  s.supplement = { s1: 1, s2: 0, s3: 0, s4: 0 };
  const ms: Partial<Milestones> = { toRegional: 3, regionalCaUpgrade: 2, toMajor: 3 };
  s.careerPaths = [
    airlinePath('regional-ual', 'Regional → United (ref)', 'regional-ual', ms),
    airlinePath('regional-swa', 'Regional → Southwest', 'regional-swa', ms),
    airlinePath('regional-dal', 'Regional → Delta (ref)', 'regional-dal', ms),
  ];
  s.activePathId = 'regional-ual';
  s.notes = 'Denver flight student (pseudonym), 220 hours, three years from a regional. No deferrals yet: the first action is a Roth IRA once there is earned income, then the regional 401(k) from the first paycheck.';
  return s;
}

export const PILOT_PERSONAS: Persona[] = [
  { key: 'cfi', name: 'Jordan', tagline: 'Fresh CFI, 23: $95k flight-school loan at 9%, Envoy flow vs three other majors', email: `jordan@${DOMAIN}`, state: jordan() },
  { key: 'regional-fo', name: 'Taylor', tagline: 'Regional FO, 27: Southwest vs FedEx vs American vs Delta, LTD and loss-of-license in place', email: `taylor@${DOMAIN}`, state: taylor() },
  { key: 'cargo-fo', name: 'Morgan', tagline: 'FedEx FO, 34, married with two kids: the 2027 pension election and the §415(c) cap', email: `morgan@${DOMAIN}`, state: morgan() },
  { key: 'senior-captain', name: 'Dale', tagline: 'American widebody captain, 59, retiring at 60 on actual spending', email: `dale@${DOMAIN}`, state: dale() },
  { key: 'student', name: 'Steve Jobs', tagline: 'Denver flight student (pseudonym), 21: three years to a regional, no deferrals yet', email: `steve@${DOMAIN}`, state: student() },
];
