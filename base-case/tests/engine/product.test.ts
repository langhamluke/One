import { describe, expect, it } from 'vitest';
import { PRODUCTS, PRODUCT_KEYS, phaseLabel, productConfig, productFromEnv } from '../../shared/product';
import { defaultPlanState, defaultPlanStateFor, exportPlan, importPlan, isPilotPlan, mergePlanState } from '../../shared/lib/inputs';
import { PILOT_SUPPLEMENT, QUESTIONS, SUPPLEMENT, questionsFor, supplementFor } from '../../shared/data/questionnaire';
import { ALL_PERSONAS, PERSONAS, personasFor } from '../../shared/data/personas';
import { PILOT_PLAYBOOK, PLAYBOOK, playbookFor } from '../../shared/data/playbook';
import { emergencyMonths } from '../../shared/lib/scoring';

describe('products', () => {
  it('resolves the product from the environment with a Base Case fallback', () => {
    expect(productFromEnv('flight-plan')).toBe('flight-plan');
    expect(productFromEnv('Flight Plan')).toBe('flight-plan');
    expect(productFromEnv('FLIGHTPLAN')).toBe('flight-plan');
    expect(productFromEnv('base-case')).toBe('base-case');
    expect(productFromEnv('')).toBe('base-case');
    expect(productFromEnv(undefined)).toBe('base-case');
    expect(productFromEnv('something-else')).toBe('base-case');
    expect(productConfig('nope').key).toBe('base-case');
  });

  it('gives every product six phases with the same route keys and Flight Plan its cockpit names', () => {
    for (const k of PRODUCT_KEYS) {
      expect(PRODUCTS[k].phases.map((p) => p.key)).toEqual(['profile', 'risk', 'career', 'plan', 'future', 'summary']);
    }
    expect(PRODUCTS['flight-plan'].phases.map((p) => p.label)).toEqual(['Preflight', 'Checklist', 'Flight plan', 'Cruise', 'Landing', 'Briefing']);
    expect(phaseLabel('flight-plan', 'summary')).toBe('Briefing');
    expect(phaseLabel('base-case', 'summary')).toBe('Summary');
    expect(PRODUCTS['flight-plan'].careerAgeLimit).toBe(65);
  });

  it('builds product-specific default plans', () => {
    const bc = defaultPlanStateFor('base-case');
    expect(bc.product).toBe('base-case');
    expect(bc.profile.pilot).toBeUndefined();
    expect(bc.careerPaths[0].kind ?? 'ladder').toBe('ladder');
    expect(isPilotPlan(bc)).toBe(false);
    const fp = defaultPlanStateFor('flight-plan');
    expect(fp.product).toBe('flight-plan');
    expect(fp.profile.retirementAge).toBe(65);
    expect(fp.profile.pilot?.stage).toBe('regional_fo');
    expect(fp.careerPaths).toHaveLength(2);
    expect(fp.careerPaths.every((p) => p.kind === 'airline')).toBe(true);
    expect(isPilotPlan(fp)).toBe(true);
    // a Base Case plan with one airline path counts as a pilot plan
    const mixed = defaultPlanState();
    mixed.careerPaths.push({ ...mixed.careerPaths[0], id: 'p2', kind: 'airline' });
    expect(isPilotPlan(mixed)).toBe(true);
  });

  it('infers the product of older saves and round-trips exports for both products', () => {
    const fp = defaultPlanStateFor('flight-plan');
    const { product: _p, ...untagged } = fp;
    const merged = mergePlanState(untagged);
    expect(merged.product).toBe('flight-plan');
    expect(merged.profile.pilot?.stage).toBe('regional_fo');
    expect(merged.careerPaths[0].airline?.pathId).toBe('envoy-aa');
    expect(merged.whatIf.upgradeDelayYears).toBe(0);
    const bcMerged = mergePlanState({ profile: { nickname: 'x' } });
    expect(bcMerged.product).toBe('base-case');
    expect(bcMerged.insurance.lossOfLicense).toBe(false);

    const exp = exportPlan(fp);
    expect(exp.app).toBe('flight-plan');
    const back = importPlan(JSON.parse(JSON.stringify(exp)));
    expect(back.product).toBe('flight-plan');
    expect(back.careerPaths[1].airline?.pathId).toBe('regional-swa');
    expect(exportPlan(defaultPlanState()).app).toBe('base-case');
    expect(() => importPlan({ app: 'other', state: {} })).toThrow();
  });

  it('serves product-specific questionnaire wording, supplements, personas and playbook topics', () => {
    expect(questionsFor('base-case')).toBe(QUESTIONS);
    const pilotQs = questionsFor('flight-plan');
    expect(pilotQs.find((q) => q.id === 'q8')?.text).toContain('flight-school');
    expect(pilotQs.find((q) => q.id === 'q10')?.help).toContain('loss-of-license');
    // scoring structure untouched
    expect(pilotQs.map((q) => q.options.map((o) => o.points))).toEqual(QUESTIONS.map((q) => q.options.map((o) => o.points)));
    expect(supplementFor('flight-plan')).toBe(PILOT_SUPPLEMENT);
    expect(supplementFor('base-case')).toBe(SUPPLEMENT);
    expect(PILOT_SUPPLEMENT.map((q) => q.id)).toEqual(['s1', 's2', 's3', 's4']);
    // value semantics shared with Base Case: 2 = high exposure / heavy reliance, 0 = no coverage / no second income
    expect(PILOT_SUPPLEMENT[0].options.find((o) => o.label.startsWith('High'))?.value).toBe(2);
    expect(PILOT_SUPPLEMENT[2].options.find((o) => o.label === 'No')?.value).toBe(0);
    expect(PILOT_SUPPLEMENT[3].options.find((o) => o.label.startsWith('No'))?.value).toBe(0);

    expect(personasFor('flight-plan').every((p) => p.state.product === 'flight-plan')).toBe(true);
    expect(personasFor('base-case')).toBe(PERSONAS);
    expect(personasFor('flight-plan')).toHaveLength(5);
    expect(new Set(ALL_PERSONAS.map((p) => p.email)).size).toBe(ALL_PERSONAS.length);
    expect(new Set(ALL_PERSONAS.map((p) => p.key)).size).toBe(ALL_PERSONAS.length);

    const fpTopics = playbookFor('flight-plan');
    expect(fpTopics.length).toBe(PLAYBOOK.length + PILOT_PLAYBOOK.length);
    expect(playbookFor('base-case')).toHaveLength(PLAYBOOK.length);
    expect(PILOT_PLAYBOOK.every((t) => t.products?.includes('flight-plan'))).toBe(true);
    expect(new Set(fpTopics.map((t) => t.key)).size).toBe(fpTopics.length);
  });

  it('applies the pilot emergency-fund rule by career stage rather than age', () => {
    const s = defaultPlanStateFor('flight-plan');
    s.profile.age = 35;
    s.profile.pilot = { ...s.profile.pilot!, stage: 'regional_fo' };
    s.supplement = { s1: 2, s2: 0, s3: 1, s4: 0 };
    expect(emergencyMonths(s).months).toBe(12); // single income, regional = early career, high exposure
    s.profile.pilot.stage = 'major_fo';
    expect(emergencyMonths(s).months).toBe(9);
    s.supplement.s4 = 1;
    s.supplement.s1 = 0;
    expect(emergencyMonths(s).months).toBe(6);
    s.supplement.s2 = 2; // employer stock reliance
    expect(emergencyMonths(s)).toMatchObject({ months: 9, rule: 'single-or-exposed' });
    expect(emergencyMonths(s).reason.toLowerCase()).toContain('employer stock');
  });
});
