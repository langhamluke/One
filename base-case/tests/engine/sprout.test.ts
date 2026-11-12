import { describe, expect, it } from 'vitest';
import { CURRENT_YEAR, defaultPlanStateFor, defaultStudentProfile } from '../../shared/lib/inputs';
import { computeDerived, sanitizeState } from '../../shared/lib/engine';
import { simulatePath } from '../../shared/lib/career';
import { STARTER_FUND, cardUtilization, futureValue, habitsProjection, simulateStudentPath, studentEmergencyTarget, studentIncome, studentYears } from '../../shared/lib/sprout';
import { emergencyMonths, emergencyTarget } from '../../shared/lib/scoring';
import { PRACTICE_PAYCHECK, STUDENT_JOBS, STUDENT_WEEKS, defaultStudentWage, minimumWageFor } from '../../shared/data/studentJobs';
import { STUDENT_PERSONAS } from '../../shared/data/personasSprout';
import { FEDERAL_RATES } from '../../shared/data/loans';

function student(patch: Partial<ReturnType<typeof defaultStudentProfile>> = {}, state = 'TX') {
  const s = defaultPlanStateFor('sprout');
  s.profile.stateCode = state;
  s.profile.student = { ...defaultStudentProfile(), ...patch };
  s.profile.livingExpenses = 12 * (s.profile.student.needsMonthly + s.profile.student.wantsMonthly);
  s.assumptions.inflation = 0;
  s.assumptions.indexing = 0;
  return s;
}

describe('student income and the practice paycheck', () => {
  it('wages = hourly × (school-year hours × weeks + summer hours × weeks); allowance is separate and untaxed', () => {
    const s = student({ job: 'cashier', hourlyWage: 15, hoursSchoolYear: 12, hoursSummer: 20, weeksSchoolYear: 36, weeksSummer: 12, allowanceMonthly: 50, practicePaycheck: false });
    const inc = studentIncome(s);
    expect(inc.wages).toBeCloseTo(15 * (12 * 36 + 20 * 12), 6);
    expect(inc.allowance).toBe(600);
    expect(inc.total).toBeCloseTo(inc.wages + 600, 6);
    expect(inc.selfReported).toBe(true);
    expect(inc.practice).toBe(false);
  });

  it('defaults a listed job to the BLS median floored at the state minimum wage', () => {
    const tx = defaultStudentWage('cashier', 'TX');
    expect(tx.wage).toBe(STUDENT_JOBS.cashier.median.value);
    expect(tx.floored).toBe(false);
    const wa = defaultStudentWage('cashier', 'WA');
    expect(minimumWageFor('WA').value).toBeGreaterThan(STUDENT_JOBS.cashier.median.value);
    expect(wa.wage).toBe(minimumWageFor('WA').value);
    expect(wa.floored).toBe(true);
    expect(minimumWageFor('ZZ').value).toBe(7.25);
    const s = student({ job: 'cashier', hourlyWage: 0, practicePaycheck: false }, 'WA');
    const inc = studentIncome(s);
    expect(inc.hourlyWage).toBe(minimumWageFor('WA').value);
    expect(inc.floored).toBe(true);
    expect(inc.selfReported).toBe(false);
  });

  it('a student with no job gets a practice paycheck that can be turned off', () => {
    const on = student({ job: '', practicePaycheck: true });
    const inc = studentIncome(on);
    expect(inc.practice).toBe(true);
    expect(inc.hoursSchoolYear).toBe(PRACTICE_PAYCHECK.hoursSchoolYear);
    expect(inc.hoursSummer).toBe(PRACTICE_PAYCHECK.hoursSummer);
    expect(inc.hourlyWage).toBe(defaultStudentWage(PRACTICE_PAYCHECK.job, 'TX').wage);
    expect(inc.wages).toBeCloseTo(inc.hourlyWage * (10 * STUDENT_WEEKS.schoolYear.value + 20 * STUDENT_WEEKS.summer.value), 6);
    const off = student({ job: '', practicePaycheck: false, allowanceMonthly: 40 });
    const inc2 = studentIncome(off);
    expect(inc2.practice).toBe(false);
    expect(inc2.wages).toBe(0);
    expect(inc2.total).toBe(480);
  });
});

describe('student stage in front of the ladder', () => {
  it('earns student income until graduation, then starts the ladder; allowance is other income', () => {
    const s = student({ job: 'retail_sales', hourlyWage: 16, hoursSchoolYear: 10, hoursSummer: 30, allowanceMonthly: 100, practicePaycheck: false });
    s.profile.age = 16;
    s.profile.graduationYear = CURRENT_YEAR + 3;
    s.careerPaths[0].startYearOffset = 0; // the student stage wins over a shorter start offset
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(studentYears(s)).toBe(3);
    for (const r of sim.rows.slice(0, 3)) {
      expect(r.stage).toBe('student');
      expect(r.wages).toBeCloseTo(16 * (10 * 36 + 30 * 12), 6);
      expect(r.otherIncome).toBe(1200);
    }
    expect(sim.rows[3].stage).toBe('working');
    expect(sim.rows[3].wages).toBeGreaterThan(sim.rows[2].wages);
    expect(sim.firstIncomeYearIndex).toBe(0);
    expect(sim.waypoints[0].kind).toBe('event');
    expect(sim.waypoints.find((w) => w.kind === 'start')?.yearIndex).toBe(3);
    expect(sim.flags).not.toContain('practice-paycheck');
    expect(sim.dataQuality.some((d) => d.key === 'student:wage:self' && d.origin === 'user')).toBe(true);
  });

  it('a recent grad has no student years', () => {
    const s = student({ stage: 'recent_grad', job: 'custom', jobTitle: 'Intern', hourlyWage: 20, practicePaycheck: false });
    s.profile.graduationYear = CURRENT_YEAR + 2;
    expect(studentYears(s)).toBe(0);
    const sim = simulateStudentPath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows.every((r) => r.stage !== 'student')).toBe(true);
  });

  it('practice paycheck rows are flagged and listed as an assumption, and the dataset wage carries its VERIFY status', () => {
    const s = student({ job: '', practicePaycheck: true }, 'CO');
    s.profile.graduationYear = CURRENT_YEAR + 2;
    const sim = simulateStudentPath(s, s.careerPaths[0], s.whatIf);
    expect(sim.flags).toContain('practice-paycheck');
    const pp = sim.dataQuality.find((d) => d.key === 'student:practice-paycheck');
    expect(pp?.origin).toBe('assumption');
    expect(pp?.verified).toBe(false);
    const wage = sim.dataQuality.find((d) => d.key === 'student:wage:cashier');
    expect(wage?.origin).toBe('data');
    expect(wage?.verified).toBe(STUDENT_JOBS.cashier.median.verified);
    const mw = sim.dataQuality.find((d) => d.key === 'student:minwage:CO');
    expect(mw?.value).toBe(minimumWageFor('CO').value);
    expect(mw?.url).toContain('dol.gov');
    const d = computeDerived(s, { sims: 50 });
    expect(d.alerts.find((a) => a.id === 'practice-paycheck')?.severity).toBe('advisory');
    expect(d.dataQuality.items.some((i) => i.key === 'student:practice-paycheck')).toBe(true);
  });

  it('expected student loans become one federal loan starting at graduation, through the loans module', () => {
    const s = student({ job: '', practicePaycheck: true, collegePlan: 'four_year', expectedStudentLoans: 27000 });
    s.profile.age = 17;
    s.profile.graduationYear = CURRENT_YEAR + 5;
    const sim = simulateStudentPath(s, s.careerPaths[0], s.whatIf);
    expect(sim.gradLoan).toMatchObject({ kind: 'federal_student', balance: 27000, federalPlan: 'tiered_standard', graceMonths: 6, startYearIndex: 5, rate: FEDERAL_RATES['2026-27'].undergrad });
    const d = computeDerived(s, { sims: 50 });
    const rows = d.active.rows;
    expect(rows[4].debtBalance).toBe(0);
    expect(rows[5].debtBalance).toBeGreaterThan(20000);
    expect(rows[6].debtService).toBeGreaterThan(0);
    expect(d.alerts.find((a) => a.id === 'engine-error')).toBeUndefined();
  });
});

describe('student emergency fund rule', () => {
  const essentials = 400;
  const t = (sup: Record<string, number | null>) => {
    const s = student();
    s.supplement = sup;
    return studentEmergencyTarget(s, essentials);
  };
  it('family covers it all with steady hours and backup = the $500 starter only', () => {
    expect(t({ s1: 0, s2: 0, s3: 0, s4: 1 })).toMatchObject({ target: 500, months: 0 });
    expect(t({ s1: null, s2: null, s3: null, s4: null }).target).toBe(500);
  });
  it('paying some = 1 month, paying all = 3 months; the starter is a floor', () => {
    expect(t({ s1: 1, s2: 0, s3: 0, s4: 1 })).toMatchObject({ target: Math.max(500, 400), months: 1 });
    expect(t({ s1: 2, s2: 0, s3: 0, s4: 1 })).toMatchObject({ target: 1200, months: 3 });
    const tiny = student();
    tiny.supplement = { s1: 1, s2: 0, s3: 0, s4: 1 };
    expect(studentEmergencyTarget(tiny, 100).target).toBe(500);
  });
  it('variable or seasonal hours add a month, no backup adds a month, a bill in your name adds $500', () => {
    expect(t({ s1: 2, s2: 1, s3: 0, s4: 1 }).months).toBe(4);
    expect(t({ s1: 2, s2: 2, s3: 0, s4: 1 }).months).toBe(4);
    expect(t({ s1: 2, s2: 0, s3: 0, s4: 0 }).months).toBe(4);
    expect(t({ s1: 2, s2: 1, s3: 1, s4: 0 })).toMatchObject({ months: 5, target: 5 * 400 + 500 });
    expect(t({ s1: 0, s2: 0, s3: 1, s4: 1 })).toMatchObject({ months: 0, target: 1000 });
  });
  it('flows through emergencyMonths / emergencyTarget and the engine readout; an advisor override still wins', () => {
    const s = student({ needsMonthly: 300, wantsMonthly: 100 });
    s.supplement = { s1: 2, s2: 1, s3: 1, s4: 1 };
    expect(emergencyMonths(s)).toMatchObject({ months: 4, rule: 'student' });
    expect(emergencyTarget(s, 400).target).toBe(4 * 400 + 500);
    const d = computeDerived(s, { sims: 50 });
    expect(d.emergency.target).toBeCloseTo(4 * 400 + 500, 0);
    expect(d.emergency.monthsTarget).toBeCloseTo(2100 / 400, 1);
    s.savings.emergencyFundMonthsOverride = 2;
    expect(emergencyTarget(s, 400)).toMatchObject({ months: 2, target: 800, rule: 'override' });
  });
});

describe('student alerts and actions', () => {
  it('flags nothing going to savings, cash below the starter and a card over 30% of its limit', () => {
    const s = student({ job: 'retail_sales', hourlyWage: 17, hoursSchoolYear: 25, hoursSummer: 35, practicePaycheck: false, card: 'credit' });
    s.balanceSheet.cash = 300;
    s.debts = [{ id: 'card', name: 'Card', kind: 'credit_card', balance: 420, rate: 0.2699, creditLimit: 1000 }];
    const d = computeDerived(s, { sims: 50 });
    const ids = d.alerts.map((a) => a.id);
    expect(ids).toContain('starter-fund');
    expect(ids).not.toContain('emergency-fund');
    expect(ids).toContain('no-savings-yet');
    expect(d.alerts.find((a) => a.id === 'card-utilization:card')?.severity).toBe('caution');
    expect(ids).toContain('high-interest-debt');
    expect(ids).not.toContain('renters');
    expect(ids).not.toContain('disability');
    expect(cardUtilization(s).overall).toBeCloseTo(0.42, 6);
    s.debts[0].balance = 600;
    expect(computeDerived(s, { sims: 50 }).alerts.find((a) => a.id === 'card-utilization:card')?.severity).toBe('warning');
    s.debts[0].creditLimit = undefined;
    expect(computeDerived(s, { sims: 50 }).alerts.find((a) => a.id === 'card-limit:card')?.severity).toBe('advisory');
  });

  it('orders the next steps easiest first: transfer, starter cushion, card to zero; every transfer carries the low-balance warning', () => {
    const s = student({ job: 'retail_sales', hourlyWage: 17, hoursSchoolYear: 25, hoursSummer: 35, practicePaycheck: false, card: 'credit' });
    s.balanceSheet.cash = 300;
    s.debts = [{ id: 'card', name: 'Card', kind: 'credit_card', balance: 420, rate: 0.2699, creditLimit: 1000 }];
    const d = computeDerived(s, { sims: 50 });
    const cats = d.actions.map((a) => a.category);
    expect(cats.slice(0, 3)).toEqual(['goal', 'emergency', 'debt']);
    expect(d.actions[0].title).toMatch(/automatic transfer/);
    expect(d.actions[0].detail).toMatch(/Low-balance warning/);
    expect(d.actions[1].title).toContain(`${STARTER_FUND.value}`);
    expect(d.actions[1].amount).toBeCloseTo(200, 0);
    expect(d.actions[2].title).toMatch(/card balance/);
    expect(d.actions.some((a) => a.category === 'ira' && /Roth IRA/.test(a.title))).toBe(true);
    expect(d.actions.every((a) => !/\p{Extended_Pictographic}/u.test(a.title + a.detail))).toBe(true);
  });

  it('once the habit is set the transfer step disappears and allowance alone cannot fund a Roth IRA', () => {
    const s = student({ job: '', practicePaycheck: false, allowanceMonthly: 100 });
    s.balanceSheet.cash = 800;
    s.savings.taxableContribution = 300;
    const d = computeDerived(s, { sims: 50 });
    expect(d.actions.some((a) => /automatic transfer/.test(a.title))).toBe(false);
    expect(d.alerts.some((a) => a.id === 'no-savings-yet')).toBe(false);
    expect(d.actions.some((a) => a.category === 'ira')).toBe(false);
    expect(d.active.rows[0].otherIncome).toBe(1200);
    expect(d.active.rows[0].fica).toBe(0);
  });
});

describe('product defaults, clamps and projections', () => {
  it('blocks anyone under 13 by clamping, and keeps the Base Case floor at 16', () => {
    const s = defaultPlanStateFor('sprout');
    s.profile.age = 11;
    expect(sanitizeState(s).profile.age).toBe(13);
    s.profile.age = 14;
    expect(sanitizeState(s).profile.age).toBe(14);
    const bc = defaultPlanStateFor('base-case');
    bc.profile.age = 11;
    expect(sanitizeState(bc).profile.age).toBe(16);
  });

  it('starts a Sprout plan at 16 with the practice paycheck on, retirement at 65 and a ladder career after graduation', () => {
    const s = defaultPlanStateFor('sprout');
    expect(s.product).toBe('sprout');
    expect(s.profile.age).toBe(16);
    expect(s.profile.retirementAge).toBe(65);
    expect(s.profile.student?.practicePaycheck).toBe(true);
    expect(s.careerPaths[0].kind ?? 'ladder').toBe('ladder');
    expect(s.portfolioAmount).toBe(1000);
    const d = computeDerived(s, { sims: 50 });
    expect(d.alerts.find((a) => a.id === 'engine-error')).toBeUndefined();
    expect(d.active.rows[0].stage).toBe('student');
    expect(d.active.rows[0].wages).toBeGreaterThan(0);
  });

  it('every student persona computes without an engine error and exercises the student stage', () => {
    for (const p of STUDENT_PERSONAS) {
      const d = computeDerived(p.state, { sims: 50 });
      expect(d.alerts.find((a) => a.id === 'engine-error'), p.key).toBeUndefined();
      expect(d.active.rows[0].stage, p.key).toBe('student');
      expect(d.active.rows[0].grossIncome, p.key).toBeGreaterThan(0);
    }
    const sam = STUDENT_PERSONAS.find((p) => p.key === 'community-college')!;
    const ids = computeDerived(sam.state, { sims: 50 }).alerts.map((a) => a.id);
    expect(ids).toContain('starter-fund');
    expect(ids).toContain('no-savings-yet');
    expect(ids).toContain('card-utilization:card');
    const jordan = STUDENT_PERSONAS.find((p) => p.key === 'senior')!;
    expect(computeDerived(jordan.state, { sims: 50 }).alerts.some((a) => a.id === 'practice-paycheck')).toBe(true);
  });

  it('habits projection: future value, cost of waiting five years, and the savings-account comparison', () => {
    expect(futureValue(0, 100, 0, 1)).toBe(1200);
    expect(futureValue(1000, 0, 0.12, 1)).toBeCloseTo(1000 * Math.pow(1.01, 12), 6);
    const s = student();
    s.profile.age = 16;
    s.balanceSheet.cash = 0;
    const h = habitsProjection(s, 50, 0.06, 30);
    expect(h.years).toBe(14);
    expect(h.contributed).toBe(50 * 12 * 14);
    expect(h.at).toBeGreaterThan(h.contributed);
    expect(h.later).toBeLessThan(h.at);
    expect(h.costOfWaiting).toBeCloseTo(h.at - h.later, 6);
    expect(h.atCashYield).toBeLessThan(h.at);
    s.profile.age = 34;
    expect(habitsProjection(s, 50, 0.06, 30).targetAge).toBe(44);
  });
});
