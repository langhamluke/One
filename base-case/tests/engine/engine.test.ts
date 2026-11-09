import { describe, expect, it } from 'vitest';
import { computeDerived, sanitizeState } from '../../shared/lib/engine';
import { defaultPlanState, exportPlan, importPlan, mergePlanState } from '../../shared/lib/inputs';
import { PERSONAS } from '../../shared/data/personas';
import { collectDataQuality } from '../../shared/lib/dataQuality';
import { simulatePath } from '../../shared/lib/career';
import { fixtureState, nonFinitePaths } from './fixtures';
import { fmtAge, fmtMoney, fmtPct, fmtYears } from '../../shared/lib/format';

describe('engine', () => {
  it('computes the default plan with no NaN anywhere', () => {
    const d = computeDerived(defaultPlanState());
    expect(d.alerts.find((a) => a.id === 'engine-error')).toBeUndefined();
    expect(nonFinitePaths(d)).toEqual([]);
    expect(d.active.rows.length).toBe(95 - 22 + 1);
    expect(d.paths.length).toBe(1);
    expect(d.active.pathId).toBe('path-1');
    expect(d.mc.ages.length).toBe(d.active.rows.length);
    expect(d.mc.sims).toBe(1000);
    expect(d.glidePath.length).toBe(d.active.rows.length);
    expect(d.profile.provisional).toBe(true);
    expect(d.modelEquity).toBe(0.6);
    expect(Object.values(d.allocation).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(d.headline.netWorth).toBe(3000);
    expect(d.emergency.monthsTarget).toBe(6);
    expect(d.tax.year).toBe(2026);
    expect(d.dataQuality.items.length).toBeGreaterThan(5);
    expect(d.computeMs).toBeGreaterThanOrEqual(0);
    const r = d.active.rows[0];
    expect(r.grossIncome).toBeCloseTo(r.wages + r.bonus + r.equityComp + r.spouseWages + r.pensionIncome + r.socialSecurity, 6);
    expect(r.investable).toBeCloseTo(r.balances.preTax + r.balances.roth + r.balances.hsa + r.balances.taxable, 6);
    expect(r.netWorth).toBeCloseTo(r.investable + r.balances.cash + r.balances.goals - r.debtBalance, 6);
  });

  it('runs under 150 ms with 1000 sims', () => {
    const s = defaultPlanState();
    computeDerived(s);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) times.push(computeDerived(s).computeMs);
    times.sort((a, b) => a - b);
    const median = times[2];
    console.log(`computeDerived(defaultPlanState()) with 1000 sims: median ${median.toFixed(1)} ms (runs: ${times.map((t) => t.toFixed(1)).join(', ')})`);
    expect(median).toBeLessThan(150);
  });

  it('runs for every persona with no NaN and plausible headline ranges', () => {
    expect(PERSONAS.length).toBeGreaterThan(0);
    for (const p of PERSONAS) {
      const s = mergePlanState(p.state);
      const d = computeDerived(s, { sims: 300 });
      const k = p.key;
      expect(d.alerts.find((a) => a.id === 'engine-error'), k).toBeUndefined();
      expect(nonFinitePaths(d), k).toEqual([]);
      expect(d.active.rows.length, k).toBe(s.assumptions.lifeExpectancy - s.profile.age + 1);
      expect(d.paths.length, k).toBe(s.careerPaths.length);
      const h = d.headline;
      expect(h.successProbability, k).toBeGreaterThanOrEqual(0);
      expect(h.successProbability, k).toBeLessThanOrEqual(1);
      expect(h.savingsRate, k).toBeGreaterThanOrEqual(0);
      expect(h.savingsRate, k).toBeLessThanOrEqual(1);
      expect(h.savingsRateWithEmployer, k).toBeGreaterThanOrEqual(h.savingsRate - 1e-9);
      expect(h.medianAtRetirementReal, k).toBeGreaterThanOrEqual(0);
      expect(h.medianAtRetirementReal, k).toBeLessThan(5e7);
      expect(h.emergencyMonthsCovered, k).toBeGreaterThanOrEqual(0);
      expect(Math.abs(h.netWorth), k).toBeLessThan(1e7);
      const first = d.active.rows[d.active.firstIncomeYearIndex];
      expect(first.grossIncome, k).toBeGreaterThan(20000);
      expect(first.grossIncome, k).toBeLessThan(500000);
      expect(h.year1TakeHome, k).toBeGreaterThan(0.5 * first.grossIncome);
      expect(h.year1TakeHome, k).toBeLessThan(first.grossIncome);
      expect(d.tax.effectiveRate, k).toBeGreaterThan(0.05);
      expect(d.tax.effectiveRate, k).toBeLessThan(0.5);
      if (h.debtFreeAge !== null) {
        expect(h.debtFreeAge, k).toBeGreaterThanOrEqual(s.profile.age);
        expect(h.debtFreeAge, k).toBeLessThanOrEqual(s.assumptions.lifeExpectancy);
      }
      expect(d.ss.annualAtClaim, k).toBeGreaterThanOrEqual(0);
      expect(d.ss.annualAtClaim, k).toBeLessThan(80000);
      expect(d.mc.targetIncomeReal, k).toBeGreaterThan(0);
      expect(d.mc.targetIncomeReal, k).toBeLessThan(400000);
      // every working-year wage stays within a sane band of today's dollars
      for (const r of d.active.rows) {
        if (r.stage === 'working') expect(r.wages / Math.pow(1 + s.assumptions.inflation, r.yearIndex), `${k} y${r.yearIndex}`).toBeLessThan(600000);
      }
      expect(d.actions.length, k).toBeGreaterThan(0);
      expect(d.alerts.length, k).toBeGreaterThan(0);
    }
  });

  it('gives a credible success probability: default developer > 50%, high saver with a 45-year horizon > 60%', () => {
    const d = computeDerived(defaultPlanState());
    expect(d.mc.successProbability).toBeGreaterThan(0.5);
    // the replacement target is 70% of the final working-year take-home in TODAY'S dollars
    const rows = d.active.rows;
    const lastWorking = [...rows].reverse().find((r) => r.stage === 'working')!;
    const takeHomeReal = lastWorking.takeHome / Math.pow(1.025, lastWorking.yearIndex);
    expect(d.mc.targetIncomeReal).toBeCloseTo(0.7 * takeHomeReal, 4);
    expect(d.mc.targetIncomeReal).toBeLessThan(200000);
    // retirement rows: contributions stop, withdrawals = (target - SS) grossed up, to life expectancy
    const ret = rows.find((r) => r.stage === 'retired')!;
    expect(ret.employeePretax401k + ret.employer401k + ret.iraContribution + ret.taxableContribution).toBe(0);
    expect(ret.livingExpenses).toBeCloseTo(d.mc.targetIncomeReal * Math.pow(1.025, ret.yearIndex), 2);
    expect(rows[rows.length - 1].age).toBe(95);
    const s = fixtureState({ inflation: 0.025 });
    s.savings.deferralPct = 0.15;
    s.savings.iraContribution = 7500;
    s.savings.taxableContribution = 6000;
    s.profile.livingExpenses = 24000;
    const hs = computeDerived(s);
    expect(hs.mc.successProbability).toBeGreaterThan(0.6);
    expect(hs.mc.medianAtRetirementReal).toBeGreaterThan(hs.mc.targetIncomeReal * 10);
  });

  it('honours engine options', () => {
    const s = defaultPlanState();
    expect(computeDerived(s, { skipMonteCarlo: true }).mc.sims).toBe(0);
    expect(computeDerived(s, { sims: 50 }).mc.sims).toBe(50);
    const a = computeDerived(s, { sims: 100 });
    const b = computeDerived(s, { sims: 100 });
    expect(a.mc.p50).toEqual(b.mc.p50);
  });

  it('survives absurd inputs by clamping', () => {
    const s = defaultPlanState();
    s.profile.age = -5;
    s.profile.retirementAge = 10;
    s.assumptions.inflation = Number.NaN;
    s.assumptions.lifeExpectancy = 3;
    s.savings.deferralPct = 9;
    s.debts = [{ id: 'd', name: 'x', kind: 'auto', balance: Number.NaN, rate: 99 }];
    s.whatIf.gradSchool.years = -3;
    const clean = sanitizeState(s);
    expect(clean.profile.age).toBe(16);
    expect(clean.profile.retirementAge).toBeGreaterThanOrEqual(clean.profile.age);
    expect(clean.assumptions.lifeExpectancy).toBeGreaterThan(clean.profile.retirementAge);
    expect(clean.assumptions.inflation).toBe(0.025);
    expect(s.profile.age).toBe(-5);
    const d = computeDerived(s, { sims: 50 });
    expect(d.alerts.find((a) => a.id === 'engine-error')).toBeUndefined();
    expect(nonFinitePaths(d)).toEqual([]);
    const empty = computeDerived({ ...defaultPlanState(), careerPaths: [] }, { skipMonteCarlo: true });
    expect(empty.paths.length).toBe(1);
  });

  it('round-trips export/import through mergePlanState', () => {
    const s = fixtureState();
    s.profile.nickname = 'Sam';
    s.debts = [{ id: 'fed', name: 'Direct loans', kind: 'federal_student', balance: 30000, rate: 0.0652, federalPlan: 'rap' }];
    s.goals = [{ id: 'g', name: 'Car', kind: 'car', targetAmount: 20000, targetYear: 2029, priority: 1, fundedSoFar: 1000 }];
    s.answers.q1 = 2;
    const json = JSON.parse(JSON.stringify(exportPlan(s)));
    expect(json.app).toBe('base-case');
    const back = importPlan(json);
    expect(back).toEqual(mergePlanState(s));
    expect(back).toEqual(s);
    const d1 = computeDerived(s, { sims: 100 });
    const d2 = computeDerived(back, { sims: 100 });
    expect(d2.headline).toEqual(d1.headline);
    expect(d2.active.rows[5]).toEqual(d1.active.rows[5]);
    expect(() => importPlan({ app: 'other' })).toThrow();
    const partial = mergePlanState({ profile: { age: 30 } });
    expect(partial.profile.age).toBe(30);
    expect(partial.careerPaths.length).toBe(1);
  });

  it('applies the order of operations and the retirement draw-down', () => {
    const s = fixtureState();
    s.profile.livingExpenses = 15000;
    s.savings.iraContribution = 7500;
    s.savings.taxableContribution = 5000;
    s.goals = [{ id: 'g', name: 'Car', kind: 'car', targetAmount: 12000, targetYear: 2029, priority: 1, fundedSoFar: 0 }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    const r0 = d.active.rows[0];
    // cash earns the cash yield before the year-end top-up
    expect(r0.emergencyTopUp).toBeCloseTo(6 * (r0.livingExpenses / 12) - 3000 * 1.035, 4);
    expect(r0.unallocated).toBeGreaterThan(0);
    expect(r0.iraContribution).toBe(7500);
    expect(r0.goalFunding).toBeCloseTo(12000 / 4, 4);
    expect(r0.taxableContribution).toBe(5000);
    expect(r0.cashFlow).toBeCloseTo(r0.takeHome - r0.livingExpenses - r0.debtService - r0.emergencyTopUp - r0.iraContribution - r0.goalFunding - r0.taxableContribution, 6);
    expect(r0.balances.roth).toBe(7500);
    const r3 = d.active.rows[3];
    expect(r3.year).toBe(2029);
    expect(r3.balances.goals).toBeCloseTo(0, 6);
    expect(d.active.rows[2].balances.goals).toBeGreaterThan(8000);
    const ret = d.active.rows.find((r) => r.stage === 'retired')!;
    expect(ret.wages).toBe(0);
    expect(ret.federalTax).toBe(0);
    expect(ret.socialSecurity).toBeGreaterThan(0);
    expect(ret.livingExpenses).toBeCloseTo(d.mc.targetIncomeReal, 4);
    const last = d.active.rows[d.active.rows.length - 1];
    expect(last.age).toBe(95);
    expect(d.active.netWorthAtRetirement).toBe(d.active.rows[44].netWorth);
    expect(d.ss.method).toBe('estimated');
    expect(d.active.rows[0].savingsRate).toBeGreaterThan(0);
    expect(d.active.rows[0].savingsRateWithEmployer).toBeGreaterThan(d.active.rows[0].savingsRate);
  });

  it('applies the student-loan match and §127 repayment in the ledger', () => {
    const s = fixtureState();
    s.savings.deferralPct = 0;
    s.benefits.studentLoanMatch = true;
    s.benefits.employerLoanRepayment = 6000;
    s.debts = [{ id: 'fed', name: 'Direct loans', kind: 'federal_student', balance: 30000, rate: 0.0652, federalPlan: 'standard' }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    const r0 = d.active.rows[0];
    expect(r0.employeePretax401k).toBe(0);
    expect(r0.employerLoanMatch401k).toBeGreaterThan(0);
    expect(r0.employerLoanMatch401k).toBeCloseTo(Math.min(0.04 * (r0.wages + r0.bonus), r0.debtService), 2);
    expect(r0.flags).toContain('s127-excess');
    expect(d.dataQuality.items.some((i) => i.key === 'irs:127')).toBe(true);
  });

  it('supports several paths and picks the active one', () => {
    const s = fixtureState();
    const p2 = { ...s.careerPaths[0], id: 'path-2', name: 'Second', track: 'high' as const };
    s.careerPaths = [s.careerPaths[0], p2];
    s.activePathId = 'path-2';
    const d = computeDerived(s, { skipMonteCarlo: true });
    expect(d.paths.length).toBe(2);
    expect(d.active.pathId).toBe('path-2');
    expect(d.paths[1].startingSalary).toBeGreaterThan(d.paths[0].startingSalary);
    expect(d.paths[1].lifetimeEarnings).toBeGreaterThan(d.paths[0].lifetimeEarnings);
  });
});

describe('data quality', () => {
  it('counts unverified dataset items and user-provided items', () => {
    const s = fixtureState();
    s.assumptions.ssOverrideAnnual = 25000;
    s.profile.stateCode = 'CUSTOM';
    s.profile.customStateRate = 0.05;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    const d = computeDerived(s, { skipMonteCarlo: true });
    const dq = d.dataQuality;
    const keys = dq.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(dq.userProvidedCount).toBe(dq.items.filter((i) => i.origin === 'user').length);
    expect(dq.unverifiedCount).toBe(dq.items.filter((i) => i.origin === 'data' && !i.verified).length);
    // 4 ladder levels visited (custom -> user) + custom ladder + custom state + ss override + state rate override
    expect(dq.userProvidedCount).toBeGreaterThanOrEqual(sim.dataQuality.length + 3);
    expect(dq.items.some((i) => i.key === 'ss:override')).toBe(true);
    expect(dq.items.some((i) => i.key === 'tax:brackets:single')).toBe(true);
    expect(dq.items.some((i) => i.key === 'fica:wageBase:2026')).toBe(true);
    expect(dq.items.filter((i) => i.origin === 'assumption').length).toBe(8);
    const direct = collectDataQuality(s, { sims: [sim], usage: { rap: true, tiered: true, ibr: true, hsa: true, s127: true, rothPhaseOut: false, backdoorRoth: false, tradIraPhaseOut: true, catchUp: true, superCatchUp: true, s415c: false, deferralCapped: false, gradLoanCap: false, goalUnderfunded: [], forgiveness: [], negativeCashFlowYears: [], retirementShortfall: false, ibrNotLegacy: false, s415cSpill: 0, s415cSpillFirstAge: null, s415cHandling: null, cashBalanceCredits: 0 } });
    for (const k of ['loans:rap', 'loans:tiered', 'loans:ibr:poverty', 'irs:catchUp50', 'irs:catchUp60to63', 'irs:hsa:self', 'irs:127', 'irs:tradIraPhaseOut:single']) expect(direct.items.some((i) => i.key === k), k).toBe(true);
  });
});

describe('format', () => {
  it('formats money, percentages, ages and years', () => {
    expect(fmtMoney(1234.56)).toBe('$1,235');
    expect(fmtMoney(-1234.56)).toBe('-$1,235');
    expect(fmtMoney(1234.56, { decimals: 2 })).toBe('$1,234.56');
    expect(fmtMoney(45600, { compact: true })).toBe('$45.6k');
    expect(fmtMoney(1250000, { compact: true })).toBe('$1.3M');
    expect(fmtMoney(2500000000, { compact: true })).toBe('$2.5B');
    expect(fmtMoney(500, { compact: true })).toBe('$500');
    expect(fmtMoney(1200, { sign: true })).toBe('+$1,200');
    expect(fmtMoney(Number.NaN)).toBe('—');
    expect(fmtPct(0.0725)).toBe('7.3%');
    expect(fmtPct(0.5, 0)).toBe('50%');
    expect(fmtAge(67)).toBe('67');
    expect(fmtAge(null)).toBe('—');
    expect(fmtYears(1)).toBe('1 yr');
    expect(fmtYears(5)).toBe('5 yrs');
    expect(fmtYears(2.5)).toBe('2.5 yrs');
  });
});
