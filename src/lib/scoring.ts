import { QUESTIONS, SUPPLEMENT } from '../data/questionnaire';
import type { HorizonCategory, RiskCategory } from './types';

export type Answers = Record<string, number | null | undefined>; // question id → option index

/** Risk tolerance = Q1–Q6 (6–28): 6–9 Conservative · 10–16 Moderate · 17–23 Assertive · 24–28 Aggressive */
export function riskCategory(score: number): RiskCategory {
  if (score <= 9) return 'Conservative';
  if (score <= 16) return 'Moderate';
  if (score <= 23) return 'Assertive';
  return 'Aggressive';
}

/** Time horizon = Q7–Q10 (4–20): 4–7 Short-term · 8–13 Intermediate · 14+ Long-term */
export function horizonCategory(score: number): HorizonCategory {
  if (score <= 7) return 'Short-term';
  if (score <= 13) return 'Intermediate';
  return 'Long-term';
}

export const RISK_LABEL: Record<RiskCategory, string> = {
  Conservative: 'Conservative',
  Moderate: 'Moderate',
  Assertive: 'Assertive (above-average)',
  Aggressive: 'Aggressive',
};

export const RISK_RANGE = { min: 6, max: 28 } as const;
export const HORIZON_RANGE = { min: 4, max: 20 } as const;

export interface ScoreResult {
  risk: number;
  horizon: number;
  riskCategory: RiskCategory;
  horizonCategory: HorizonCategory;
  answered: number;
  complete: boolean;
  perQuestion: { id: string; n: number; points: number | null; group: 'risk' | 'horizon' }[];
}

export function pointsFor(qid: string, optionIndex: number | null | undefined): number | null {
  if (optionIndex === null || optionIndex === undefined) return null;
  const q = QUESTIONS.find((x) => x.id === qid);
  if (!q) throw new Error(`Unknown question ${qid}`);
  const opt = q.options[optionIndex];
  if (!opt) throw new Error(`Invalid option ${optionIndex} for ${qid}`);
  return opt.points;
}

export function scoreAnswers(answers: Answers): ScoreResult {
  let risk = 0;
  let horizon = 0;
  let answered = 0;
  const perQuestion = QUESTIONS.map((q) => {
    const p = pointsFor(q.id, answers[q.id]);
    if (p !== null) {
      answered++;
      if (q.group === 'risk') risk += p;
      else horizon += p;
    }
    return { id: q.id, n: q.n, points: p, group: q.group };
  });
  return {
    risk,
    horizon,
    riskCategory: riskCategory(risk),
    horizonCategory: horizonCategory(horizon),
    answered,
    complete: answered === QUESTIONS.length,
    perQuestion,
  };
}

// ---------------------------------------------------------------- Pilot Supplement (not scored with the class rubric)

export type SupplementAnswers = Partial<Record<'s1' | 's2' | 's3' | 's4', number | null>>;
export type CareerRiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';

export function careerRisk(s: SupplementAnswers): { points: number; level: CareerRiskLevel } {
  let points = 0;
  for (const q of SUPPLEMENT) {
    const idx = s[q.id];
    if (idx !== null && idx !== undefined) points += q.options[idx]?.risk ?? 0;
  }
  const level: CareerRiskLevel = points <= 1 ? 'LOW' : points <= 3 ? 'MODERATE' : points <= 5 ? 'ELEVATED' : 'HIGH';
  return { points, level };
}

/**
 * Recommended emergency fund in months of expenses.
 * 6 months default · single income or high income exposure → 9
 * · single income + early career (CFI/regional) + high exposure → 12.
 */
export function emergencyFundMonths(s: SupplementAnswers, earlyCareer: boolean): number {
  const singleIncome = s.s4 === 2;
  const highExposure = s.s1 === 2;
  if (singleIncome && earlyCareer) return highExposure ? 12 : 9;
  if (singleIncome || highExposure) return 9;
  return 6;
}
