import { describe, expect, it } from 'vitest';
import { AIRLINES } from '../src/data/airlines';
import { buildCareer, raiseFactor, type CareerInput } from '../src/lib/payroll';

const base: CareerInput = {
  age: 23, retireAge: 65, stage: 'cfi', employer: 'cfi', yearsAtEmployer: 0, creditHours: 80,
  pathId: 'envoy-aa',
  milestones: { toRegional: 1, regionalCaUpgrade: 2, toMajor: 4, majorCaUpgrade: 8, widebody: 6 },
  upgradeDelay: 0, furloughYears: 0, envoyCaRule: true, profitSharingPct: 0, payGrowthAfterContract: 0.03,
};

describe('career simulation', () => {
  it('runs from current age to retirement with expected phases', () => {
    const c = buildCareer(base);
    expect(c.years).toHaveLength(42);
    expect(c.years[0].phase).toBe('cfi');
    expect(c.years[1].label).toBe('ENVOY FO');
    expect(c.years[2].caRateAsFo).toBe(true);
    expect(c.years[5].airline).toBe('american');
    expect(c.waypoints.map((w) => w.label)).toEqual(['CFI', 'ENVOY FO', 'CA PAY RATE', 'CA UPGRADE', 'FLOW → AA', 'AA CA', 'WIDEBODY', 'AGE 65']);
  });
  it('pay = rate × credit hours × 12 × contract raises', () => {
    const c = buildCareer(base);
    const y = c.years[1]; // Envoy FO yr 1, 2028
    expect(y.basePay).toBeCloseTo(AIRLINES.envoy.narrowbody.fo[0].value * 80 * 12 * raiseFactor(AIRLINES.envoy, y.year, 0.03), 6);
  });
  it('Southwest raises compound 4% (2027) and 3.25% (2028)', () => {
    expect(raiseFactor(AIRLINES.southwest, 2027, 0)).toBeCloseTo(1.04, 10);
    expect(raiseFactor(AIRLINES.southwest, 2028, 0)).toBeCloseTo(1.04 * 1.0325, 10);
  });
  it('upgrade delay pushes captain upgrades later', () => {
    const a = buildCareer(base), b = buildCareer({ ...base, upgradeDelay: 2 });
    const caAge = (c: typeof a) => c.years.find((y) => y.airline === 'american' && y.seat === 'CA')!.age;
    expect(caAge(b) - caAge(a)).toBe(2);
  });
  it('furlough zeroes pay and shifts later events', () => {
    const a = buildCareer(base), b = buildCareer({ ...base, furloughYears: 2 });
    expect(b.years.filter((y) => y.phase === 'furlough')).toHaveLength(2);
    expect(b.years.filter((y) => y.phase === 'furlough').every((y) => y.gross === 0)).toBe(true);
    const caAge = (c: typeof a) => c.years.find((y) => y.airline === 'american' && y.seat === 'CA')!.age;
    expect(caAge(b) - caAge(a)).toBe(2);
  });
  it('current major pilot stays at employer', () => {
    const c = buildCareer({ ...base, age: 34, stage: 'cargo_fo', employer: 'fedex', yearsAtEmployer: 3, pathId: 'stay',
      milestones: { ...base.milestones, majorCaUpgrade: 10, widebody: 0 } });
    expect(c.years.every((y) => y.airline === 'fedex')).toBe(true);
    expect(c.years[0].longevity).toBe(4);
    expect(c.years.find((y) => y.seat === 'CA')!.age).toBe(34 + 7);
  });
});
