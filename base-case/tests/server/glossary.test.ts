import { describe, expect, it } from 'vitest';
import { classifyIntent, offlineAnswer } from '../../server/services/assistant';
import { buildPlanContext } from '../../server/services/planContext';
import { PERSONAS } from '../../shared/data/personas';

describe('offline explainer glossary', () => {
  it('classifies definition questions as glossary and plan questions as before', () => {
    expect(classifyIntent('what is coast fire?')).toBe('glossary');
    expect(classifyIntent('What does backdoor Roth mean')).toBe('glossary');
    expect(classifyIntent('explain the 4% rule')).toBe('glossary');
    expect(classifyIntent('what should I do first?')).toBe('first');
    expect(classifyIntent('what is my success probability?')).toBe('success');
    expect(classifyIntent('how is my emergency fund?')).toBe('emergency');
  });

  it('answers coast FIRE with a number computed from the plan', () => {
    const ctx = buildPlanContext(PERSONAS[0].state);
    const a = offlineAnswer(ctx, 'what is coast fire?');
    expect(a).toMatch(/Coast FIRE is the point/);
    expect(a).toMatch(/Coast FIRE number today is about \$[\d,]+/);
    expect(a).toMatch(/FIRE number is about \$[\d,]+/);
  });

  it('defines RAP and SBLOC', () => {
    const ctx = buildPlanContext(PERSONAS[0].state);
    expect(offlineAnswer(ctx, 'what is RAP?')).toMatch(/Repayment Assistance Plan/);
    expect(offlineAnswer(ctx, 'explain an sbloc')).toMatch(/securities-based line of credit/);
  });
});
