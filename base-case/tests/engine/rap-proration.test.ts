import { describe, expect, it } from 'vitest';
import { rapMonthlyPayment, simulateDebts, type LoanInput, type LoanYearContext } from '../../shared/lib/loans';

function years(n: number, agi: number): LoanYearContext[] {
  return Array.from({ length: n }, (_, i) => ({ yearIndex: i, year: 2026 + i, agi, dependents: 0, householdSize: 1, inflation: 0.025 }));
}

const base = (id: string, balance: number): LoanInput => ({
  id,
  name: id,
  kind: 'federal_student',
  balance,
  rate: 0.065,
  federalPlan: 'rap',
  legacyBorrower: true,
  originalBalance: balance,
});

describe('RAP is one payment per borrower', () => {
  it('two loans on RAP together pay the same scheduled amount as one loan with the combined balance', () => {
    const agi = 60000;
    const monthly = rapMonthlyPayment(agi, 0); // AGI $60,000 sits in the 'over $50k up to $60k' tier: 5% -> $250/mo
    expect(monthly).toBeCloseTo(250, 6);
    const two = simulateDebts([base('a', 20000), base('b', 10000)], years(1, agi));
    const one = simulateDebts([base('c', 30000)], years(1, agi));
    expect(two[0].scheduled).toBeCloseTo(monthly * 12, 2);
    expect(one[0].scheduled).toBeCloseTo(monthly * 12, 2);
    // The $50/mo principal match is also per borrower, so principal paid matches too (within rounding)
    expect(two[0].principal).toBeCloseTo(one[0].principal, 0);
  });

  it('prorates the payment by balance across the RAP loans', () => {
    const agi = 60000;
    const res = simulateDebts([base('a', 20000), base('b', 10000)], years(1, agi));
    const a = res[0].lines.find((l) => l.id === 'a')!;
    const b = res[0].lines.find((l) => l.id === 'b')!;
    expect(a.paid).toBeGreaterThan(b.paid);
    expect(a.paid / (a.paid + b.paid)).toBeCloseTo(2 / 3, 1);
  });

  it('a RAP loan next to a standard loan still pays the full borrower RAP amount on the RAP loan', () => {
    const agi = 60000;
    const std: LoanInput = { ...base('s', 11000), federalPlan: 'standard' };
    const res = simulateDebts([base('r', 12000), std], years(1, agi));
    const r = res[0].lines.find((l) => l.id === 'r')!;
    expect(r.paid).toBeCloseTo(rapMonthlyPayment(agi, 0) * 12, 2);
  });
});
