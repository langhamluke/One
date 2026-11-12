/**
 * Sprout: the student stage in front of a career ladder, the practice paycheck, and the student emergency-fund rule.
 *
 *  - Student stage: from CURRENT_YEAR until the expected graduation year the plan earns student income instead of
 *    the ladder's pre-start income. Wages = hourly wage × (school-year hours × weeks + summer hours × weeks); an
 *    allowance or gifts arrive as untaxed other income (not earned income, so it cannot fund a Roth IRA).
 *  - Default wages come from BLS OEWS medians for common student jobs (shared/data/studentJobs.ts), floored at the
 *    state minimum wage. A wage the student enters wins and is listed as self-reported.
 *  - Practice paycheck: with no job and the toggle on, the plan uses a cashier's wage at 10 / 20 hours a week so the
 *    budget is real; it is flagged in the data ledger and the alert stack, and never counts as real income elsewhere.
 *  - Expected student loans become one federal loan (tiered standard, 6-month grace) that starts at graduation, using
 *    the same loan simulator as every other debt.
 *  - Emergency fund: a $500 starter cushion, then months of expenses set by the supplement (who pays for housing and
 *    food, how steady the hours are, whether someone could help) plus $500 when a bill is in the student's name.
 * Pure TypeScript; the ladder simulation does the career years.
 */
import { CURRENT_YEAR, defaultStudentProfile, type CareerPath, type PlanState, type WhatIf } from './inputs';
import { simulateLadderPath, type CareerSim } from './career';
import type { LoanInput } from './loans';
import { FEDERAL_RATES } from '../data/loans';
import { PRACTICE_PAYCHECK, STUDENT_JOBS, STUDENT_WEEKS, defaultStudentWage, minimumWageFor } from '../data/studentJobs';
import { sourced, type DataQualityItem, type Sourced } from './types';

/** The starter cushion every Sprout plan aims for first. */
export const STARTER_FUND: Sourced<number> = sourced(500, 'Sprout rule: $500 starter emergency cushion, then months of expenses (CFPB "An essential guide to building an emergency fund": start small, set a goal you can reach)', '2026-11', true, {
  url: 'https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/',
  note: 'The dollar amount is a product rule, not a statistic; the prototype used the same $500 starter.',
});
/** Extra cushion when a car, phone or other bill is in the student's name. */
export const BILL_CUSHION = 500;
/** Card balance above this share of the limit draws a caution; above 50% a warning (FICO guidance: keep utilization low, under 30% is the common rule of thumb). */
export const UTILIZATION_CAUTION = 0.3;
export const UTILIZATION_WARNING = 0.5;

export interface StudentIncome {
  /** Annual job wages (today's dollars) */
  wages: number;
  /** Annual allowance / gifts (today's dollars, untaxed, not earned income) */
  allowance: number;
  total: number;
  hourlyWage: number;
  hoursSchoolYear: number;
  hoursSummer: number;
  weeksSchoolYear: number;
  weeksSummer: number;
  /** The practice paycheck is in use (no job, toggle on) */
  practice: boolean;
  /** Human label for the stage rows and waypoint */
  label: string;
  /** The dataset wage the default came from, when a listed job is used */
  wageSource?: Sourced<number>;
  /** State minimum wage applied as the floor */
  minimum: Sourced<number>;
  /** The default wage was raised to the state minimum */
  floored: boolean;
  /** The wage was typed in by the student (self-reported) */
  selfReported: boolean;
}

/** Student income for the plan (today's dollars per year). Zero when there is no job, no allowance and no practice paycheck. */
export function studentIncome(state: PlanState): StudentIncome {
  const st = state.profile.student ?? defaultStudentProfile();
  const stateCode = state.profile.stateCode;
  const minimum = minimumWageFor(stateCode);
  const weeksSchoolYear = Math.max(0, st.weeksSchoolYear);
  const weeksSummer = Math.max(0, st.weeksSummer);
  const allowance = Math.max(0, st.allowanceMonthly) * 12;
  const base = { allowance, weeksSchoolYear, weeksSummer, minimum };
  if (st.job !== '') {
    const listed = st.job !== 'custom' ? STUDENT_JOBS[st.job] : undefined;
    const dflt = listed ? defaultStudentWage(listed.key, stateCode) : undefined;
    const selfReported = st.hourlyWage > 0;
    const hourlyWage = selfReported ? st.hourlyWage : dflt?.wage ?? 0;
    const hoursSchoolYear = Math.max(0, st.hoursSchoolYear);
    const hoursSummer = Math.max(0, st.hoursSummer);
    const wages = hourlyWage * (hoursSchoolYear * weeksSchoolYear + hoursSummer * weeksSummer);
    const title = listed ? listed.title : st.jobTitle.trim() || 'Part-time job';
    return { ...base, wages, total: wages + allowance, hourlyWage, hoursSchoolYear, hoursSummer, practice: false, label: `Student · ${title}`, wageSource: listed?.median, floored: !selfReported && !!dflt?.floored, selfReported };
  }
  if (st.practicePaycheck) {
    const dflt = defaultStudentWage(PRACTICE_PAYCHECK.job, stateCode);
    const hoursSchoolYear = PRACTICE_PAYCHECK.hoursSchoolYear;
    const hoursSummer = PRACTICE_PAYCHECK.hoursSummer;
    const wages = dflt.wage * (hoursSchoolYear * weeksSchoolYear + hoursSummer * weeksSummer);
    return { ...base, wages, total: wages + allowance, hourlyWage: dflt.wage, hoursSchoolYear, hoursSummer, practice: true, label: 'Student · practice paycheck', wageSource: dflt.median, floored: dflt.floored, selfReported: false };
  }
  return { ...base, wages: 0, total: allowance, hourlyWage: 0, hoursSchoolYear: 0, hoursSummer: 0, practice: false, label: allowance > 0 ? 'Student · allowance' : 'Student', floored: false, selfReported: false };
}

/** Years from now until the career starts (0 for a recent graduate). */
export function studentYears(state: PlanState): number {
  const st = state.profile.student;
  if (!st || st.stage === 'recent_grad') return 0;
  return Math.max(0, Math.min(60, Math.floor(state.profile.graduationYear - CURRENT_YEAR)));
}

/**
 * Simulate a Sprout ladder path: student years first, then the occupation ladder from the graduation year.
 * The ladder's own what-ifs (promotion delay, layoff gap, grad school) still apply to the career years.
 */
export function simulateStudentPath(state: PlanState, path: CareerPath, whatIf: WhatIf): CareerSim {
  const st = state.profile.student ?? defaultStudentProfile();
  const years = studentYears(state);
  const inc = studentIncome(state);
  const infl = state.assumptions.inflation;
  const ladderPath: CareerPath = { ...path, startYearOffset: Math.max(Math.floor(path.startYearOffset), years), preStartIncome: years > 0 ? 0 : path.preStartIncome };
  const sim = simulateLadderPath(state, ladderPath, whatIf);
  const rows = sim.rows;
  let touched = 0;
  for (const r of rows) {
    if (r.yearIndex >= years || r.stage !== 'pre-start') continue;
    const k = Math.pow(1 + infl, r.yearIndex);
    r.stage = 'student';
    r.levelTitle = inc.label;
    r.wages = inc.wages * k;
    r.otherIncome = inc.allowance * k;
    touched++;
  }
  let firstIncomeYearIndex = -1;
  for (const r of rows) {
    if (r.wages + (r.otherIncome ?? 0) > 0) {
      firstIncomeYearIndex = r.yearIndex;
      break;
    }
  }
  const waypoints = [...sim.waypoints];
  if (touched > 0) {
    const hrs = inc.hoursSchoolYear > 0 || inc.hoursSummer > 0 ? ` · ${inc.hoursSchoolYear} / ${inc.hoursSummer} hrs a week` : '';
    waypoints.unshift({ yearIndex: 0, age: state.profile.age, label: `${inc.label}${hrs}`, pay: inc.total, kind: 'event' });
  }
  const flags = [...sim.flags];
  if (inc.practice && touched > 0) flags.push('practice-paycheck');
  if (inc.floored) flags.push('wage-floored');

  let gradLoan = sim.gradLoan;
  const expected = Math.max(0, st.expectedStudentLoans);
  if (!gradLoan && expected > 0 && years > 0) {
    const rate = FEDERAL_RATES['2026-27'].undergrad;
    const loan: LoanInput = {
      id: `${path.id}-student-loan`,
      name: 'Expected student loans (federal)',
      kind: 'federal_student',
      balance: expected,
      originalBalance: expected,
      rate,
      federalPlan: 'tiered_standard',
      legacyBorrower: false,
      graceMonths: 6,
      startYearIndex: years,
    };
    gradLoan = loan;
    flags.push('expected-student-loans');
  }

  const dq: DataQualityItem[] = [...sim.dataQuality];
  if (touched > 0) {
    if (inc.wageSource && !inc.selfReported) {
      const job = st.job !== '' && st.job !== 'custom' ? STUDENT_JOBS[st.job] : STUDENT_JOBS[PRACTICE_PAYCHECK.job];
      dq.push({ key: `student:wage:${job.key}`, label: `${job.title} median hourly wage (BLS OEWS)`, value: inc.wageSource.value, source: inc.wageSource.source, url: inc.wageSource.url, asOf: inc.wageSource.asOf, verified: inc.wageSource.verified, note: inc.wageSource.note, origin: 'data' });
      const mw = inc.minimum;
      dq.push({ key: `student:minwage:${state.profile.stateCode}`, label: `${state.profile.stateCode} minimum wage (floor for the default wage${inc.floored ? ', applied' : ''})`, value: mw.value, source: mw.source, url: mw.url, asOf: mw.asOf, verified: mw.verified, note: mw.note, origin: 'data' });
    }
    if (inc.selfReported) {
      dq.push({ key: 'student:wage:self', label: 'Hourly wage (entered by the student)', value: inc.hourlyWage, source: 'Entered by the client / advisor', asOf: `${CURRENT_YEAR}-11`, verified: false, origin: 'user' });
    }
    if (inc.wages > 0) {
      dq.push({ key: 'student:hours', label: 'Hours a week (school year / summer)', value: `${inc.hoursSchoolYear} / ${inc.hoursSummer}`, source: inc.practice ? PRACTICE_PAYCHECK.source.source : 'Entered by the client / advisor', asOf: `${CURRENT_YEAR}-11`, verified: false, origin: inc.practice ? 'assumption' : 'user' });
      const w = STUDENT_WEEKS;
      dq.push({ key: 'student:weeks', label: 'Weeks worked (school year / summer)', value: `${inc.weeksSchoolYear} / ${inc.weeksSummer}`, source: w.schoolYear.source, asOf: w.schoolYear.asOf, verified: w.schoolYear.verified, note: w.schoolYear.note, origin: 'assumption' });
    }
    if (inc.practice) {
      const p = PRACTICE_PAYCHECK.source;
      dq.push({ key: 'student:practice-paycheck', label: 'Practice paycheck (not real income)', value: Math.round(inc.wages), source: p.source, asOf: p.asOf, verified: p.verified, note: p.note, origin: 'assumption' });
    }
    if (inc.allowance > 0) dq.push({ key: 'student:allowance', label: 'Allowance / gifts per year', value: inc.allowance, source: 'Entered by the client / advisor', asOf: `${CURRENT_YEAR}-11`, verified: false, origin: 'user' });
  }
  if (gradLoan && gradLoan.id.endsWith('-student-loan')) {
    const r = FEDERAL_RATES['2026-27'];
    dq.push({ key: 'student:loan-rate', label: 'Federal undergraduate loan rate 2026-27 (expected loans)', value: r.undergrad, source: r.source, asOf: '2026-07', verified: r.verified, origin: 'data' });
  }

  return { ...sim, rows, waypoints, firstIncomeYearIndex, gradLoan, flags, dataQuality: dq };
}

export interface StudentEmergencyRule {
  months: number;
  /** Dollar floor (the starter) */
  starter: number;
  /** Extra dollars on top (bill in the student's name) */
  extra: number;
  reason: string;
}

/**
 * The Sprout emergency-fund rule from the supplement (option VALUES):
 *   s1 who pays housing/food: 0 family covers it (starter only) · 1 I pay some (+1 month) · 2 I pay all (+3 months)
 *   s2 hours: 0 steady · 1 change week to week (+1 month) · 2 summer or seasonal only (+1 month)
 *   s3 bill in my name: 0 no · 1 yes (+$500)
 *   s4 someone could help: 1 yes · 0 not really (+1 month)
 * Unanswered questions add nothing. The target is max(starter, months × monthly expenses) + extra.
 */
export function studentEmergencyRule(state: PlanState): StudentEmergencyRule {
  const s = state.supplement ?? {};
  const parts: string[] = [];
  let months = 0;
  if (s.s1 === 1) {
    months += 1;
    parts.push('you pay some of your housing and food (+1 month)');
  } else if (s.s1 === 2) {
    months += 3;
    parts.push('you pay all of your housing and food (+3 months)');
  }
  if (s.s2 === 1) {
    months += 1;
    parts.push('your hours change week to week (+1 month)');
  } else if (s.s2 === 2) {
    months += 1;
    parts.push('your work is summer or seasonal only (+1 month)');
  }
  if (s.s4 === 0) {
    months += 1;
    parts.push('nobody could easily help you out (+1 month)');
  }
  const extra = s.s3 === 1 ? BILL_CUSHION : 0;
  if (extra) parts.push(`a bill is in your name (+$${BILL_CUSHION})`);
  const starter = STARTER_FUND.value;
  const reason = parts.length ? `$${starter} starter, then ${months} month${months === 1 ? '' : 's'} of expenses: ${parts.join(', ')}` : `$${starter} starter cushion (family covers housing and food, steady hours)`;
  return { months, starter, extra, reason };
}

export function studentEmergencyTarget(state: PlanState, monthlyEssentials: number): { target: number; months: number; reason: string } {
  const rule = studentEmergencyRule(state);
  const target = Math.max(rule.starter, rule.months * Math.max(0, monthlyEssentials)) + rule.extra;
  return { target, months: rule.months, reason: rule.reason };
}

/** Future value with monthly compounding and end-of-month contributions (the prototype's savings.ts formula). */
export function futureValue(principal: number, monthly: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = Math.max(0, Math.round(years * 12));
  if (r === 0) return principal + monthly * n;
  const g = Math.pow(1 + r, n);
  return principal * g + monthly * ((g - 1) / r);
}

export interface HabitsProjection {
  targetAge: number;
  years: number;
  /** Monthly amount being saved today (planned transfer + IRA, today's dollars) */
  monthly: number;
  /** What steady saving grows to by the target age at the given nominal return */
  at: number;
  contributed: number;
  /** Starting five years later instead */
  later: number;
  costOfWaiting: number;
  /** Same habit at a savings-account yield instead of the portfolio return */
  atCashYield: number;
}

/** What today's saving habit grows to by a target age (default 30), and what waiting five years would cost. */
export function habitsProjection(state: PlanState, monthlySaving: number, annualReturn: number, targetAge = 30): HabitsProjection {
  const age = state.profile.age;
  const target = targetAge > age ? targetAge : age + 10;
  const years = target - age;
  const start = Math.max(0, state.balanceSheet.cash + state.balanceSheet.taxable + state.balanceSheet.roth + state.balanceSheet.preTax);
  const monthly = Math.max(0, monthlySaving);
  const at = futureValue(start, monthly, annualReturn, years);
  const later = futureValue(start, monthly, annualReturn, Math.max(0, years - 5));
  return { targetAge: target, years, monthly, at, contributed: start + monthly * 12 * years, later, costOfWaiting: at - later, atCashYield: futureValue(start, monthly, state.assumptions.cashYield, years) };
}

/** Credit-card utilization for the plan's card debts (balance ÷ limit), overall and per card. */
export function cardUtilization(state: PlanState): { balance: number; limit: number; overall: number | null; cards: { id: string; name: string; balance: number; limit: number; ratio: number | null }[] } {
  const cards = state.debts.filter((d) => d.kind === 'credit_card').map((d) => {
    const limit = Math.max(0, d.creditLimit ?? 0);
    return { id: d.id, name: d.name, balance: Math.max(0, d.balance), limit, ratio: limit > 0 ? Math.max(0, d.balance) / limit : null };
  });
  const balance = cards.reduce((s, c) => s + c.balance, 0);
  const limit = cards.reduce((s, c) => s + c.limit, 0);
  return { balance, limit, overall: limit > 0 ? balance / limit : null, cards };
}
