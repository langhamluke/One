/**
 * IRS retirement-plan limits for any plan year, built from LIMITS_2026 (and the published 2027 HSA figures).
 *
 * Indexing rule (documented so the Data page can say so): limits for years after 2026 are the 2026 values grown by
 * (1 + indexing)^(year - 2026) and rounded the way the statute rounds:
 *   §402(g) deferral, §415(c) annual additions, IRA limit, catch-ups ........ nearest $500
 *   §401(a)(17) compensation cap ............................................. nearest $5,000
 *   IRA catch-up (SECURE 2.0 indexed in $100 steps) ......................... nearest $100
 *   Roth / traditional IRA phase-out ranges ................................. nearest $1,000
 *   HSA (from the 2027 published values onward) ............................. nearest $50
 * Statutory unindexed figures (HSA age-55 catch-up, §127) are held flat.
 */
import { IRS_YEAR, LIMITS_2026, LIMITS_2027_PUBLISHED } from '../data/irs2026';
import { INFLATION_DEFAULT } from '../data/cma';
import type { FilingStatus } from './types';
import type { Benefits } from './inputs';

function grow(value: number, year: number, indexing: number, step: number, baseYear = IRS_YEAR): number {
  const n = Math.max(0, Math.floor(year) - baseYear);
  if (n === 0) return value;
  const x = value * Math.pow(1 + indexing, n);
  return step > 0 ? Math.round(x / step) * step : x;
}

export interface DeferralLimit {
  base: number;
  catchUp: number;
  total: number;
  catchUpKind: 'none' | 'age50' | 'age60to63';
}

/** §402(g) limit plus the applicable catch-up: age 50+ gets catchUp50; ages 60-63 get the super catch-up INSTEAD. */
export function deferralLimit(age: number, year = IRS_YEAR, indexing = INFLATION_DEFAULT): DeferralLimit {
  const base = grow(LIMITS_2026.electiveDeferral.value, year, indexing, 500);
  let catchUp = 0;
  let catchUpKind: DeferralLimit['catchUpKind'] = 'none';
  if (age >= 60 && age <= 63) {
    catchUp = grow(LIMITS_2026.catchUp60to63.value, year, indexing, 500);
    catchUpKind = 'age60to63';
  } else if (age >= 50) {
    catchUp = grow(LIMITS_2026.catchUp50.value, year, indexing, 500);
    catchUpKind = 'age50';
  }
  return { base, catchUp, total: base + catchUp, catchUpKind };
}

/** §415(c) annual additions limit (employee deferrals excluding catch-ups + employer contributions). */
export function annualAdditionsLimit(year = IRS_YEAR, indexing = INFLATION_DEFAULT): number {
  return grow(LIMITS_2026.annualAdditions415c.value, year, indexing, 500);
}

/** §401(a)(17) compensation that may be counted for contributions. */
export function compensationCap(year = IRS_YEAR, indexing = INFLATION_DEFAULT): number {
  return grow(LIMITS_2026.compensationCap401a17.value, year, indexing, 5000);
}

export interface IraLimit {
  base: number;
  catchUp: number;
  total: number;
}

/** IRA contribution limit (traditional + Roth combined), with the age-50 catch-up. */
export function iraLimit(age: number, year = IRS_YEAR, indexing = INFLATION_DEFAULT): IraLimit {
  const base = grow(LIMITS_2026.ira.value, year, indexing, 500);
  const catchUp = age >= 50 ? grow(LIMITS_2026.iraCatchUp50.value, year, indexing, 100) : 0;
  return { base, catchUp, total: base + catchUp };
}

export type RothStatus = 'full' | 'partial' | 'none';

export interface RothAllowed {
  allowed: number;
  status: RothStatus;
  lo: number;
  hi: number;
}

/**
 * Roth IRA contribution allowed at a MAGI: full below the range, none at/above the top, and inside the range a linear
 * reduction of `ageLimit` rounded UP to the next $10 with a $200 minimum (IRS Pub. 590-A).
 */
export function rothIraAllowed(magi: number, status: FilingStatus, year = IRS_YEAR, ageLimit?: number, indexing = INFLATION_DEFAULT): RothAllowed {
  const limit = ageLimit ?? iraLimit(49, year, indexing).total;
  const range = LIMITS_2026.rothPhaseOut[status] ?? LIMITS_2026.rothPhaseOut.single;
  const lo = grow(range.value.lo, year, indexing, 1000);
  const hi = grow(range.value.hi, year, indexing, 1000);
  if (limit <= 0) return { allowed: 0, status: 'none', lo, hi };
  if (magi < lo) return { allowed: limit, status: 'full', lo, hi };
  if (magi >= hi) return { allowed: 0, status: 'none', lo, hi };
  const reduced = limit * ((hi - magi) / (hi - lo));
  const step = LIMITS_2026.rothRounding.step;
  let allowed = Math.ceil(reduced / step - 1e-9) * step;
  if (allowed < LIMITS_2026.rothRounding.minimum) allowed = LIMITS_2026.rothRounding.minimum;
  allowed = Math.min(allowed, limit);
  return { allowed, status: allowed >= limit ? 'full' : 'partial', lo, hi };
}

/**
 * Deductible part of a traditional IRA contribution. Fully deductible when not covered by a workplace plan; otherwise
 * phased out linearly over the MAGI range with the same $10 round-up / $200 minimum convention.
 */
export function tradIraDeductible(contribution: number, magi: number, status: FilingStatus, coveredByPlan: boolean, year = IRS_YEAR, indexing = INFLATION_DEFAULT): number {
  const c = Math.max(0, contribution);
  if (c === 0) return 0;
  if (!coveredByPlan) return c;
  const range = LIMITS_2026.tradIraDeductionPhaseOut[status] ?? LIMITS_2026.tradIraDeductionPhaseOut.single;
  const lo = grow(range.value.lo, year, indexing, 1000);
  const hi = grow(range.value.hi, year, indexing, 1000);
  if (magi < lo) return c;
  if (magi >= hi) return 0;
  let d = Math.ceil((c * ((hi - magi) / (hi - lo))) / 10 - 1e-9) * 10;
  if (d < 200) d = 200;
  return Math.min(d, c);
}

export interface HsaLimit {
  base: number;
  catchUp: number;
  total: number;
}

/** HSA limit: 2026 and 2027 published values, later years indexed from 2027 (rounded to $50); +$1,000 at age 55+. */
export function hsaLimit(coverage: 'self' | 'family', age: number, year = IRS_YEAR, indexing = INFLATION_DEFAULT): HsaLimit {
  const y = Math.floor(year);
  let base: number;
  if (y <= 2026) base = LIMITS_2026.hsa[coverage].value;
  else if (y === 2027) base = LIMITS_2027_PUBLISHED.hsa[coverage].value;
  else base = grow(LIMITS_2027_PUBLISHED.hsa[coverage].value, y, indexing, 50, 2027);
  const catchUp = age >= 55 ? LIMITS_2026.hsa.catchUp55.value : 0;
  return { base, catchUp, total: base + catchUp };
}

export interface Section415cResult {
  employee: number;
  employer: number;
  total: number;
  limit: number;
  capped: boolean;
  /** Amount that could not be contributed */
  excess: number;
}

/**
 * Apply the §415(c) annual additions limit: min(limit, 100% of pay) across employee deferrals (excluding catch-ups,
 * which sit outside §415(c)) and employer contributions. Employer contributions are trimmed first, then deferrals.
 */
export function applySection415c(
  employeeDeferral: number,
  employerContribs: number,
  pay: number,
  year = IRS_YEAR,
  opts: { indexing?: number; catchUpExcluded?: number } = {},
): Section415cResult {
  const statutory = annualAdditionsLimit(year, opts.indexing ?? INFLATION_DEFAULT);
  const limit = Math.max(0, Math.min(statutory, Math.max(0, pay)));
  const catchUp = Math.max(0, opts.catchUpExcluded ?? 0);
  const emp = Math.max(0, employeeDeferral - catchUp);
  const er = Math.max(0, employerContribs);
  const total = emp + er;
  if (total <= limit) return { employee: emp + catchUp, employer: er, total: total + catchUp, limit, capped: false, excess: 0 };
  const employee = Math.min(emp, limit);
  const employer = Math.max(0, Math.min(er, limit - employee));
  return { employee: employee + catchUp, employer, total: employee + employer + catchUp, limit, capped: true, excess: total - (employee + employer) };
}

export interface EmployerContribInput {
  pay: number;
  /** Employee deferral as a fraction of pay (actual, after any deferral-limit cap) */
  deferralPct: number;
  benefits: Pick<Benefits, 'matchRate' | 'matchCapPct' | 'nonElectivePct' | 'studentLoanMatch'>;
  year?: number;
  /** Qualified student-loan payments this year (SECURE 2.0 §110) */
  studentLoanPayments?: number;
  indexing?: number;
}

export interface EmployerContribResult {
  match: number;
  /** Part of the match earned by student-loan payments rather than deferrals */
  loanMatch: number;
  nonElective: number;
  total: number;
  eligiblePay: number;
  /** Deferral fraction that was matched (<= matchCapPct) */
  matchedPct: number;
}

/**
 * Employer contributions: match = matchRate * min(deferralPct, matchCapPct) * pay, plus nonElectivePct * pay, with pay
 * capped at §401(a)(17). When the plan matches student-loan payments, those payments count as deferrals up to the cap.
 */
export function employerContributions(input: EmployerContribInput): EmployerContribResult {
  const year = input.year ?? IRS_YEAR;
  const eligiblePay = Math.min(Math.max(0, input.pay), compensationCap(year, input.indexing ?? INFLATION_DEFAULT));
  const b = input.benefits;
  if (eligiblePay <= 0) return { match: 0, loanMatch: 0, nonElective: 0, total: 0, eligiblePay: 0, matchedPct: 0 };
  const cap = Math.max(0, b.matchCapPct);
  const rate = Math.max(0, b.matchRate);
  const basePct = Math.min(cap, Math.max(0, input.deferralPct));
  const loanPct = b.studentLoanMatch ? Math.max(0, input.studentLoanPayments ?? 0) / eligiblePay : 0;
  const matchedPct = Math.min(cap, basePct + loanPct);
  const baseMatch = rate * basePct * eligiblePay;
  const match = rate * matchedPct * eligiblePay;
  const nonElective = Math.max(0, b.nonElectivePct) * eligiblePay;
  return { match, loanMatch: match - baseMatch, nonElective, total: match + nonElective, eligiblePay, matchedPct };
}
