import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/data/questionnaire';
import { careerRisk, emergencyFundMonths, horizonCategory, riskCategory, scoreAnswers, type Answers } from '../src/lib/scoring';

const minIdx = (qid: string) => {
  const q = QUESTIONS.find((x) => x.id === qid)!;
  return q.options.reduce((best, o, i) => (o.points < q.options[best].points ? i : best), 0);
};
const maxIdx = (qid: string) => {
  const q = QUESTIONS.find((x) => x.id === qid)!;
  return q.options.reduce((best, o, i) => (o.points > q.options[best].points ? i : best), 0);
};
const all = (pick: (id: string) => number): Answers => Object.fromEntries(QUESTIONS.map((q) => [q.id, pick(q.id)]));

describe('questionnaire point values (exact rubric)', () => {
  const pts = (id: string) => QUESTIONS.find((q) => q.id === id)!.options.map((o) => o.points);
  it('matches the FNCE 2830 rubric', () => {
    expect(pts('q1')).toEqual([1, 2, 3, 4, 5]);
    expect(pts('q2')).toEqual([1, 2, 3, 4]);
    expect(pts('q3')).toEqual([1, 2, 3, 4]);
    expect(pts('q4')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pts('q5')).toEqual([1, 2, 3, 4, 5]);
    expect(pts('q6')).toEqual([1, 2, 3, 4]);
    expect(pts('q7')).toEqual([1, 2, 4, 6]);
    expect(pts('q8')).toEqual([1, 2, 3, 5]);
    expect(pts('q9')).toEqual([1, 2, 3, 5]);
    expect(pts('q10')).toEqual([1, 2, 3, 4]);
  });
  it('Q5 ranges match the handout', () => {
    const r = QUESTIONS.find((q) => q.id === 'q5')!.ranges!;
    expect(r[4]).toEqual({ high: 1.5, median: 1.2, base: 1.0, low: 0.75 });
    expect(r[0]).toEqual({ high: 1.1, median: 1.03, base: 1.0, low: 0.95 });
    expect(r.map((x) => x.high)).toEqual([1.1, 1.15, 1.2, 1.3, 1.5]);
    expect(r.map((x) => x.low)).toEqual([0.95, 0.92, 0.9, 0.85, 0.75]);
  });
  it('Q1–Q6 are risk, Q7–Q10 are horizon', () => {
    expect(QUESTIONS.filter((q) => q.group === 'risk').map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(QUESTIONS.filter((q) => q.group === 'horizon').map((q) => q.n)).toEqual([7, 8, 9, 10]);
  });
});

describe('totals', () => {
  it('minimum totals are 6 / 4', () => {
    const r = scoreAnswers(all(minIdx));
    expect(r.risk).toBe(6);
    expect(r.horizon).toBe(4);
    expect(r.riskCategory).toBe('Conservative');
    expect(r.horizonCategory).toBe('Short-term');
    expect(r.complete).toBe(true);
  });
  it('maximum totals are 28 / 20', () => {
    const r = scoreAnswers(all(maxIdx));
    expect(r.risk).toBe(28);
    expect(r.horizon).toBe(20);
    expect(r.riskCategory).toBe('Aggressive');
    expect(r.horizonCategory).toBe('Long-term');
  });
  it('incomplete answers are flagged', () => {
    const r = scoreAnswers({ q1: 0 });
    expect(r.complete).toBe(false);
    expect(r.answered).toBe(1);
    expect(r.risk).toBe(1);
  });
});

describe('risk category boundaries (6–9 / 10–16 / 17–23 / 24–28)', () => {
  it.each([
    [6, 'Conservative'], [9, 'Conservative'],
    [10, 'Moderate'], [16, 'Moderate'],
    [17, 'Assertive'], [23, 'Assertive'],
    [24, 'Aggressive'], [28, 'Aggressive'],
  ])('%i → %s', (score, cat) => expect(riskCategory(score as number)).toBe(cat));
});

describe('horizon category boundaries (4–7 / 8–13 / 14+)', () => {
  it.each([
    [4, 'Short-term'], [7, 'Short-term'],
    [8, 'Intermediate'], [13, 'Intermediate'],
    [14, 'Long-term'], [20, 'Long-term'],
  ])('%i → %s', (score, cat) => expect(horizonCategory(score as number)).toBe(cat));
});

describe('boundaries reached through real answer sets', () => {
  // Start from minimum (6) and raise Q4 (+0..5) and Q1 (+0..4) to hit exact totals.
  const riskSet = (target: number): Answers => {
    const a = all(minIdx);
    let extra = target - 6;
    const q4 = Math.min(5, extra); a.q4 = q4; extra -= q4;
    const q1 = Math.min(4, extra); a.q1 = q1; extra -= q1;
    const q5 = Math.min(4, extra); a.q5 = q5; extra -= q5;
    const q2 = Math.min(3, extra); a.q2 = q2; extra -= q2;
    const q3 = Math.min(3, extra); a.q3 = q3; extra -= q3;
    a.q6 = Math.min(3, extra);
    return a;
  };
  it.each([[9, 'Conservative'], [10, 'Moderate'], [16, 'Moderate'], [17, 'Assertive'], [23, 'Assertive'], [24, 'Aggressive']])(
    'risk total %i scores as %s', (t, cat) => {
      const r = scoreAnswers(riskSet(t as number));
      expect(r.risk).toBe(t);
      expect(r.riskCategory).toBe(cat);
    });

  // Horizon combos: Q7 [1,2,4,6] Q8 [1,2,3,5] Q9 [1,2,3,5] Q10 [1,2,3,4]
  const h = (q7: number, q8: number, q9: number, q10: number): Answers => ({ ...all(minIdx), q7, q8, q9, q10 });
  it.each([
    [h(0, 1, 1, 1), 7, 'Short-term'], // 1+2+2+2
    [h(1, 1, 1, 1), 8, 'Intermediate'], // 2+2+2+2
    [h(3, 1, 1, 2), 13, 'Intermediate'], // 6+2+2+3
    [h(3, 2, 1, 2), 14, 'Long-term'], // 6+3+2+3
  ])('horizon answer set → %i', (ans, total, cat) => {
    const r = scoreAnswers(ans as Answers);
    expect(r.horizon).toBe(total);
    expect(r.horizonCategory).toBe(cat);
  });
});

describe('pilot supplement', () => {
  it('is not part of the class score', () => {
    const r = scoreAnswers({ ...all(minIdx) });
    expect(r.risk + r.horizon).toBe(10);
  });
  it('career risk levels', () => {
    expect(careerRisk({ s1: 0, s2: 0, s3: 0, s4: 0 }).level).toBe('LOW');
    expect(careerRisk({ s1: 2, s2: 2, s3: 2, s4: 2 }).level).toBe('HIGH');
  });
  it('emergency fund months: 6 default, 9–12 for single-income early-career pilots', () => {
    expect(emergencyFundMonths({ s1: 0, s4: 0 }, false)).toBe(6);
    expect(emergencyFundMonths({ s1: 1, s4: 2 }, true)).toBe(9);
    expect(emergencyFundMonths({ s1: 2, s4: 2 }, true)).toBe(12);
    expect(emergencyFundMonths({ s1: 2, s4: 0 }, false)).toBe(9);
  });
});
