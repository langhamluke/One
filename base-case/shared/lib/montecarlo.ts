/**
 * Monte Carlo projection of the investable portfolio.
 *
 *  - mulberry32 seeded PRNG, Box-Muller (polar form) normals, Cholesky factor of CORRELATION (positive-definite check; on failure
 *    1e-6 jitter is added to the diagonal and a flag recorded).
 *  - Per asset class lognormal: sigma^2 = ln(1 + vol^2 / (1+m)^2), mu = ln(1+m) - sigma^2/2, so the arithmetic mean of
 *    the simple return equals the CMA's `ret`. Annual rebalance to that year's glide-path allocation.
 *  - One shared step() is used by the deterministic path and every simulation, so at zero volatility the Monte Carlo
 *    bands reproduce the deterministic path exactly.
 *  - Success = the demanded retirement withdrawal is covered every year to life expectancy.
 * Inner loops use typed arrays and allocate nothing per sim-year.
 */
import { ASSET_CLASSES, type Allocation, type AssetClass } from './types';
import type { CMAEntry } from './inputs';
import { CORRELATION } from '../data/cma';
import type { MonteCarloResult } from './derived';

const N_ASSETS = ASSET_CLASSES.length;

/** mulberry32: small, fast, seedable 32-bit PRNG returning [0, 1). */
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

/** Standard normal generator: Box-Muller in polar (Marsaglia) form, no trig, caches the second draw. */
export function normalGenerator(rng: () => number): () => number {
  let spare = 0;
  let hasSpare = false;
  return () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = 2 * rng() - 1;
      v = 2 * rng() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mag = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mag;
    hasSpare = true;
    return u * mag;
  };
}

export interface CholeskyResult {
  /** Lower-triangular factor, row-major n x n */
  L: Float64Array;
  n: number;
  jittered: boolean;
}

/** Cholesky factor of a symmetric matrix. Adds 1e-6 to the diagonal (and flags it) if the matrix is not positive-definite. */
export function cholesky(matrix: number[][]): CholeskyResult {
  const n = matrix.length;
  const attempt = (jitter: number): Float64Array | null => {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = matrix[i][j] + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) {
          if (s <= 0 || !Number.isFinite(s)) return null;
          L[i * n + j] = Math.sqrt(s);
        } else {
          L[i * n + j] = s / L[j * n + j];
        }
      }
    }
    return L;
  };
  const clean = attempt(0);
  if (clean) return { L: clean, n, jittered: false };
  const jit = attempt(1e-6);
  if (jit) return { L: jit, n, jittered: true };
  // Last resort: identity (independent draws)
  const I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  return { L: I, n, jittered: true };
}

export interface LognormalParams {
  mu: Float64Array;
  sigma: Float64Array;
  mean: Float64Array;
}

export function lognormalParams(cma: Record<AssetClass, CMAEntry>): LognormalParams {
  const mu = new Float64Array(N_ASSETS);
  const sigma = new Float64Array(N_ASSETS);
  const mean = new Float64Array(N_ASSETS);
  for (let j = 0; j < N_ASSETS; j++) {
    const e = cma[ASSET_CLASSES[j]] ?? { ret: 0, vol: 0 };
    const m = Math.max(-0.99, e.ret);
    const v = Math.max(0, e.vol);
    const s2 = Math.log(1 + (v * v) / ((1 + m) * (1 + m)));
    sigma[j] = Math.sqrt(s2);
    mu[j] = Math.log(1 + m) - s2 / 2;
    mean[j] = m;
  }
  return { mu, sigma, mean };
}

export function weightsOf(alloc: Allocation): Float64Array {
  const w = new Float64Array(N_ASSETS);
  let s = 0;
  for (let j = 0; j < N_ASSETS; j++) {
    w[j] = Math.max(0, alloc[ASSET_CLASSES[j]] ?? 0);
    s += w[j];
  }
  if (s > 0 && Math.abs(s - 1) > 1e-9) for (let j = 0; j < N_ASSETS; j++) w[j] /= s;
  return w;
}

/**
 * One year of portfolio evolution: grow at the weighted asset returns (annual rebalance to `weights`), then add the
 * year-end contribution and take the withdrawal. Never below zero.
 */
export function step(balance: number, weights: Float64Array, returns: Float64Array, withdrawal: number, contribution: number): number {
  let r = 0;
  for (let j = 0; j < N_ASSETS; j++) r += weights[j] * returns[j];
  const b = balance * (1 + r) + contribution - withdrawal;
  return b > 0 ? b : 0;
}

export interface MonteCarloInput {
  startBalance: number;
  /** Per plan year, nominal */
  contributions: ArrayLike<number>;
  /** Per plan year, nominal (demanded) */
  withdrawals: ArrayLike<number>;
  /** Per plan year allocation (annual rebalance target) */
  allocations: Allocation[];
  ages: number[];
  cma: Record<AssetClass, CMAEntry>;
  inflation: number;
  sims: number;
  seed: number;
  /** Row index of the first retirement year (success is judged from here) */
  retirementIndex: number;
  retirementAge: number;
  targetIncomeReal: number;
  skip?: boolean;
}

export interface MonteCarloOutput extends MonteCarloResult {
  flags: string[];
}

function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = p * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const t = pos - lo;
  return sorted[lo] + t * (sorted[hi] - sorted[lo]);
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloOutput {
  const years = input.ages.length;
  const flags: string[] = [];
  const params = lognormalParams(input.cma);
  const W: Float64Array[] = input.allocations.map(weightsOf);
  const contrib = new Float64Array(years);
  const withdraw = new Float64Array(years);
  for (let i = 0; i < years; i++) {
    contrib[i] = Number.isFinite(input.contributions[i]) ? input.contributions[i] : 0;
    withdraw[i] = Number.isFinite(input.withdrawals[i]) ? Math.max(0, input.withdrawals[i]) : 0;
  }
  const start = Math.max(0, Number.isFinite(input.startBalance) ? input.startBalance : 0);
  const deflator = new Float64Array(years);
  for (let i = 0; i < years; i++) deflator[i] = Math.pow(1 + input.inflation, i);
  const retIdx = Math.min(years - 1, Math.max(0, input.retirementIndex));

  // Deterministic path at expected (arithmetic) returns, using the shared step.
  const deterministic = new Array<number>(years);
  let detFail = false;
  {
    let b = start;
    for (let i = 0; i < years; i++) {
      if (i >= retIdx && withdraw[i] > 0) {
        let r = 0;
        for (let j = 0; j < N_ASSETS; j++) r += W[i][j] * params.mean[j];
        if (b * (1 + r) + contrib[i] < withdraw[i] - 1e-6) detFail = true;
      }
      b = step(b, W[i], params.mean, withdraw[i], contrib[i]);
      deterministic[i] = b;
    }
  }

  const sims = input.skip ? 0 : Math.max(0, Math.floor(input.sims));
  const ages = input.ages.slice();
  if (sims === 0) {
    const real = deterministic.map((v, i) => v / deflator[i]);
    return {
      ages,
      p10: deterministic.slice(),
      p50: deterministic.slice(),
      p90: deterministic.slice(),
      p10Real: real.slice(),
      p50Real: real.slice(),
      p90Real: real.slice(),
      successProbability: detFail ? 0 : 1,
      medianAtRetirement: deterministic[retIdx] ?? 0,
      medianAtRetirementReal: real[retIdx] ?? 0,
      targetIncomeReal: input.targetIncomeReal,
      deterministic,
      sims: 0,
      seed: input.seed,
      retirementAge: input.retirementAge,
      flags,
    };
  }

  const chol = cholesky(CORRELATION);
  if (chol.jittered) flags.push('correlation-jittered');
  const L = chol.L;
  const n = N_ASSETS;
  const rng = mulberry32(input.seed);
  const normal = normalGenerator(rng);
  const eps = new Float64Array(n);
  const z = new Float64Array(n);
  const ret = new Float64Array(n);
  const balances = new Float64Array(sims * years);
  let successes = 0;

  for (let s = 0; s < sims; s++) {
    let b = start;
    let failed = false;
    const base = s * years;
    for (let i = 0; i < years; i++) {
      for (let j = 0; j < n; j++) eps[j] = normal();
      for (let j = 0; j < n; j++) {
        let acc = 0;
        const row = j * n;
        for (let k = 0; k <= j; k++) acc += L[row + k] * eps[k];
        z[j] = acc;
      }
      for (let j = 0; j < n; j++) {
        const sg = params.sigma[j];
        ret[j] = sg === 0 ? params.mean[j] : Math.exp(params.mu[j] + sg * z[j]) - 1;
      }
      const w = W[i];
      if (!failed && i >= retIdx && withdraw[i] > 0) {
        let r = 0;
        for (let j = 0; j < n; j++) r += w[j] * ret[j];
        if (b * (1 + r) + contrib[i] < withdraw[i] - 1e-6) failed = true;
      }
      b = step(b, w, ret, withdraw[i], contrib[i]);
      balances[base + i] = b;
    }
    if (!failed) successes++;
  }

  const p10 = new Array<number>(years);
  const p50 = new Array<number>(years);
  const p90 = new Array<number>(years);
  const col = new Float64Array(sims);
  for (let i = 0; i < years; i++) {
    for (let s = 0; s < sims; s++) col[s] = balances[s * years + i];
    col.sort();
    p10[i] = percentile(col, 0.1);
    p50[i] = percentile(col, 0.5);
    p90[i] = percentile(col, 0.9);
  }
  const p10Real = p10.map((v, i) => v / deflator[i]);
  const p50Real = p50.map((v, i) => v / deflator[i]);
  const p90Real = p90.map((v, i) => v / deflator[i]);

  return {
    ages,
    p10,
    p50,
    p90,
    p10Real,
    p50Real,
    p90Real,
    successProbability: successes / sims,
    medianAtRetirement: p50[retIdx] ?? 0,
    medianAtRetirementReal: p50Real[retIdx] ?? 0,
    targetIncomeReal: input.targetIncomeReal,
    deterministic,
    sims,
    seed: input.seed,
    retirementAge: input.retirementAge,
    flags,
  };
}
