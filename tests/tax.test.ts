import { describe, expect, it } from 'vitest';
import { computeTaxes, federalIncomeTax, ficaForEarner } from '../src/lib/tax';

describe('federal income tax 2026', () => {
  it('zero and first bracket', () => {
    expect(federalIncomeTax(0, 'single')).toBe(0);
    expect(federalIncomeTax(12_400, 'single')).toBeCloseTo(1_240, 6);
  });
  it('single $100,000 taxable', () => {
    // 1,240 + 0.12*(50,400-12,400) + 0.22*(100,000-50,400)
    expect(federalIncomeTax(100_000, 'single')).toBeCloseTo(1_240 + 4_560 + 10_912, 6);
  });
  it('MFJ $200,000 taxable', () => {
    // 2,480 + 0.12*(100,800-24,800) + 0.22*(200,000-100,800)
    expect(federalIncomeTax(200_000, 'mfj')).toBeCloseTo(2_480 + 9_120 + 21_824, 6);
  });
});

describe('FICA', () => {
  it('Social Security stops at the $184,500 wage base', () => {
    expect(ficaForEarner(100_000).ss).toBeCloseTo(6_200, 6);
    expect(ficaForEarner(300_000).ss).toBeCloseTo(184_500 * 0.062, 6);
    expect(ficaForEarner(300_000).medicare).toBeCloseTo(4_350, 6);
  });
  it('additional Medicare above $200k single', () => {
    const t = computeTaxes({ wages: 300_000, pretaxDeferral: 0, hsa: 0, spouseWages: 0, status: 'single', stateRate: 0 });
    expect(t.addlMedicare).toBeCloseTo(900, 6);
  });
  it('pre-tax deferrals reduce income tax but not FICA', () => {
    const a = computeTaxes({ wages: 150_000, pretaxDeferral: 0, hsa: 0, spouseWages: 0, status: 'single', stateRate: 0 });
    const b = computeTaxes({ wages: 150_000, pretaxDeferral: 24_500, hsa: 0, spouseWages: 0, status: 'single', stateRate: 0 });
    expect(b.federal).toBeLessThan(a.federal);
    expect(b.ss).toBe(a.ss);
    expect(b.taxableIncome).toBe(150_000 - 24_500 - 16_100);
  });
});
