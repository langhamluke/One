/**
 * Airline career / pay simulation for one airline CareerPath (Flight Plan), year by year from CURRENT_YEAR to life
 * expectancy. Produces the same CareerSim shape as the occupation-ladder simulation so the ledger, Monte Carlo,
 * alerts and charts need no special cases beyond the optional airline fields on PayRow.
 *
 * Rules (ported from Flight Plan's payroll model)
 *  - Stages: student (1 year of zero pay) → CFI (time-building salary) → regional (FO, then CA after
 *    milestones.regionalCaUpgrade years) → major (hired/flow after milestones.toMajor years at the regional; CA after
 *    milestones.majorCaUpgrade years; widebody milestones.widebody years after the CA upgrade when the fleet has one).
 *  - A pilot already at a regional keeps that regional and its longevity (yearsAtEmployer); a pilot already at a
 *    major/cargo carrier stays there for every path.
 *  - Pay = rate(seat, fleet, longevity) × contract multiplier(year) × credit hours × 12. CFI pay is an annual salary.
 *    Rates are nominal contract rates; dated raises apply first, then the path's pay-growth assumption.
 *  - Envoy FOs are paid at the captain rate from longevity year 2 (750-hour rule) when the rule is on.
 *  - Profit sharing (path.airline.profitSharingPct × base pay) in regional and major years, carried as `bonus`.
 *  - What-ifs: upgradeDelayYears pushes both captain upgrades later; furloughYears inserts zero-pay years right after
 *    joining the major and freezes seniority (longevity resumes where it stopped).
 *  - Airline flying ends at the FAA age limit (65) even if the plan retires later; the row is 'retired' from then on
 *    and the sim flags 'faa-age-65'.
 *  - Company retirement money: the airline's non-elective % (employerPctOverride) replaces the generic match in the
 *    ledger; Southwest's 2% MBCB is a cash-balance credit; FedEx pilots hired before the 2026 CBA accrue the legacy
 *    pension (or switch to the MBCB from 2028 if fedexOption = 'mbcb'); pilots who join FedEx later get the MBCB only.
 *    The legacy pension pays maxAnnualBenefit × min(1, years/fullServiceYears) × min(1, FAE/faeCap), nominal, no COLA.
 */
import { CURRENT_YEAR, type CareerPath, type PlanState, type WhatIf } from './inputs';
import {
  AIRLINES,
  AIRLINE_PATHS,
  airlinePathName,
  contractMultiplier,
  resolveAirlines,
  isCaptainStage,
  isMajorStage,
  isRegionalStage,
  milestonesFor,
  rateFor,
  type Airline,
  type AirlineId,
  type Fleet,
  type Seat,
} from '../data/airlines';
import type { Waypoint } from './derived';
import type { CareerSim, PayRow } from './career';
import type { DataQualityItem } from './types';

export const FAA_RETIREMENT_AGE = 65;
/** §401(a)(17) compensation cap used for the FedEx MBCB credit (2026, indexed in the ledger's own math) */
const FDX_MBCB_COMP_CAP = 360000;

const INF = 1e9;

interface Phase {
  airline: AirlineId | null;
  seat: Seat | null;
  fleet: Fleet;
  phase: 'training' | 'cfi' | 'regional' | 'major' | 'furlough';
  label: string;
  longevity: number;
  caRateAsFo: boolean;
}

function seatLabel(seat: Seat): string {
  return seat === 'CA' ? 'CA' : 'FO';
}

export function simulateAirlinePath(state: PlanState, path: CareerPath, whatIf: WhatIf): CareerSim {
  const a = state.assumptions;
  const prof = state.profile;
  const pilot = prof.pilot ?? { stage: 'regional_fo' as const, employer: 'regional' as const, hours: 1500, yearsAtEmployer: 0, creditHours: 80, domicile: '' };
  const cfg = path.airline ?? { pathId: 'envoy-aa' as const, milestones: {}, profitSharingPct: 0, payGrowthAfterContract: 0.03, envoyCaRateRule: true, fedexOption: 'legacy' as const };
  const infl = a.inflation;
  const age0 = prof.age;
  const n = Math.max(1, Math.floor(a.lifeExpectancy) - Math.floor(age0) + 1);
  const plannedRetire = whatIf.retireAtOverride ?? prof.retirementAge;
  const retireAt = Math.min(plannedRetire, FAA_RETIREMENT_AGE);
  const flags: string[] = [];
  if (plannedRetire > FAA_RETIREMENT_AGE) flags.push('faa-age-65');
  const dq: DataQualityItem[] = [];
  const waypoints: Waypoint[] = [];
  const rows: PayRow[] = [];
  const creditHours = Math.max(0, pilot.creditHours);
  const growth = Math.max(-0.5, cfg.payGrowthAfterContract);
  const delay = Math.max(0, Math.floor(whatIf.upgradeDelayYears ?? 0));
  const furlough = Math.max(0, Math.round(whatIf.furloughYears ?? 0));
  const ms = milestonesFor(cfg.pathId, cfg.milestones);
  const stage = pilot.stage;
  const employer = pilot.employer;
  const resolved = resolve(path, state);
  const regionalId = resolved.regional;
  const majorId = resolved.major;
  const major = majorId ? AIRLINES[majorId] : null;

  // ---- Timeline (year indexes; negative = already happened)
  let studentYears = 0;
  let regionalStart = INF;
  let regionalCa = INF;
  let majorStart = INF;
  let majorCa = INF;
  let widebodyAt = INF;
  if (stage === 'student' || stage === 'cfi') {
    studentYears = stage === 'student' ? 1 : 0;
    regionalStart = studentYears + ms.toRegional;
  } else if (isRegionalStage(stage)) {
    regionalStart = -Math.max(0, pilot.yearsAtEmployer);
  }
  if (regionalStart !== INF) {
    regionalCa = stage === 'regional_ca' ? -INF : regionalStart + ms.regionalCaUpgrade + delay;
    if (major) majorStart = Math.max(regionalStart + ms.toMajor, isRegionalStage(stage) ? 1 : regionalStart);
    if (regionalId === null) majorStart = regionalStart;
  }
  if (isMajorStage(stage)) majorStart = -Math.max(0, pilot.yearsAtEmployer);
  if (majorStart !== INF) {
    majorCa = isCaptainStage(stage) && isMajorStage(stage) ? -INF : Math.max(majorStart + ms.majorCaUpgrade + delay, isMajorStage(stage) ? 1 : majorStart);
    if (major?.widebody && ms.widebody > 0) widebodyAt = majorCa === -INF ? majorStart + ms.majorCaUpgrade + ms.widebody : majorCa + ms.widebody;
  }
  const cfiEnd = regionalStart === INF ? 0 : regionalStart;
  const furloughStart = majorStart !== INF && majorStart >= 0 ? majorStart + 1 : 1;

  // ---- FedEx pension / MBCB
  const atFedExNow = employer === 'fedex' && (stage === 'cargo_fo' || stage === 'cargo_ca');
  let fdxServiceYears = atFedExNow ? Math.max(0, pilot.yearsAtEmployer) : 0;
  const recentGross: number[] = [];
  let pensionNominal = 0;

  const usedRates = new Set<string>();
  const usedAirlines = new Set<AirlineId>();
  const noteRate = (al: Airline, seat: Seat, fleet: Fleet, longevity: number, r: { value: number; source: string; url?: string; asOf: string; verified: boolean; note?: string }) => {
    const key = `rate:${path.id}:${al.id}:${seat}:${fleet}:${Math.min(12, Math.max(1, longevity))}`;
    if (usedRates.has(key)) return;
    usedRates.add(key);
    const unit = al.payUnit === 'salary' ? 'annual pay' : al.payUnit === 'TFP' ? 'rate per TFP' : 'hourly rate';
    dq.push({ key, label: `${al.code} ${fleet === 'WB' ? 'widebody ' : ''}${seatLabel(seat)} year ${Math.min(12, Math.max(1, longevity))} ${unit}`, value: r.value, source: r.source, url: r.url, asOf: r.asOf, verified: r.verified, note: r.note, origin: 'data' });
  };
  const noteAirline = (al: Airline) => {
    if (usedAirlines.has(al.id)) return;
    usedAirlines.add(al.id);
    const cp = al.retirement.companyPct;
    dq.push({ key: `airline:${path.id}:${al.id}:companyPct`, label: `${al.code} company 401(k) contribution (% of pay)`, value: cp.value, source: cp.source, url: cp.url, asOf: cp.asOf, verified: cp.verified, note: cp.note, origin: 'data' });
    const eh = al.retirement.excessHandling;
    if (al.kind === 'major' || al.kind === 'cargo') {
      dq.push({ key: `airline:${path.id}:${al.id}:excess`, label: `${al.code} handling of company money above §415(c)`, value: eh.value, source: eh.source, url: eh.url, asOf: eh.asOf, verified: eh.verified, note: eh.note, origin: 'data' });
    }
    if (al.retirement.mbcbPct && al.id !== 'fedex') {
      const m = al.retirement.mbcbPct;
      dq.push({ key: `airline:${path.id}:${al.id}:mbcb`, label: `${al.code} market-based cash balance credit (% of pay)`, value: m.value, source: m.source, url: m.url, asOf: m.asOf, verified: m.verified, note: m.note, origin: 'data' });
    }
    for (const r of al.raises) {
      dq.push({ key: `airline:${path.id}:${al.id}:raise:${r.effective}`, label: `${al.code} contract raise ${r.effective.slice(0, 4)} (%)`, value: r.pct.value, source: r.pct.source, url: r.pct.url, asOf: r.pct.asOf, verified: r.pct.verified, note: r.pct.note, origin: 'data' });
    }
  };

  let prev: Phase | null = null;
  let firstIncomeYearIndex = -1;
  let retireNoted = false;
  let levelIndex = -1;

  for (let i = 0; i < n; i++) {
    const age = age0 + i;
    const year = CURRENT_YEAR + i;
    const retired = age >= retireAt;
    const row: PayRow = {
      yearIndex: i,
      year,
      age,
      stage: 'working',
      levelTitle: '',
      levelIndex: Math.max(0, levelIndex),
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
      yearsOfService: fdxServiceYears,
      gapMonths: 0,
    };

    if (retired) {
      row.stage = 'retired';
      row.levelTitle = 'Retired';
      if (!retireNoted) {
        retireNoted = true;
        if (pensionNominal === 0 && fdxServiceYears > 0 && major?.retirement.pension) {
          const p = major.retirement.pension;
          const fae = recentGross.length ? recentGross.reduce((s, g) => s + g, 0) / recentGross.length : 0;
          const idxAtRetire = Math.pow(1 + infl, i);
          pensionNominal = p.maxAnnualBenefit.value * idxAtRetire * Math.min(1, fdxServiceYears / Math.max(1, p.fullServiceYears.value)) * Math.min(1, fae / Math.max(1, p.faeCap.value * idxAtRetire));
          dq.push({ key: `airline:${path.id}:fedex:pension`, label: 'FDX legacy pension maximum annual benefit', value: p.maxAnnualBenefit.value, source: p.maxAnnualBenefit.source, url: p.maxAnnualBenefit.url, asOf: p.maxAnnualBenefit.asOf, verified: p.maxAnnualBenefit.verified, note: p.maxAnnualBenefit.note, origin: 'data' });
          dq.push({ key: `airline:${path.id}:fedex:faeCap`, label: 'FDX pension final-average-earnings cap', value: p.faeCap.value, source: p.faeCap.source, url: p.faeCap.url, asOf: p.faeCap.asOf, verified: p.faeCap.verified, note: p.faeCap.note, origin: 'data' });
          flags.push('fedex-pension');
        }
        waypoints.push({ yearIndex: i, age, label: retireAt === FAA_RETIREMENT_AGE && plannedRetire >= FAA_RETIREMENT_AGE ? 'Age 65 (FAA)' : `Retired at ${retireAt}`, pay: 0, kind: 'retire' });
      }
      row.pensionIncome = pensionNominal;
      row.yearsOfService = fdxServiceYears;
      rows.push(row);
      continue;
    }

    const inFurlough = furlough > 0 && i >= furloughStart && i < furloughStart + furlough;
    const k = furlough > 0 && i >= furloughStart + furlough ? i - furlough : i;
    let cur: Phase;
    let basePay = 0;
    let airline: Airline | null = null;

    if (inFurlough) {
      cur = { airline: majorId, seat: null, fleet: 'NB', phase: 'furlough', label: 'Furlough', longevity: 0, caRateAsFo: false };
      row.stage = 'gap';
      row.gapMonths = 12;
    } else if (k < studentYears) {
      cur = { airline: null, seat: null, fleet: 'NB', phase: 'training', label: 'Student pilot', longevity: 0, caRateAsFo: false };
      row.stage = 'pre-start';
    } else if (k < cfiEnd) {
      airline = AIRLINES.cfi;
      const r = airline.narrowbody.fo[0];
      const mult = contractMultiplier(airline, year, growth);
      basePay = r.value * mult;
      cur = { airline: 'cfi', seat: null, fleet: 'NB', phase: 'cfi', label: 'CFI', longevity: k - studentYears + 1, caRateAsFo: false };
      noteRate(airline, 'FO', 'NB', 1, r);
      row.hourlyRate = r.value * mult;
    } else if (k < majorStart || !major) {
      const rid: AirlineId = regionalId ?? 'regional';
      airline = AIRLINES[rid];
      const seat: Seat = k >= regionalCa ? 'CA' : 'FO';
      const longevity = k - regionalStart + 1;
      let r = rateFor(airline, seat, 'NB', longevity);
      let caRateAsFo = false;
      if (seat === 'FO' && cfg.envoyCaRateRule && airline.foPaidCaRateAfter750?.value && longevity >= 2) {
        r = rateFor(airline, 'CA', 'NB', longevity);
        caRateAsFo = true;
      }
      const mult = contractMultiplier(airline, year, growth);
      basePay = r.value * mult * creditHours * 12;
      cur = { airline: rid, seat, fleet: 'NB', phase: 'regional', label: `${airline.code} ${seatLabel(seat)}${caRateAsFo ? ' @CA rate' : ''}`, longevity, caRateAsFo };
      noteRate(airline, caRateAsFo ? 'CA' : seat, 'NB', longevity, r);
      row.hourlyRate = r.value * mult;
    } else {
      airline = major;
      const seat: Seat = k >= majorCa ? 'CA' : 'FO';
      const fleet: Fleet = k >= widebodyAt && airline.widebody ? 'WB' : 'NB';
      const longevity = k - majorStart + 1;
      const r = rateFor(airline, seat, fleet, longevity);
      const mult = contractMultiplier(airline, year, growth);
      basePay = r.value * mult * creditHours * 12;
      cur = { airline: majorId, seat, fleet, phase: 'major', label: `${airline.code} ${fleet === 'WB' ? 'WB ' : ''}${seatLabel(seat)}`, longevity, caRateAsFo: false };
      noteRate(airline, seat, fleet, longevity, r);
      row.hourlyRate = r.value * mult;
    }

    if (airline) noteAirline(airline);
    const paidPhase = cur.phase === 'regional' || cur.phase === 'major';
    row.wages = basePay;
    row.bonus = paidPhase ? basePay * Math.max(0, cfg.profitSharingPct) : 0;
    row.airline = cur.airline ?? undefined;
    row.seat = cur.seat ?? undefined;
    row.fleet = cur.phase === 'major' ? cur.fleet : undefined;
    row.longevity = cur.longevity || undefined;
    row.caRateAsFo = cur.caRateAsFo || undefined;
    row.levelTitle = cur.label;
    if (!prev || prev.label !== cur.label) levelIndex++;
    row.levelIndex = Math.max(0, levelIndex);

    // Company retirement money
    if (airline && (cur.phase === 'cfi' || paidPhase)) {
      row.employerPctOverride = Math.max(0, airline.retirement.companyPct.value) / 100;
      row.excessHandling = cfg.excessHandlingOverride ?? airline.retirement.excessHandling.value;
      let mbcb = 0;
      if (airline.retirement.mbcbPct && airline.id !== 'fedex') mbcb += (row.wages + row.bonus) * (airline.retirement.mbcbPct.value / 100);
      if (airline.id === 'fedex' && cur.phase === 'major') {
        const newHire = !atFedExNow;
        const onMbcb = newHire || (cfg.fedexOption === 'mbcb' && year >= 2028);
        if (onMbcb) {
          const pct = (year <= 2028 ? 9 : 10) / 100;
          mbcb += Math.min(row.wages + row.bonus, FDX_MBCB_COMP_CAP * Math.pow(1 + infl, i)) * pct;
          flags.push('fedex-mbcb');
        }
        if (!newHire && (cfg.fedexOption === 'legacy' || year <= 2027)) fdxServiceYears += 1;
      }
      row.mbcbCredit = mbcb > 0 ? mbcb : undefined;
    } else if (cur.phase === 'furlough') {
      row.employerPctOverride = 0;
    }
    if (cur.phase === 'major' && airline?.id === 'fedex') {
      recentGross.push(row.wages + row.bonus);
      if (recentGross.length > 5) recentGross.shift();
    }
    row.yearsOfService = fdxServiceYears;

    // Waypoints
    const wp = (label: string, kind: Waypoint['kind']) => waypoints.push({ yearIndex: i, age, label, pay: row.wages + row.bonus, kind });
    if (!prev) wp(cur.label.replace(' @CA rate', ''), 'start');
    else if (prev.label !== cur.label || prev.phase !== cur.phase) {
      if (cur.phase === 'furlough') wp('Furlough', 'gap');
      else if (prev.phase === 'furlough') wp(`Recall ${cur.label}`, 'event');
      else if (cur.phase === 'cfi') wp('CFI', 'event');
      else if (cur.phase === 'regional' && prev.phase !== 'regional') wp(`Hired ${cur.label.replace(' @CA rate', '')}`, 'event');
      else if (cur.phase === 'regional' && cur.caRateAsFo && !prev.caRateAsFo) wp('CA pay rate', 'promotion');
      else if (cur.phase === 'regional' && cur.seat === 'CA' && prev.seat !== 'CA') wp('CA upgrade', 'promotion');
      else if (cur.phase === 'major' && prev.phase !== 'major') {
        const flow = regionalId && majorId && AIRLINES[regionalId].flowTo === majorId;
        wp(flow ? `Flow → ${AIRLINES[majorId!].code}` : `Hired ${AIRLINES[majorId!].code}`, 'promotion');
      } else if (cur.phase === 'major' && cur.fleet === 'WB' && prev.fleet !== 'WB') wp('Widebody', 'promotion');
      else if (cur.phase === 'major' && cur.seat === 'CA' && prev.seat !== 'CA') wp(`${AIRLINES[majorId!].code} CA`, 'promotion');
    }
    prev = cur;

    if (row.wages > 0 && firstIncomeYearIndex < 0) firstIncomeYearIndex = i;
    rows.push(row);
  }

  const ladderTitle = airlinePathName(cfg.pathId, stage, employer);
  return {
    pathId: path.id,
    name: path.name,
    rows,
    waypoints,
    firstIncomeYearIndex,
    ladders: [{ code: `airline:${cfg.pathId}`, title: ladderTitle, levels: [], origin: 'data', fallback: false }],
    metroIndex: 1,
    flags,
    dataQuality: dq,
    airline: { regional: regionalId, major: majorId, retireAt, milestones: ms },
  };
}

/** Regional and major for a path given the pilot's current position. A bad saved pathId degrades to the generic regional. */
export function resolve(path: CareerPath, state: PlanState): { regional: AirlineId | null; major: AirlineId | null } {
  const pilot = state.profile.pilot;
  const stage = pilot?.stage ?? 'regional_fo';
  const employer = pilot?.employer ?? 'regional';
  const choice = path.airline?.pathId ?? 'envoy-aa';
  if (choice !== 'stay' && !AIRLINE_PATHS[choice]) return { regional: 'regional', major: null };
  return resolveAirlines(choice, stage, employer);
}
