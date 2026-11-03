import { describe, expect, it } from 'vitest';
import { aimeFromRows, claimAdjustmentFactor, estimateSocialSecurity, piaFromAime } from '../../shared/lib/ss';
import { BEND_POINTS } from '../../shared/data/ss';
import { defaultPlanState } from '../../shared/lib/inputs';

describe('Social Security', () => {
  const bp = BEND_POINTS[2026].value;
  it('applies the PIA formula at the bend points', () => {
    expect(piaFromAime(0)).toBe(0);
    expect(piaFromAime(bp.first)).toBeCloseTo(0.9 * bp.first, 8);
    expect(piaFromAime(bp.second)).toBeCloseTo(0.9 * bp.first + 0.32 * (bp.second - bp.first), 8);
    expect(piaFromAime(10000)).toBeCloseTo(0.9 * bp.first + 0.32 * (bp.second - bp.first) + 0.15 * (10000 - bp.second), 8);
  });
  it('adjusts for claim age (62 -> 0.70, 70 -> 1.24 with FRA 67)', () => {
    expect(claimAdjustmentFactor(62)).toBeCloseTo(0.7, 10);
    expect(claimAdjustmentFactor(64)).toBeCloseTo(0.8, 10);
    expect(claimAdjustmentFactor(65)).toBeCloseTo(1 - 24 * (5 / 9 / 100), 10);
    expect(claimAdjustmentFactor(67)).toBe(1);
    expect(claimAdjustmentFactor(70)).toBeCloseTo(1.24, 10);
    expect(claimAdjustmentFactor(75)).toBeCloseTo(1.24, 10);
    expect(claimAdjustmentFactor(55)).toBeCloseTo(0.7, 10);
  });
  it('computes AIME from the highest 35 years of deflated, capped earnings', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ yearIndex: i, wages: 60000 }));
    expect(aimeFromRows(rows, 0).aime).toBeCloseTo((60000 * 35) / 420, 8);
    const infl = Array.from({ length: 40 }, (_, i) => ({ yearIndex: i, wages: 60000 * Math.pow(1.025, i) }));
    expect(aimeFromRows(infl, 0.025).aime).toBeCloseTo((60000 * 35) / 420, 6);
    const capped = Array.from({ length: 35 }, (_, i) => ({ yearIndex: i, wages: 1e6 }));
    expect(aimeFromRows(capped, 0).aime).toBeCloseTo(184500 / 12, 8);
    const notCovered = rows.map((r) => ({ ...r, coveredBySS: false }));
    expect(aimeFromRows(notCovered, 0).aime).toBe(0);
  });
  it('estimates, overrides and reports none', () => {
    const s = defaultPlanState();
    s.assumptions.inflation = 0;
    const rows = Array.from({ length: 40 }, (_, i) => ({ yearIndex: i, wages: 60000 }));
    const est = estimateSocialSecurity(s, rows);
    expect(est.method).toBe('estimated');
    expect(est.aime).toBeCloseTo(5000, 8);
    expect(est.pia).toBeCloseTo(piaFromAime(5000), 8);
    expect(est.annualAtClaim).toBeCloseTo(est.pia * 12, 6);
    s.assumptions.ssClaimAge = 62;
    expect(estimateSocialSecurity(s, rows).annualAtClaim).toBeCloseTo(est.pia * 12 * 0.7, 6);
    s.assumptions.ssClaimAge = 67;
    s.assumptions.ssHaircut = 0.23;
    expect(estimateSocialSecurity(s, rows).annualAtClaim).toBeCloseTo(est.pia * 12 * 0.77, 6);
    s.assumptions.ssHaircut = 0;
    s.assumptions.ssOverrideAnnual = 30000;
    const ov = estimateSocialSecurity(s, rows);
    expect(ov.method).toBe('override');
    expect(ov.annualAtClaim).toBe(30000);
    s.assumptions.ssOverrideAnnual = undefined;
    expect(estimateSocialSecurity(s, []).method).toBe('none');
  });
});
