/**
 * Sprout demo personas: five students (fictional pseudonyms, no real people). Each exercises a different part of the
 * student engine: a self-reported wage below the state minimum, the practice paycheck with an allowance, a bill in
 * the student's name, a first credit card above 30% of its limit, and existing federal loans in grace.
 * Balance sheets, spending and goals are illustrative client inputs (origin 'user'), not data points.
 */
import { defaultPlanStateFor, defaultStudentProfile, type PlanState, type StudentProfile } from '../lib/inputs';
import { FEDERAL_RATES } from './loans';
import type { Persona } from './personas';
import { CURRENT_YEAR } from '../lib/inputs';

const DOMAIN = 'demo.sprout.local';

function student(s: PlanState, patch: Partial<StudentProfile>): void {
  s.profile.student = { ...defaultStudentProfile(), ...patch };
  s.profile.livingExpenses = 12 * (s.profile.student.needsMonthly + s.profile.student.wantsMonthly);
}

// ---------------------------------------------------------------------------------------------
// a) Maya, 16, high-school junior in Colorado: $12/hr at a coffee shop 12 hrs a week, saving for a car
// ---------------------------------------------------------------------------------------------
function maya(): PlanState {
  const s = defaultPlanStateFor('sprout');
  s.profile = { ...s.profile, nickname: 'Maya', age: 16, stateCode: 'CO', metro: 'denver', graduationYear: CURRENT_YEAR + 6, housingCost: 0 };
  student(s, { stage: 'high_school', job: 'food_prep', hourlyWage: 12, hoursSchoolYear: 12, hoursSummer: 20, practicePaycheck: false, collegePlan: 'four_year', expectedStudentLoans: 20000, card: 'debit', needsMonthly: 110, wantsMonthly: 160 });
  s.balanceSheet = { cash: 350, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 };
  s.goals = [{ id: 'car', name: 'A used car', kind: 'car', targetAmount: 6000, targetYear: CURRENT_YEAR + 2, priority: 1, fundedSoFar: 0 }];
  s.careerPaths = [{ ...s.careerPaths[0], name: 'Nursing after college', occupationCode: 'registered_nurse', metro: 'denver', startYearOffset: 6 }];
  // Risk 3+2+1+3+2+3 = 14 (Moderate). Horizon 2+1+5+2 = 10 (Intermediate): the car comes first.
  s.answers = { q1: 2, q2: 1, q3: 0, q4: 2, q5: 1, q6: 2, q7: 1, q8: 0, q9: 3, q10: 1 };
  s.supplement = { s1: 0, s2: 1, s3: 0, s4: 1 };
  s.notes = 'Coffee-shop pay is below the Colorado minimum because tips are not counted; the entered wage wins and is listed as self-reported. Nothing goes to savings yet, so the first step is a small automatic transfer.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// b) Jordan, 17, senior in Texas: no job, practice paycheck on, $40 a week allowance, four-year college with loans
// ---------------------------------------------------------------------------------------------
function jordan(): PlanState {
  const s = defaultPlanStateFor('sprout');
  s.profile = { ...s.profile, nickname: 'Jordan', age: 17, stateCode: 'TX', metro: 'national', graduationYear: CURRENT_YEAR + 5, housingCost: 0 };
  student(s, { stage: 'high_school', job: '', hourlyWage: 0, practicePaycheck: true, allowanceMonthly: Math.round((40 * 52) / 12), collegePlan: 'four_year', expectedStudentLoans: 27000, card: 'none', needsMonthly: 60, wantsMonthly: 120 });
  s.balanceSheet = { cash: 900, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 };
  s.savings.taxableContribution = 25 * 12;
  s.careerPaths = [{ ...s.careerPaths[0], name: 'Software after college', occupationCode: 'software_developer', metro: 'national', startYearOffset: 5 }];
  // Risk 4+3+3+4+3+4 = 21 (Assertive). Horizon 6+5+5+2 = 18 (Long-term).
  s.answers = { q1: 3, q2: 2, q3: 2, q4: 3, q5: 2, q6: 3, q7: 3, q8: 3, q9: 3, q10: 1 };
  s.supplement = { s1: 0, s2: 0, s3: 0, s4: 1 };
  s.notes = 'No job yet: the practice paycheck (cashier wage, 10 and 20 hours a week) makes the budget real. The $27k of expected loans start repayment after college on the tiered standard plan.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// c) Alex, 18, Career Prep senior in Texas: grocery cashier 18 hrs a week, pays their own phone bill, electrician next
// ---------------------------------------------------------------------------------------------
function alex(): PlanState {
  const s = defaultPlanStateFor('sprout');
  s.profile = { ...s.profile, nickname: 'Alex', age: 18, stateCode: 'TX', metro: 'national', graduationYear: CURRENT_YEAR + 1, degree: 'trade', housingCost: 0 };
  student(s, { stage: 'high_school', job: 'cashier', hourlyWage: 0, hoursSchoolYear: 18, hoursSummer: 30, practicePaycheck: false, collegePlan: 'none', card: 'debit', needsMonthly: 190, wantsMonthly: 210 });
  s.balanceSheet = { cash: 600, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 2500 };
  s.savings.taxableContribution = 50 * 12;
  s.goals = [{ id: 'tools', name: 'Tools and a work truck down payment', kind: 'other', targetAmount: 4000, targetYear: CURRENT_YEAR + 2, priority: 1, fundedSoFar: 300 }];
  s.careerPaths = [{ ...s.careerPaths[0], name: 'Electrician apprenticeship', occupationCode: 'electrician', metro: 'national', startYearOffset: 1 }];
  // Risk 3+2+2+3+3+3 = 16 (Moderate). Horizon 4+2+5+2 = 13 (Intermediate).
  s.answers = { q1: 2, q2: 1, q3: 1, q4: 2, q5: 2, q6: 2, q7: 2, q8: 1, q9: 3, q10: 1 };
  s.supplement = { s1: 1, s2: 1, s3: 1, s4: 1 };
  s.notes = 'Career Prep student heading into an apprenticeship next year. Pays some of their own costs and the phone bill is in their name, so the emergency target is one month of expenses plus $500 on top of the starter.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// d) Sam, 19, community college in Arizona: retail 25 hrs a week, first student credit card at 42% of its limit
// ---------------------------------------------------------------------------------------------
function sam(): PlanState {
  const s = defaultPlanStateFor('sprout');
  s.profile = { ...s.profile, nickname: 'Sam', age: 19, stateCode: 'AZ', metro: 'phoenix', graduationYear: CURRENT_YEAR + 2, housingCost: 400 * 12 };
  student(s, { stage: 'college', job: 'retail_sales', hourlyWage: 0, hoursSchoolYear: 25, hoursSummer: 35, practicePaycheck: false, collegePlan: 'two_year', expectedStudentLoans: 6000, card: 'credit', needsMonthly: 650, wantsMonthly: 250 });
  s.balanceSheet = { cash: 300, taxable: 0, preTax: 0, roth: 0, hsa: 0, otherAssets: 0 };
  s.debts = [{ id: 'card', name: 'Student credit card', kind: 'credit_card', balance: 420, rate: 0.2699, creditLimit: 1000 }];
  s.careerPaths = [{ ...s.careerPaths[0], name: 'Dental hygienist', occupationCode: 'dental_hygienist', metro: 'phoenix', startYearOffset: 2 }];
  // Risk 2+2+2+2+2+2 = 12 (Moderate). Horizon 2+2+3+1 = 8 (Intermediate).
  s.answers = { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 1, q9: 2, q10: 0 };
  s.supplement = { s1: 1, s2: 1, s3: 1, s4: 1 };
  s.notes = 'First credit card: $420 of a $1,000 limit at 26.99%. Cash is below the $500 starter, nothing is automated, and the card sits above 30% of its limit, so every Sprout alert fires at once. Three steps: transfer, starter cushion, card to zero.';
  return s;
}

// ---------------------------------------------------------------------------------------------
// e) Priya, 21, university senior in Illinois: $22/hr internship, $28k of federal loans in grace, full-time job next year
// ---------------------------------------------------------------------------------------------
function priya(): PlanState {
  const s = defaultPlanStateFor('sprout');
  s.profile = { ...s.profile, nickname: 'Priya', age: 21, stateCode: 'IL', metro: 'chicago', graduationYear: CURRENT_YEAR + 1, degree: 'bachelor', fieldOfStudy: 'Finance', housingCost: 750 * 12 };
  student(s, { stage: 'college', job: 'custom', jobTitle: 'Finance internship', hourlyWage: 22, hoursSchoolYear: 15, hoursSummer: 40, practicePaycheck: false, collegePlan: 'four_year', expectedStudentLoans: 0, card: 'credit', needsMonthly: 1100, wantsMonthly: 300 });
  s.balanceSheet = { cash: 2200, taxable: 0, preTax: 0, roth: 1800, hsa: 0, otherAssets: 0 };
  s.debts = [
    { id: 'fed-2023', name: 'Direct Unsubsidized 2023-24', kind: 'federal_student', balance: 14000, originalBalance: 14000, rate: FEDERAL_RATES['2023-24'].undergrad, termMonths: 120, federalPlan: 'standard', legacyBorrower: true, graceMonths: 13 },
    { id: 'fed-2025', name: 'Direct Unsubsidized 2025-26', kind: 'federal_student', balance: 14000, originalBalance: 14000, rate: FEDERAL_RATES['2025-26'].undergrad, termMonths: 120, federalPlan: 'standard', legacyBorrower: true, graceMonths: 13 },
    { id: 'card', name: 'Credit card', kind: 'credit_card', balance: 0, rate: 0.2449, creditLimit: 2500 },
  ];
  s.savings.iraContribution = 1500;
  s.savings.iraType = 'roth';
  s.savings.taxableContribution = 100 * 12;
  s.careerPaths = [{ ...s.careerPaths[0], name: 'Financial analyst', occupationCode: 'financial_analyst', metro: 'chicago', startYearOffset: 1 }];
  // Risk 4+3+3+4+4+4 = 22 (Assertive). Horizon 6+3+5+2 = 16 (Long-term).
  s.answers = { q1: 3, q2: 2, q3: 2, q4: 3, q5: 3, q6: 3, q7: 3, q8: 2, q9: 3, q10: 1 };
  s.supplement = { s1: 2, s2: 0, s3: 1, s4: 1 };
  s.notes = 'Pays all of her own housing and food: three months of expenses plus $500 for the phone bill. Loans sit in grace until six months after graduation; the first working year compares the standard plan with RAP.';
  return s;
}

export const STUDENT_PERSONAS: Persona[] = [
  { key: 'junior', name: 'Maya', tagline: 'Junior, 16: $12/hr coffee shop, saving for a car, nothing automated yet', email: `maya@${DOMAIN}`, state: maya() },
  { key: 'senior', name: 'Jordan', tagline: 'Senior, 17: no job (practice paycheck), $40/wk allowance, college with loans', email: `jordan@${DOMAIN}`, state: jordan() },
  { key: 'career-prep', name: 'Alex', tagline: 'Career Prep, 18: grocery cashier 18 hrs/wk, own phone bill, electrician next', email: `alex@${DOMAIN}`, state: alex() },
  { key: 'community-college', name: 'Sam', tagline: 'Community college, 19: retail 25 hrs/wk, first credit card at 42% of its limit', email: `sam@${DOMAIN}`, state: sam() },
  { key: 'university-senior', name: 'Priya', tagline: 'University senior, 21: $22/hr internship, $28k loans in grace, job next year', email: `priya@${DOMAIN}`, state: priya() },
];
