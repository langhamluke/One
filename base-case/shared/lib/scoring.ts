/**
 * Risk questionnaire scoring (FNCE 2830 structure) and the emergency-fund months rule.
 *   risk tolerance = Q1-Q6 (6-28): 6-9 Conservative, 10-16 Moderate, 17-23 Assertive, 24-28 Aggressive
 *   time horizon   = Q7-Q10 (4-20): 4-7 Short-term, 8-13 Intermediate, 14-20 Long-term
 * The supplement (s1-s4) is NOT part of the score; it feeds the emergency-fund target.
 */
import { HORIZON_BANDS, QUESTIONS, RISK_BANDS } from '../data/questionnaire';
import type { HorizonCategory, RiskCategory } from './types';
import { isPilotPlan, type PlanState } from './inputs';
import type { RiskProfile } from './derived';
import { isEarlyCareerStage } from '../data/airlines';

export const RISK_IDS = QUESTIONS.filter((q) => q.section === 'risk').map((q) => q.id);
export const HORIZON_IDS = QUESTIONS.filter((q) => q.section === 'horizon').map((q) => q.id);

/** Sum of the chosen options' points for one section; null when any question is unanswered or out of range. */
export function sectionScore(answers: Record<string, number | null> | undefined, section: 'risk' | 'horizon'): number | null {
  let total = 0;
  for (const q of QUESTIONS) {
    if (q.section !== section) continue;
    const idx = answers?.[q.id];
    if (idx === null || idx === undefined || !Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return null;
    total += q.options[idx].points;
  }
  return total;
}

export function riskScore(answers: Record<string, number | null> | undefined): number | null {
  return sectionScore(answers, 'risk');
}

export function horizonScore(answers: Record<string, number | null> | undefined): number | null {
  return sectionScore(answers, 'horizon');
}

export function riskCategory(score: number): RiskCategory {
  for (const b of RISK_BANDS) if (score <= b.max) return b.category;
  return RISK_BANDS[RISK_BANDS.length - 1].category;
}

export function horizonCategory(score: number): HorizonCategory {
  for (const b of HORIZON_BANDS) if (score <= b.max) return b.category;
  return HORIZON_BANDS[HORIZON_BANDS.length - 1].category;
}

/** Provisional horizon from years to retirement: <=5 Short-term, 6-12 Intermediate, 13+ Long-term. */
export function horizonFromYears(yearsToRetirement: number): HorizonCategory {
  if (yearsToRetirement <= 5) return 'Short-term';
  if (yearsToRetirement <= 12) return 'Intermediate';
  return 'Long-term';
}

export function answeredCount(answers: Record<string, number | null> | undefined): number {
  let n = 0;
  for (const q of QUESTIONS) {
    const idx = answers?.[q.id];
    if (idx !== null && idx !== undefined && Number.isInteger(idx) && idx >= 0 && idx < q.options.length) n++;
  }
  return n;
}

/**
 * Risk profile for the plan. When the questionnaire is incomplete the profile is provisional:
 * risk 'Moderate' (unless the risk section alone is complete) and horizon from years to retirement
 * (unless the horizon section alone is complete).
 */
export function riskProfile(state: PlanState): RiskProfile {
  const rs = riskScore(state.answers);
  const hs = horizonScore(state.answers);
  const yearsToRetirement = (state.whatIf?.retireAtOverride ?? state.profile.retirementAge) - state.profile.age;
  const provisional = rs === null || hs === null;
  return {
    riskScore: rs,
    horizonScore: hs,
    risk: rs === null ? 'Moderate' : riskCategory(rs),
    horizon: hs === null ? horizonFromYears(yearsToRetirement) : horizonCategory(hs),
    provisional,
    answered: answeredCount(state.answers),
    total: QUESTIONS.length,
  };
}

export interface EmergencyMonthsResult {
  months: number;
  reason: string;
  /** Which rule fired */
  rule: 'override' | 'default' | 'single-or-exposed' | 'single-early-exposed';
}

/**
 * Emergency-fund months target.
 *  - savings.emergencyFundMonthsOverride wins when set
 *  - 12 when single income (s4 = No) AND early career AND high exposure
 *  - 9 when single income OR high exposure (s1 volatile, or s2 = 20%+ variable pay)
 *  - otherwise assumptions.emergencyMonthsDefault (6)
 * Unanswered supplement questions do not trigger a rule.
 *
 * Both supplements store option VALUES with the same meaning: s1 = 2 high exposure, s2 = 2 heavy variable pay /
 * employer-stock reliance, s4 = 0 no second income. "Early career" is age < 30 for graduates; for pilots it is the
 * stage (student, CFI or regional).
 */
export function emergencyMonths(state: PlanState): EmergencyMonthsResult {
  const override = state.savings?.emergencyFundMonthsOverride;
  if (override !== undefined && override !== null && Number.isFinite(override)) {
    return { months: Math.max(0, override), reason: 'Advisor override', rule: 'override' };
  }
  const s = state.supplement ?? {};
  const pilot = isPilotPlan(state);
  const singleIncome = s.s4 === 0;
  const volatile = s.s1 === 2;
  const variablePay = s.s2 === 2;
  const highExposure = volatile || variablePay;
  const stage = state.profile.pilot?.stage;
  const earlyCareer = pilot && stage ? isEarlyCareerStage(stage) : state.profile.age < 30;
  const base = Math.max(0, state.assumptions?.emergencyMonthsDefault ?? 6);
  const volatileWhy = pilot ? 'high airline exposure (junior seniority, furlough or base-closure history)' : 'a volatile industry';
  const variableWhy = pilot ? 'reliance on employer stock or profit sharing' : 'variable pay';
  if (singleIncome && earlyCareer && highExposure) {
    return {
      months: 12,
      reason: `Single income, early career and ${volatile ? volatileWhy : variableWhy}: 12 months`,
      rule: 'single-early-exposed',
    };
  }
  if (singleIncome || highExposure) {
    const why = [singleIncome ? 'single income' : '', volatile ? (pilot ? 'high airline exposure' : 'volatile industry') : '', variablePay ? (pilot ? 'employer stock / profit-sharing reliance' : '20%+ variable pay') : '']
      .filter(Boolean)
      .join(', ');
    return { months: 9, reason: `${why.charAt(0).toUpperCase()}${why.slice(1)}: 9 months`, rule: 'single-or-exposed' };
  }
  return { months: base, reason: `Default target: ${base} months of essentials`, rule: 'default' };
}
