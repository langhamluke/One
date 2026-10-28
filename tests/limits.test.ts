import { describe, expect, it } from 'vitest';
import { IRS_2026 } from '../src/data/irs2026';
import { catchUpLimit, catchUpMustBeRoth, computeDC, hsaLimit, payWhere415cBinds, rothIraEligibility } from '../src/lib/limits';

const dc = (pay: number, over: Partial<Parameters<typeof computeDC>[0]> = {}) =>
  computeDC({ pay, age: 35, deferralRate: 1, companyRate: 0.18, excessHandling: 'cash', ...over });

describe('§415(c) annual additions', () => {
  it('bind point with 18% company + $24,500 deferral is ≈ $264k', () => {
    const p = payWhere415cBinds(0.18);
    expect(p).toBeCloseTo((72_000 - 24_500) / 0.18, 6);
    expect(Math.round(p)).toBe(263_889);
  });

  it('$200k pay: no spillover', () => {
    const r = dc(200_000);
    expect(r.employeeDeferral).toBe(24_500);
    expect(r.companyIntended).toBe(36_000);
    expect(r.companyContribution).toBe(36_000);
    expect(r.excess).toBe(0);
    expect(r.bound415c).toBe(false);
    expect(r.annualAdditions).toBe(60_500);
  });

  it('$264k pay: cap just binds (≈$20 spill)', () => {
    const r = dc(264_000);
    expect(r.companyIntended).toBeCloseTo(47_520, 6);
    expect(r.annualAdditions).toBe(72_000);
    expect(r.excess).toBeCloseTo(20, 6);
    expect(r.bound415c).toBe(true);
  });

  it('$300k pay: $6,500 spills', () => {
    const r = dc(300_000);
    expect(r.companyIntended).toBe(54_000);
    expect(r.companyContribution).toBe(47_500);
    expect(r.excess).toBe(6_500);
    expect(r.annualAdditions).toBe(72_000);
  });

  it('$400k pay: 401(a)(17) caps comp at $360k, $17,300 spills', () => {
    const r = dc(400_000);
    expect(r.compBase).toBe(360_000);
    expect(r.capped401a17).toBe(true);
    expect(r.companyIntended).toBe(64_800);
    expect(r.companyContribution).toBe(47_500);
    expect(r.excess).toBe(17_300);
    expect(r.annualAdditions).toBe(72_000);
  });

  it('total additions never exceed the limit (sweep $0–$1M, 0–30% company, 0–100% deferral)', () => {
    for (let pay = 0; pay <= 1_000_000; pay += 7_919) {
      for (const companyRate of [0, 0.05, 0.1, 0.16, 0.18, 0.2, 0.3]) {
        for (const deferralRate of [0, 0.05, 0.1, 0.25, 1]) {
          const r = computeDC({ pay, age: 40, deferralRate, companyRate, excessHandling: 'cash' });
          expect(r.annualAdditions).toBeLessThanOrEqual(IRS_2026.annualAdditions415c + 1e-9);
          expect(r.employeeDeferral).toBeLessThanOrEqual(IRS_2026.electiveDeferral);
          expect(r.companyContribution + r.excess).toBeCloseTo(r.companyIntended, 6);
        }
      }
    }
  });

  it('catch-up sits outside §415(c)', () => {
    const r = dc(400_000, { age: 52 });
    expect(r.catchUp).toBe(8_000);
    expect(r.annualAdditions).toBe(72_000);
  });
});

describe('§401(a)(17) compensation cap', () => {
  it('company contribution base is capped at $360k', () => {
    expect(dc(500_000, { companyRate: 0.1 }).compBase).toBe(360_000);
    expect(dc(500_000, { companyRate: 0.1 }).companyIntended).toBe(36_000);
    expect(dc(359_000, { companyRate: 0.1 }).compBase).toBe(359_000);
    expect(dc(359_000, { companyRate: 0.1 }).capped401a17).toBe(false);
  });
});

describe('catch-ups', () => {
  it('age-based catch-up amounts', () => {
    expect(catchUpLimit(49)).toBe(0);
    expect(catchUpLimit(50)).toBe(8_000);
    expect(catchUpLimit(59)).toBe(8_000);
    expect(catchUpLimit(60)).toBe(11_250);
    expect(catchUpLimit(63)).toBe(11_250);
    expect(catchUpLimit(64)).toBe(8_000);
  });
  it('Roth catch-up required above $150k prior-year FICA wages', () => {
    expect(catchUpMustBeRoth(150_000)).toBe(false);
    expect(catchUpMustBeRoth(150_001)).toBe(true);
  });
});

describe('Roth IRA phase-out', () => {
  it('single: full / partial / none', () => {
    expect(rothIraEligibility(140_000, 'single')).toMatchObject({ status: 'full', allowed: 7_500 });
    const mid = rothIraEligibility(160_500, 'single');
    expect(mid.status).toBe('partial');
    expect(mid.allowed).toBe(3_750);
    expect(rothIraEligibility(168_000, 'single')).toMatchObject({ status: 'none', allowed: 0 });
  });
  it('MFJ: full / partial / none', () => {
    expect(rothIraEligibility(241_999, 'mfj').status).toBe('full');
    const mid = rothIraEligibility(247_000, 'mfj');
    expect(mid.status).toBe('partial');
    expect(mid.allowed).toBe(3_750);
    expect(rothIraEligibility(260_000, 'mfj').status).toBe('none');
  });
});

describe('HSA', () => {
  it('2026 limits', () => {
    expect(hsaLimit(false, 40)).toBe(4_400);
    expect(hsaLimit(true, 40)).toBe(8_750);
    expect(hsaLimit(true, 55)).toBe(9_750);
  });
});
