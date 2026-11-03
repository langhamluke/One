/**
 * Core shared types for Base Case.
 * Pure TypeScript: no React, no Node-only imports. Used by the engine, the server and the client.
 */

/** Every real-world figure in the app is Sourced. "No silent numbers." */
export interface Sourced<T = number> {
  value: T;
  /** Human-readable citation, e.g. "IRS Notice 2025-67" or "BLS OEWS May 2025, SOC 15-1252, national" */
  source: string;
  url?: string;
  /** As-of month, e.g. "2026-05" */
  asOf: string;
  /** false = interpolated, estimated, proxy, or not confirmed against a primary source */
  verified: boolean;
  note?: string;
}

export type FilingStatus = 'single' | 'mfj' | 'hoh';

export type AssetClass = 'uslc' | 'ussmid' | 'intl' | 'em' | 'bonds' | 'tips' | 'cash';
export const ASSET_CLASSES: AssetClass[] = ['uslc', 'ussmid', 'intl', 'em', 'bonds', 'tips', 'cash'];
export const EQUITY_CLASSES: AssetClass[] = ['uslc', 'ussmid', 'intl', 'em'];
export const FIXED_CLASSES: AssetClass[] = ['bonds', 'tips', 'cash'];
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  uslc: 'US Large Cap',
  ussmid: 'US Small/Mid Cap',
  intl: 'International Developed',
  em: 'Emerging Markets',
  bonds: 'US Aggregate Bonds',
  tips: 'TIPS',
  cash: 'Cash',
};

/** Fractions that sum to 1. */
export type Allocation = Record<AssetClass, number>;

export type RiskCategory = 'Conservative' | 'Moderate' | 'Assertive' | 'Aggressive';
export type HorizonCategory = 'Short-term' | 'Intermediate' | 'Long-term';

export type Severity = 'warning' | 'caution' | 'advisory';

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Shown only in advisor/admin mode */
  advisorOnly?: boolean;
  /** Numeric payload for UI (e.g. shortfall $) */
  value?: number;
}

export type ActionCategory =
  | 'emergency'
  | 'debt'
  | 'match'
  | '401k'
  | 'hsa'
  | 'ira'
  | 'taxable'
  | 'insurance'
  | 'loans'
  | 'goal'
  | 'tax'
  | 'other';

export interface ActionItem {
  id: string;
  rank: number;
  category: ActionCategory;
  title: string;
  detail: string;
  /** Suggested annual dollar amount when relevant */
  amount?: number;
}

export type Role = 'admin' | 'advisor' | 'client';

export type ViewMode = 'client' | 'advisor';
export type DollarBasis = 'today' | 'nominal';

/** A data point in use by the current plan, surfaced on the Data & Sources page and in VERIFY tags. */
export interface DataQualityItem {
  key: string;
  label: string;
  value: number | string;
  source: string;
  url?: string;
  asOf: string;
  verified: boolean;
  note?: string;
  /** 'data' = from a cited dataset, 'user' = self-reported by the client, 'assumption' = modelling assumption */
  origin: 'data' | 'user' | 'assumption';
}

export function sourced<T>(
  value: T,
  source: string,
  asOf: string,
  verified = true,
  extra: { url?: string; note?: string } = {},
): Sourced<T> {
  return { value, source, asOf, verified, ...extra };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/** Round to cents to avoid float drift in ledgers. */
export function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
