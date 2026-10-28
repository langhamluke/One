import { describe, expect, it } from 'vitest';
import { CMA_DEFAULT, CORRELATION } from '../src/data/cma';
import { MODELS } from '../src/data/models';
import { cholesky, deterministicPath, expectedReturn, mulberry32, runMonteCarlo, type MCInput } from '../src/lib/montecarlo';
import type { AssetClass } from '../src/lib/types';

const T = 35;
const alloc = MODELS.Assertive['Long-term'];
const baseInput = (over: Partial<MCInput> = {}): MCInput => ({
  startBalance: 50_000,
  allocations: Array(T).fill(alloc),
  contributions: Array(T).fill(20_000),
  withdrawals: Array(T).fill(0),
  retireIndex: T,
  cma: CMA_DEFAULT,
  nSims: 1000,
  seed: 42,
  ...over,
});

describe('PRNG & linear algebra', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(7), b = mulberry32(7);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('Cholesky reproduces the correlation matrix', () => {
    const L = cholesky(CORRELATION);
    const n = L.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += L[i][k] * L[j][k];
        expect(s).toBeCloseTo(CORRELATION[i][j], 10);
      }
  });
});

describe('Monte Carlo', () => {
  it('same seed → identical result', () => {
    const a = runMonteCarlo(baseInput());
    const b = runMonteCarlo(baseInput());
    expect(a.bands).toEqual(b.bands);
    expect(a.successProb).toBe(b.successProb);
  });
  it('different seed → different result', () => {
    const a = runMonteCarlo(baseInput());
    const b = runMonteCarlo(baseInput({ seed: 43 }));
    expect(a.bands[T].p50).not.toBe(b.bands[T].p50);
  });
  it('at zero volatility every path equals the deterministic projection', () => {
    const zeroVol = Object.fromEntries(Object.entries(CMA_DEFAULT).map(([k, v]) => [k, { ...v, vol: 0 }])) as Record<AssetClass, { mean: number; vol: number }>;
    const inp = baseInput({ cma: zeroVol, nSims: 50 });
    const mc = runMonteCarlo(inp);
    const det = deterministicPath(inp);
    for (let t = 0; t <= T; t++) {
      expect(mc.bands[t].p50).toBeCloseTo(det[t], 4);
      expect(mc.bands[t].p10).toBeCloseTo(det[t], 4);
      expect(mc.bands[t].p90).toBeCloseTo(det[t], 4);
    }
  });
  it('median with volatility lands near (below) the deterministic arithmetic path', () => {
    const inp = baseInput({ nSims: 2000 });
    const mc = runMonteCarlo(inp);
    const det = deterministicPath(inp);
    const ratio = mc.bands[T].p50 / det[T];
    expect(ratio).toBeGreaterThan(0.75); // volatility drag lowers the median vs. the arithmetic path
    expect(ratio).toBeLessThan(1.02);
    expect(mc.bands[T].p10).toBeLessThan(mc.bands[T].p50);
    expect(mc.bands[T].p90).toBeGreaterThan(mc.bands[T].p50);
  });
  it('success probability responds to withdrawals', () => {
    const accum = 20, dec = 30;
    const mk = (wd: number) => baseInput({
      allocations: Array(accum + dec).fill(alloc),
      contributions: [...Array(accum).fill(20_000), ...Array(dec).fill(0)],
      withdrawals: [...Array(accum).fill(0), ...Array(dec).fill(wd)],
      retireIndex: accum,
    });
    const easy = runMonteCarlo(mk(10_000)).successProb;
    const hard = runMonteCarlo(mk(200_000)).successProb;
    expect(easy).toBeGreaterThan(0.95);
    expect(hard).toBeLessThan(0.2);
  });
  it('expected return is the weighted mean', () => {
    const r = expectedReturn({ usLarge: 100, usSmallMid: 0, intlDev: 0, emerging: 0, usAgg: 0, tips: 0, cash: 0 }, CMA_DEFAULT);
    expect(r).toBeCloseTo(CMA_DEFAULT.usLarge.mean, 10);
  });
});
