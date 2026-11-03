import { describe, expect, it } from 'vitest';
import { LoanSimulator, ibrMonthlyPayment, levelPayment, rapMonthlyPayment, simulateDebts, tieredStandardTermMonths, type LoanInput, type LoanYearContext } from '../../shared/lib/loans';
import { computeDerived } from '../../shared/lib/engine';
import { fixtureState } from './fixtures';

function years(n: number, agi: number, extra: Partial<LoanYearContext> = {}): LoanYearContext[] {
  return Array.from({ length: n }, (_, i) => ({ yearIndex: i, year: 2026 + i, agi, dependents: 0, householdSize: 1, inflation: 0, ...extra }));
}

describe('standard amortization', () => {
  it('$30,000 at 6.52% over 10 years is about $341/month and pays off exactly', () => {
    const pmt = levelPayment(30000, 0.0652, 120);
    expect(Math.abs(pmt - 341)).toBeLessThan(1);
    const debt: LoanInput = { id: 'fed', name: 'Federal', kind: 'federal_student', balance: 30000, rate: 0.0652, federalPlan: 'standard' };
    const res = simulateDebts([debt], years(11, 60000));
    expect(res[0].debtService).toBeCloseTo(pmt * 12, 2);
    expect(res[9].totalBalance).toBeCloseTo(0, 2);
    expect(res[10].debtService).toBe(0);
    const totalPaid = res.reduce((s, r) => s + r.debtService, 0);
    const totalInterest = res.reduce((s, r) => s + r.interest, 0);
    expect(totalPaid).toBeCloseTo(pmt * 120, 0);
    expect(totalInterest).toBeCloseTo(pmt * 120 - 30000, 0);
    expect(res[9].paidOff).toContain('fed');
  });

  it('zero-rate loans amortize linearly and payment overrides win', () => {
    expect(levelPayment(12000, 0, 12)).toBe(1000);
    const debt: LoanInput = { id: 'a', name: 'Auto', kind: 'auto', balance: 12000, rate: 0.05, payment: 500 };
    const res = simulateDebts([debt], years(3, 50000));
    expect(res[0].scheduled).toBeCloseTo(6000, 6);
  });

  it('honours grace months (interest accrues, no payments)', () => {
    const debt: LoanInput = { id: 'g', name: 'Grace', kind: 'federal_student', balance: 10000, rate: 0.06, graceMonths: 6 };
    const res = simulateDebts([debt], years(2, 50000));
    expect(res[0].scheduled).toBeGreaterThan(0);
    const pmt = levelPayment(10000 * Math.pow(1 + 0.06 / 12, 6), 0.06, 120);
    expect(res[0].scheduled).toBeCloseTo(pmt * 6, 4);
  });

  it('credit cards pay 3% of balance with a $25 floor', () => {
    const card: LoanInput = { id: 'c', name: 'Card', kind: 'credit_card', balance: 1000, rate: 0.24 };
    const sim = new LoanSimulator([card]);
    const r = sim.stepYear(years(1, 50000)[0]);
    expect(r.scheduled).toBeGreaterThan(25 * 12);
    expect(r.scheduled).toBeLessThan(30 * 12);
    expect(r.totalBalance).toBeLessThan(1000);
  });
});

describe('tiered standard', () => {
  it('selects the term by amount borrowed', () => {
    expect(tieredStandardTermMonths(24999)).toBe(120);
    expect(tieredStandardTermMonths(25000)).toBe(180);
    expect(tieredStandardTermMonths(50000)).toBe(240);
    expect(tieredStandardTermMonths(100000)).toBe(300);
    expect(tieredStandardTermMonths(99999)).toBe(240);
  });
  it('uses originalBalance for the term', () => {
    const d: LoanInput = { id: 't', name: 'T', kind: 'federal_student', balance: 20000, originalBalance: 60000, rate: 0.06, federalPlan: 'tiered_standard' };
    const res = simulateDebts([d], years(1, 50000));
    expect(res[0].scheduled).toBeCloseTo(levelPayment(20000, 0.06, 240) * 12, 4);
  });
});

describe('RAP', () => {
  it('computes the payment examples', () => {
    expect(rapMonthlyPayment(45000, 0)).toBeCloseTo(150, 6);
    expect(rapMonthlyPayment(9000, 0)).toBe(10);
    expect(rapMonthlyPayment(70000, 2)).toBeCloseTo(250, 6);
    expect(rapMonthlyPayment(70001, 0)).toBeCloseTo((0.07 * 70001) / 12, 6);
    expect(rapMonthlyPayment(20000, 5)).toBe(10);
  });
  it('matches principal so the balance falls by at least $50 a month and never grows', () => {
    const d: LoanInput = { id: 'r', name: 'RAP', kind: 'federal_student', balance: 20000, rate: 0.06, federalPlan: 'rap' };
    const res = simulateDebts([d], years(1, 9000));
    expect(res[0].debtService).toBeCloseTo(120, 6);
    expect(res[0].rapMatch).toBeCloseTo(600, 6);
    expect(res[0].totalBalance).toBeCloseTo(19400, 6);
    const d2: LoanInput = { id: 'r2', name: 'RAP', kind: 'federal_student', balance: 50000, rate: 0.08, federalPlan: 'rap' };
    const res2 = simulateDebts([d2], years(5, 20000));
    let prev = 50000;
    for (const r of res2) {
      expect(r.totalBalance).toBeLessThanOrEqual(prev);
      prev = r.totalBalance;
    }
    expect(res2[0].interest).toBeLessThanOrEqual(res2[0].scheduled);
  });
  it('forgives the remaining balance after 360 payments and flags it', () => {
    const d: LoanInput = { id: 'rf', name: 'RAP', kind: 'federal_student', balance: 200000, rate: 0.07, federalPlan: 'rap' };
    const res = simulateDebts([d], years(31, 20000));
    expect(res[28].forgiven).toBe(0);
    expect(res[29].forgiven).toBeCloseTo(200000 - 50 * 360, 2);
    expect(res[29].flags).toContain('rap-forgiveness:rf');
    expect(res[30].totalBalance).toBe(0);
  });
});

describe('IBR', () => {
  it('caps the payment at the 10-year standard payment', () => {
    expect(ibrMonthlyPayment(200000, 1, 2026)).toBeGreaterThan(1000);
    const d: LoanInput = { id: 'i', name: 'IBR', kind: 'federal_student', balance: 10000, rate: 0.05, federalPlan: 'ibr', legacyBorrower: true };
    const res = simulateDebts([d], years(1, 200000));
    expect(res[0].scheduled).toBeCloseTo(levelPayment(10000, 0.05, 120) * 12, 4);
  });
  it('allows negative amortization and forgives after 20 years', () => {
    const d: LoanInput = { id: 'i2', name: 'IBR', kind: 'federal_student', balance: 50000, rate: 0.06, federalPlan: 'ibr', legacyBorrower: true };
    const res = simulateDebts([d], years(21, 0));
    expect(res[0].scheduled).toBe(0);
    expect(res[0].totalBalance).toBeGreaterThan(50000);
    expect(res[19].forgiven).toBeGreaterThan(50000);
    expect(res[19].flags).toContain('ibr-forgiveness:i2');
    expect(res[20].totalBalance).toBe(0);
  });
  it('flags IBR for non-legacy borrowers', () => {
    const d: LoanInput = { id: 'i3', name: 'IBR', kind: 'federal_student', balance: 10000, rate: 0.06, federalPlan: 'ibr' };
    const res = simulateDebts([d], years(1, 30000));
    expect(res[0].flags).toContain('ibr-not-legacy:i3');
  });
});

describe('extras, employer repayment and snowball', () => {
  it('applies extra payments and employer repayment to student loans', () => {
    const d: LoanInput = { id: 'e', name: 'Fed', kind: 'federal_student', balance: 30000, rate: 0.06, extraPayment: 100 };
    const res = simulateDebts([d], years(1, 60000, { employerLoanRepayment: 5250 }));
    expect(res[0].extraPrincipal).toBeCloseTo(1200, 6);
    expect(res[0].employerPaid).toBeCloseTo(5250, 6);
    expect(res[0].debtService).toBeCloseTo(res[0].scheduled + 1200, 6);
    expect(res[0].studentLoanPayments).toBeCloseTo(res[0].debtService, 6);
    const auto: LoanInput = { id: 'au', name: 'Auto', kind: 'auto', balance: 10000, rate: 0.05 };
    const res2 = simulateDebts([auto], years(1, 60000, { employerLoanRepayment: 5250 }));
    expect(res2[0].employerPaid).toBe(0);
  });

  it('snowballs: a paid-off loan frees its payment into the ledger surplus', () => {
    const s = fixtureState();
    s.debts = [{ id: 'p', name: 'Personal', kind: 'personal', balance: 9000, rate: 0.08, termMonths: 36 }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    const rows = d.active.rows;
    expect(rows[2].debtService).toBeGreaterThan(0);
    expect(rows[3].debtService).toBe(0);
    expect(rows[2].debtBalance).toBeCloseTo(0, 1);
    expect(rows[3].unallocated - rows[2].unallocated).toBeGreaterThan(rows[2].debtService * 0.5);
    expect(d.active.debtFreeAge).toBe(24);
    expect(d.debt.payoffAge).toBe(24);
    expect(d.debt.totalInterest).toBeGreaterThan(0);
    expect(d.debt.monthlyPayment).toBeCloseTo(levelPayment(9000, 0.08, 36), 4);
  });

  it('reports no debt-free age when debts outlive the projection', () => {
    const s = fixtureState();
    s.debts = [{ id: 'x', name: 'Forever', kind: 'other', balance: 100000, rate: 0.1, payment: 10 }];
    const d = computeDerived(s, { skipMonteCarlo: true });
    expect(d.active.debtFreeAge).toBeNull();
  });
});
