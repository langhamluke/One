import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../../shared/data/questionnaire';
import { emergencyMonths, horizonScore, riskCategory, riskProfile, riskScore, horizonCategory } from '../../shared/lib/scoring';
import { defaultPlanState, emptyAnswers } from '../../shared/lib/inputs';

/** Build answers from option INDEXES per question id (real combinations, not synthetic points). */
function answers(idx: Record<string, number>): Record<string, number | null> {
  const a = emptyAnswers();
  for (const [k, v] of Object.entries(idx)) a[k] = v;
  return a;
}

function pointsOf(a: Record<string, number | null>, ids: string[]): number {
  return ids.reduce((s, id) => s + QUESTIONS.find((q) => q.id === id)!.options[a[id]!].points, 0);
}

describe('questionnaire scoring', () => {
  it('scores the minimum and maximum of each section (6/4 and 28/20)', () => {
    const min = answers({ q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0, q8: 0, q9: 0, q10: 0 });
    expect(riskScore(min)).toBe(6);
    expect(horizonScore(min)).toBe(4);
    const max = answers({ q1: 4, q2: 3, q3: 3, q4: 5, q5: 4, q6: 3, q7: 3, q8: 3, q9: 3, q10: 3 });
    expect(riskScore(max)).toBe(28);
    expect(horizonScore(max)).toBe(20);
    expect(riskCategory(6)).toBe('Conservative');
    expect(riskCategory(28)).toBe('Aggressive');
    expect(horizonCategory(4)).toBe('Short-term');
    expect(horizonCategory(20)).toBe('Long-term');
  });

  it('hits every risk boundary with real answer combinations (9/10, 16/17, 23/24)', () => {
    const cases: [Record<string, number>, number, string][] = [
      [{ q1: 3, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0 }, 9, 'Conservative'],
      [{ q1: 4, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0 }, 10, 'Moderate'],
      [{ q1: 4, q2: 3, q3: 3, q4: 0, q5: 0, q6: 0 }, 16, 'Moderate'],
      [{ q1: 4, q2: 3, q3: 3, q4: 1, q5: 0, q6: 0 }, 17, 'Assertive'],
      [{ q1: 4, q2: 3, q3: 3, q4: 5, q5: 2, q6: 0 }, 23, 'Assertive'],
      [{ q1: 4, q2: 3, q3: 3, q4: 5, q5: 3, q6: 0 }, 24, 'Aggressive'],
    ];
    for (const [idx, score, cat] of cases) {
      const a = answers(idx);
      expect(pointsOf(a, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])).toBe(score);
      expect(riskScore(a)).toBe(score);
      expect(riskCategory(riskScore(a)!)).toBe(cat);
    }
  });

  it('hits every horizon boundary with real answer combinations (7/8, 13/14)', () => {
    const cases: [Record<string, number>, number, string][] = [
      [{ q7: 2, q8: 0, q9: 0, q10: 0 }, 7, 'Short-term'],
      [{ q7: 2, q8: 1, q9: 0, q10: 0 }, 8, 'Intermediate'],
      [{ q7: 3, q8: 3, q9: 0, q10: 0 }, 13, 'Intermediate'],
      [{ q7: 3, q8: 3, q9: 1, q10: 0 }, 14, 'Long-term'],
    ];
    for (const [idx, score, cat] of cases) {
      const a = answers(idx);
      expect(horizonScore(a)).toBe(score);
      expect(horizonCategory(score)).toBe(cat);
    }
  });

  it('returns null when any question in the section is unanswered', () => {
    const a = answers({ q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 });
    expect(riskScore(a)).toBeNull();
    expect(horizonScore(a)).toBeNull();
    expect(riskScore(answers({ q1: 99, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0 }))).toBeNull();
  });

  it('builds a provisional profile from years to retirement when incomplete', () => {
    const s = defaultPlanState();
    const p = riskProfile(s);
    expect(p.provisional).toBe(true);
    expect(p.risk).toBe('Moderate');
    expect(p.horizon).toBe('Long-term');
    expect(p.answered).toBe(0);
    expect(p.total).toBe(10);
    s.profile.age = 60;
    expect(riskProfile(s).horizon).toBe('Intermediate');
    s.profile.age = 63;
    expect(riskProfile(s).horizon).toBe('Short-term');
    s.profile.age = 54;
    expect(riskProfile(s).horizon).toBe('Long-term');
  });

  it('is not provisional when complete', () => {
    const s = defaultPlanState();
    s.answers = answers({ q1: 4, q2: 3, q3: 3, q4: 5, q5: 3, q6: 0, q7: 3, q8: 3, q9: 1, q10: 0 });
    const p = riskProfile(s);
    expect(p.provisional).toBe(false);
    expect(p.risk).toBe('Aggressive');
    expect(p.horizon).toBe('Long-term');
    expect(p.answered).toBe(10);
  });
});

describe('emergency months', () => {
  it('defaults to 6 months', () => {
    const s = defaultPlanState();
    expect(emergencyMonths(s).months).toBe(6);
    expect(emergencyMonths(s).rule).toBe('default');
  });
  it('is 9 for single income OR high exposure', () => {
    const s = defaultPlanState();
    s.supplement = { s1: 0, s2: 0, s3: 1, s4: 0 };
    expect(emergencyMonths(s).months).toBe(9);
    s.supplement = { s1: 2, s2: 0, s3: 1, s4: 1 };
    expect(emergencyMonths(s).months).toBe(9);
    s.supplement = { s1: 0, s2: 2, s3: 1, s4: 1 };
    expect(emergencyMonths(s).months).toBe(9);
    s.profile.age = 35;
    s.supplement = { s1: 2, s2: 0, s3: 1, s4: 0 };
    expect(emergencyMonths(s).months).toBe(9);
  });
  it('is 12 for single income AND early career AND high exposure', () => {
    const s = defaultPlanState();
    s.profile.age = 25;
    s.supplement = { s1: 2, s2: 0, s3: 1, s4: 0 };
    expect(emergencyMonths(s).months).toBe(12);
    s.supplement = { s1: 0, s2: 2, s3: 1, s4: 0 };
    expect(emergencyMonths(s).months).toBe(12);
    expect(emergencyMonths(s).reason.length).toBeGreaterThan(0);
  });
  it('honours the override', () => {
    const s = defaultPlanState();
    s.profile.age = 25;
    s.supplement = { s1: 2, s2: 2, s3: 1, s4: 0 };
    s.savings.emergencyFundMonthsOverride = 3;
    expect(emergencyMonths(s).months).toBe(3);
    expect(emergencyMonths(s).rule).toBe('override');
  });
});
