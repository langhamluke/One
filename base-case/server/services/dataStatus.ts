/**
 * Data freshness summary for /api/data/status: as-of dates and verified/unverified counts over every Sourced value.
 */
import type { DataStatus } from '../../shared/api';
import * as data from '../../shared/data';
import { walkSourced } from '../../shared/data';

/** Months between an as-of "YYYY-MM" string and `now`. */
export function monthsOld(asOf: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})/.exec(asOf);
  if (!m) return 0;
  return (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
}

export function collectSourced(): { key: string; asOf: string; verified: boolean }[] {
  const pool: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'PERSONAS' || typeof v === 'function') continue;
    pool[k] = v;
  }
  return walkSourced(pool, '').map((e) => ({ key: e.key, asOf: String(e.s.asOf ?? ''), verified: Boolean(e.s.verified) }));
}

/** Derived values are computed from verified primary data (e.g. ladder levels mapped from OEWS percentiles, typical bonus assumptions). */
export function isDerived(key: string): boolean {
  return /\.levels\.\d+\./.test(key) || /\.bonusTypical$/.test(key);
}

/** Months after which a dataset counts as stale, by its normal publication cadence. */
export function staleAfterMonths(key: string): number {
  if (key.startsWith('OCCUPATIONS') || key.startsWith('METROS')) return 18; // OEWS: annual, published ~11 months after the reference month
  if (key.startsWith('STATES')) return 14;
  return 14; // IRS / SSA / loans: annual
}

export function dataStatus(now: Date): DataStatus {
  const items = collectSourced();
  const primary = items.filter((i) => !isDerived(i.key));
  const derivedCount = items.length - primary.length;
  const primaryUnverifiedCount = primary.filter((i) => !i.verified).length;
  const unverifiedCount = items.filter((i) => !i.verified).length;
  const staleCount = primary.filter((i) => monthsOld(i.asOf, now) > staleAfterMonths(i.key)).length;
  return {
    asOf: { irs: data.IRS_AS_OF, tax: String(data.TAX_YEAR), wages: data.WAGES_AS_OF, loans: data.LOANS_AS_OF, ssa: data.SS_AS_OF },
    unverifiedCount,
    totalCount: items.length,
    staleCount,
    primaryCount: primary.length,
    primaryUnverifiedCount,
    derivedCount,
  };
}

/** Most recent as-of month across the headline datasets (shown in /api/me as firm.dataAsOf). */
export function latestDataAsOf(): string {
  return [data.IRS_AS_OF, data.WAGES_AS_OF, data.LOANS_AS_OF, data.SS_AS_OF].sort().at(-1) ?? data.IRS_AS_OF;
}
