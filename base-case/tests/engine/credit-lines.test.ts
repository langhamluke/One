import { describe, expect, it } from 'vitest';
import { defaultTermMonths, effectivePlan, initialMonthlyPayment, simulateDebts, type LoanInput } from '../../shared/lib/loans';
import { computeDerived } from '../../shared/lib/engine';
import { defaultPlanState } from '../../shared/lib/inputs';
import { PLAYBOOK } from '../../shared/data/playbook';

const yearCtx = (n: number) => Array.from({ length: n }, (_, i) => ({ yearIndex: i, year: 2026 + i, agi: 80000, dependents: 0, householdSize: 1, inflation: 0.025 }));

describe('SBLOC and HELOC debts', () => {
  it('SBLOC is interest-only: the balance does not fall without extra payments', () => {
    const d: LoanInput = { id: 's', name: 'SBLOC', kind: 'sbloc', balance: 50000, rate: 0.07 };
    expect(effectivePlan(d)).toBe('interest_only');
    expect(initialMonthlyPayment(d, { agi: 0, dependents: 0, householdSize: 1 })).toBeCloseTo((50000 * 0.07) / 12, 6);
    const res = simulateDebts([d], yearCtx(3));
    expect(res[2].totalBalance).toBeCloseTo(50000, 2);
    expect(res[0].interest).toBeCloseTo(3500, 0);
  });

  it('SBLOC principal falls with an extra payment', () => {
    const d: LoanInput = { id: 's', name: 'SBLOC', kind: 'sbloc', balance: 50000, rate: 0.07, extraPayment: 1000 };
    const res = simulateDebts([d], yearCtx(1));
    expect(res[0].totalBalance).toBeCloseTo(38000, 0);
  });

  it('HELOC amortizes over 20 years by default', () => {
    const d: LoanInput = { id: 'h', name: 'HELOC', kind: 'heloc', balance: 40000, rate: 0.07 };
    expect(defaultTermMonths(d)).toBe(240);
    expect(effectivePlan(d)).toBe('amortizing');
    expect(initialMonthlyPayment(d, { agi: 0, dependents: 0, householdSize: 1 })).toBeCloseTo(310.12, 1);
  });

  it('raises the SBLOC caution above 50% of the taxable portfolio and the HELOC advisory', () => {
    const s = defaultPlanState();
    s.balanceSheet.taxable = 60000;
    s.debts = [
      { id: 's', name: 'Portfolio line', kind: 'sbloc', balance: 40000, rate: 0.072 },
      { id: 'h', name: 'Home equity line', kind: 'heloc', balance: 25000, rate: 0.075 },
    ];
    const d = computeDerived(s, { sims: 100 });
    const sb = d.alerts.find((a) => a.id === 'sbloc-risk');
    expect(sb?.severity).toBe('caution');
    expect(d.alerts.some((a) => a.id === 'heloc-risk')).toBe(true);
  });

  it('playbook covers SBLOC and HELOC', () => {
    expect(PLAYBOOK.some((t) => t.key === 'sbloc')).toBe(true);
    expect(PLAYBOOK.some((t) => t.key === 'heloc')).toBe(true);
  });
});
