/**
 * Data-quality ledger: every sourced figure the current plan actually uses, plus user-provided inputs and modelling
 * assumptions. unverifiedCount counts dataset items (origin 'data') with verified: false; userProvidedCount counts
 * origin 'user'. Assumptions are listed but not counted as unverified.
 */
import type { DataQualityItem, Sourced } from './types';
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from './types';
import type { PlanState } from './inputs';
import type { CareerSim } from './career';
import type { LedgerUsage } from './plan';
import { LIMITS_2026 } from '../data/irs2026';
import { BRACKETS_2026, FICA, STANDARD_DEDUCTION_2026 } from '../data/tax2026';
import { STATES } from '../data/states';
import { IBR, RAP, TIERED_STANDARD } from '../data/loans';
import { BEND_POINTS } from '../data/ss';
import { CMA_AS_OF } from '../data/cma';
import { CURRENT_YEAR } from './inputs';

function item(key: string, label: string, s: Sourced<unknown>, value: number | string, origin: DataQualityItem['origin'] = 'data'): DataQualityItem {
  return { key, label, value, source: s.source, url: s.url, asOf: s.asOf, verified: s.verified, note: s.note, origin };
}

function userItem(key: string, label: string, value: number | string, note?: string): DataQualityItem {
  return { key, label, value, source: 'Entered by the client / advisor', asOf: `${CURRENT_YEAR}-11`, verified: false, note, origin: 'user' };
}

export interface DataQualityContext {
  sims: CareerSim[];
  usage: LedgerUsage;
}

export function collectDataQuality(state: PlanState, ctx: DataQualityContext): { unverifiedCount: number; userProvidedCount: number; items: DataQualityItem[] } {
  const items: DataQualityItem[] = [];
  const seen = new Set<string>();
  const add = (it: DataQualityItem) => {
    if (seen.has(it.key)) return;
    seen.add(it.key);
    items.push(it);
  };
  const status = state.profile.filingStatus;
  const u = ctx.usage;

  // Career bands and metro indexes actually used
  for (const sim of ctx.sims) for (const it of sim.dataQuality) add(it);
  for (const path of state.careerPaths) {
    if (path.occupationCode === 'custom' && path.customLevels?.length) {
      add(userItem(`custom-ladder:${path.id}`, `${path.name}: custom career ladder`, `${path.customLevels.length} levels`, 'Self-reported salary bands'));
    }
  }

  // State tax
  const code = state.profile.stateCode;
  if (code === 'CUSTOM') add(userItem('state:custom', 'State tax rate (custom)', state.profile.customStateRate ?? 0));
  else {
    const st = STATES[code];
    if (!st) add(userItem(`state:${code}`, `State tax preset ${code || '(none)'}`, 'not loaded', 'No preset for this state; state tax modelled as zero'));
    else {
      const t = st.tax;
      if (t.type === 'none' || t.type === 'flat') add(item(`state:${code}`, `${st.name} income tax rate`, t.rate, t.rate.value));
      else if (t.type === 'brackets') add(item(`state:${code}`, `${st.name} income tax brackets`, status === 'mfj' ? t.mfj : t.single, 'bracket table'));
      else add(item(`state:${code}`, `${st.name} effective tax curve`, t.curve, 'effective-rate curve'));
    }
  }

  // IRS limits in use
  add(item('irs:electiveDeferral', '401(k) elective deferral limit (2026)', LIMITS_2026.electiveDeferral, LIMITS_2026.electiveDeferral.value));
  if (u.catchUp) add(item('irs:catchUp50', '401(k) age-50 catch-up (2026)', LIMITS_2026.catchUp50, LIMITS_2026.catchUp50.value));
  if (u.superCatchUp) add(item('irs:catchUp60to63', '401(k) age 60-63 catch-up (2026)', LIMITS_2026.catchUp60to63, LIMITS_2026.catchUp60to63.value));
  add(item('irs:415c', '§415(c) annual additions limit (2026)', LIMITS_2026.annualAdditions415c, LIMITS_2026.annualAdditions415c.value));
  add(item('irs:401a17', '§401(a)(17) compensation cap (2026)', LIMITS_2026.compensationCap401a17, LIMITS_2026.compensationCap401a17.value));
  add(item('irs:ira', 'IRA contribution limit (2026)', LIMITS_2026.ira, LIMITS_2026.ira.value));
  const rp = LIMITS_2026.rothPhaseOut[status];
  add(item(`irs:rothPhaseOut:${status}`, `Roth IRA MAGI phase-out (${status})`, rp, `${rp.value.lo}-${rp.value.hi}`));
  if (u.tradIraPhaseOut) {
    const tp = LIMITS_2026.tradIraDeductionPhaseOut[status];
    add(item(`irs:tradIraPhaseOut:${status}`, `Traditional IRA deduction phase-out (${status})`, tp, `${tp.value.lo}-${tp.value.hi}`));
  }
  if (u.hsa) {
    const fam = status === 'mfj' || state.profile.dependents > 0;
    const h = fam ? LIMITS_2026.hsa.family : LIMITS_2026.hsa.self;
    add(item(`irs:hsa:${fam ? 'family' : 'self'}`, `HSA limit ${fam ? 'family' : 'self-only'} (2026)`, h, h.value));
  }
  if (u.s127) add(item('irs:127', '§127 educational assistance exclusion', LIMITS_2026.educationalAssistance127, LIMITS_2026.educationalAssistance127.value));

  // Federal tax tables
  add(item(`tax:brackets:${status}`, `Federal tax brackets 2026 (${status})`, BRACKETS_2026[status], 'bracket table'));
  add(item(`tax:standardDeduction:${status}`, `Standard deduction 2026 (${status})`, STANDARD_DEDUCTION_2026[status], STANDARD_DEDUCTION_2026[status].value));
  add(item('fica:wageBase:2026', 'Social Security wage base 2026', FICA.wageBase[2026], FICA.wageBase[2026].value));
  add(item('fica:wageBase:2027', 'Social Security wage base 2027', FICA.wageBase[2027], FICA.wageBase[2027].value));

  // Loan rules
  if (u.rap) add(item('loans:rap', 'RAP payment tiers', RAP.tiers, 'tier table'));
  if (u.tiered) add(item('loans:tiered', 'Tiered standard plan terms', TIERED_STANDARD, 'term table'));
  if (u.ibr) add(item('loans:ibr:poverty', 'HHS poverty guideline 2026 (IBR)', IBR.povertyGuideline2026, IBR.povertyGuideline2026.value));

  // Social Security
  if (state.assumptions.ssOverrideAnnual !== undefined && state.assumptions.ssOverrideAnnual !== null) {
    add(userItem('ss:override', 'Social Security benefit (SSA statement)', state.assumptions.ssOverrideAnnual));
  } else {
    const bp = BEND_POINTS[CURRENT_YEAR] ?? BEND_POINTS[2025];
    add(item('ss:bendPoints', `Social Security bend points ${CURRENT_YEAR}`, bp, `${bp.value.first} / ${bp.value.second}`));
  }

  // Capital-market assumptions
  for (const k of ASSET_CLASSES) {
    const e = state.assumptions.cma[k];
    items.push({
      key: `cma:${k}`,
      label: `${ASSET_CLASS_LABELS[k]} expected return / volatility`,
      value: `${(e.ret * 100).toFixed(1)}% / ${(e.vol * 100).toFixed(1)}%`,
      source: 'Advisor-editable capital-market assumption (not a forecast)',
      asOf: CMA_AS_OF,
      verified: false,
      origin: 'assumption',
    });
  }
  items.push({ key: 'assumption:inflation', label: 'Inflation', value: state.assumptions.inflation, source: 'Plan assumption', asOf: CMA_AS_OF, verified: false, origin: 'assumption' });

  // User overrides
  const a = state.assumptions;
  if (a.equityOverride !== undefined) add(userItem('override:equity', 'Equity allocation override', a.equityOverride));
  if (a.retirementSpendingOverride !== undefined) add(userItem('override:retirementSpending', 'Retirement spending override (today\'s $)', a.retirementSpendingOverride));
  if (state.savings.emergencyFundMonthsOverride !== undefined) add(userItem('override:emergencyMonths', 'Emergency-fund months override', state.savings.emergencyFundMonthsOverride));
  if (state.profile.stateCode === 'CUSTOM' && state.profile.customStateRate !== undefined) add(userItem('override:stateRate', 'Custom state tax rate', state.profile.customStateRate));

  let unverifiedCount = 0;
  let userProvidedCount = 0;
  for (const it of items) {
    if (it.origin === 'data' && !it.verified) unverifiedCount++;
    if (it.origin === 'user') userProvidedCount++;
  }
  return { unverifiedCount, userProvidedCount, items };
}
