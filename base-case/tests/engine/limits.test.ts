import { describe, expect, it } from 'vitest';
import { annualAdditionsLimit, applySection415c, compensationCap, deferralLimit, employerContributions, hsaLimit, iraLimit, rothIraAllowed, tradIraDeductible } from '../../shared/lib/limits';

describe('deferral limit', () => {
  it('applies the age-50 and 60-63 catch-ups (super replaces age-50)', () => {
    expect(deferralLimit(49).total).toBe(24500);
    expect(deferralLimit(50).total).toBe(32500);
    expect(deferralLimit(59).total).toBe(32500);
    expect(deferralLimit(60).total).toBe(35750);
    expect(deferralLimit(63).total).toBe(35750);
    expect(deferralLimit(64).total).toBe(32500);
    expect(deferralLimit(60).catchUpKind).toBe('age60to63');
    expect(deferralLimit(64).catchUpKind).toBe('age50');
  });
  it('indexes future years in $500 steps', () => {
    expect(deferralLimit(30, 2027, 0.025).base).toBe(25000);
    expect(deferralLimit(30, 2030, 0.03).base % 500).toBe(0);
  });
});

describe('§415(c) and §401(a)(17)', () => {
  it('never exceeds the annual additions limit across a pay sweep with 15% employer', () => {
    const limit = annualAdditionsLimit(2026);
    expect(limit).toBe(72000);
    for (let pay = 100000; pay <= 600000; pay += 25000) {
      const employer = 0.15 * Math.min(pay, compensationCap(2026));
      const r = applySection415c(24500, employer, pay, 2026);
      expect(r.total).toBeLessThanOrEqual(limit + 1e-9);
      expect(r.employee).toBeCloseTo(24500, 6);
      if (24500 + employer > limit) {
        expect(r.capped).toBe(true);
        expect(r.employer).toBeCloseTo(limit - 24500, 6);
      } else {
        expect(r.capped).toBe(false);
        expect(r.employer).toBeCloseTo(employer, 6);
      }
    }
  });
  it('keeps catch-ups outside the limit and caps at 100% of pay', () => {
    const r = applySection415c(32500, 50000, 500000, 2026, { catchUpExcluded: 8000 });
    expect(r.employee).toBe(32500);
    expect(r.employer).toBeCloseTo(72000 - 24500, 6);
    const low = applySection415c(10000, 5000, 12000, 2026);
    expect(low.total).toBeLessThanOrEqual(12000);
    expect(low.capped).toBe(true);
  });
  it('caps compensation at §401(a)(17)', () => {
    expect(compensationCap(2026)).toBe(360000);
    const ec = employerContributions({ pay: 500000, deferralPct: 0.06, benefits: { matchRate: 1, matchCapPct: 0.04, nonElectivePct: 0.03, studentLoanMatch: false } });
    expect(ec.eligiblePay).toBe(360000);
    expect(ec.match).toBeCloseTo(0.04 * 360000, 6);
    expect(ec.nonElective).toBeCloseTo(0.03 * 360000, 6);
  });
});

describe('IRA limits and Roth phase-out', () => {
  it('has the base and catch-up IRA limit', () => {
    expect(iraLimit(30).total).toBe(7500);
    expect(iraLimit(50).total).toBe(8600);
  });
  it('single: full / partial / none with $10 round-up and $200 minimum', () => {
    expect(rothIraAllowed(150000, 'single', 2026, 7500)).toMatchObject({ allowed: 7500, status: 'full' });
    expect(rothIraAllowed(168000, 'single', 2026, 7500)).toMatchObject({ allowed: 0, status: 'none' });
    expect(rothIraAllowed(160500, 'single', 2026, 7500)).toMatchObject({ allowed: 3750, status: 'partial' });
    // 7500 * 11999/15000 = 5999.5 -> rounds UP to 6000
    expect(rothIraAllowed(156001, 'single', 2026, 7500)).toMatchObject({ allowed: 6000, status: 'partial' });
    // 7500 * 100/15000 = 50 -> $200 minimum
    expect(rothIraAllowed(167900, 'single', 2026, 7500)).toMatchObject({ allowed: 200, status: 'partial' });
  });
  it('MFJ: full / partial / none', () => {
    expect(rothIraAllowed(241999, 'mfj', 2026, 7500)).toMatchObject({ allowed: 7500, status: 'full' });
    expect(rothIraAllowed(247000, 'mfj', 2026, 7500)).toMatchObject({ allowed: 3750, status: 'partial' });
    expect(rothIraAllowed(252000, 'mfj', 2026, 7500)).toMatchObject({ allowed: 0, status: 'none' });
    expect(rothIraAllowed(251900, 'mfj', 2026, 7500).allowed).toBe(200);
  });
  it('traditional IRA deductibility phases out only when covered by a plan', () => {
    expect(tradIraDeductible(7500, 200000, 'single', false)).toBe(7500);
    expect(tradIraDeductible(7500, 86000, 'single', true)).toBe(3750);
    expect(tradIraDeductible(7500, 91000, 'single', true)).toBe(0);
  });
});

describe('HSA limits', () => {
  it('uses 2026 and 2027 published values, then indexes', () => {
    expect(hsaLimit('self', 30, 2026).total).toBe(4400);
    expect(hsaLimit('family', 30, 2026).total).toBe(8750);
    expect(hsaLimit('self', 30, 2027).total).toBe(4500);
    expect(hsaLimit('family', 30, 2027).total).toBe(9000);
    expect(hsaLimit('self', 55, 2026).total).toBe(5400);
    expect(hsaLimit('family', 56, 2027).total).toBe(10000);
    expect(hsaLimit('self', 30, 2028, 0.025).total).toBe(4600);
  });
});

describe('employer match formula', () => {
  const benefits = { matchRate: 1, matchCapPct: 0.04, nonElectivePct: 0, studentLoanMatch: false };
  it('matches up to the cap', () => {
    expect(employerContributions({ pay: 100000, deferralPct: 0.03, benefits }).match).toBeCloseTo(3000, 6);
    expect(employerContributions({ pay: 100000, deferralPct: 0.06, benefits }).match).toBeCloseTo(4000, 6);
    expect(employerContributions({ pay: 100000, deferralPct: 0.1, benefits: { ...benefits, matchRate: 0.5, matchCapPct: 0.06 } }).match).toBeCloseTo(3000, 6);
    expect(employerContributions({ pay: 0, deferralPct: 0.1, benefits }).total).toBe(0);
  });
  it('counts student-loan payments as deferrals when the plan adopts §110', () => {
    const r = employerContributions({ pay: 100000, deferralPct: 0, benefits: { ...benefits, studentLoanMatch: true }, studentLoanPayments: 5000 });
    expect(r.match).toBeCloseTo(4000, 6);
    expect(r.loanMatch).toBeCloseTo(4000, 6);
    const r2 = employerContributions({ pay: 100000, deferralPct: 0.02, benefits: { ...benefits, studentLoanMatch: true }, studentLoanPayments: 1000 });
    expect(r2.match).toBeCloseTo(3000, 6);
    expect(r2.loanMatch).toBeCloseTo(1000, 6);
    const off = employerContributions({ pay: 100000, deferralPct: 0, benefits, studentLoanPayments: 5000 });
    expect(off.match).toBe(0);
  });
});
