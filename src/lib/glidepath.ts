import { ASSET_CLASSES, EQUITY_CLASSES, FIXED_CLASSES, equityPct } from '../data/models';
import type { Allocation } from './types';

/**
 * Equity % at a given age. Holds today's model equity until the descent begins
 * (`glideYears` before retirement), then declines linearly to `landingEquity` at retirement,
 * and holds the landing allocation thereafter. Never increases risk above today's model.
 */
export function equityAt(age: number, startAge: number, startEquity: number, retireAge: number, landingEquity: number, glideYears: number): number {
  if (startEquity <= landingEquity) return startEquity;
  if (age >= retireAge) return landingEquity;
  const descentStart = Math.max(startAge, retireAge - glideYears);
  if (age <= descentStart) return startEquity;
  const span = retireAge - descentStart;
  if (span <= 0) return landingEquity;
  return startEquity + ((landingEquity - startEquity) * (age - descentStart)) / span;
}

const DEFAULT_FIXED: Partial<Allocation> = { usAgg: 70, tips: 20, cash: 10 };

/** Rescale a model to a target equity %, preserving the mix within the equity and fixed-income sleeves. */
export function allocationWithEquity(model: Allocation, targetEquity: number): Allocation {
  const eq = equityPct(model);
  const fx = 100 - eq;
  const out = {} as Allocation;
  for (const k of EQUITY_CLASSES) out[k] = eq > 0 ? (model[k] / eq) * targetEquity : k === 'usLarge' ? targetEquity : 0;
  for (const k of FIXED_CLASSES) {
    const share = fx > 0 ? model[k] / fx : (DEFAULT_FIXED[k] ?? 0) / 100;
    out[k] = share * (100 - targetEquity);
  }
  return out;
}

export interface GlidePoint extends Allocation { age: number; equity: number }

export function buildGlidePath(model: Allocation, startAge: number, retireAge: number, endAge: number, landingEquity: number, glideYears: number): GlidePoint[] {
  const startEq = equityPct(model);
  const pts: GlidePoint[] = [];
  for (let age = startAge; age <= endAge; age++) {
    const e = equityAt(age, startAge, startEq, retireAge, landingEquity, glideYears);
    pts.push({ age, equity: e, ...allocationWithEquity(model, e) });
  }
  return pts;
}

export const ASSET_ORDER = ASSET_CLASSES.map((a) => a.id);
