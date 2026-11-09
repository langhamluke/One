/**
 * Career / pay simulation for one CareerPath, year by year from CURRENT_YEAR to life expectancy.
 *
 * Rules
 *  - year index 0 = CURRENT_YEAR; age = profile.age + i.
 *  - Before path.startYearOffset the stage is 'pre-start' and income is preStartIncome (indexed by inflation).
 *  - Ladder: OCCUPATIONS[path.occupationCode], or path.customLevels when 'custom'. If the occupation is not in the
 *    dataset we fall back to customLevels, else to a flagged default band (FALLBACK_BAND) built with STANDARD_LADDER.
 *  - Salary at the start of a stint = bandAt(level band, track position) in today's dollars, indexed by inflation and
 *    industry drift to the year, times the metro index. Track positions: low 0.25, mid 0.5, high 0.75.
 *  - Within a level salary grows at path.meritRaise, a NOMINAL rate (default 3% = roughly inflation + 0.5% real), times
 *    (1+industryDrift). Real pay within a level plateaus at the level band's p90 (today's dollars, indexed by inflation
 *    and drift), the way pay scales have range maxima. Promotions provide the real jumps: pay re-bases to the next
 *    level's band at the same track position (never below the merit-grown salary).
 *  - Promotion after `years` in level (yearsOverrides wins). whatIf.promotionDelayYears pushes the whole promotion
 *    schedule later by N years (the first level of each stint is held N years longer).
 *  - Layoff gap: starting at layoffYearOffset, layoffGapMonths of zero wages pro-rated across the year(s); level tenure
 *    is frozen for those months; stage 'gap'.
 *  - Grad school: for `years` from gradSchool.startYearOffset wages = incomeDuring, stage 'grad-school', tuition is
 *    indexed; the financed share becomes a single federal unsubsidized loan (interest accrues at loanRate until the
 *    end of school, 10-year standard repayment after a 6-month grace), capped at LOAN_LIMITS_2026.graduate annual /
 *    aggregate limits; the excess and the unfinanced share are paid from cash flow (tuitionCash) and flagged.
 *    After school the path switches to postOccupationCode at postLevelIndex, or stays with (1+postPremium) pay.
 *  - Retirement at (whatIf.retireAtOverride ?? profile.retirementAge): stage 'retired', wages 0.
 *  - Pension: employee contribution reduces pay pre-tax; from max(retirement age, normalRetirementAge) the benefit is
 *    multiplier * yearsOfService * final average salary (last 3 working years, nominal, no COLA) if vested.
 *    Non-covered pension jobs pay no OASDI and accrue no Social Security.
 */
import { CURRENT_YEAR, type CareerPath, type LadderLevel, type PlanState, type SalaryBand, type Track, type WhatIf } from './inputs';
import { METROS, OCCUPATIONS, STANDARD_LADDER, bandAt, ladderFromBand } from '../data/careers';
import { LOAN_LIMITS_2026 } from '../data/loans';
import type { Stage, Waypoint } from './derived';
import { sourced, type DataQualityItem, type Sourced } from './types';
import type { LoanInput } from './loans';
import type { AirlineId, ExcessHandling, Fleet, Milestones, Seat } from '../data/airlines';
import { simulateAirlinePath } from './airline';

export const TRACK_POSITION: Record<Track, number> = { low: 0.25, mid: 0.5, high: 0.75 };

/** Used when an occupation code is not in the dataset and no custom ladder was supplied. */
export const FALLBACK_BAND: Sourced<SalaryBand> = sourced<SalaryBand>(
  { p10: 42000, p25: 52000, p50: 68000, p75: 90000, p90: 118000 },
  'Fallback band: occupation not found in the dataset (bachelor-level placeholder)',
  '2026-11',
  false,
  { note: 'Choose a listed occupation or enter a custom ladder to replace this placeholder' },
);

export interface PayRow {
  yearIndex: number;
  year: number;
  age: number;
  stage: Stage;
  levelTitle: string;
  levelIndex: number;
  /** Base wages actually earned this year (nominal), after any layoff pro-rating */
  wages: number;
  bonus: number;
  rsu: number;
  esppContribution: number;
  /** Immediate ESPP discount gain (taxable compensation) */
  esppGain: number;
  /** Grad-school tuition paid from cash flow this year (unfinanced share + anything above federal caps) */
  tuitionCash: number;
  /** Tuition financed by the grad loan this year */
  tuitionFinanced: number;
  /** Financed amount that exceeded federal caps (assumed paid from cash/taxable) */
  tuitionExcess: number;
  pensionEmployeeContrib: number;
  pensionIncome: number;
  /** False only for working years in a pension job not covered by Social Security */
  coveredBySS: boolean;
  yearsOfService: number;
  gapMonths: number;
  // ---- Airline paths only (Flight Plan)
  /** Company non-elective 401(k) contribution as a fraction of pay; replaces the generic match when set */
  employerPctOverride?: number;
  /** What the airline does with company money above §415(c) */
  excessHandling?: ExcessHandling;
  /** Market-based cash balance credit this year (nominal $) */
  mbcbCredit?: number;
  airline?: AirlineId;
  seat?: Seat;
  fleet?: Fleet;
  longevity?: number;
  /** Rate actually paid this year (per hour / TFP, or annual for CFI), after contract raises */
  hourlyRate?: number;
  caRateAsFo?: boolean;
}

export interface LadderResolution {
  code: string;
  title: string;
  levels: LadderLevel[];
  origin: 'data' | 'user';
  fallback: boolean;
}

export interface CareerSim {
  pathId: string;
  name: string;
  rows: PayRow[];
  waypoints: Waypoint[];
  /** First row with wages > 0, or -1 */
  firstIncomeYearIndex: number;
  ladders: LadderResolution[];
  metroIndex: number;
  gradLoan?: LoanInput;
  flags: string[];
  dataQuality: DataQualityItem[];
  /** Airline paths only: resolved carriers, effective retirement age and milestones in use */
  airline?: { regional: AirlineId | null; major: AirlineId | null; retireAt: number; milestones: Milestones };
}

/** Resolve the ladder for an occupation code (data), a custom ladder (user) or the fallback band (user, flagged). */
export function resolveLadder(code: string, customLevels?: LadderLevel[]): LadderResolution {
  const occ = code !== 'custom' ? OCCUPATIONS[code] : undefined;
  if (occ && occ.levels.length > 0) return { code, title: occ.title, levels: occ.levels, origin: 'data', fallback: false };
  if (customLevels && customLevels.length > 0) {
    return { code, title: code === 'custom' ? 'Custom ladder' : `${code} (custom ladder)`, levels: customLevels, origin: 'user', fallback: false };
  }
  return { code, title: `${code} (not in dataset)`, levels: ladderFromBand(FALLBACK_BAND, STANDARD_LADDER), origin: 'user', fallback: true };
}

/** Metro multiplier: per-occupation override, else the metro's all-occupations index, else 1. */
export function metroIndexFor(metro: string, code: string): { index: number; sourced?: Sourced<number>; known: boolean; occupationSpecific: boolean } {
  const m = METROS[metro];
  if (!m) return { index: 1, known: false, occupationSpecific: false };
  const occ = m.occupationIndex?.[code];
  if (occ) return { index: occ.value, sourced: occ, known: true, occupationSpecific: true };
  return { index: m.index?.value ?? 1, sourced: m.index, known: true, occupationSpecific: false };
}

function bandItem(pathId: string, code: string, lvl: LadderLevel, origin: 'data' | 'user'): DataQualityItem {
  return {
    key: `band:${pathId}:${code}:${lvl.title}`,
    label: `${code} - ${lvl.title} salary band (p50)`,
    value: lvl.band.value.p50,
    source: lvl.band.source,
    url: lvl.band.url,
    asOf: lvl.band.asOf,
    verified: lvl.band.verified,
    note: lvl.band.note,
    origin,
  };
}

function clampIdx(i: number, n: number): number {
  return Math.min(Math.max(0, Math.floor(Number.isFinite(i) ? i : 0)), Math.max(0, n - 1));
}

/** Simulate one career path: occupation ladder (default) or airline seat/longevity progression. */
export function simulatePath(state: PlanState, path: CareerPath, whatIf: WhatIf): CareerSim {
  if (path.kind === 'airline') return simulateAirlinePath(state, path, whatIf);
  return simulateLadderPath(state, path, whatIf);
}

export function simulateLadderPath(state: PlanState, path: CareerPath, whatIf: WhatIf): CareerSim {
  const a = state.assumptions;
  const prof = state.profile;
  const infl = a.inflation;
  const age0 = prof.age;
  const n = Math.max(1, Math.floor(a.lifeExpectancy) - Math.floor(age0) + 1);
  const retireAt = whatIf.retireAtOverride ?? prof.retirementAge;
  const gs = whatIf.gradSchool;
  const schoolYears = gs.enabled ? Math.max(0, Math.floor(gs.years)) : 0;
  const schoolStart = gs.enabled && schoolYears > 0 ? Math.max(0, Math.floor(gs.startYearOffset)) : -1;
  const schoolEnd = schoolStart >= 0 ? schoolStart + schoolYears : -1;
  const startOffset = Math.max(0, Math.floor(path.startYearOffset));
  const merit = path.meritRaise;
  const drift = path.industryDrift;
  const growth = (1 + merit) * (1 + drift) - 1;
  const pos = TRACK_POSITION[path.track] ?? 0.5;
  const pension = state.benefits.pension;
  const eq = state.benefits.equityComp;
  const esppDiscount = Math.min(0.9, Math.max(0, eq.esppDiscount));
  const flags: string[] = [];
  const dq: DataQualityItem[] = [];
  const ladders: LadderResolution[] = [];
  const waypoints: Waypoint[] = [];
  const rows: PayRow[] = [];

  let ladder = resolveLadder(path.occupationCode, path.customLevels);
  ladders.push(ladder);
  if (ladder.fallback) flags.push(`occupation-not-found:${path.occupationCode}`);
  const metro = metroIndexFor(path.metro, ladder.code);
  if (!metro.known) flags.push(`metro-not-found:${path.metro}`);
  const bandsUsed = new Set<string>();
  const noteBand = (lvl: LadderLevel) => {
    const key = `${ladder.code}:${lvl.title}`;
    if (bandsUsed.has(key)) return;
    bandsUsed.add(key);
    dq.push(bandItem(path.id, ladder.code, lvl, ladder.origin));
  };

  const yearsFor = (idx: number): number => {
    const o = path.yearsOverrides?.[idx];
    const y = o !== undefined && o !== null && Number.isFinite(o) ? o : ladder.levels[idx].years;
    return Math.max(0, y);
  };
  const bandSalary = (i: number, idx: number, premium: number, position = pos): number =>
    bandAt(ladder.levels[idx].band.value, position) * Math.pow(1 + infl, i) * Math.pow(1 + drift, i) * metro.index * premium;
  /** Range maximum for a level: the level band's p90 in that year's dollars. */
  const ceiling = (i: number, idx: number, premium: number): number => bandSalary(i, idx, premium, 0.9);

  let started = false;
  let levelIdx = clampIdx(path.startLevelIndex, ladder.levels.length);
  let salary = 0;
  let tenure = 0;
  let levelNeed = 0;
  let premium = 1;
  let needsPostSchool = false;
  let yearsOfService = 0;
  let startSalary = 0;
  let gapRemaining = Math.max(0, Math.floor(whatIf.layoffGapMonths));
  let gapNoted = false;
  const recentWages: number[] = [];
  let gradBorrowed = 0;
  let gradLoanAtGrad = 0;
  let gradLoan: LoanInput | undefined;
  let retireNoted = false;
  let firstIncomeYearIndex = -1;
  const cumulativeGradCap = LOAN_LIMITS_2026.graduate.aggregate.value;
  const annualGradCap = LOAN_LIMITS_2026.graduate.annual.value;

  const beginStint = (i: number, fromSchool: boolean) => {
    if (fromSchool) {
      if (gs.postOccupationCode && gs.postOccupationCode !== ladder.code) {
        ladder = resolveLadder(gs.postOccupationCode, undefined);
        ladders.push(ladder);
        if (ladder.fallback) flags.push(`occupation-not-found:${gs.postOccupationCode}`);
        levelIdx = clampIdx(gs.postLevelIndex, ladder.levels.length);
        premium = 1;
      } else {
        const baseIdx = started ? levelIdx : clampIdx(path.startLevelIndex, ladder.levels.length);
        levelIdx = clampIdx(Math.max(baseIdx, Math.floor(gs.postLevelIndex)), ladder.levels.length);
        premium = 1 + Math.max(-0.9, gs.postPremium);
      }
    } else {
      levelIdx = clampIdx(path.startLevelIndex, ladder.levels.length);
    }
    tenure = 0;
    levelNeed = yearsFor(levelIdx) + Math.max(0, whatIf.promotionDelayYears);
    const fresh = bandSalary(i, levelIdx, premium);
    salary = fromSchool && started ? Math.max(fresh, salary * (1 + growth)) : fresh;
    salary = Math.min(salary, Math.max(fresh, ceiling(i, levelIdx, premium)));
    if (startSalary === 0) startSalary = salary;
    noteBand(ladder.levels[levelIdx]);
    const title = ladder.levels[levelIdx].title;
    waypoints.push({
      yearIndex: i,
      age: age0 + i,
      label: fromSchool && started ? `Back to work as ${title}` : `Started as ${title}`,
      pay: salary,
      kind: fromSchool && started ? 'event' : 'start',
    });
    started = true;
  };

  for (let i = 0; i < n; i++) {
    const age = age0 + i;
    const year = CURRENT_YEAR + i;
    const retired = age >= retireAt;
    const inSchool = !retired && schoolStart >= 0 && i >= schoolStart && i < schoolEnd;
    const preStart = !retired && !inSchool && i < startOffset;
    const row: PayRow = {
      yearIndex: i,
      year,
      age,
      stage: 'working',
      levelTitle: started ? ladder.levels[levelIdx].title : '',
      levelIndex: levelIdx,
      wages: 0,
      bonus: 0,
      rsu: 0,
      esppContribution: 0,
      esppGain: 0,
      tuitionCash: 0,
      tuitionFinanced: 0,
      tuitionExcess: 0,
      pensionEmployeeContrib: 0,
      pensionIncome: 0,
      coveredBySS: true,
      yearsOfService,
      gapMonths: 0,
    };

    if (retired) {
      row.stage = 'retired';
      row.levelTitle = 'Retired';
      if (!retireNoted) {
        retireNoted = true;
        waypoints.push({ yearIndex: i, age, label: 'Retired', pay: 0, kind: 'retire' });
      }
    } else if (inSchool) {
      row.stage = 'grad-school';
      row.levelTitle = 'Grad school';
      row.wages = Math.max(0, gs.incomeDuring) * Math.pow(1 + infl, i);
      const tuition = Math.max(0, gs.annualCost) * Math.pow(1 + infl, i);
      const wanted = tuition * Math.min(1, Math.max(0, gs.financedPct));
      const allowed = Math.max(0, Math.min(wanted, annualGradCap, cumulativeGradCap - gradBorrowed));
      const excess = wanted - allowed;
      gradBorrowed += allowed;
      row.tuitionFinanced = allowed;
      row.tuitionExcess = excess;
      row.tuitionCash = tuition - allowed;
      if (excess > 0.5) flags.push('grad-loan-cap');
      gradLoanAtGrad += allowed * Math.pow(1 + Math.max(0, gs.loanRate), schoolEnd - i);
      if (i === schoolStart) waypoints.push({ yearIndex: i, age, label: `Grad school (${schoolYears} yr${schoolYears === 1 ? '' : 's'})`, pay: row.wages, kind: 'school' });
      needsPostSchool = true;
      if (i === schoolEnd - 1 && gradLoanAtGrad > 0) {
        gradLoan = {
          id: `${path.id}-grad-loan`,
          name: 'Grad school loan (federal unsubsidized)',
          kind: 'federal_student',
          balance: gradLoanAtGrad,
          originalBalance: gradLoanAtGrad,
          rate: Math.max(0, gs.loanRate),
          termMonths: 120,
          federalPlan: 'standard',
          graceMonths: 6,
          startYearIndex: schoolEnd,
        };
      }
    } else if (preStart) {
      row.stage = 'pre-start';
      row.levelTitle = 'Before start';
      row.wages = Math.max(0, path.preStartIncome) * Math.pow(1 + infl, i);
    } else {
      // Working year
      if (!started) beginStint(i, needsPostSchool);
      else if (needsPostSchool) beginStint(i, true);
      else {
        salary = Math.min(salary * (1 + growth), Math.max(salary * (1 + infl) * (1 + drift), ceiling(i, levelIdx, premium)));
        while (levelIdx < ladder.levels.length - 1 && tenure >= levelNeed - 1e-9) {
          tenure -= levelNeed;
          levelIdx++;
          levelNeed = yearsFor(levelIdx);
          const fresh = bandSalary(i, levelIdx, premium);
          salary = Math.min(Math.max(fresh, salary), Math.max(fresh, ceiling(i, levelIdx, premium)));
          noteBand(ladder.levels[levelIdx]);
          waypoints.push({ yearIndex: i, age, label: `Promoted to ${ladder.levels[levelIdx].title}`, pay: salary, kind: 'promotion' });
        }
      }
      needsPostSchool = false;
      let worked = 1;
      if (gapRemaining > 0 && i >= Math.floor(whatIf.layoffYearOffset)) {
        const months = Math.min(12, gapRemaining);
        gapRemaining -= months;
        worked = (12 - months) / 12;
        row.gapMonths = months;
        row.stage = 'gap';
        if (!gapNoted) {
          gapNoted = true;
          waypoints.push({ yearIndex: i, age, label: `Career gap: ${Math.floor(whatIf.layoffGapMonths)} months`, pay: salary * worked, kind: 'gap' });
        }
      }
      row.levelTitle = ladder.levels[levelIdx].title;
      row.levelIndex = levelIdx;
      row.wages = salary * worked;
      const bonusPct = path.bonusPctOverride ?? ladder.levels[levelIdx].bonusPct ?? 0;
      row.bonus = Math.max(0, bonusPct) * row.wages;
      row.rsu = Math.max(0, eq.annualRsuValue) * (startSalary > 0 ? salary / startSalary : 1) * worked;
      row.esppContribution = Math.min(0.15, Math.max(0, eq.esppContribPct)) * row.wages;
      row.esppGain = esppDiscount > 0 ? row.esppContribution * (esppDiscount / (1 - esppDiscount)) : 0;
      if (pension.enabled) {
        row.pensionEmployeeContrib = Math.max(0, pension.employeeContribPct) * row.wages;
        row.coveredBySS = pension.coveredBySocialSecurity;
        yearsOfService += worked;
      }
      tenure += worked;
      recentWages.push(row.wages);
      if (recentWages.length > 3) recentWages.shift();
    }

    if (row.wages > 0 && firstIncomeYearIndex < 0) firstIncomeYearIndex = i;

    // Pension benefit in payment
    if (pension.enabled && retired && age >= Math.max(retireAt, pension.normalRetirementAge) && yearsOfService >= pension.vestingYears && yearsOfService > 0) {
      const fas = recentWages.length ? recentWages.reduce((s, w) => s + w, 0) / recentWages.length : 0;
      row.pensionIncome = Math.max(0, pension.multiplier) * yearsOfService * fas;
    }
    row.yearsOfService = yearsOfService;
    rows.push(row);
  }

  if (metro.sourced) {
    dq.push({
      key: `metro:${path.id}:${path.metro}`,
      label: `Metro wage index (${path.metro}, ${metro.occupationSpecific ? `${ladder.code} median vs national` : 'all occupations'})`,
      value: metro.index,
      source: metro.sourced.source,
      url: metro.sourced.url,
      asOf: metro.sourced.asOf,
      verified: metro.sourced.verified,
      note: metro.sourced.note,
      origin: 'data',
    });
  }

  return { pathId: path.id, name: path.name, rows, waypoints, firstIncomeYearIndex, ladders, metroIndex: metro.index, gradLoan, flags, dataQuality: dq };
}
