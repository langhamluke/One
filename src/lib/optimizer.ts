import type { AssetClass, Holding, RiskProfile } from './types';

/**
 * Mean–variance ("Markowitz") optimizer over broad asset classes.
 *
 * Plain Markowitz is notorious for "error maximisation": tiny differences in forecast returns
 * push it into extreme, single-region portfolios. Like professional robo-advisors, we instead
 * use Black–Litterman *equilibrium* returns — the returns implied by how the world's investors
 * actually hold these assets — so the optimizer starts from a globally diversified baseline.
 *
 * Volatilities and correlations are rounded long-run figures. None of this is a prediction.
 */
export const OPT_CLASSES = ['usStocks', 'intlStocks', 'emStocks', 'bonds', 'cash', 'realEstate'] as const;
export type OptClass = (typeof OPT_CLASSES)[number];

export interface Assumptions {
  expectedReturn: Record<OptClass, number>;
  volatility: Record<OptClass, number>;
  /** Correlation matrix in OPT_CLASSES order. */
  correlation: number[][];
}

const VOLATILITY: Record<OptClass, number> = {
  usStocks: 0.16,
  intlStocks: 0.17,
  emStocks: 0.22,
  bonds: 0.06,
  cash: 0.005,
  realEstate: 0.19,
};

const CORRELATION = [
  // US   Intl  EM    Bond  Cash  REIT
  [1.0, 0.8, 0.7, 0.1, 0.0, 0.7],
  [0.8, 1.0, 0.8, 0.1, 0.0, 0.6],
  [0.7, 0.8, 1.0, 0.05, 0.0, 0.55],
  [0.1, 0.1, 0.05, 1.0, 0.1, 0.25],
  [0.0, 0.0, 0.0, 0.1, 1.0, 0.0],
  [0.7, 0.6, 0.55, 0.25, 0.0, 1.0],
];

/** Approximate share of each class in a global multi-asset "market portfolio". */
export const MARKET_WEIGHTS: Record<OptClass, number> = {
  usStocks: 0.38,
  intlStocks: 0.17,
  emStocks: 0.06,
  bonds: 0.33,
  cash: 0.03,
  realEstate: 0.03,
};

/** Cash yield used as the risk-free rate (roughly in line with T-bill / top HYSA yields in Oct 2026). */
export const RISK_FREE = 0.04;
/** Risk-aversion coefficient used to back out equilibrium returns (δ in Black–Litterman). */
export const RISK_AVERSION = 2.5;

/** Black–Litterman equilibrium returns: π = r_f + δ·Σ·w_market. */
export function impliedReturns(
  volatility = VOLATILITY,
  correlation = CORRELATION,
  weights = MARKET_WEIGHTS,
): Record<OptClass, number> {
  const w = OPT_CLASSES.map((c) => weights[c]);
  return Object.fromEntries(
    OPT_CLASSES.map((ci, i) => [
      ci,
      RISK_FREE +
        RISK_AVERSION *
          OPT_CLASSES.reduce((s, cj, j) => s + correlation[i][j] * volatility[ci] * volatility[cj] * w[j], 0),
    ]),
  ) as Record<OptClass, number>;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  expectedReturn: impliedReturns(),
  volatility: VOLATILITY,
  correlation: CORRELATION,
};

/** Per-class caps keep the optimizer diversified (cash belongs in savings, not the portfolio). */
export const DEFAULT_CAPS: Record<OptClass, number> = {
  usStocks: 0.65,
  intlStocks: 0.35,
  emStocks: 0.12,
  bonds: 0.7,
  cash: 0.1,
  realEstate: 0.1,
};

/** Suggested low-cost funds to implement each asset class. */
export const CLASS_FUNDS: Record<OptClass, string[]> = {
  usStocks: ['VTI', 'ITOT', 'FXAIX'],
  intlStocks: ['VXUS', 'IEFA', 'IXUS'],
  emStocks: ['VWO'],
  bonds: ['BND', 'AGG'],
  cash: ['SGOV', 'High-yield savings'],
  realEstate: ['VNQ'],
};

export const PROFILE_TARGET_VOL: Record<RiskProfile, number> = {
  cautious: 0.07,
  balanced: 0.1,
  growth: 0.13,
  aggressive: 0.155,
};

export type Weights = Record<OptClass, number>;

export interface PortfolioPoint {
  weights: Weights;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
}

export function covariance(a: Assumptions = DEFAULT_ASSUMPTIONS): number[][] {
  return OPT_CLASSES.map((ci, i) =>
    OPT_CLASSES.map((cj, j) => a.correlation[i][j] * a.volatility[ci] * a.volatility[cj]),
  );
}

const toVec = (w: Weights) => OPT_CLASSES.map((c) => w[c]);
const toWeights = (v: number[]) => Object.fromEntries(OPT_CLASSES.map((c, i) => [c, v[i]])) as Weights;

export function evaluate(w: Weights, a: Assumptions = DEFAULT_ASSUMPTIONS, cov = covariance(a)): PortfolioPoint {
  const v = toVec(w);
  const ret = OPT_CLASSES.reduce((s, c, i) => s + v[i] * a.expectedReturn[c], 0);
  let variance = 0;
  for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) variance += v[i] * v[j] * cov[i][j];
  const vol = Math.sqrt(Math.max(variance, 0));
  const rf = a.expectedReturn.cash;
  return { weights: w, expectedReturn: ret, volatility: vol, sharpe: vol > 1e-9 ? (ret - rf) / vol : 0 };
}

/**
 * Euclidean projection onto { w : sum(w) = 1, 0 <= w_i <= cap_i } via bisection on the shift τ.
 */
export function projectCappedSimplex(v: number[], caps: number[]): number[] {
  const f = (tau: number) => v.reduce((s, x, i) => s + Math.min(caps[i], Math.max(0, x - tau)), 0) - 1;
  let lo = Math.min(...v) - 1;
  let hi = Math.max(...v);
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const tau = (lo + hi) / 2;
  return v.map((x, i) => Math.min(caps[i], Math.max(0, x - tau)));
}

export interface OptimizeOptions {
  /** Max weight per asset class (forces diversification). */
  caps?: Record<OptClass, number>;
  assumptions?: Assumptions;
}

/** Minimise ½·wᵀΣw − λ·μᵀw over the capped simplex using projected gradient descent. */
function solve(lambda: number, cov: number[][], mu: number[], caps: number[]): number[] {
  const n = mu.length;
  // Lipschitz constant bound for the gradient (max row sum of |Σ|).
  const L = Math.max(...cov.map((row) => row.reduce((s, x) => s + Math.abs(x), 0)));
  const step = 1 / L;
  let w = projectCappedSimplex(new Array(n).fill(1 / n), caps);
  for (let iter = 0; iter < 4000; iter++) {
    const grad = cov.map((row, i) => row.reduce((s, x, j) => s + x * w[j], 0) - lambda * mu[i]);
    const next = projectCappedSimplex(
      w.map((x, i) => x - step * grad[i]),
      caps,
    );
    const delta = next.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
    w = next;
    if (delta < 1e-10) break;
  }
  return w;
}

export function efficientFrontier(opts: OptimizeOptions = {}): PortfolioPoint[] {
  const a = opts.assumptions ?? DEFAULT_ASSUMPTIONS;
  const capMap = opts.caps ?? DEFAULT_CAPS;
  const cov = covariance(a);
  const mu = OPT_CLASSES.map((c) => a.expectedReturn[c]);
  const caps = OPT_CLASSES.map((c) => capMap[c]);
  const points: PortfolioPoint[] = [];
  // λ spaced geometrically from pure min-variance to pure max-return.
  const lambdas = [0, ...Array.from({ length: 45 }, (_, k) => 0.002 * Math.pow(1.22, k))];
  for (const lambda of lambdas) {
    const w = solve(lambda, cov, mu, caps);
    points.push(evaluate(toWeights(roundWeights(w, caps)), a, cov));
  }
  // De-duplicate and keep the frontier monotone in volatility.
  points.sort((p, q) => p.volatility - q.volatility);
  const frontier: PortfolioPoint[] = [];
  for (const p of points) {
    const last = frontier[frontier.length - 1];
    if (!last || (p.volatility - last.volatility > 1e-4 && p.expectedReturn > last.expectedReturn + 1e-5)) frontier.push(p);
  }
  return frontier;
}

/** Drop dust weights (<0.25%) and hand their mass to positions that still have room under the cap. */
function roundWeights(w: number[], caps: number[]): number[] {
  const r = w.map((x) => (x < 0.0025 ? 0 : x));
  const deficit = 1 - r.reduce((a, b) => a + b, 0);
  const room = r.map((x, i) => (x > 0 ? Math.max(0, caps[i] - x) : 0));
  const totalRoom = room.reduce((a, b) => a + b, 0);
  return totalRoom > 0 ? r.map((x, i) => x + (deficit * room[i]) / totalRoom) : r;
}

/**
 * Share of total portfolio risk (variance) that comes from each asset class:
 * RC_i = w_i · (Σw)_i / wᵀΣw. These sum to 1 and often surprise people — a 60/40 portfolio
 * gets ~90% of its risk from the stocks.
 */
export function riskContributions(w: Weights, a: Assumptions = DEFAULT_ASSUMPTIONS): Weights {
  const cov = covariance(a);
  const v = toVec(w);
  const marginal = cov.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
  const variance = v.reduce((s, x, i) => s + x * marginal[i], 0);
  return toWeights(v.map((x, i) => (variance > 0 ? (x * marginal[i]) / variance : 0)));
}

/** A rough "bad year" (1-in-20) return under a normal approximation: μ − 1.645σ. */
export const badYear = (p: Pick<PortfolioPoint, 'expectedReturn' | 'volatility'>) => p.expectedReturn - 1.645 * p.volatility;

export function minVolatility(frontier: PortfolioPoint[]): PortfolioPoint {
  return frontier[0];
}

export function maxReturn(frontier: PortfolioPoint[]): PortfolioPoint {
  return frontier[frontier.length - 1];
}

export function maxSharpe(frontier: PortfolioPoint[]): PortfolioPoint {
  return frontier.reduce((best, p) => (p.sharpe > best.sharpe ? p : best), frontier[0]);
}

/** Pick the frontier portfolio whose volatility is closest to the risk profile's comfort level. */
export function portfolioForProfile(frontier: PortfolioPoint[], profile: RiskProfile): PortfolioPoint {
  const target = PROFILE_TARGET_VOL[profile];
  return frontier.reduce((best, p) =>
    Math.abs(p.volatility - target) < Math.abs(best.volatility - target) ? p : best,
  );
}

export interface CurrentMix {
  weights: Weights;
  /** Dollars in each optimizer class. */
  dollars: Weights;
  investable: number;
  /** Dollars held in assets the optimizer doesn't model (crypto, commodities). */
  excluded: number;
}

export function currentMix(holdings: Holding[]): CurrentMix {
  const dollars = Object.fromEntries(OPT_CLASSES.map((c) => [c, 0])) as Weights;
  let excluded = 0;
  for (const h of holdings) {
    if (h.value <= 0) continue;
    const expSum = Object.values(h.exposure).reduce((s, x) => s + (x ?? 0), 0) || 1;
    for (const [cls, x] of Object.entries(h.exposure) as [AssetClass, number][]) {
      const amt = (h.value * x) / expSum;
      if ((OPT_CLASSES as readonly string[]).includes(cls)) dollars[cls as OptClass] += amt;
      else excluded += amt;
    }
  }
  const investable = OPT_CLASSES.reduce((s, c) => s + dollars[c], 0);
  const weights = Object.fromEntries(
    OPT_CLASSES.map((c) => [c, investable ? dollars[c] / investable : 0]),
  ) as Weights;
  return { weights, dollars, investable, excluded };
}

export interface Trade {
  cls: OptClass;
  current: number;
  target: number;
  /** Positive = buy, negative = sell. */
  amount: number;
}

/** Full rebalance: what to buy and sell so `investable` dollars match the target weights. */
export function rebalanceTrades(mix: CurrentMix, target: Weights, minTrade = 1): Trade[] {
  return OPT_CLASSES.map((cls) => {
    const goal = target[cls] * mix.investable;
    return { cls, current: mix.dollars[cls], target: goal, amount: goal - mix.dollars[cls] };
  }).filter((t) => Math.abs(t.amount) >= minTrade);
}

/**
 * "Rebalance with new money": split a new contribution across the most underweight classes
 * so the portfolio drifts toward target without selling anything (no taxes, no fees).
 */
export function contributionPlan(mix: CurrentMix, target: Weights, contribution: number): Trade[] {
  const newTotal = mix.investable + contribution;
  const gaps = OPT_CLASSES.map((cls) => ({ cls, gap: Math.max(0, target[cls] * newTotal - mix.dollars[cls]) }));
  const totalGap = gaps.reduce((s, g) => s + g.gap, 0);
  return gaps
    .map(({ cls, gap }) => {
      const amount = totalGap > 0 ? (gap / totalGap) * contribution : target[cls] * contribution;
      return { cls, current: mix.dollars[cls], target: target[cls] * newTotal, amount };
    })
    .filter((t) => t.amount >= 0.5);
}

/** Deterministic PRNG so projections are stable between renders and testable. */
export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export interface ProjectionYear {
  year: number;
  contributed: number;
  p10: number;
  p50: number;
  p90: number;
}

/**
 * Monte-Carlo projection with lognormal annual returns and monthly contributions.
 * Returns the 10th/50th/90th percentile outcomes for each year.
 */
export function projectGrowth(params: {
  start: number;
  monthly: number;
  years: number;
  expectedReturn: number;
  volatility: number;
  paths?: number;
  seed?: number;
}): ProjectionYear[] {
  const { start, monthly, years, expectedReturn, volatility, paths = 2000, seed = 42 } = params;
  const rand = mulberry32(seed);
  // Lognormal parameters so the arithmetic mean annual return equals expectedReturn.
  const sigma = Math.sqrt(Math.log(1 + (volatility * volatility) / Math.pow(1 + expectedReturn, 2)));
  const mu = Math.log(1 + expectedReturn) - (sigma * sigma) / 2;
  const values: number[][] = Array.from({ length: years + 1 }, () => []);
  for (let p = 0; p < paths; p++) {
    let v = start;
    values[0].push(v);
    for (let y = 1; y <= years; y++) {
      const annual = Math.exp(mu + sigma * normal(rand));
      const monthlyGrowth = Math.pow(annual, 1 / 12);
      for (let m = 0; m < 12; m++) v = v * monthlyGrowth + monthly;
      values[y].push(v);
    }
  }
  return values.map((vals, year) => {
    vals.sort((x, y) => x - y);
    const q = (f: number) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))];
    return { year, contributed: start + monthly * 12 * year, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
  });
}
