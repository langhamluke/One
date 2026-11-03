import { describe, expect, it } from 'vitest';
import { computeDerived } from '../../shared/lib/engine';
import { fixtureState } from './fixtures';

const ORDER = { warning: 0, caution: 1, advisory: 2 };

describe('alerts', () => {
  it('warns when the deferral leaves employer match on the table', () => {
    const s = fixtureState();
    s.savings.deferralPct = 0.02;
    s.benefits.matchRate = 1;
    s.benefits.matchCapPct = 0.04;
    const d = computeDerived(s, { skipMonteCarlo: true });
    const al = d.alerts.find((a) => a.id === 'match-left');
    expect(al).toBeDefined();
    expect(al!.severity).toBe('warning');
    const row = d.active.rows[0];
    expect(al!.value).toBeCloseTo(0.02 * (row.wages + row.bonus), 4);
    expect(al!.title).toMatch(/match on the table/);
    s.savings.deferralPct = 0.04;
    expect(computeDerived(s, { skipMonteCarlo: true }).alerts.find((a) => a.id === 'match-left')).toBeUndefined();
  });

  it('warns on negative cash flow in the first five years and draws from cash', () => {
    const s = fixtureState();
    s.profile.livingExpenses = 200000;
    const d = computeDerived(s, { skipMonteCarlo: true });
    const al = d.alerts.find((a) => a.id === 'negative-cash-flow');
    expect(al).toBeDefined();
    expect(al!.severity).toBe('warning');
    expect(d.active.rows[0].cashFlow).toBeLessThan(0);
    expect(d.active.rows[0].flags).toContain('negative-cash-flow');
    expect(d.active.rows[0].balances.cash).toBe(0);
  });

  it('surfaces unsaved cash flow and the deferral-below-max advisory', () => {
    const s = fixtureState();
    s.profile.livingExpenses = 30000;
    const d = computeDerived(s, { skipMonteCarlo: true });
    const row = d.active.rows[0];
    expect(row.unallocated).toBeGreaterThan(0);
    const al = d.alerts.find((a) => a.id === 'unsaved-cash-flow');
    expect(al).toBeDefined();
    expect(al!.severity).toBe('advisory');
    expect(al!.value).toBeCloseTo(row.unallocated, 6);
    expect(d.alerts.find((a) => a.id === 'deferral-below-max')).toBeDefined();
  });

  it('is sorted warning -> caution -> advisory and flags the provisional profile and insurance gaps', () => {
    const s = fixtureState();
    const d = computeDerived(s, { skipMonteCarlo: true });
    for (let i = 1; i < d.alerts.length; i++) expect(ORDER[d.alerts[i].severity]).toBeGreaterThanOrEqual(ORDER[d.alerts[i - 1].severity]);
    expect(d.alerts.find((a) => a.id === 'provisional-profile')?.severity).toBe('caution');
    expect(d.alerts.find((a) => a.id === 'disability')?.severity).toBe('caution');
    expect(d.alerts.find((a) => a.id === 'renters')?.severity).toBe('advisory');
    expect(d.alerts.find((a) => a.id === 'emergency-fund')?.severity).toBe('warning');
    expect(d.alerts.find((a) => a.id === 'ss-estimated')?.advisorOnly).toBe(true);
    expect(d.alerts.find((a) => a.id === 'questionnaire-text')).toBeUndefined(); // text verified against Flight Plan
    s.insurance.disability = true;
    s.insurance.renters = true;
    const d2 = computeDerived(s, { skipMonteCarlo: true });
    expect(d2.alerts.find((a) => a.id === 'disability')).toBeUndefined();
    expect(d2.alerts.find((a) => a.id === 'renters')).toBeUndefined();
  });

  it('flags high-interest debt, forgiveness, backdoor Roth and goals', () => {
    const s = fixtureState();
    s.debts = [
      { id: 'cc', name: 'Card', kind: 'credit_card', balance: 5000, rate: 0.24 },
      { id: 'rap', name: 'Fed', kind: 'federal_student', balance: 150000, rate: 0.07, federalPlan: 'rap' },
    ];
    s.savings.iraContribution = 7000;
    s.goals = [{ id: 'g1', name: 'House', kind: 'home', targetAmount: 2000000, targetYear: 2028, priority: 1, fundedSoFar: 0 }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    expect(d.alerts.find((a) => a.id === 'high-interest-debt')?.severity).toBe('caution');
    expect(d.alerts.find((a) => a.id === 'forgiveness-tax')).toBeDefined();
    expect(d.alerts.find((a) => a.id === 'goal-underfunded:g1')?.severity).toBe('caution');
    expect(d.debt.highInterestBalance).toBeGreaterThan(0);
    // very high pay -> Roth phased out
    s.careerPaths[0].customLevels![0].band.value = { p10: 300000, p25: 300000, p50: 300000, p75: 300000, p90: 300000 };
    const d2 = computeDerived(s, { skipMonteCarlo: true });
    expect(d2.active.rows[0].limits.rothIra).toBe('none');
    expect(d2.alerts.find((a) => a.id === 'roth-phaseout')).toBeDefined();
  });

  it('flags retirement shortfall from the Monte Carlo', () => {
    const s = fixtureState();
    s.assumptions.retirementSpendingOverride = 500000;
    const d = computeDerived(s, { sims: 200 });
    expect(d.mc.successProbability).toBeLessThan(0.75);
    expect(d.alerts.find((a) => a.id === 'shortfall')?.severity).toBe('warning');
  });
});

describe('actions', () => {
  it('starts at the first year with real income (a student with no income this year still gets a 401(k) action)', () => {
    const s = fixtureState();
    s.careerPaths[0].startYearOffset = 1;
    s.careerPaths[0].preStartIncome = 0;
    s.savings.deferralPct = 0.02;
    const d = computeDerived(s, { skipMonteCarlo: true });
    expect(d.active.firstIncomeYearIndex).toBe(1);
    expect(d.active.rows[0].wages).toBe(0);
    const match = d.actions.find((a) => a.category === 'match');
    expect(match).toBeDefined();
    expect(match!.detail).toContain('2027');
    expect(match!.amount).toBeCloseTo(0.02 * (d.active.rows[1].wages + d.active.rows[1].bonus), 4);
    expect(d.actions.some((a) => a.category === '401k' || a.category === 'match')).toBe(true);
    expect(d.tax.year).toBe(2027);
    expect(d.headline.year1TakeHome).toBe(d.active.rows[1].takeHome);
  });

  it('follows the order of operations with sequential ranks and amounts', () => {
    const s = fixtureState();
    s.debts = [{ id: 'cc', name: 'Card', kind: 'credit_card', balance: 4000, rate: 0.22 }];
    s.benefits.hsaEligible = true;
    s.savings.deferralPct = 0.02;
    const d = computeDerived(s, { skipMonteCarlo: true });
    const cats = d.actions.map((a) => a.category);
    expect(cats.slice(0, 5)).toEqual(['emergency', 'debt', 'match', 'hsa', 'ira']);
    d.actions.forEach((a, i) => expect(a.rank).toBe(i + 1));
    expect(d.actions[1].amount).toBe(4000);
    expect(d.actions[3].amount).toBe(4400);
    expect(d.actions[4].amount).toBe(7500);
    expect(d.actions.every((a) => a.id && a.title && a.detail)).toBe(true);
    expect(d.actions.some((a) => a.category === 'insurance')).toBe(true);
  });

  it('adds a loan-plan comparison for federal loans', () => {
    const s = fixtureState();
    s.debts = [{ id: 'fed', name: 'Direct loans', kind: 'federal_student', balance: 30000, rate: 0.0652, federalPlan: 'tiered_standard' }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    const loan = d.actions.find((a) => a.category === 'loans');
    expect(loan).toBeDefined();
    expect(loan!.title).toMatch(/Compare RAP vs tiered standard: RAP \$[\d,]+\/mo vs \$[\d,]+\/mo/);
  });
});
