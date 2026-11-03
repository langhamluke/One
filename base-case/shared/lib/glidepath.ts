/**
 * Equity glide path and portfolio statistics.
 *
 * Equity by age: hold the model equity (or assumptions.equityOverride) until (retirementAge - glideYears), then move
 * linearly to landingEquity at retirement and hold it afterwards. The landing is never above today's model equity.
 */
import { ASSET_CLASSES, type Allocation, type AssetClass } from './types';
import type { CMAEntry, PlanState } from './inputs';
import { CORRELATION } from '../data/cma';
import type { GlidePoint } from './derived';

export interface GlideParams {
  modelEquity: number;
  retirementAge: number;
  glideYears: number;
  landingEquity: number;
}

export function glideEquity(age: number, p: GlideParams): number {
  const model = Math.min(1, Math.max(0, p.modelEquity));
  const landing = Math.min(model, Math.max(0, p.landingEquity));
  const glideYears = Math.max(0, p.glideYears);
  const start = p.retirementAge - glideYears;
  if (age <= start) return model;
  if (age >= p.retirementAge) return landing;
  if (glideYears === 0) return landing;
  const t = (age - start) / glideYears;
  return model + t * (landing - model);
}

export function glideParams(state: PlanState, modelEquity: number): GlideParams {
  const a = state.assumptions;
  return {
    modelEquity: a.equityOverride ?? modelEquity,
    retirementAge: state.whatIf?.retireAtOverride ?? state.profile.retirementAge,
    glideYears: a.glideYears,
    landingEquity: a.landingEquity,
  };
}

/** One point per age from the client's current age to life expectancy. */
export function buildGlidePath(state: PlanState, modelEquity: number): GlidePoint[] {
  const p = glideParams(state, modelEquity);
  const from = Math.floor(state.profile.age);
  const to = Math.max(from, Math.floor(state.assumptions.lifeExpectancy));
  const out: GlidePoint[] = [];
  for (let age = from; age <= to; age++) out.push({ age, equity: glideEquity(age, p) });
  return out;
}

/** Expected arithmetic nominal return of an allocation. */
export function expectedReturn(alloc: Allocation, cma: Record<AssetClass, CMAEntry>): number {
  let r = 0;
  for (const k of ASSET_CLASSES) r += (alloc[k] ?? 0) * (cma[k]?.ret ?? 0);
  return r;
}

/** Portfolio volatility sqrt(w' S w) using the fixed CORRELATION matrix. */
export function portfolioVol(alloc: Allocation, cma: Record<AssetClass, CMAEntry>): number {
  let v = 0;
  for (let i = 0; i < ASSET_CLASSES.length; i++) {
    const wi = alloc[ASSET_CLASSES[i]] ?? 0;
    if (wi === 0) continue;
    const si = cma[ASSET_CLASSES[i]]?.vol ?? 0;
    for (let j = 0; j < ASSET_CLASSES.length; j++) {
      const wj = alloc[ASSET_CLASSES[j]] ?? 0;
      if (wj === 0) continue;
      const sj = cma[ASSET_CLASSES[j]]?.vol ?? 0;
      v += wi * wj * si * sj * CORRELATION[i][j];
    }
  }
  return Math.sqrt(Math.max(0, v));
}

export function equityShare(alloc: Allocation): number {
  return (alloc.uslc ?? 0) + (alloc.ussmid ?? 0) + (alloc.intl ?? 0) + (alloc.em ?? 0);
}
