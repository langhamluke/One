import { describe, expect, it } from 'vitest';
import { findSecurity } from '../data/securities';
import { analyzePortfolio, feeDrag } from './portfolio';
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_CAPS,
  OPT_CLASSES,
  contributionPlan,
  covariance,
  currentMix,
  efficientFrontier,
  evaluate,
  maxSharpe,
  portfolioForProfile,
  projectCappedSimplex,
  projectGrowth,
  rebalanceTrades,
  riskContributions,
} from './optimizer';
import { analyzeBudget, futureValue, monthlyNeeded, monthsToGoal } from './savings';
import { creditCheckup, minimumPayment, multiPayoff, payoff, utilization } from './credit';
import type { Holding } from './types';

const holding = (symbol: string, value: number): Holding => {
  const s = findSecurity(symbol)!;
  return { id: symbol, symbol, name: s.name, kind: s.kind, value, exposure: s.exposure, sectors: s.sectors, expenseRatio: s.expenseRatio };
};

describe('portfolio analysis', () => {
  it('rates a three-fund portfolio as well diversified', () => {
    const a = analyzePortfolio([holding('VTI', 6000), holding('VXUS', 3000), holding('BND', 1000)], 'growth');
    expect(a.total).toBe(10000);
    expect(a.score).toBeGreaterThanOrEqual(85);
    expect(a.byClass.usStocks).toBeCloseTo(0.6);
    expect(a.internationalShareOfStocks).toBeCloseTo(1 / 3);
    expect(a.largestSingle).toBeNull();
    expect(a.weightedExpenseRatio).toBeLessThan(0.001);
  });

  it('flags a portfolio concentrated in one tech stock and crypto', () => {
    const a = analyzePortfolio([holding('NVDA', 6000), holding('TSLA', 1000), holding('BTC', 3000)], 'growth');
    expect(a.score).toBeLessThan(40);
    expect(a.largestSingle?.symbol).toBe('NVDA');
    const ids = a.insights.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['single-name', 'stock-picking', 'sector', 'crypto', 'intl']));
  });

  it('handles an empty portfolio', () => {
    const a = analyzePortfolio([], 'balanced');
    expect(a.score).toBe(0);
    expect(a.insights[0].id).toBe('empty');
  });

  it('splits multi-asset funds across classes', () => {
    const a = analyzePortfolio([holding('VT', 1000)], 'aggressive');
    expect(a.byClass.usStocks + a.byClass.intlStocks + a.byClass.emStocks).toBeCloseTo(1);
    expect(a.internationalShareOfStocks).toBeCloseTo(0.38);
  });

  it('computes fee drag', () => {
    const { lost, without } = feeDrag(10000, 0, 0.07, 0.01, 30);
    expect(lost / without).toBeGreaterThan(0.2);
    expect(lost / without).toBeLessThan(0.3);
  });
});

describe('optimizer', () => {
  it('has a positive-definite covariance matrix', () => {
    const c = covariance();
    // Cholesky decomposition succeeds only for positive-definite matrices.
    const n = c.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = 0; j <= i; j++) {
        let s = c[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          expect(s).toBeGreaterThan(0);
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
  });

  it('projects onto the capped simplex', () => {
    const w = projectCappedSimplex([2, 0.5, -1, 0.1], [0.6, 0.6, 0.6, 0.6]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    w.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(0.6 + 1e-9);
    });
  });

  const frontier = efficientFrontier();

  it('builds a monotone frontier with valid weights', () => {
    expect(frontier.length).toBeGreaterThan(8);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].volatility).toBeGreaterThan(frontier[i - 1].volatility);
      expect(frontier[i].expectedReturn).toBeGreaterThan(frontier[i - 1].expectedReturn);
    }
    for (const p of frontier) {
      const ws = OPT_CLASSES.map((c) => p.weights[c]);
      expect(ws.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      OPT_CLASSES.forEach((c) => expect(p.weights[c]).toBeLessThanOrEqual(DEFAULT_CAPS[c] + 1e-6));
    }
  });

  it('frontier portfolios beat a naive equal-weight portfolio at similar risk', () => {
    const eq = evaluate(Object.fromEntries(OPT_CLASSES.map((c) => [c, 1 / 6])) as never);
    const near = frontier.reduce((b, p) => (Math.abs(p.volatility - eq.volatility) < Math.abs(b.volatility - eq.volatility) ? p : b));
    expect(near.expectedReturn).toBeGreaterThanOrEqual(eq.expectedReturn - 0.002);
  });

  it('picks riskier portfolios for bolder profiles', () => {
    const c = portfolioForProfile(frontier, 'cautious');
    const a = portfolioForProfile(frontier, 'aggressive');
    expect(a.volatility).toBeGreaterThan(c.volatility);
    expect(a.weights.bonds + a.weights.cash).toBeLessThan(c.weights.bonds + c.weights.cash);
    expect(maxSharpe(frontier).sharpe).toBeGreaterThan(0);
  });

  it('attributes most of a 60/40 portfolio\'s risk to stocks', () => {
    const w = { usStocks: 0.6, intlStocks: 0, emStocks: 0, bonds: 0.4, cash: 0, realEstate: 0 };
    const rc = riskContributions(w);
    expect(OPT_CLASSES.reduce((s, c) => s + rc[c], 0)).toBeCloseTo(1, 9);
    expect(rc.usStocks).toBeGreaterThan(0.85);
  });

  it('rebalances and plans contributions without selling', () => {
    const mix = currentMix([holding('VTI', 9000), holding('BTC', 500)]);
    expect(mix.excluded).toBe(500);
    expect(mix.investable).toBe(9000);
    const target = portfolioForProfile(frontier, 'growth').weights;
    const trades = rebalanceTrades(mix, target);
    expect(trades.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(0, 6);
    const plan = contributionPlan(mix, target, 1000);
    expect(plan.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(1000, 6);
    plan.forEach((t) => expect(t.amount).toBeGreaterThan(0));
    expect(plan.find((t) => t.cls === 'usStocks')).toBeUndefined();
  });

  it('projects growth with sensible percentiles', () => {
    const p = projectGrowth({ start: 1000, monthly: 100, years: 20, expectedReturn: 0.07, volatility: 0.15, paths: 1500 });
    const last = p[20];
    expect(last.contributed).toBe(1000 + 100 * 240);
    expect(last.p10).toBeLessThan(last.p50);
    expect(last.p50).toBeLessThan(last.p90);
    expect(last.p50).toBeGreaterThan(last.contributed);
    expect(DEFAULT_ASSUMPTIONS.expectedReturn.cash).toBeGreaterThan(0);
  });
});

describe('savings', () => {
  it('computes future value', () => {
    expect(futureValue(1000, 0, 0.12, 1)).toBeCloseTo(1000 * Math.pow(1.01, 12), 6);
    expect(futureValue(0, 100, 0, 2)).toBe(2400);
  });

  it('round-trips monthlyNeeded and monthsToGoal', () => {
    const m = monthlyNeeded(200, 3000, 24, 0.04);
    expect(monthsToGoal(200, 3000, m + 0.01, 0.04)).toBe(24);
    expect(monthsToGoal(0, 100, 0, 0.04)).toBe(Infinity);
    expect(monthsToGoal(500, 100, 0, 0)).toBe(0);
  });

  it('analyzes a budget with 50/30/20 shares', () => {
    const b = analyzeBudget(1000, [
      { id: '1', label: 'Rent', amount: 500, type: 'need', category: 'Housing' },
      { id: '2', label: 'Eating out', amount: 400, type: 'want', category: 'Food' },
      { id: '3', label: 'Netflix', amount: 20, type: 'want', category: 'Subscriptions' },
    ]);
    expect(b.shares.needs).toBe(0.5);
    expect(b.shares.wants).toBeCloseTo(0.42);
    const ids = b.insights.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['start-saving', 'wants', 'subs']));
  });
});

describe('credit', () => {
  it('computes minimum payments', () => {
    expect(minimumPayment(0, 0.22)).toBe(0);
    expect(minimumPayment(500, 0.24)).toBe(25);
    expect(minimumPayment(5000, 0.24)).toBeCloseTo(50 + 100);
    expect(minimumPayment(10, 0.24)).toBeCloseTo(10.2);
  });

  it('pays off with a fixed payment', () => {
    const r = payoff(1200, 0, 100);
    expect(r.months).toBe(12);
    expect(r.totalInterest).toBe(0);
    const never = payoff(1000, 0.24, 10);
    expect(never.months).toBe(Infinity);
  });

  it('shows minimum payments take far longer than fixed payments', () => {
    const min = payoff(3000, 0.22, 'minimum');
    const fixed = payoff(3000, 0.22, 150);
    expect(min.months).toBeGreaterThan(fixed.months * 2);
    expect(min.totalInterest).toBeGreaterThan(fixed.totalInterest);
  });

  it('avalanche never costs more interest than snowball', () => {
    const cards = [
      { id: 'a', name: 'A', balance: 500, limit: 1000, apr: 0.29 },
      { id: 'b', name: 'B', balance: 2500, limit: 5000, apr: 0.15 },
      { id: 'c', name: 'C', balance: 1200, limit: 2000, apr: 0.24 },
    ];
    const av = multiPayoff(cards, 300, 'avalanche');
    const sn = multiPayoff(cards, 300, 'snowball');
    expect(av.feasible && sn.feasible).toBe(true);
    if (av.feasible && sn.feasible) {
      expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest + 1e-6);
      expect(sn.order[0]).toBe('a');
      expect(av.order[0]).toBe('a');
    }
    expect(multiPayoff(cards, 10, 'avalanche').feasible).toBe(false);
  });

  it('computes utilization and a checkup', () => {
    const u = utilization([
      { id: 'a', name: 'A', balance: 300, limit: 1000, apr: 0.2 },
      { id: 'b', name: 'B', balance: 0, limit: 1000, apr: 0.2 },
    ]);
    expect(u.overall).toBeCloseTo(0.15);
    const good = creditCheckup({ hasCredit: true, missedPayments: 0, oldestAccountYears: 7, hardInquiries: 0, accountTypes: 3 }, 0.05);
    expect(good.health).toBe(100);
    const bad = creditCheckup({ hasCredit: true, missedPayments: 3, oldestAccountYears: 1, hardInquiries: 4, accountTypes: 1 }, 0.8);
    expect(bad.health).toBeLessThan(40);
  });
});
