import { describe, expect, it } from 'vitest';
import { AIRLINES, AIRLINE_IDS, AIRLINE_PATHS, AIRLINE_PATH_IDS, PILOT_STAGES, resolveAirlines } from '../../shared/data/airlines';
import { PILOT_PERSONAS } from '../../shared/data/personasPilot';
import { PILOT_PLAYBOOK } from '../../shared/data/playbook';
import { mergePlanState } from '../../shared/lib/inputs';
import { PILOT_SUPPLEMENT, QUESTIONS } from '../../shared/data/questionnaire';

describe('airline dataset', () => {
  it('has a complete 12-step scale for every seat and fleet, sourced and dated', () => {
    for (const id of AIRLINE_IDS) {
      const a = AIRLINES[id];
      for (const [fleet, s] of Object.entries({ NB: a.narrowbody, ...(a.widebody ? { WB: a.widebody } : {}) })) {
        for (const seat of ['fo', 'ca'] as const) {
          const steps = s[seat];
          expect(steps, `${id} ${fleet} ${seat}`).toHaveLength(12);
          for (let i = 0; i < 12; i++) {
            const r = steps[i];
            expect(r.value, `${id} ${fleet} ${seat} ${i + 1}`).toBeGreaterThan(0);
            expect(r.source, `${id} ${fleet} ${seat} ${i + 1}`).toBeTruthy();
            expect(r.asOf, `${id} ${fleet} ${seat} ${i + 1}`).toMatch(/^\d{4}-\d{2}$/);
            expect(typeof r.verified).toBe('boolean');
            if (i > 0) expect(r.value, `${id} ${fleet} ${seat} step ${i + 1} should not fall`).toBeGreaterThanOrEqual(steps[i - 1].value - 1e-9);
          }
          // captains out-earn first officers at the same step (CFI scale is flat)
          if (id !== 'cfi') expect(s.ca[11].value).toBeGreaterThan(s.fo[11].value);
        }
      }
      expect(a.retirement.companyPct.value).toBeGreaterThanOrEqual(0);
      expect(a.retirement.companyPct.value).toBeLessThanOrEqual(25);
      expect(['cash', 'mbcb', 'forfeit']).toContain(a.retirement.excessHandling.value);
      for (const r of a.raises) expect(r.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('marks proxies, estimates and interpolations unverified', () => {
    expect(AIRLINES.united.narrowbody.fo[11].verified).toBe(false);
    expect(AIRLINES.united.narrowbody.fo[11].source).toContain('PROXY');
    expect(AIRLINES.delta.narrowbody.ca[0].verified).toBe(false);
    expect(AIRLINES.american.narrowbody.fo[11].verified).toBe(true);
    expect(AIRLINES.american.narrowbody.fo[6].source).toContain('Interpolated');
    expect(AIRLINES.cfi.narrowbody.fo[0].verified).toBe(false);
    expect(AIRLINES.envoy.flowTo).toBe('american');
    expect(AIRLINES.envoy.premium?.ends).toBe('2026-12-31');
    expect(AIRLINES.fedex.retirement.pension?.electionWindow.verified).toBe(false);
  });

  it('defines every path over known carriers and resolves every stage/employer combination', () => {
    for (const id of AIRLINE_PATH_IDS) {
      const p = AIRLINE_PATHS[id];
      expect(p.id).toBe(id);
      if (p.regional) expect(AIRLINES[p.regional].kind).toBe('regional');
      if (p.major) expect(['major', 'cargo']).toContain(AIRLINES[p.major].kind);
      for (const k of ['toRegional', 'regionalCaUpgrade', 'toMajor', 'majorCaUpgrade', 'widebody'] as const) expect(p.defaults[k]).toBeGreaterThanOrEqual(0);
    }
    for (const stage of PILOT_STAGES.map((s) => s.value)) {
      for (const employer of ['none', ...AIRLINE_IDS] as const) {
        for (const choice of [...AIRLINE_PATH_IDS, 'stay'] as const) {
          const r = resolveAirlines(choice, stage, employer);
          expect(r.regional === null || AIRLINES[r.regional] !== undefined).toBe(true);
          expect(r.major === null || AIRLINES[r.major] !== undefined).toBe(true);
          expect(r.regional !== null || r.major !== null).toBe(true);
        }
      }
    }
  });

  it('ships five pilot personas with complete questionnaires and valid supplements', () => {
    expect(PILOT_PERSONAS).toHaveLength(5);
    for (const p of PILOT_PERSONAS) {
      const s = mergePlanState(p.state);
      expect(p.email, p.key).toMatch(/@demo\.flightplan\.local$/);
      expect(s.product, p.key).toBe('flight-plan');
      expect(s.profile.nickname, p.key).toBeTruthy();
      expect(s.profile.pilot, p.key).toBeDefined();
      for (const q of QUESTIONS) {
        const a = s.answers[q.id];
        expect(a, `${p.key} ${q.id}`).not.toBeNull();
        expect(a!, `${p.key} ${q.id}`).toBeGreaterThanOrEqual(0);
        expect(a!, `${p.key} ${q.id}`).toBeLessThan(q.options.length);
      }
      for (const sq of PILOT_SUPPLEMENT) {
        const v = s.supplement[sq.id];
        expect(sq.options.some((o) => o.value === v), `${p.key} ${sq.id}`).toBe(true);
      }
      expect(s.careerPaths.length, p.key).toBeGreaterThan(0);
      expect(s.careerPaths.length, p.key).toBeLessThanOrEqual(4);
      expect(s.careerPaths.some((c) => c.id === s.activePathId), p.key).toBe(true);
      for (const c of s.careerPaths) {
        expect(c.kind, `${p.key} ${c.id}`).toBe('airline');
        expect(c.airline, `${p.key} ${c.id}`).toBeDefined();
        expect(c.airline!.pathId === 'stay' || AIRLINE_PATHS[c.airline!.pathId as keyof typeof AIRLINE_PATHS] !== undefined, `${p.key} ${c.id}`).toBe(true);
      }
    }
  });

  it('pilot playbook topics are complete and tagged for Flight Plan', () => {
    expect(PILOT_PLAYBOOK.length).toBeGreaterThanOrEqual(6);
    for (const t of PILOT_PLAYBOOK) {
      expect(t.products, t.key).toEqual(['flight-plan']);
      expect(t.items.length, t.key).toBeGreaterThan(0);
      for (const it of t.items) {
        expect(it.text, t.key).toBeTruthy();
        if (it.asOf) expect(it.asOf, t.key).toMatch(/^\d{4}-\d{2}$/);
      }
    }
  });
});
