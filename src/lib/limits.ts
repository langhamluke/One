import { IRS_2026 } from '../data/irs2026';
import type { ExcessHandling, FilingStatus } from './types';

/** Catch-up available at a given age (SECURE 2.0: 60–63 super catch-up replaces the age-50 amount). */
export function catchUpLimit(age: number, index = 1): number {
  if (age >= 60 && age <= 63) return IRS_2026.catchUp60to63 * index;
  if (age >= 50) return IRS_2026.catchUp50 * index;
  return 0;
}

/** Pay level at which §415(c) binds: companyPct × pay + deferral = limit. */
export function payWhere415cBinds(companyRate: number, deferral = IRS_2026.electiveDeferral, limit = IRS_2026.annualAdditions415c): number {
  if (companyRate <= 0) return Infinity;
  return (limit - deferral) / companyRate;
}

export interface DCInput {
  pay: number;              // plan compensation (base + profit sharing if eligible)
  age: number;
  deferralRate: number;     // 0–1 elected deferral as % of pay
  companyRate: number;      // 0–1 non-elective company contribution
  excessHandling: ExcessHandling;
  index?: number;           // inflation index for limits (1 = 2026)
}

export interface DCResult {
  employeeDeferral: number; // base elective deferral (counts toward §415(c))
  catchUp: number;          // catch-up (outside §415(c))
  companyContribution: number; // what actually lands in the DC plan
  companyIntended: number;  // company % × capped comp before §415(c)
  compBase: number;         // comp after §401(a)(17) cap
  excess: number;           // company $ that spills over §415(c)
  excessHandling: ExcessHandling;
  annualAdditions: number;  // employeeDeferral + companyContribution (≤ §415(c))
  limit415c: number;
  bound415c: boolean;
  capped401a17: boolean;
}

export function computeDC(i: DCInput): DCResult {
  const index = i.index ?? 1;
  const limit402g = IRS_2026.electiveDeferral * index;
  const limit415c = IRS_2026.annualAdditions415c * index;
  const compCap = IRS_2026.compLimit401a17 * index;

  const desired = Math.max(0, i.deferralRate * i.pay);
  const employeeDeferral = Math.min(desired, limit402g, i.pay);
  const catchUp = Math.min(Math.max(0, desired - limit402g), catchUpLimit(i.age, index));

  const compBase = Math.min(i.pay, compCap);
  const companyIntended = Math.max(0, i.companyRate * compBase);
  const room = Math.max(0, limit415c - employeeDeferral);
  const companyContribution = Math.min(companyIntended, room);
  const excess = companyIntended - companyContribution;

  return {
    employeeDeferral,
    catchUp,
    companyContribution,
    companyIntended,
    compBase,
    excess,
    excessHandling: i.excessHandling,
    annualAdditions: employeeDeferral + companyContribution,
    limit415c,
    bound415c: excess > 0.005,
    capped401a17: i.pay > compCap,
  };
}

export type RothIraStatus = 'full' | 'partial' | 'none';

/** Direct Roth IRA eligibility by MAGI. Partial → reduced contribution per IRS ratio (rounded up to $10). */
export function rothIraEligibility(magi: number, status: FilingStatus, age = 30, index = 1): { status: RothIraStatus; allowed: number; limit: number } {
  const limit = (IRS_2026.ira + (age >= 50 ? IRS_2026.iraCatchUp : 0)) * index;
  const { start, end } = IRS_2026.rothPhaseOut[status];
  const s = start * index, e = end * index;
  if (magi < s) return { status: 'full', allowed: limit, limit };
  if (magi >= e) return { status: 'none', allowed: 0, limit };
  let allowed = limit * (1 - (magi - s) / (e - s));
  allowed = Math.ceil(allowed / 10) * 10;
  if (allowed < 200) allowed = 200; // IRS minimum when not fully phased out
  return { status: 'partial', allowed: Math.min(allowed, limit), limit };
}

export function hsaLimit(family: boolean, age: number, index = 1): number {
  return (family ? IRS_2026.hsa.family : IRS_2026.hsa.self) * index + (age >= 55 ? IRS_2026.hsa.catchUp55 : 0);
}

/** Catch-up must be Roth when prior-year FICA wages exceed the threshold (SECURE 2.0 §603). */
export function catchUpMustBeRoth(priorYearFicaWages: number, index = 1): boolean {
  return priorYearFicaWages > IRS_2026.rothCatchUpWageThreshold * index;
}
