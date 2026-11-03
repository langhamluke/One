/** Presentation-only formatting helpers. No financial math lives here beyond unit display. */
import type { DollarBasis } from '@shared/lib/types';

const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtMoney(x: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const s = money0.format(Math.abs(x));
  if (x < 0) return `−${s}`;
  return opts.sign && x > 0 ? `+${s}` : s;
}

/** $1.2M / $340k style */
export function fmtCompact(x: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  let s: string;
  if (a >= 1e9) s = `$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  else if (a >= 1e6) s = `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  else if (a >= 1e3) s = `$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  else s = `$${a.toFixed(0)}`;
  if (x < 0) return `−${s}`;
  return opts.sign && x > 0 ? `+${s}` : s;
}

export function fmtPct(x: number | null | undefined, digits = 0, opts: { sign?: boolean } = {}): string {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = x * 100;
  const s = `${Math.abs(v).toFixed(digits)}%`;
  if (v < 0) return `−${s}`;
  return opts.sign && v > 0 ? `+${s}` : s;
}

export function fmtNum(x: number | null | undefined, digits = 0): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return digits === 0 ? num0.format(x) : x.toFixed(digits);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtMonths(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x.toFixed(1)} mo`;
}

export function fmtAge(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return 'Never';
  return `${Math.round(x)}`;
}

/**
 * Display conversion between nominal and today's dollars. The engine provides nominal ledgers plus the inflation
 * assumption; this only divides by the price index for the display basis (a unit change, not a model result).
 */
export function toBasis(nominal: number, yearIndex: number, inflation: number, basis: DollarBasis): number {
  if (basis === 'nominal') return nominal;
  return nominal / Math.pow(1 + inflation, yearIndex);
}

export function basisLabel(basis: DollarBasis): string {
  return basis === 'today' ? "today's $" : 'nominal $';
}

export function titleCase(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
