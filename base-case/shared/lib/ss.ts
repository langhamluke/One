/**
 * Social Security benefit estimate (simplified PIA method, today's dollars).
 *
 *  - assumptions.ssOverrideAnnual (e.g. from an SSA statement) -> method 'override' (haircut still applies).
 *  - Otherwise: covered earnings per simulated year are deflated to today's dollars, capped at the wage base (held
 *    constant in real terms), the highest 35 years are averaged over 420 months -> AIME; PIA with current-year bend
 *    points and the statutory 90/32/15 factors; claim-age adjustment (5/9% per month for the first 36 months early,
 *    5/12% beyond; 2/3% per month of delay after FRA up to 70); then assumptions.ssHaircut. Method 'estimated'.
 *  - No covered earnings -> method 'none'.
 * Pension jobs not covered by Social Security accrue nothing for those years. Benefits are not rounded to the dime.
 */
import { BEND_POINTS, CLAIM_ADJUSTMENT, EARLIEST_CLAIM_AGE, FULL_RETIREMENT_AGE, LATEST_CREDIT_AGE, PIA_FACTORS } from '../data/ss';
import { CURRENT_YEAR, type PlanState } from './inputs';
import type { SocialSecurityEstimate } from './derived';
import { wageBase } from './tax';

export interface CoveredEarningsRow {
  yearIndex: number;
  wages: number;
  bonus?: number;
  coveredBySS?: boolean;
}

/** Bend points for a year (falls back to the latest year available). */
export function bendPointsFor(year = CURRENT_YEAR): { first: number; second: number; year: number } {
  const years = Object.keys(BEND_POINTS).map(Number).sort((a, b) => a - b);
  let y = years[0];
  for (const k of years) if (k <= year) y = k;
  const bp = BEND_POINTS[y].value;
  return { first: bp.first, second: bp.second, year: y };
}

/** Primary insurance amount (monthly) from AIME using the bend-point formula. */
export function piaFromAime(aime: number, year = CURRENT_YEAR): number {
  const a = Math.max(0, aime);
  const bp = bendPointsFor(year);
  const p1 = Math.min(a, bp.first);
  const p2 = Math.max(0, Math.min(a, bp.second) - bp.first);
  const p3 = Math.max(0, a - bp.second);
  return PIA_FACTORS.first * p1 + PIA_FACTORS.second * p2 + PIA_FACTORS.third * p3;
}

/** Multiplier on the PIA for claiming at `claimAge` (62 -> 0.70, 67 -> 1.00, 70 -> 1.24 with FRA 67). */
export function claimAdjustmentFactor(claimAge: number, fra = FULL_RETIREMENT_AGE): number {
  const age = Math.min(LATEST_CREDIT_AGE, Math.max(EARLIEST_CLAIM_AGE, claimAge));
  const months = Math.round((age - fra) * 12);
  if (months < 0) {
    const early = -months;
    const first = Math.min(36, early);
    const beyond = Math.max(0, early - 36);
    return 1 - first * CLAIM_ADJUSTMENT.earlyFirst36MonthsPerMonth - beyond * CLAIM_ADJUSTMENT.earlyBeyond36MonthsPerMonth;
  }
  return 1 + months * CLAIM_ADJUSTMENT.delayedPerMonth;
}

/** AIME (monthly, today's dollars) from simulated earnings. */
export function aimeFromRows(rows: CoveredEarningsRow[], inflation: number): { aime: number; coveredYears: number } {
  const cap = wageBase(CURRENT_YEAR, inflation);
  const real: number[] = [];
  for (const r of rows) {
    if (r.coveredBySS === false) continue;
    const w = Math.max(0, r.wages) + Math.max(0, r.bonus ?? 0);
    if (w <= 0) continue;
    real.push(Math.min(cap, w / Math.pow(1 + inflation, r.yearIndex)));
  }
  real.sort((a, b) => b - a);
  const top = real.slice(0, 35);
  const total = top.reduce((s, x) => s + x, 0);
  return { aime: total / 420, coveredYears: real.length };
}

export function estimateSocialSecurity(state: PlanState, rows: CoveredEarningsRow[]): SocialSecurityEstimate {
  const a = state.assumptions;
  const claimAge = Math.min(LATEST_CREDIT_AGE, Math.max(EARLIEST_CLAIM_AGE, a.ssClaimAge));
  const haircut = Math.min(1, Math.max(0, a.ssHaircut));
  const factor = claimAdjustmentFactor(claimAge);
  if (a.ssOverrideAnnual !== undefined && a.ssOverrideAnnual !== null && Number.isFinite(a.ssOverrideAnnual)) {
    const annual = Math.max(0, a.ssOverrideAnnual) * (1 - haircut);
    return {
      annualAtClaim: annual,
      claimAge,
      aime: 0,
      pia: 0,
      method: 'override',
      note: haircut > 0 ? `From the client's SSA statement, reduced ${Math.round(haircut * 100)}% for the trust-fund haircut` : "From the client's SSA statement",
    };
  }
  const { aime, coveredYears } = aimeFromRows(rows, a.inflation);
  if (aime <= 0) {
    return { annualAtClaim: 0, claimAge, aime: 0, pia: 0, method: 'none', note: 'No Social Security-covered earnings in the projection' };
  }
  const pia = piaFromAime(aime, CURRENT_YEAR);
  const annual = pia * 12 * factor * (1 - haircut);
  const bp = bendPointsFor(CURRENT_YEAR);
  return {
    annualAtClaim: annual,
    claimAge,
    aime,
    pia,
    method: 'estimated',
    note: `Estimated from ${coveredYears} years of simulated covered earnings (${bp.year} bend points), claim at ${claimAge} (${Math.round(factor * 100)}% of PIA)${haircut > 0 ? `, ${Math.round(haircut * 100)}% haircut` : ''}. Not from an SSA statement.`,
  };
}
