import { describe, expect, it } from 'vitest';
import { federalIncomeTax, fica, ltcgTax, marginalFederalRate, standardDeduction, stateTax, stateTaxFromPreset, studentLoanInterestDeduction, wageBase } from '../../shared/lib/tax';
import { sourced } from '../../shared/lib/types';
import type { StateTax } from '../../shared/data/states';

describe('federal income tax', () => {
  it('matches the bracket edges for single filers (2026)', () => {
    expect(federalIncomeTax(0, 'single')).toBe(0);
    expect(federalIncomeTax(12400, 'single')).toBeCloseTo(1240, 6);
    expect(federalIncomeTax(50400, 'single')).toBeCloseTo(1240 + 0.12 * 38000, 6);
    expect(federalIncomeTax(105700, 'single')).toBeCloseTo(5800 + 0.22 * 55300, 6);
    expect(federalIncomeTax(201775, 'single')).toBeCloseTo(17966 + 0.24 * 96075, 6);
    expect(federalIncomeTax(105701, 'single') - federalIncomeTax(105700, 'single')).toBeCloseTo(0.24, 6);
    expect(federalIncomeTax(12401, 'single') - federalIncomeTax(12400, 'single')).toBeCloseTo(0.12, 6);
  });
  it('matches the bracket edges for MFJ (2026)', () => {
    expect(federalIncomeTax(24800, 'mfj')).toBeCloseTo(2480, 6);
    expect(federalIncomeTax(100800, 'mfj')).toBeCloseTo(2480 + 0.12 * 76000, 6);
    expect(federalIncomeTax(211400, 'mfj')).toBeCloseTo(11600 + 0.22 * 110600, 6);
    expect(federalIncomeTax(1000000, 'mfj')).toBeCloseTo(
      2480 + 0.12 * 76000 + 0.22 * 110600 + 0.24 * (403550 - 211400) + 0.32 * (512450 - 403550) + 0.35 * (768700 - 512450) + 0.37 * (1000000 - 768700),
      4,
    );
  });
  it('reports the marginal rate at the edge and just past it', () => {
    expect(marginalFederalRate(12400, 'single')).toBe(0.1);
    expect(marginalFederalRate(12401, 'single')).toBe(0.12);
    expect(marginalFederalRate(50401, 'single')).toBe(0.22);
    expect(marginalFederalRate(5e6, 'single')).toBe(0.37);
  });
  it('indexes thresholds and the standard deduction for later years', () => {
    expect(standardDeduction('single', 2026)).toBe(16100);
    expect(standardDeduction('single', 2027, 0.025)).toBe(16500);
    expect(standardDeduction('mfj', 2026)).toBe(32200);
    // same taxable income is taxed less in a later year when brackets widen
    expect(federalIncomeTax(60000, 'single', 2030, 0.03)).toBeLessThan(federalIncomeTax(60000, 'single', 2026));
  });
});

describe('FICA', () => {
  it('uses the 2026 wage base', () => {
    const f = fica(200000, 'single', 2026);
    expect(f.wageBase).toBe(184500);
    expect(f.oasdi).toBeCloseTo(0.062 * 184500, 6);
    expect(f.medicare).toBeCloseTo(0.0145 * 200000, 6);
    expect(f.additionalMedicare).toBe(0);
    expect(f.total).toBeCloseTo(f.oasdi + f.medicare, 6);
  });
  it('uses the 2027 wage base and indexes later years', () => {
    expect(fica(200000, 'single', 2027).oasdi).toBeCloseTo(0.062 * 192300, 6);
    expect(wageBase(2027)).toBe(192300);
    expect(wageBase(2028, 0.025)).toBe(197100);
    expect(wageBase(2024)).toBe(176100);
  });
  it('applies Additional Medicare above the statutory thresholds', () => {
    expect(fica(250000, 'single', 2026).additionalMedicare).toBeCloseTo(0.009 * 50000, 6);
    expect(fica(250000, 'mfj', 2026).additionalMedicare).toBe(0);
    expect(fica(300000, 'mfj', 2026).additionalMedicare).toBeCloseTo(0.009 * 50000, 6);
  });
  it('exempts OASDI for non-covered pension jobs', () => {
    const f = fica(100000, 'single', 2026, { oasdiExempt: true });
    expect(f.oasdi).toBe(0);
    expect(f.medicare).toBeCloseTo(1450, 6);
  });
});

describe('state tax', () => {
  it("handles 'none', 'flat' and 'CUSTOM'", () => {
    expect(stateTax(100000, 'TX', 'single')).toBe(0);
    expect(stateTax(100000, 'CO', 'single')).toBeCloseTo(4400, 6);
    expect(stateTax(100000, 'CUSTOM', 'single', { customRate: 0.03 })).toBeCloseTo(3000, 6);
    expect(stateTax(100000, 'ZZ', 'single')).toBe(0);
  });
  it('handles graduated brackets with a standard deduction', () => {
    const preset: StateTax = {
      type: 'brackets',
      single: sourced([{ upTo: 10000, rate: 0.02 }, { upTo: Infinity, rate: 0.05 }], 'fixture', '2026-01', true),
      mfj: sourced([{ upTo: 20000, rate: 0.02 }, { upTo: Infinity, rate: 0.05 }], 'fixture', '2026-01', true),
      standardDeductionSingle: 5000,
      standardDeductionMfj: 10000,
    };
    expect(stateTaxFromPreset(25000, preset, 'single')).toBeCloseTo(10000 * 0.02 + 10000 * 0.05, 6);
    expect(stateTaxFromPreset(25000, preset, 'mfj')).toBeCloseTo(15000 * 0.02, 6);
    expect(stateTaxFromPreset(3000, preset, 'single')).toBe(0);
  });
  it('interpolates an effective-rate curve', () => {
    const preset: StateTax = {
      type: 'effective',
      curve: sourced([{ income: 0, rate: 0 }, { income: 100000, rate: 0.05 }, { income: 200000, rate: 0.06 }], 'fixture', '2026-01', false),
      note: 'fixture',
    };
    expect(stateTaxFromPreset(50000, preset, 'single')).toBeCloseTo(0.025 * 50000, 6);
    expect(stateTaxFromPreset(150000, preset, 'single')).toBeCloseTo(0.055 * 150000, 6);
    expect(stateTaxFromPreset(400000, preset, 'single')).toBeCloseTo(0.06 * 400000, 6);
  });
  it('flat presets honour an optional standard deduction', () => {
    const preset: StateTax = { type: 'flat', rate: sourced(0.05, 'fixture', '2026-01', true), standardDeductionSingle: 10000 };
    expect(stateTaxFromPreset(30000, preset, 'single')).toBeCloseTo(1000, 6);
  });
});

describe('other deductions', () => {
  it('computes LTCG stacking across 0/15/20', () => {
    expect(ltcgTax(10000, 20000, 'single')).toBe(0);
    expect(ltcgTax(10000, 45000, 'single')).toBeCloseTo(0.15 * (55000 - 49450), 6);
    expect(ltcgTax(100000, 600000, 'single')).toBeCloseTo(0.2 * 100000, 6);
  });
  it('phases out the student loan interest deduction', () => {
    expect(studentLoanInterestDeduction(3000, 50000, 'single')).toBe(2500);
    expect(studentLoanInterestDeduction(1000, 92500, 'single')).toBeCloseTo(500, 6);
    expect(studentLoanInterestDeduction(2500, 100000, 'single')).toBe(0);
    expect(studentLoanInterestDeduction(2500, 190000, 'mfj')).toBeCloseTo(1250, 6);
  });
});
