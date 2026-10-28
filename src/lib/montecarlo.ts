import { CORRELATION } from '../data/cma';
import type { CMA } from '../data/cma';
import { ASSET_ORDER } from './glidepath';
import type { Allocation, AssetClass } from './types';

/** Mulberry32 — small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalGen(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

/** Cholesky decomposition (lower triangular) of a symmetric positive-definite matrix. */
export function cholesky(m: number[][]): number[][] {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('Correlation matrix is not positive definite');
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Arithmetic expected portfolio return for an allocation (weights in %). */
export function expectedReturn(a: Allocation, cma: Record<AssetClass, CMA>): number {
  return ASSET_ORDER.reduce((s, k) => s + (a[k] / 100) * cma[k].mean, 0);
}

export function portfolioVol(a: Allocation, cma: Record<AssetClass, CMA>, corr = CORRELATION): number {
  let v = 0;
  for (let i = 0; i < ASSET_ORDER.length; i++)
    for (let j = 0; j < ASSET_ORDER.length; j++) {
      const ki = ASSET_ORDER[i], kj = ASSET_ORDER[j];
      v += (a[ki] / 100) * (a[kj] / 100) * cma[ki].vol * cma[kj].vol * corr[i][j];
    }
  return Math.sqrt(v);
}

export interface MCInput {
  startBalance: number;
  /** Per-year allocations (length T) */
  allocations: Allocation[];
  /** Added at the end of year t (length T) */
  contributions: number[];
  /** Withdrawn at the start of year t (length T) */
  withdrawals: number[];
  /** Index of the first decumulation year (failure only counts from here) */
  retireIndex: number;
  cma: Record<AssetClass, CMA>;
  corr?: number[][];
  nSims: number;
  seed: number;
}

export interface Percentiles { p10: number; p50: number; p90: number }

export interface MCResult {
  /** Balance percentiles at each time point (length T+1; index 0 = start) */
  bands: Percentiles[];
  successProb: number;
  atRetirement: Percentiles;
  nSims: number;
  seed: number;
}

export function percentile(sorted: Float64Array | number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** One step of the projection: withdraw at start, grow, contribute at end. Shared by deterministic & MC paths. */
export function step(balance: number, r: number, contribution: number, withdrawal: number): number {
  return Math.max(0, balance - withdrawal) * (1 + r) + contribution;
}

export function runMonteCarlo(inp: MCInput): MCResult {
  const T = inp.allocations.length;
  const nA = ASSET_ORDER.length;
  const L = cholesky(inp.corr ?? CORRELATION);
  const mu = new Float64Array(nA), sd = new Float64Array(nA);
  ASSET_ORDER.forEach((k, i) => {
    const m = inp.cma[k].mean, v = inp.cma[k].vol;
    const s2 = Math.log(1 + (v * v) / ((1 + m) * (1 + m)));
    mu[i] = Math.log(1 + m) - s2 / 2;
    sd[i] = Math.sqrt(s2);
  });
  const W = inp.allocations.map((a) => ASSET_ORDER.map((k) => a[k] / 100));

  const rng = mulberry32(inp.seed);
  const gauss = normalGen(rng);
  const cols: Float64Array[] = Array.from({ length: T + 1 }, () => new Float64Array(inp.nSims));
  const z = new Float64Array(nA), y = new Float64Array(nA);
  let successes = 0;

  for (let s = 0; s < inp.nSims; s++) {
    let bal = inp.startBalance;
    cols[0][s] = bal;
    let failed = false;
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < nA; i++) z[i] = gauss();
      for (let i = 0; i < nA; i++) {
        let acc = 0;
        for (let k = 0; k <= i; k++) acc += L[i][k] * z[k];
        y[i] = acc;
      }
      let r = 0;
      const w = W[t];
      for (let i = 0; i < nA; i++) if (w[i] !== 0) r += w[i] * (Math.exp(mu[i] + sd[i] * y[i]) - 1);
      const wd = inp.withdrawals[t] ?? 0;
      if (t >= inp.retireIndex && wd > 0 && bal < wd) failed = true;
      bal = step(bal, r, inp.contributions[t] ?? 0, wd);
      cols[t + 1][s] = bal;
    }
    if (!failed) successes++;
  }

  const bands = cols.map((c) => {
    const sorted = Float64Array.from(c).sort();
    return { p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9) };
  });
  return {
    bands,
    successProb: inp.nSims > 0 ? successes / inp.nSims : 0,
    atRetirement: bands[Math.min(inp.retireIndex, T)],
    nSims: inp.nSims,
    seed: inp.seed,
  };
}

/** Deterministic projection with expected returns (same step function as MC). */
export function deterministicPath(inp: Omit<MCInput, 'nSims' | 'seed' | 'corr'>): number[] {
  const out = [inp.startBalance];
  let bal = inp.startBalance;
  for (let t = 0; t < inp.allocations.length; t++) {
    bal = step(bal, expectedReturn(inp.allocations[t], inp.cma), inp.contributions[t] ?? 0, inp.withdrawals[t] ?? 0);
    out.push(bal);
  }
  return out;
}
