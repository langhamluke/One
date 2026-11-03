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

export function dataStatus(now: Date): DataStatus {
  const items = collectSourced();
  const unverifiedCount = items.filter((i) => !i.verified).length;
  const staleCount = items.filter((i) => monthsOld(i.asOf, now) > 12).length;
  return {
    asOf: { irs: data.IRS_AS_OF, tax: String(data.TAX_YEAR), wages: data.WAGES_AS_OF, loans: data.LOANS_AS_OF, ssa: data.SS_AS_OF },
    unverifiedCount,
    totalCount: items.length,
    staleCount,
  };
}

/** Most recent as-of month across the headline datasets (shown in /api/me as firm.dataAsOf). */
export function latestDataAsOf(): string {
  return [data.IRS_AS_OF, data.WAGES_AS_OF, data.LOANS_AS_OF, data.SS_AS_OF].sort().at(-1) ?? data.IRS_AS_OF;
}
