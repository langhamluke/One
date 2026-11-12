import { describe, expect, it } from 'vitest';
import { FEDERAL_MINIMUM_WAGE, PRACTICE_PAYCHECK, STATE_MINIMUM_WAGE, STUDENT_JOBS, STUDENT_JOB_KEYS, STUDENT_WEEKS, listStudentJobs, minimumWageFor } from '../../shared/data/studentJobs';
import { STATES } from '../../shared/data/states';
import { OCCUPATIONS, METROS } from '../../shared/data/careers';
import { STUDENT_PERSONAS } from '../../shared/data/personasSprout';
import { STUDENT_PLAYBOOK, playbookFor } from '../../shared/data/playbook';
import { STUDENT_SUPPLEMENT, STUDENT_TEXT, QUESTIONS, questionsFor } from '../../shared/data/questionnaire';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('student job wages', () => {
  it('cover the five common student jobs with sourced OEWS medians and URLs', () => {
    expect(STUDENT_JOB_KEYS.sort()).toEqual(['cashier', 'food_prep', 'lifeguard', 'retail_sales', 'tutor']);
    for (const j of listStudentJobs()) {
      expect(j.median.value, j.key).toBeGreaterThan(7.25);
      expect(j.median.value, j.key).toBeLessThan(60);
      expect(j.median.source, j.key).toContain('OEWS');
      expect(j.median.url, j.key).toMatch(/^https:\/\//);
      expect(j.median.asOf).toBe('2025-05');
      expect(typeof j.median.verified).toBe('boolean');
      if (!j.median.verified) expect(j.median.note, j.key).toBeTruthy();
      expect(j.soc).toMatch(/^\d{2}-\d{4}$/);
      expect(j.typicalHours.schoolYear).toBeGreaterThan(0);
    }
    // Secondary-source figures carry the VERIFY flag; OOH / O*NET figures are verified
    expect(STUDENT_JOBS.cashier.median.verified).toBe(true);
    expect(STUDENT_JOBS.retail_sales.median.verified).toBe(true);
    expect(STUDENT_JOBS.lifeguard.median.verified).toBe(true);
    expect(STUDENT_JOBS.food_prep.median.verified).toBe(false);
    expect(STUDENT_JOBS.tutor.median.verified).toBe(false);
    expect(STUDENT_JOBS[PRACTICE_PAYCHECK.job]).toBeTruthy();
    expect(PRACTICE_PAYCHECK.source.verified).toBe(false);
    expect(STUDENT_WEEKS.schoolYear.verified).toBe(false);
  });
});

describe('state minimum wages', () => {
  it('list every state in the tax presets plus DC, never below the federal floor, all with the DOL URL', () => {
    for (const code of Object.keys(STATES)) expect(STATE_MINIMUM_WAGE[code], code).toBeTruthy();
    expect(STATE_MINIMUM_WAGE.DC).toBeTruthy();
    for (const [code, s] of Object.entries(STATE_MINIMUM_WAGE)) {
      expect(s.value, code).toBeGreaterThanOrEqual(FEDERAL_MINIMUM_WAGE.value);
      expect(s.value, code).toBeLessThan(25);
      expect(s.url, code).toContain('dol.gov');
      expect(s.asOf, code).toBe('2026-01');
      expect(typeof s.verified, code).toBe('boolean');
    }
    expect(minimumWageFor('tx').value).toBe(7.25);
    expect(minimumWageFor('CA').value).toBe(16.9);
    expect(minimumWageFor(undefined)).toBe(FEDERAL_MINIMUM_WAGE);
    const unverified = Object.values(STATE_MINIMUM_WAGE).filter((s) => !s.verified).length;
    expect(unverified).toBeGreaterThan(0); // the build could not confirm every state; VERIFY tags expected
  });
});

describe('student personas, playbook and questionnaire', () => {
  it('five pseudonymous students on demo.sprout.local with valid occupations, metros, states and jobs', () => {
    expect(STUDENT_PERSONAS.map((p) => p.name)).toEqual(['Maya', 'Jordan', 'Alex', 'Sam', 'Priya']);
    expect(STUDENT_PERSONAS.map((p) => p.state.profile.age)).toEqual([16, 17, 18, 19, 21]);
    for (const p of STUDENT_PERSONAS) {
      expect(p.email).toMatch(/@demo\.sprout\.local$/);
      expect(p.state.product).toBe('sprout');
      expect(p.state.profile.age).toBeGreaterThanOrEqual(13);
      expect(STATES[p.state.profile.stateCode], p.key).toBeTruthy();
      const st = p.state.profile.student!;
      expect(st, p.key).toBeTruthy();
      if (st.job && st.job !== 'custom') expect(STUDENT_JOBS[st.job], p.key).toBeTruthy();
      for (const path of p.state.careerPaths) {
        expect(OCCUPATIONS[path.occupationCode], `${p.key}/${path.name}`).toBeTruthy();
        expect(METROS[path.metro], `${p.key}/${path.name}`).toBeTruthy();
      }
      expect(p.state.careerPaths.some((c) => c.id === p.state.activePathId)).toBe(true);
      expect(p.state.profile.livingExpenses).toBe(12 * (st.needsMonthly + st.wantsMonthly));
      for (const d of p.state.debts) if (d.kind === 'credit_card') expect(d.creditLimit, `${p.key} card limit`).toBeGreaterThan(0);
    }
    const jordan = STUDENT_PERSONAS[1].state.profile.student!;
    expect(jordan.job).toBe('');
    expect(jordan.practicePaycheck).toBe(true);
    expect(jordan.allowanceMonthly).toBe(Math.round((40 * 52) / 12));
    const sam = STUDENT_PERSONAS[3].state;
    expect(sam.debts[0].balance / (sam.debts[0].creditLimit ?? 1)).toBeCloseTo(0.42, 6);
    const priya = STUDENT_PERSONAS[4].state;
    expect(priya.debts.filter((d) => d.kind === 'federal_student').reduce((s, d) => s + d.balance, 0)).toBe(28000);
  });

  it('six Sprout playbook topics with sourced items, plain copy and no emojis; Sprout hides the grown-up topics', () => {
    expect(STUDENT_PLAYBOOK.map((t) => t.key)).toEqual(['student-budget', 'student-pay-yourself-first', 'student-emergency-fund', 'student-credit-score', 'student-card-no-interest', 'student-compound-growth']);
    for (const t of STUDENT_PLAYBOOK) {
      expect(t.products).toEqual(['sprout']);
      expect(t.items.length, t.key).toBeGreaterThan(2);
      for (const it of t.items) {
        expect(it.source, `${t.key}: ${it.text.slice(0, 40)}`).toBeTruthy();
        expect(typeof it.verified).toBe('boolean');
        expect(EMOJI.test(it.text), `${t.key} emoji`).toBe(false);
      }
      expect(EMOJI.test(t.summary)).toBe(false);
    }
    const shown = playbookFor('sprout');
    expect(shown.filter((t) => t.products?.includes('sprout'))).toHaveLength(STUDENT_PLAYBOOK.length);
    expect(shown.some((t) => t.key === 'sbloc' || t.key === 'heloc')).toBe(false);
    expect(shown.every((t) => !t.products || t.products.includes('sprout'))).toBe(true);
    expect(playbookFor('base-case').some((t) => t.products?.includes('sprout'))).toBe(false);
    expect(playbookFor('flight-plan').some((t) => t.products?.includes('sprout'))).toBe(false);
    expect(STUDENT_PLAYBOOK.find((t) => t.key === 'student-pay-yourself-first')!.items.some((i) => /low-balance/i.test(i.text))).toBe(true);
  });

  it('rewords every question for a 16-year-old without touching the points, and the supplement carries the rule values', () => {
    const qs = questionsFor('sprout');
    expect(qs.map((q) => q.options.map((o) => o.points))).toEqual(QUESTIONS.map((q) => q.options.map((o) => o.points)));
    expect(Object.keys(STUDENT_TEXT).sort()).toEqual(QUESTIONS.map((q) => q.id).sort());
    expect(qs.find((q) => q.id === 'q1')?.text).not.toBe(QUESTIONS.find((q) => q.id === 'q1')?.text);
    expect(qs.find((q) => q.id === 'q5')?.help).toContain('{{amount}}');
    for (const q of qs) expect(EMOJI.test(q.text + (q.help ?? ''))).toBe(false);
    expect(STUDENT_SUPPLEMENT.map((q) => q.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(STUDENT_SUPPLEMENT[0].options.map((o) => o.value)).toEqual([0, 1, 2]);
    expect(STUDENT_SUPPLEMENT[2].options.find((o) => o.label === 'Yes')?.value).toBe(1);
    expect(STUDENT_SUPPLEMENT[3].options.find((o) => o.label === 'Not really')?.value).toBe(0);
  });
});
