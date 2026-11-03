/**
 * Occupations, career ladders and metro wage indexes.
 * Wage source: U.S. BLS Occupational Employment and Wage Statistics (OEWS), May 2025 (released May 15, 2026),
 * national cross-industry estimates: annual 10th/25th/50th/75th/90th percentile wages.
 * Ladder levels are DERIVED from the percentile distribution (entry ~p10-p25, mid ~p50, senior ~p75-p90) unless a
 * level-specific source is cited, and are therefore flagged verified: false ("Derived from OEWS percentiles").
 * Projections: BLS Employment Projections 2024-34 (percent change in employment).
 *
 * THIS SKELETON defines the shape and helpers; the data pass fills OCCUPATIONS and METROS with sourced values.
 */
import type { LadderLevel, SalaryBand } from '../lib/inputs';
import { sourced, type Sourced } from '../lib/types';

export const WAGES_AS_OF = '2025-05';
export const WAGES_SOURCE = 'BLS OEWS May 2025 (national), released 2026-05-15';

export type Education = 'none' | 'trade' | 'associate' | 'bachelor' | 'master' | 'professional' | 'doctoral';
export type LayoffRisk = 'low' | 'medium' | 'high';

export interface Occupation {
  /** Stable key, e.g. 'software_developer' */
  code: string;
  /** SOC code, e.g. '15-1252' */
  soc: string;
  title: string;
  industry: string;
  education: Education;
  /** National OEWS percentile band (annual $) */
  oews: Sourced<SalaryBand>;
  /** National employment (OEWS) */
  employment: Sourced<number>;
  /** Projected % employment change 2024-34 (BLS EP), as a fraction e.g. 0.15 */
  growth: Sourced<number>;
  layoffRisk: LayoffRisk;
  /** Typical bonus as a fraction of salary (assumption, flagged) */
  bonusTypical: Sourced<number>;
  /** Career ladder, entry level first */
  levels: LadderLevel[];
  /** Pension-typical (public sector), equity-typical (tech), etc. */
  tags: ('pension' | 'equity' | 'overtime' | 'commission' | 'licensure' | 'shift-differential' | 'union')[];
  notes?: string;
}

export interface Metro {
  key: string;
  name: string;
  state: string;
  /** All-occupations annual mean wage relative to national (1.0 = national) */
  index: Sourced<number>;
  /** Optional per-occupation overrides: occupation code -> ratio of metro median to national median */
  occupationIndex?: Record<string, Sourced<number>>;
}

export const OCCUPATIONS: Record<string, Occupation> = {};
export const METROS: Record<string, Metro> = {
  national: { key: 'national', name: 'National average', state: '', index: sourced(1, 'By definition', WAGES_AS_OF, true) },
};

export function listOccupations(): Occupation[] {
  return Object.values(OCCUPATIONS).sort((a, b) => a.title.localeCompare(b.title));
}

export function listMetros(): Metro[] {
  return Object.values(METROS).sort((a, b) => (a.key === 'national' ? -1 : b.key === 'national' ? 1 : a.name.localeCompare(b.name)));
}

/** Linear interpolation inside a band for a position 0..1 across [p10, p25, p50, p75, p90]. */
export function bandAt(band: SalaryBand, position: number): number {
  const pts = [band.p10, band.p25, band.p50, band.p75, band.p90];
  const knots = [0.1, 0.25, 0.5, 0.75, 0.9];
  const p = Math.min(0.9, Math.max(0.1, position));
  for (let i = 0; i < knots.length - 1; i++) {
    if (p <= knots[i + 1]) {
      const t = (p - knots[i]) / (knots[i + 1] - knots[i]);
      return pts[i] + t * (pts[i + 1] - pts[i]);
    }
  }
  return band.p90;
}

/**
 * Derive a ladder from a national percentile band.
 * Each level gets its own band centred on a percentile position so that track low/mid/high (p25/p50/p75 within the
 * level band) still moves the whole ladder. Flagged verified:false because the level mapping is an assumption.
 */
export function ladderFromBand(
  oews: Sourced<SalaryBand>,
  spec: { title: string; years: number; center: number; spread?: number; bonusPct?: number }[],
): LadderLevel[] {
  return spec.map((lvl) => {
    const spread = lvl.spread ?? 0.12;
    const b: SalaryBand = {
      p10: bandAt(oews.value, lvl.center - spread * 1.5),
      p25: bandAt(oews.value, lvl.center - spread),
      p50: bandAt(oews.value, lvl.center),
      p75: bandAt(oews.value, lvl.center + spread),
      p90: bandAt(oews.value, lvl.center + spread * 1.5),
    };
    return {
      title: lvl.title,
      years: lvl.years,
      bonusPct: lvl.bonusPct ?? 0,
      band: {
        value: b,
        source: `Derived from OEWS percentiles (${oews.source})`,
        url: oews.url,
        asOf: oews.asOf,
        verified: false,
        note: `Level centred at the p${Math.round(lvl.center * 100)} of the national distribution; mapping is an assumption`,
      },
    };
  });
}

/** Standard 4-level ladder spec used for most bachelor's-level occupations. */
export const STANDARD_LADDER = [
  { title: 'Entry', years: 2, center: 0.2 },
  { title: 'Mid-level', years: 3, center: 0.4 },
  { title: 'Senior', years: 5, center: 0.62 },
  { title: 'Lead / Manager', years: 99, center: 0.8 },
];
