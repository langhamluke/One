/**
 * Test fixtures that do not depend on the data pass: a custom ladder built through the exported careers helpers and a
 * plan state with deterministic settings (zero inflation unless a test asks otherwise).
 */
import { STANDARD_LADDER, ladderFromBand } from '../../shared/data/careers';
import { defaultPlanState, type LadderLevel, type PlanState, type SalaryBand } from '../../shared/lib/inputs';
import { sourced } from '../../shared/lib/types';

export const FIXTURE_BAND = sourced<SalaryBand>({ p10: 50000, p25: 60000, p50: 70000, p75: 85000, p90: 100000 }, 'Test fixture band', '2026-05', true);

export function fixtureLadder(): LadderLevel[] {
  return ladderFromBand(FIXTURE_BAND, STANDARD_LADDER);
}

/** Level 0 p50 of the fixture ladder = bandAt(oews, 0.2) = 56,666.67 */
export const FIXTURE_L0_P50 = 50000 + ((0.2 - 0.1) / (0.25 - 0.1)) * 10000;
/** Level 1 p50 = bandAt(oews, 0.4) = 66,000 */
export const FIXTURE_L1_P50 = 60000 + ((0.4 - 0.25) / (0.5 - 0.25)) * 10000;

export interface FixtureOptions {
  inflation?: number;
  merit?: number;
  age?: number;
  retirementAge?: number;
  lifeExpectancy?: number;
}

/** Plan state using the fixture ladder as a custom occupation, no debts, questionnaire unanswered. */
export function fixtureState(opts: FixtureOptions = {}): PlanState {
  const s = defaultPlanState();
  s.profile.age = opts.age ?? 22;
  s.profile.retirementAge = opts.retirementAge ?? 67;
  s.assumptions.lifeExpectancy = opts.lifeExpectancy ?? 95;
  s.assumptions.inflation = opts.inflation ?? 0;
  s.assumptions.indexing = opts.inflation ?? 0;
  s.careerPaths = [
    {
      id: 'path-1',
      name: 'Fixture',
      occupationCode: 'custom',
      metro: 'national',
      track: 'mid',
      startLevelIndex: 0,
      yearsOverrides: {},
      customLevels: fixtureLadder(),
      meritRaise: opts.merit ?? 0.03,
      startYearOffset: 0,
      preStartIncome: 0,
      industryDrift: 0,
    },
  ];
  s.activePathId = 'path-1';
  return s;
}

/** Deep scan for NaN / Infinity anywhere in an object graph. Returns the paths found. */
export function nonFinitePaths(o: unknown, path = 'root', out: string[] = []): string[] {
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) out.push(path);
  } else if (Array.isArray(o)) {
    o.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out));
  } else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) nonFinitePaths(v, `${path}.${k}`, out);
  }
  return out;
}
