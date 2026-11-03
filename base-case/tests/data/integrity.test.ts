import { describe, expect, it } from 'vitest';
import { ASSET_CLASSES } from '../../shared/lib/types';
import type { Sourced } from '../../shared/lib/types';
import { LIMITS_2026, walkSourced } from '../../shared/data/irs2026';
import { BRACKETS_2026, STANDARD_DEDUCTION_2026, FICA } from '../../shared/data/tax2026';
import { RAP, TIERED_STANDARD, FEDERAL_RATES } from '../../shared/data/loans';
import { BEND_POINTS } from '../../shared/data/ss';
import { CORRELATION, CMA_DEFAULT } from '../../shared/data/cma';
import { MODEL_EQUITY, allocationFromEquity } from '../../shared/data/models';
import { QUESTIONS, SUPPLEMENT, RISK_BANDS, HORIZON_BANDS } from '../../shared/data/questionnaire';
import { OCCUPATIONS, METROS } from '../../shared/data/careers';
import { STATES } from '../../shared/data/states';
import { PERSONAS } from '../../shared/data/personas';
import { PLAYBOOK } from '../../shared/data/playbook';

function isSourced(x: unknown): x is Sourced<unknown> {
  return !!x && typeof x === 'object' && 'value' in (x as object) && 'source' in (x as object) && 'asOf' in (x as object);
}

function collect(obj: unknown, prefix = '', out: { key: string; s: Sourced<unknown> }[] = []): { key: string; s: Sourced<unknown> }[] {
  if (isSourced(obj)) {
    out.push({ key: prefix, s: obj });
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) collect(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

describe('sourced values are well-formed', () => {
  const all = [
    ...collect(LIMITS_2026, 'irs'),
    ...collect({ BRACKETS_2026, STANDARD_DEDUCTION_2026, FICA }, 'tax'),
    ...collect({ RAP, TIERED_STANDARD }, 'loans'),
    ...collect(BEND_POINTS, 'ss'),
    ...collect(OCCUPATIONS, 'careers'),
    ...collect(METROS, 'metros'),
    ...collect(STATES, 'states'),
  ];
  it('has at least a few dozen sourced values', () => {
    expect(all.length).toBeGreaterThan(40);
  });
  it('every value has a non-empty source and an as-of month', () => {
    for (const { key, s } of all) {
      expect(s.source, key).toBeTruthy();
      expect(s.asOf, key).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof s.verified, key).toBe('boolean');
    }
  });
  it('walkSourced finds the IRS values', () => {
    expect(walkSourced(LIMITS_2026, 'irs').length).toBeGreaterThan(10);
  });
});

describe('tax tables', () => {
  it('brackets are ascending and end at Infinity', () => {
    for (const status of ['single', 'mfj', 'hoh'] as const) {
      const b = BRACKETS_2026[status].value;
      for (let i = 1; i < b.length; i++) {
        expect(b[i].upTo).toBeGreaterThan(b[i - 1].upTo);
        expect(b[i].rate).toBeGreaterThan(b[i - 1].rate);
      }
      expect(b[b.length - 1].upTo).toBe(Infinity);
    }
  });
  it('wage bases rise year over year', () => {
    expect(FICA.wageBase[2026].value).toBeGreaterThan(FICA.wageBase[2025].value);
    expect(FICA.wageBase[2027].value).toBeGreaterThan(FICA.wageBase[2026].value);
  });
});

describe('loans', () => {
  it('RAP tiers are ascending to 10%', () => {
    const t = RAP.tiers.value;
    expect(t[0].pct).toBe(0);
    expect(t[t.length - 1].pct).toBe(0.1);
    for (let i = 1; i < t.length; i++) expect(t[i].agiUpTo).toBeGreaterThan(t[i - 1].agiUpTo);
  });
  it('tiered standard terms rise with balance', () => {
    const t = TIERED_STANDARD.value;
    expect(t.map((x) => x.years)).toEqual([10, 15, 20, 25]);
  });
  it('federal rates exist for 2026-27 and are below statutory caps', () => {
    const r = FEDERAL_RATES['2026-27'];
    expect(r.undergrad).toBeLessThan(0.0825);
    expect(r.grad).toBeLessThan(0.095);
    expect(r.plus).toBeLessThan(0.105);
  });
});

describe('capital markets and models', () => {
  it('correlation matrix is symmetric with unit diagonal', () => {
    const n = ASSET_CLASSES.length;
    expect(CORRELATION.length).toBe(n);
    for (let i = 0; i < n; i++) {
      expect(CORRELATION[i].length).toBe(n);
      expect(CORRELATION[i][i]).toBe(1);
      for (let j = 0; j < n; j++) expect(CORRELATION[i][j]).toBeCloseTo(CORRELATION[j][i], 10);
    }
  });
  it('correlation matrix is positive definite (Cholesky succeeds)', () => {
    const n = CORRELATION.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = CORRELATION[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          expect(s).toBeGreaterThan(0);
          L[i][j] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
  });
  it('every CMA entry has positive vol and sane return', () => {
    for (const a of ASSET_CLASSES) {
      expect(CMA_DEFAULT[a].vol).toBeGreaterThan(0);
      expect(CMA_DEFAULT[a].ret).toBeGreaterThan(0);
      expect(CMA_DEFAULT[a].ret).toBeLessThan(0.15);
    }
  });
  it('model matrix is monotone in risk and horizon and allocations sum to 1', () => {
    const risks = ['Conservative', 'Moderate', 'Assertive', 'Aggressive'] as const;
    const horizons = ['Short-term', 'Intermediate', 'Long-term'] as const;
    for (let r = 0; r < risks.length; r++) {
      for (let h = 0; h < horizons.length; h++) {
        const e = MODEL_EQUITY[risks[r]][horizons[h]];
        if (r > 0) expect(e).toBeGreaterThanOrEqual(MODEL_EQUITY[risks[r - 1]][horizons[h]]);
        if (h > 0) expect(e).toBeGreaterThanOrEqual(MODEL_EQUITY[risks[r]][horizons[h - 1]]);
        const a = allocationFromEquity(e);
        const total = ASSET_CLASSES.reduce((s, k) => s + a[k], 0);
        expect(total).toBeCloseTo(1, 10);
      }
    }
  });
});

describe('questionnaire structure', () => {
  it('has 10 questions with the FNCE 2830 point ranges', () => {
    expect(QUESTIONS.length).toBe(10);
    const max = (id: string) => Math.max(...QUESTIONS.find((q) => q.id === id)!.options.map((o) => o.points));
    const min = (id: string) => Math.min(...QUESTIONS.find((q) => q.id === id)!.options.map((o) => o.points));
    expect([1, 2, 3, 4, 5, 6].map((i) => max(`q${i}`))).toEqual([5, 4, 4, 6, 5, 4]);
    expect([7, 8, 9, 10].map((i) => max(`q${i}`))).toEqual([6, 5, 5, 4]);
    for (let i = 1; i <= 10; i++) expect(min(`q${i}`)).toBe(1);
    const riskMax = [1, 2, 3, 4, 5, 6].reduce((s, i) => s + max(`q${i}`), 0);
    const horizonMax = [7, 8, 9, 10].reduce((s, i) => s + max(`q${i}`), 0);
    expect(riskMax).toBe(28);
    expect(horizonMax).toBe(20);
    expect(RISK_BANDS[RISK_BANDS.length - 1].max).toBe(28);
    expect(HORIZON_BANDS[HORIZON_BANDS.length - 1].max).toBe(20);
    expect(SUPPLEMENT.length).toBe(4);
  });
  it('Q5 has five ranges of four multiples each', () => {
    const q5 = QUESTIONS.find((q) => q.id === 'q5')!;
    expect(q5.ranges?.length).toBe(5);
    for (const r of q5.ranges!) expect(r.length).toBe(4);
  });
});

describe('careers, metros, states, personas, playbook', () => {
  it('occupation bands are strictly increasing across percentiles', () => {
    for (const [code, occ] of Object.entries(OCCUPATIONS)) {
      const b = occ.oews.value;
      expect(b.p10, code).toBeLessThan(b.p25);
      expect(b.p25, code).toBeLessThan(b.p50);
      expect(b.p50, code).toBeLessThan(b.p75);
      expect(b.p75, code).toBeLessThan(b.p90);
      expect(occ.levels.length, code).toBeGreaterThanOrEqual(2);
      for (const lvl of occ.levels) {
        expect(lvl.band.value.p25, `${code}/${lvl.title}`).toBeLessThanOrEqual(lvl.band.value.p50);
        expect(lvl.band.value.p50, `${code}/${lvl.title}`).toBeLessThanOrEqual(lvl.band.value.p75);
      }
      expect(occ.code).toBe(code);
    }
  });
  it('metros have a national entry and positive indexes', () => {
    expect(METROS.national.index.value).toBe(1);
    for (const m of Object.values(METROS)) expect(m.index.value).toBeGreaterThan(0.5);
  });
  it('states include CO and TX and have valid tax shapes', () => {
    expect(STATES.CO).toBeTruthy();
    expect(STATES.TX.tax.type).toBe('none');
    for (const s of Object.values(STATES)) {
      if (s.tax.type === 'flat') expect(s.tax.rate.value).toBeLessThan(0.1);
      if (s.tax.type === 'brackets') {
        const b = s.tax.single.value;
        expect(b[b.length - 1].upTo).toBe(Infinity);
      }
    }
  });
  it('personas reference existing occupations, metros and states', () => {
    for (const p of PERSONAS) {
      expect(p.state.profile.stateCode === 'CUSTOM' || !!STATES[p.state.profile.stateCode], `${p.key} state`).toBe(true);
      for (const path of p.state.careerPaths) {
        expect(path.occupationCode === 'custom' || !!OCCUPATIONS[path.occupationCode], `${p.key}/${path.name} occupation ${path.occupationCode}`).toBe(true);
        expect(!!METROS[path.metro], `${p.key}/${path.name} metro ${path.metro}`).toBe(true);
      }
      expect(p.state.careerPaths.some((c) => c.id === p.state.activePathId), `${p.key} active path`).toBe(true);
    }
  });
  it('playbook topics have items', () => {
    for (const t of PLAYBOOK) expect(t.items.length, t.key).toBeGreaterThan(0);
  });
});
