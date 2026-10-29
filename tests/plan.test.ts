import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../src/data/personas';
import { computePlan, monteCarloFor } from '../src/lib/plan';

describe('end-to-end plan for each demo persona', () => {
  for (const persona of PERSONAS) {
    it(`${persona.label}: produces a coherent plan`, () => {
      const s = persona.make();
      const plan = computePlan(s, s.activePath);
      expect(plan.rows.length).toBe(plan.retireAge - s.profile.age);
      for (const r of plan.rows) {
        expect(Number.isFinite(r.balances.total)).toBe(true);
        expect(r.employeeDeferral + r.company).toBeLessThanOrEqual(72_000 * r.index + 1e-6);
      }
      expect(plan.retirement.deterministicNominal).toBeGreaterThan(0);
      const mc = monteCarloFor(plan, { ...s, assumptions: { ...s.assumptions, nSims: 200 } });
      expect(mc.atRetirement.p10).toBeLessThan(mc.atRetirement.p90);
      expect(mc.successProb).toBeGreaterThanOrEqual(0);
      expect(mc.successProb).toBeLessThanOrEqual(1);
    });
  }
  it('Fresh CFI on Envoy → AA hits §415(c) later in career', () => {
    const s = PERSONAS[0].make();
    const plan = computePlan(s, 'envoy-aa');
    expect(plan.firstSpill).not.toBeNull();
    expect(plan.bindPay415).toBeCloseTo(263_889, 0);
  });
  it('FedEx legacy pension accrues for the cargo FO', () => {
    const s = PERSONAS[2].make();
    const plan = computePlan(s, 'stay');
    expect(plan.retirement.pensionNominal).toBeGreaterThan(0);
    const mbcb = computePlan({ ...s, assumptions: { ...s.assumptions, fedexOption: 'mbcb' } }, 'stay');
    expect(mbcb.rows.at(-1)!.balances.mbcb).toBeGreaterThan(0);
    expect(mbcb.retirement.pensionNominal).toBeLessThan(plan.retirement.pensionNominal);
  });
});

describe('Steve Jobs test client', () => {
  it('reproduces the reviewed plan', () => {
    const s = PERSONAS.find((p) => p.id === 'stevejobs')!.make();
    const plan = computePlan(s, s.activePath);
    expect(plan.score.risk).toBe(16);
    expect(plan.risk).toBe('Moderate');
    expect(plan.horizon).toBe('Long-term');
    expect(plan.efMonths).toBe(9);
    expect(plan.career.waypoints.map((w) => w.label)).toEqual(['CFI', 'RGNL FO', 'CA UPGRADE', 'HIRED UAL', 'UAL CA', 'AGE 65']);
    expect(plan.firstNegativeCash).toBeNull();
  });
});

describe('Senior captain about to retire', () => {
  it('is a widebody captain now and lands at 60', () => {
    const s = PERSONAS.find((p) => p.id === 'ca59')!.make();
    const plan = computePlan(s, s.activePath);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ airline: 'american', seat: 'CA', fleet: 'WB' });
    expect(plan.rows[0].catchUp).toBeGreaterThan(0); // age 59: age-50 catch-up
    expect(plan.risk).toBe('Moderate');
    expect(plan.horizon).toBe('Intermediate');
  });
});
