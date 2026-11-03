import { describe, expect, it } from 'vitest';
import { cholesky, mulberry32, normalGenerator, runMonteCarlo, step, weightsOf, type MonteCarloInput } from '../../shared/lib/montecarlo';
import { CORRELATION } from '../../shared/data/cma';
import { allocationFromEquity } from '../../shared/data/models';
import { defaultAssumptions } from '../../shared/lib/inputs';
import { ASSET_CLASSES } from '../../shared/lib/types';

function input(over: Partial<MonteCarloInput> = {}): MonteCarloInput {
  const years = 40;
  const ages = Array.from({ length: years }, (_, i) => 60 + i);
  return {
    startBalance: 500000,
    contributions: new Array(years).fill(0),
    withdrawals: new Array(years).fill(0).map((_, i) => (i >= 5 ? 40000 : 0)),
    allocations: ages.map(() => allocationFromEquity(0.6)),
    ages,
    cma: defaultAssumptions().cma,
    inflation: 0.025,
    sims: 500,
    seed: 42,
    retirementIndex: 5,
    retirementAge: 65,
    targetIncomeReal: 40000,
    ...over,
  };
}

describe('Monte Carlo', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = runMonteCarlo(input());
    const b = runMonteCarlo(input());
    expect(a.p50).toEqual(b.p50);
    expect(a.p10).toEqual(b.p10);
    expect(a.successProbability).toBe(b.successProbability);
    const c = runMonteCarlo(input({ seed: 7 }));
    expect(c.p50).not.toEqual(a.p50);
    expect(a.sims).toBe(500);
    expect(a.ages.length).toBe(40);
    expect(a.p10Real[10]).toBeCloseTo(a.p10[10] / Math.pow(1.025, 10), 6);
  });

  it('reproduces the deterministic path exactly at zero volatility', () => {
    const cma = defaultAssumptions().cma;
    for (const k of ASSET_CLASSES) cma[k] = { ret: cma[k].ret, vol: 0 };
    const r = runMonteCarlo(input({ cma, sims: 50 }));
    expect(r.p10).toEqual(r.deterministic);
    expect(r.p50).toEqual(r.deterministic);
    expect(r.p90).toEqual(r.deterministic);
    expect(r.medianAtRetirement).toBe(r.deterministic[5]);
  });

  it('lowers the success probability when withdrawals rise', () => {
    const base = runMonteCarlo(input());
    const heavy = runMonteCarlo(input({ withdrawals: new Array(40).fill(0).map((_, i) => (i >= 5 ? 80000 : 0)) }));
    expect(base.successProbability).toBeGreaterThan(0.2);
    expect(heavy.successProbability).toBeLessThan(base.successProbability);
    expect(heavy.p50[39]).toBeLessThanOrEqual(base.p50[39]);
    const none = runMonteCarlo(input({ withdrawals: new Array(40).fill(0) }));
    expect(none.successProbability).toBe(1);
  });

  it('orders the bands and keeps balances non-negative', () => {
    const r = runMonteCarlo(input());
    for (let i = 0; i < 40; i++) {
      expect(r.p10[i]).toBeLessThanOrEqual(r.p50[i]);
      expect(r.p50[i]).toBeLessThanOrEqual(r.p90[i]);
      expect(r.p10[i]).toBeGreaterThanOrEqual(0);
    }
    expect(r.p50[3]).toBeGreaterThan(500000);
  });

  it('skips simulation on request and returns the deterministic path as bands', () => {
    const r = runMonteCarlo(input({ skip: true }));
    expect(r.sims).toBe(0);
    expect(r.p50).toEqual(r.deterministic);
    expect([0, 1]).toContain(r.successProbability);
  });

  it('Cholesky reproduces the correlation matrix', () => {
    const { L, n, jittered } = cholesky(CORRELATION);
    expect(jittered).toBe(false);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += L[i * n + k] * L[j * n + k];
        expect(s).toBeCloseTo(CORRELATION[i][j], 12);
      }
    }
    const bad = cholesky([
      [1, 1.2],
      [1.2, 1],
    ]);
    expect(bad.jittered).toBe(true);
  });

  it('PRNG and normals behave', () => {
    const rng = mulberry32(123);
    const xs = Array.from({ length: 1000 }, () => rng());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mulberry32(123)()).toBe(xs[0]);
    const normal = normalGenerator(mulberry32(9));
    const zs = Array.from({ length: 20000 }, () => normal());
    const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
    const varc = zs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / zs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(varc - 1)).toBeLessThan(0.05);
  });

  it('step grows, contributes at year end and floors at zero', () => {
    const w = weightsOf(allocationFromEquity(1));
    const r = new Float64Array(ASSET_CLASSES.length).fill(0.1);
    expect(step(100, w, r, 0, 10)).toBeCloseTo(120, 10);
    expect(step(100, w, r, 500, 0)).toBe(0);
  });
});
