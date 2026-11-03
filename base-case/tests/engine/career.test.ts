import { describe, expect, it } from 'vitest';
import { simulatePath, resolveLadder } from '../../shared/lib/career';
import { FIXTURE_L0_P50, FIXTURE_L1_P50, fixtureState } from './fixtures';

describe('career simulation', () => {
  it('starts at the level band and applies merit raises within a level', () => {
    const s = fixtureState();
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[0].wages).toBeCloseTo(FIXTURE_L0_P50, 4);
    expect(sim.rows[1].wages).toBeCloseTo(FIXTURE_L0_P50 * 1.03, 4);
    expect(sim.rows[0].stage).toBe('working');
    expect(sim.rows[0].levelTitle).toBe('Entry');
    expect(sim.firstIncomeYearIndex).toBe(0);
    expect(sim.rows.length).toBe(95 - 22 + 1);
  });

  it('promotes at the right years (2, 5, 10) and re-bases pay to the next band', () => {
    const s = fixtureState();
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    const promos = sim.waypoints.filter((w) => w.kind === 'promotion');
    expect(promos.map((w) => w.yearIndex)).toEqual([2, 5, 10]);
    expect(promos.map((w) => w.label)).toEqual(['Promoted to Mid-level', 'Promoted to Senior', 'Promoted to Lead / Manager']);
    expect(sim.rows[2].wages).toBeCloseTo(FIXTURE_L1_P50, 4);
    expect(sim.rows[2].levelTitle).toBe('Mid-level');
    expect(sim.rows[1].levelTitle).toBe('Entry');
    expect(sim.rows[10].levelTitle).toBe('Lead / Manager');
    expect(sim.rows[40].levelTitle).toBe('Lead / Manager');
    // never a pay cut on promotion
    for (let i = 1; i < 44; i++) expect(sim.rows[i].wages).toBeGreaterThan(sim.rows[i - 1].wages);
  });

  it('honours yearsOverrides', () => {
    const s = fixtureState();
    s.careerPaths[0].yearsOverrides = { 0: 4 };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.waypoints.filter((w) => w.kind === 'promotion').map((w) => w.yearIndex)).toEqual([4, 7, 12]);
  });

  it('delays every promotion by promotionDelayYears', () => {
    const s = fixtureState();
    s.whatIf.promotionDelayYears = 1;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.waypoints.filter((w) => w.kind === 'promotion').map((w) => w.yearIndex)).toEqual([3, 6, 11]);
  });

  it('inserts a layoff gap with pro-rated wages and frozen tenure', () => {
    const s = fixtureState();
    s.whatIf.layoffGapMonths = 6;
    s.whatIf.layoffYearOffset = 3;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[3].stage).toBe('gap');
    expect(sim.rows[3].gapMonths).toBe(6);
    expect(sim.rows[3].wages).toBeCloseTo((FIXTURE_L1_P50 * 1.03) / 2, 4);
    const gap = sim.waypoints.find((w) => w.kind === 'gap');
    expect(gap?.yearIndex).toBe(3);
    expect(sim.waypoints.filter((w) => w.kind === 'promotion').map((w) => w.yearIndex)).toEqual([2, 6, 11]);
    // 18-month gap spans two years
    s.whatIf.layoffGapMonths = 18;
    const sim2 = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim2.rows[3].gapMonths).toBe(12);
    expect(sim2.rows[3].wages).toBe(0);
    expect(sim2.rows[4].gapMonths).toBe(6);
  });

  it('models grad school: income during, loan created within federal caps, post-school premium', () => {
    const s = fixtureState();
    s.whatIf.gradSchool = { enabled: true, startYearOffset: 2, years: 2, annualCost: 30000, financedPct: 0.5, loanRate: 0.05, incomeDuring: 10000, postLevelIndex: 1, postPremium: 0.2 };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[2].stage).toBe('grad-school');
    expect(sim.rows[3].stage).toBe('grad-school');
    expect(sim.rows[2].wages).toBe(10000);
    expect(sim.rows[2].tuitionFinanced).toBe(15000);
    expect(sim.rows[2].tuitionCash).toBe(15000);
    expect(sim.rows[2].tuitionExcess).toBe(0);
    expect(sim.gradLoan).toBeDefined();
    expect(sim.gradLoan!.balance).toBeCloseTo(15000 * 1.05 * 1.05 + 15000 * 1.05, 4);
    expect(sim.gradLoan!.startYearIndex).toBe(4);
    expect(sim.gradLoan!.graceMonths).toBe(6);
    expect(sim.gradLoan!.kind).toBe('federal_student');
    expect(sim.rows[4].stage).toBe('working');
    expect(sim.rows[4].levelTitle).toBe('Mid-level');
    expect(sim.rows[4].wages).toBeCloseTo(FIXTURE_L1_P50 * 1.2, 4);
    expect(sim.waypoints.find((w) => w.kind === 'school')?.yearIndex).toBe(2);
  });

  it('caps grad-school borrowing at the federal annual limit and flags the excess', () => {
    const s = fixtureState();
    s.whatIf.gradSchool = { enabled: true, startYearOffset: 1, years: 3, annualCost: 80000, financedPct: 1, loanRate: 0.08, incomeDuring: 0, postLevelIndex: 1, postPremium: 0.2 };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[1].tuitionFinanced).toBe(20500);
    expect(sim.rows[1].tuitionExcess).toBe(80000 - 20500);
    expect(sim.rows[1].tuitionCash).toBe(80000 - 20500);
    expect(sim.flags).toContain('grad-loan-cap');
  });

  it('switches occupation after school when postOccupationCode is set and that code is not in the dataset (fallback)', () => {
    const s = fixtureState();
    s.whatIf.gradSchool = { enabled: true, startYearOffset: 1, years: 1, annualCost: 1000, financedPct: 0, loanRate: 0.05, incomeDuring: 0, postOccupationCode: 'not_a_real_code', postLevelIndex: 0, postPremium: 0 };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.ladders.length).toBe(2);
    expect(sim.ladders[1].fallback).toBe(true);
    expect(sim.rows[2].stage).toBe('working');
    expect(sim.gradLoan).toBeUndefined();
  });

  it('cuts wages at retirement and records waypoints', () => {
    const s = fixtureState({ retirementAge: 30 });
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[7].stage).toBe('working');
    expect(sim.rows[8].stage).toBe('retired');
    expect(sim.rows[8].age).toBe(30);
    for (const r of sim.rows) if (r.age >= 30) expect(r.wages).toBe(0);
    const kinds = sim.waypoints.map((w) => w.kind);
    expect(kinds[0]).toBe('start');
    expect(sim.waypoints[0].label).toBe('Started as Entry');
    expect(sim.waypoints.find((w) => w.kind === 'retire')?.yearIndex).toBe(8);
    expect(sim.waypoints.filter((w) => w.kind === 'promotion').length).toBe(2);
  });

  it('uses the retireAtOverride what-if', () => {
    const s = fixtureState();
    s.whatIf.retireAtOverride = 40;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[18].stage).toBe('retired');
    expect(sim.rows[17].stage).toBe('working');
  });

  it('handles pre-start years and reports the first income year', () => {
    const s = fixtureState();
    s.careerPaths[0].startYearOffset = 2;
    s.careerPaths[0].preStartIncome = 0;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[0].stage).toBe('pre-start');
    expect(sim.rows[1].stage).toBe('pre-start');
    expect(sim.rows[2].stage).toBe('working');
    expect(sim.firstIncomeYearIndex).toBe(2);
    expect(sim.rows[2].wages).toBeCloseTo(FIXTURE_L0_P50, 4);
    s.careerPaths[0].preStartIncome = 12000;
    const sim2 = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim2.rows[0].wages).toBe(12000);
    expect(sim2.firstIncomeYearIndex).toBe(0);
  });

  it('falls back to a flagged default band when the occupation is unknown', () => {
    const s = fixtureState();
    s.careerPaths[0].occupationCode = 'definitely_not_an_occupation';
    s.careerPaths[0].customLevels = undefined;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.ladders[0].fallback).toBe(true);
    expect(sim.flags.some((f) => f.startsWith('occupation-not-found'))).toBe(true);
    expect(sim.rows[0].wages).toBeGreaterThan(0);
    expect(sim.dataQuality.every((d) => d.origin === 'user' || d.key.startsWith('metro'))).toBe(true);
    expect(sim.dataQuality.some((d) => d.origin === 'user' && d.verified === false)).toBe(true);
    const custom = resolveLadder('custom', undefined);
    expect(custom.fallback).toBe(true);
  });

  it('applies the metro index and bonus override', () => {
    const s = fixtureState();
    s.careerPaths[0].bonusPctOverride = 0.1;
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim.rows[0].bonus).toBeCloseTo(0.1 * FIXTURE_L0_P50, 4);
    expect(sim.metroIndex).toBe(1);
    s.careerPaths[0].metro = 'no_such_metro';
    const sim2 = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim2.metroIndex).toBe(1);
    expect(sim2.flags.some((f) => f.startsWith('metro-not-found'))).toBe(true);
  });

  it('models equity comp and a non-covered pension', () => {
    const s = fixtureState();
    s.benefits.equityComp = { annualRsuValue: 10000, esppDiscount: 0.15, esppContribPct: 0.1 };
    s.benefits.pension = { enabled: true, multiplier: 0.02, employeeContribPct: 0.08, vestingYears: 5, normalRetirementAge: 65, coveredBySocialSecurity: false };
    const sim = simulatePath(s, s.careerPaths[0], s.whatIf);
    const r0 = sim.rows[0];
    expect(r0.rsu).toBe(10000);
    expect(sim.rows[1].rsu).toBeCloseTo(10000 * 1.03, 6);
    expect(r0.esppContribution).toBeCloseTo(0.1 * r0.wages, 6);
    expect(r0.esppGain).toBeCloseTo(r0.esppContribution * (0.15 / 0.85), 6);
    expect(r0.pensionEmployeeContrib).toBeCloseTo(0.08 * r0.wages, 6);
    expect(r0.coveredBySS).toBe(false);
    const ret = sim.rows.find((r) => r.stage === 'retired')!;
    const last3 = sim.rows.filter((r) => r.stage === 'working').slice(-3);
    const fas = last3.reduce((a, r) => a + r.wages, 0) / 3;
    expect(ret.yearsOfService).toBe(45);
    expect(ret.pensionIncome).toBeCloseTo(0.02 * 45 * fas, 4);
    // not vested -> no pension
    s.benefits.pension.vestingYears = 60;
    const sim2 = simulatePath(s, s.careerPaths[0], s.whatIf);
    expect(sim2.rows.find((r) => r.stage === 'retired')!.pensionIncome).toBe(0);
  });
});
