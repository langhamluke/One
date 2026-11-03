/**
 * Formatting helpers shared by the UI, the chat assistant and the summary page.
 * Pure TypeScript (no React, no Intl dependence) so output is identical in the browser and on the server.
 */

export interface MoneyOptions {
  /** 1,234,567 -> $1.2M; 45,600 -> $45.6k */
  compact?: boolean;
  /** Decimal places (default 0, or 1 when compact) */
  decimals?: number;
  /** Prefix positive numbers with "+" */
  sign?: boolean;
}

function withCommas(fixed: string): string {
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

/** toFixed with half-up rounding that ignores binary representation drift (0.0725 -> "7.3", not "7.2"). */
export function toFixedHalfUp(x: number, decimals: number): string {
  const p = Math.pow(10, decimals);
  const sign = x < 0 ? -1 : 1;
  const r = Math.round(Math.abs(x) * p + 1e-9) / p;
  return (sign * r).toFixed(decimals);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Format a dollar amount. Non-finite values render as an em dash. */
export function fmtMoney(n: number, opts: MoneyOptions = {}): string {
  if (!Number.isFinite(n)) return '—';
  const { compact = false, decimals, sign = false } = opts;
  const neg = n < -0.005;
  const abs = Math.abs(n);
  let body: string;
  if (compact && abs >= 1000) {
    if (abs >= 1e9) body = `${trimZeros(toFixedHalfUp(abs / 1e9, decimals ?? 1))}B`;
    else if (abs >= 1e6) body = `${trimZeros(toFixedHalfUp(abs / 1e6, decimals ?? 1))}M`;
    else body = `${trimZeros(toFixedHalfUp(abs / 1e3, decimals ?? (abs >= 100000 ? 0 : 1)))}k`;
  } else {
    body = withCommas(toFixedHalfUp(abs, decimals ?? 0));
  }
  const prefix = neg ? '-$' : sign && n > 0.005 ? '+$' : '$';
  return prefix + body;
}

/** 0.0725 -> "7.3%" (decimals default 1) */
export function fmtPct(x: number, decimals = 1, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(x)) return '—';
  const v = x * 100;
  const s = toFixedHalfUp(v, decimals);
  const plus = opts.sign && v > 0 ? '+' : '';
  return `${plus}${s}%`;
}

/** 67 -> "67"; null -> em dash. Fractional ages are rounded. */
export function fmtAge(age: number | null | undefined): string {
  if (age === null || age === undefined || !Number.isFinite(age)) return '—';
  return String(Math.round(age));
}

/** 1 -> "1 yr", 5 -> "5 yrs", 2.5 -> "2.5 yrs" */
export function fmtYears(years: number): string {
  if (!Number.isFinite(years)) return '—';
  const v = Math.abs(years - Math.round(years)) < 0.05 ? String(Math.round(years)) : years.toFixed(1);
  return `${v} ${v === '1' ? 'yr' : 'yrs'}`;
}

/** 6 -> "6 months", 1 -> "1 month", 4.5 -> "4.5 months" */
export function fmtMonths(months: number): string {
  if (!Number.isFinite(months)) return '—';
  const v = Math.abs(months - Math.round(months)) < 0.05 ? String(Math.round(months)) : months.toFixed(1);
  return `${v} ${v === '1' ? 'month' : 'months'}`;
}

/** Plain number with thousands separators. */
export function fmtNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  return (neg ? '-' : '') + withCommas(Math.abs(n).toFixed(decimals));
}

/** Calendar year, e.g. 2031 -> "2031" (kept as a function so the UI never concatenates raw numbers). */
export function fmtYear(year: number): string {
  return Number.isFinite(year) ? String(Math.round(year)) : '—';
}

/** "+$1,200" / "-$300" deltas for readouts. */
export function fmtDelta(n: number, opts: MoneyOptions = {}): string {
  return fmtMoney(n, { ...opts, sign: true });
}

/** Deflate a nominal amount at plan year i to today's dollars. */
export function toTodayDollars(nominal: number, yearIndex: number, inflation: number): number {
  return nominal / Math.pow(1 + inflation, yearIndex);
}
