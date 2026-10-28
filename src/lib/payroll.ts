import { AIRLINES, PATHS, type Airline, type AirlineId, type PathId } from '../data/airlines';
import type { Milestones } from './inputs';
import type { Fleet, Seat, Sourced, Stage } from './types';

export const PLAN_START_YEAR = 2027; // first full plan year; 2026 rates are indexed by contract raises from here

export interface CareerInput {
  age: number;
  retireAge: number;
  stage: Stage;
  employer: AirlineId | 'none';
  yearsAtEmployer: number;
  creditHours: number;
  pathId: PathId;
  milestones: Milestones;
  upgradeDelay: number;
  furloughYears: number;
  envoyCaRule: boolean;
  profitSharingPct: number; // 0–1
  payGrowthAfterContract: number; // 0–1
  startYear?: number;
}

export interface CareerYear {
  t: number;
  age: number;
  year: number;
  airline: AirlineId | null;
  seat: Seat | null;
  fleet: Fleet;
  phase: 'training' | 'cfi' | 'regional' | 'major' | 'furlough';
  label: string;
  longevity: number;
  rate: Sourced | null;
  rateNow: number; // rate after raises
  caRateAsFo: boolean;
  annualCredit: number;
  basePay: number;
  profitSharing: number;
  gross: number;
}

export interface Waypoint {
  age: number;
  year: number;
  label: string;
  pay: number;
  kind: 'start' | 'hire' | 'upgrade' | 'flow' | 'widebody' | 'furlough' | 'end';
}

export interface Career {
  pathId: PathId;
  regional: AirlineId | null;
  major: AirlineId | null;
  years: CareerYear[];
  waypoints: Waypoint[];
}

const isRegionalStage = (s: Stage) => s === 'regional_fo' || s === 'regional_ca';
const isMajorStage = (s: Stage) => s === 'major_fo' || s === 'major_ca' || s === 'cargo_fo' || s === 'cargo_ca';
const isCaStage = (s: Stage) => s.endsWith('_ca');

/** Resolve which airlines a path uses for this pilot. */
export function resolvePath(pathId: PathId, stage: Stage, employer: AirlineId | 'none'): { regional: AirlineId | null; major: AirlineId | null } {
  // Already at a major/cargo carrier: every path is "stay at current employer".
  if (isMajorStage(stage) && employer !== 'none') return { regional: null, major: employer };
  if (pathId === 'stay') {
    const emp: AirlineId = employer === 'none' ? 'regional' : employer;
    return AIRLINES[emp].kind === 'regional' ? { regional: emp, major: null } : { regional: null, major: emp };
  }
  const tpl = PATHS[pathId];
  // A pilot already at a regional keeps that employer as the regional leg.
  const regional: AirlineId | null =
    isRegionalStage(stage) && employer !== 'none' && AIRLINES[employer].kind === 'regional' ? employer : tpl.regional ?? null;
  return { regional, major: tpl.major };
}

/** Compact ND-style label, e.g. "ENVOY → AA". */
export function pathShort(pathId: PathId, stage: Stage, employer: AirlineId | 'none'): string {
  const { regional, major } = resolvePath(pathId, stage, employer);
  if (!major) return AIRLINES[regional!].code;
  if (!regional) return AIRLINES[major].code;
  return `${AIRLINES[regional].code} → ${AIRLINES[major].code}`;
}

/** Human label for a path as it applies to this pilot, e.g. "ENVOY → AA". */
export function pathLabel(pathId: PathId, stage: Stage, employer: AirlineId | 'none'): string {
  const { regional, major } = resolvePath(pathId, stage, employer);
  if (!major) return `Stay at ${AIRLINES[regional!].name}`;
  if (!regional) return `Career at ${AIRLINES[major].name}`;
  return `${AIRLINES[regional].name} → ${AIRLINES[major].name}`;
}

/** Cumulative pay factor from 2026 base rates to `year`, using dated contract raises then an assumed growth rate. */
export function raiseFactor(airline: Airline, year: number, growthAfter: number): number {
  const raiseYears = airline.raises.map((r) => Number(r.effective.slice(0, 4)));
  const lastContractYear = Math.max(2026, ...raiseYears);
  let f = 1;
  for (let y = 2027; y <= year; y++) {
    const r = airline.raises.find((x) => Number(x.effective.slice(0, 4)) === y);
    if (r) f *= 1 + r.pct.value / 100;
    else if (y > lastContractYear) f *= 1 + growthAfter;
  }
  return f;
}

export function scaleRate(airline: Airline, seat: Seat, fleet: Fleet, longevity: number): Sourced {
  const sc = fleet === 'WB' && airline.widebody ? airline.widebody : airline.narrowbody;
  const arr = seat === 'CA' ? sc.ca : sc.fo;
  return arr[Math.min(Math.max(longevity, 1), 12) - 1];
}

const SEAT_WORD = (s: Seat) => (s === 'CA' ? 'CA' : 'FO');

export function buildCareer(inp: CareerInput): Career {
  const startYear = inp.startYear ?? PLAN_START_YEAR;
  const { regional, major } = resolvePath(inp.pathId, inp.stage, inp.employer);
  const m = inp.milestones;
  const delay = Math.max(0, inp.upgradeDelay);
  const NEVER = 1e9;

  // Event times in "effective years" (t=0 is the first plan year).
  let trainingEnd = 0, cfiEnd = 0, regionalHire = NEVER, regionalCA = NEVER, majorHire = NEVER, majorCA = NEVER, widebodyCA = NEVER;
  if (inp.stage === 'student' || inp.stage === 'cfi') {
    trainingEnd = inp.stage === 'student' ? 1 : 0;
    cfiEnd = trainingEnd + Math.max(0, m.toRegional);
    regionalHire = cfiEnd;
  } else if (isRegionalStage(inp.stage)) {
    regionalHire = -Math.max(0, inp.yearsAtEmployer);
  }
  if (regionalHire !== NEVER) {
    regionalCA = inp.stage === 'regional_ca' ? -NEVER : regionalHire + m.regionalCaUpgrade + delay;
    if (major) majorHire = Math.max(regionalHire + m.toMajor, inp.stage === 'regional_fo' || inp.stage === 'regional_ca' ? 1 : regionalHire);
    if (regional === null) majorHire = regionalHire; // direct path
  }
  if (isMajorStage(inp.stage)) {
    majorHire = -Math.max(0, inp.yearsAtEmployer);
  }
  if (majorHire !== NEVER) {
    majorCA = isCaStage(inp.stage) && isMajorStage(inp.stage) ? -NEVER : Math.max(majorHire + m.majorCaUpgrade + delay, isMajorStage(inp.stage) ? 1 : majorHire);
    const maj = major ? AIRLINES[major] : null;
    if (maj?.widebody && m.widebody > 0) widebodyCA = (majorCA === -NEVER ? Math.max(1, majorHire + m.majorCaUpgrade + m.widebody) : majorCA + m.widebody);
  }

  // Furlough: N years of zero pay starting at major hire (or next year if already at a major); seniority/longevity freezes.
  const fN = Math.max(0, Math.round(inp.furloughYears));
  const fStart = majorHire !== NEVER && majorHire >= 0 ? Math.max(majorHire, 0) + (majorHire >= 0 ? 1 : 0) : 1;

  const years: CareerYear[] = [];
  const nYears = Math.max(0, inp.retireAge - inp.age);
  for (let t = 0; t < nYears; t++) {
    const age = inp.age + t;
    const year = startYear + t;
    const furloughed = fN > 0 && t >= fStart && t < fStart + fN;
    const te = fN > 0 && t >= fStart + fN ? t - fN : t;

    let row: CareerYear = {
      t, age, year, airline: null, seat: null, fleet: 'NB', phase: 'training', label: 'TRAINING', longevity: 0,
      rate: null, rateNow: 0, caRateAsFo: false, annualCredit: 0, basePay: 0, profitSharing: 0, gross: 0,
    };

    if (furloughed) {
      row = { ...row, phase: 'furlough', label: 'FURLOUGH' };
    } else if (te < trainingEnd) {
      // student pilot still training: no income
    } else if (te < cfiEnd) {
      const a = AIRLINES.cfi;
      const rate = a.narrowbody.fo[0];
      const f = raiseFactor(a, year, inp.payGrowthAfterContract);
      row = { ...row, airline: 'cfi', seat: null, phase: 'cfi', label: 'CFI', longevity: te - trainingEnd + 1, rate, rateNow: rate.value * f, basePay: rate.value * f };
    } else if (te < majorHire || !major) {
      const id = regional ?? 'regional';
      const a = AIRLINES[id];
      const seat: Seat = te >= regionalCA ? 'CA' : 'FO';
      const longevity = te - regionalHire + 1;
      let rate = scaleRate(a, seat, 'NB', longevity);
      let caRateAsFo = false;
      if (seat === 'FO' && inp.envoyCaRule && a.foPaidCaRateAfter750?.value && longevity >= 2) {
        rate = scaleRate(a, 'CA', 'NB', longevity);
        caRateAsFo = true;
      }
      const f = raiseFactor(a, year, inp.payGrowthAfterContract);
      const annualCredit = inp.creditHours * 12;
      row = { ...row, airline: id, seat, phase: 'regional', label: `${a.code} ${SEAT_WORD(seat)}${caRateAsFo ? ' @CA RATE' : ''}`, longevity, rate, rateNow: rate.value * f, caRateAsFo, annualCredit, basePay: rate.value * f * annualCredit };
    } else {
      const a = AIRLINES[major];
      const seat: Seat = te >= majorCA ? 'CA' : 'FO';
      const fleet: Fleet = te >= widebodyCA && a.widebody ? 'WB' : 'NB';
      const longevity = te - majorHire + 1;
      const rate = scaleRate(a, seat, fleet, longevity);
      const f = raiseFactor(a, year, inp.payGrowthAfterContract);
      const annualCredit = inp.creditHours * 12;
      row = { ...row, airline: major, seat, fleet, phase: 'major', label: `${a.code} ${fleet === 'WB' ? 'WB ' : ''}${SEAT_WORD(seat)}`, longevity, rate, rateNow: rate.value * f, annualCredit, basePay: rate.value * f * annualCredit };
    }
    row.profitSharing = row.phase === 'regional' || row.phase === 'major' ? row.basePay * inp.profitSharingPct : 0;
    row.gross = row.basePay + row.profitSharing;
    years.push(row);
  }

  return { pathId: inp.pathId, regional, major, years, waypoints: buildWaypoints(years, regional, major, inp.retireAge) };
}

function buildWaypoints(years: CareerYear[], regional: AirlineId | null, major: AirlineId | null, retireAge: number): Waypoint[] {
  const wps: Waypoint[] = [];
  let prev: CareerYear | null = null;
  for (const y of years) {
    const wp = (label: string, kind: Waypoint['kind']) => wps.push({ age: y.age, year: y.year, label, pay: y.gross, kind });
    if (!prev) {
      wp(y.phase === 'training' ? 'TRAINING' : y.label.replace(' @CA RATE', ''), 'start');
    } else if (y.phase !== prev.phase || y.airline !== prev.airline || y.seat !== prev.seat || y.fleet !== prev.fleet || y.caRateAsFo !== prev.caRateAsFo) {
      if (y.phase === 'furlough') wp('FURLOUGH', 'furlough');
      else if (prev.phase === 'furlough') wp(`RECALL ${y.label}`, 'hire');
      else if (y.phase === 'cfi') wp('CFI', 'hire');
      else if (y.phase === 'regional' && prev.phase !== 'regional') wp(`${y.label.replace(' @CA RATE', '')}`, 'hire');
      else if (y.phase === 'regional' && y.caRateAsFo && !prev.caRateAsFo) wp('CA PAY RATE', 'upgrade');
      else if (y.phase === 'regional' && y.seat === 'CA') wp('CA UPGRADE', 'upgrade');
      else if (y.phase === 'major' && prev.phase !== 'major') {
        const flow = regional && major && AIRLINES[regional].flowTo === major;
        wp(flow ? `FLOW → ${AIRLINES[major].code}` : `HIRED ${AIRLINES[major!].code}`, 'flow');
      } else if (y.phase === 'major' && y.fleet === 'WB' && prev.fleet !== 'WB') wp('WIDEBODY', 'widebody');
      else if (y.phase === 'major' && y.seat === 'CA' && prev.seat !== 'CA') wp(`${AIRLINES[major!].code} CA`, 'upgrade');
    }
    prev = y;
  }
  const last = years[years.length - 1];
  if (last) wps.push({ age: retireAge, year: last.year + 1, label: retireAge >= 65 ? 'AGE 65' : `RETIRE ${retireAge}`, pay: 0, kind: 'end' });
  return wps;
}
