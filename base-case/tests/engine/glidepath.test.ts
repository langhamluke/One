import { describe, expect, it } from 'vitest';
import { buildGlidePath, expectedReturn, glideEquity, portfolioVol } from '../../shared/lib/glidepath';
import { allocationFromEquity } from '../../shared/data/models';
import { defaultAssumptions, defaultPlanState } from '../../shared/lib/inputs';

describe('glide path', () => {
  const p = { modelEquity: 0.8, retirementAge: 67, glideYears: 25, landingEquity: 0.45 };
  it('holds the model, glides linearly, then holds the landing', () => {
    expect(glideEquity(22, p)).toBe(0.8);
    expect(glideEquity(42, p)).toBe(0.8);
    expect(glideEquity(54.5, p)).toBeCloseTo(0.625, 10);
    expect(glideEquity(67, p)).toBe(0.45);
    expect(glideEquity(90, p)).toBe(0.45);
  });
  it('never lands above the model and handles zero glide years', () => {
    expect(glideEquity(60, { ...p, modelEquity: 0.4, landingEquity: 0.9 })).toBe(0.4);
    expect(glideEquity(66, { ...p, glideYears: 0 })).toBe(0.8);
    expect(glideEquity(67, { ...p, glideYears: 0 })).toBe(0.45);
  });
  it('builds one point per age and is non-increasing', () => {
    const s = defaultPlanState();
    const g = buildGlidePath(s, 0.6);
    expect(g.length).toBe(95 - 22 + 1);
    expect(g[0]).toEqual({ age: 22, equity: 0.6 });
    for (let i = 1; i < g.length; i++) expect(g[i].equity).toBeLessThanOrEqual(g[i - 1].equity + 1e-12);
    expect(g[g.length - 1].equity).toBe(0.45);
    s.assumptions.equityOverride = 0.3;
    expect(buildGlidePath(s, 0.6)[0].equity).toBe(0.3);
  });
  it('computes expected return and portfolio volatility', () => {
    const cma = defaultAssumptions().cma;
    const cash = allocationFromEquity(0);
    expect(expectedReturn({ uslc: 0, ussmid: 0, intl: 0, em: 0, bonds: 0, tips: 0, cash: 1 }, cma)).toBeCloseTo(0.035, 10);
    expect(portfolioVol({ uslc: 0, ussmid: 0, intl: 0, em: 0, bonds: 0, tips: 0, cash: 1 }, cma)).toBeCloseTo(0.01, 10);
    const sixty = allocationFromEquity(0.6);
    const er = expectedReturn(sixty, cma);
    expect(er).toBeGreaterThan(expectedReturn(cash, cma));
    const naive = 0.6 * (0.5 * 0.16 + 0.15 * 0.2 + 0.25 * 0.17 + 0.1 * 0.23) + 0.4 * (0.7 * 0.055 + 0.2 * 0.06 + 0.1 * 0.01);
    expect(portfolioVol(sixty, cma)).toBeLessThan(naive);
    expect(portfolioVol(sixty, cma)).toBeGreaterThan(0.05);
  });
});
