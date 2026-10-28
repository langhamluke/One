import { describe, expect, it } from 'vitest';
import { AIRLINES } from '../src/data/airlines';
import { MODELS, equityPct } from '../src/data/models';
import { allocationWithEquity, buildGlidePath, equityAt } from '../src/lib/glidepath';

describe('airline data integrity', () => {
  it('every pay step has a source and asOf; scales have 12 steps', () => {
    for (const a of Object.values(AIRLINES)) {
      for (const sc of [a.narrowbody, a.widebody].filter(Boolean)) {
        for (const arr of [sc!.fo, sc!.ca]) {
          expect(arr).toHaveLength(12);
          for (const s of arr) {
            expect(s.source.length).toBeGreaterThan(0);
            expect(s.asOf.length).toBeGreaterThan(0);
            expect(typeof s.verified).toBe('boolean');
            expect(s.value).toBeGreaterThan(0);
          }
        }
      }
      expect(a.retirement.companyPct.source.length).toBeGreaterThan(0);
    }
  });
  it('seeded verified values are present exactly', () => {
    expect(AIRLINES.american.narrowbody.fo[11]).toMatchObject({ value: 266.58, verified: true });
    expect(AIRLINES.american.narrowbody.ca[11]).toMatchObject({ value: 402.01, verified: true });
    expect(AIRLINES.american.widebody!.ca[11]).toMatchObject({ value: 483.74, verified: true });
    expect(AIRLINES.american.widebody!.fo[11]).toMatchObject({ value: 330.44, verified: true });
    expect(AIRLINES.american.retirement.companyPct.value).toBe(18);
    expect(AIRLINES.southwest.narrowbody.fo[0]).toMatchObject({ value: 125.9, verified: true });
    expect(AIRLINES.southwest.narrowbody.fo[11]).toMatchObject({ value: 240.2, verified: true });
    expect(AIRLINES.southwest.narrowbody.ca[11]).toMatchObject({ value: 343.14, verified: true });
    expect(AIRLINES.southwest.payUnit).toBe('TFP');
    expect(AIRLINES.fedex.narrowbody.ca[11]).toMatchObject({ value: 469, verified: true });
    expect(AIRLINES.fedex.narrowbody.fo[11]).toMatchObject({ value: 332.49, verified: true });
    expect(AIRLINES.american.narrowbody.fo[0].verified).toBe(false); // 2024 scale, flagged
  });
  it('interpolated steps are flagged unverified', () => {
    expect(AIRLINES.american.narrowbody.fo[5].verified).toBe(false);
    expect(AIRLINES.american.narrowbody.fo[5].source).toMatch(/Interpolated/);
  });
});

describe('model portfolios', () => {
  it('all 12 models sum to 100%', () => {
    for (const r of Object.values(MODELS)) for (const m of Object.values(r)) {
      expect(Object.values(m).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8);
    }
  });
  it('equity ranges are sensible', () => {
    expect(equityPct(MODELS.Aggressive['Long-term'])).toBeGreaterThanOrEqual(90);
    expect(equityPct(MODELS.Conservative['Short-term'])).toBeGreaterThanOrEqual(20);
    expect(equityPct(MODELS.Conservative['Short-term'])).toBeLessThanOrEqual(30);
  });
});

describe('glide path', () => {
  it('holds, then descends linearly to the landing equity at retirement', () => {
    expect(equityAt(30, 25, 90, 65, 45, 25)).toBe(90);
    expect(equityAt(40, 25, 90, 65, 45, 25)).toBe(90);
    expect(equityAt(65, 25, 90, 65, 45, 25)).toBe(45);
    expect(equityAt(70, 25, 90, 65, 45, 25)).toBe(45);
    expect(equityAt(52.5, 25, 90, 65, 45, 25)).toBeCloseTo(67.5, 8);
  });
  it('never increases risk above the starting model', () => {
    expect(equityAt(64, 60, 30, 65, 45, 25)).toBe(30);
  });
  it('rescaled allocations sum to 100', () => {
    const g = buildGlidePath(MODELS.Aggressive['Long-term'], 23, 65, 95, 45, 25);
    for (const p of g) {
      const { age: _a, equity: _e, ...alloc } = p;
      expect(Object.values(alloc).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8);
    }
    expect(allocationWithEquity(MODELS.Moderate['Long-term'], 40).usAgg).toBeGreaterThan(MODELS.Moderate['Long-term'].usAgg);
  });
});
