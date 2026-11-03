/**
 * Federal income tax, FICA, state tax and a few deduction helpers.
 *
 * Indexing: 2026 is the data year. For later years bracket thresholds, the standard deduction and phase-out ranges are
 * indexed by `indexing` (the plan's assumptions.indexing ?? inflation) as (1 + indexing)^(year - 2026) and rounded the
 * way the IRS rounds (brackets to $25, standard deduction to $50, §221 ranges to $5,000, LTCG thresholds to $50).
 * Earlier years are not deflated (factor 1).
 *
 * Pre-tax 401(k) and deductible traditional IRA contributions reduce income tax but not FICA; payroll HSA
 * contributions reduce both. Callers subtract those from gross before calling federalIncomeTax / fica.
 */
import { BRACKETS_2026, FICA, STANDARD_DEDUCTION_2026, TAX_YEAR, type Bracket } from '../data/tax2026';
import { STATES, type StateTax } from '../data/states';
import { LIMITS_2026 } from '../data/irs2026';
import { INFLATION_DEFAULT } from '../data/cma';
import type { FilingStatus } from './types';

/** (1 + rate)^(year - baseYear), never below 1. */
export function indexFactor(year: number, rate: number, baseYear = TAX_YEAR): number {
  const n = Math.max(0, Math.floor(year) - baseYear);
  return n === 0 ? 1 : Math.pow(1 + rate, n);
}

export function roundTo(x: number, step: number): number {
  return step > 0 ? Math.round(x / step) * step : x;
}

/** Bracket table for a year (thresholds indexed and rounded to $25). */
export function bracketsFor(status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): Bracket[] {
  const f = indexFactor(year, indexing);
  const base = BRACKETS_2026[status] ?? BRACKETS_2026.single;
  return base.value.map((b) => ({ upTo: Number.isFinite(b.upTo) ? roundTo(b.upTo * f, 25) : Infinity, rate: b.rate }));
}

export function standardDeduction(status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): number {
  const base = STANDARD_DEDUCTION_2026[status] ?? STANDARD_DEDUCTION_2026.single;
  return roundTo(base.value * indexFactor(year, indexing), 50);
}

/** Regular federal income tax on taxable income (after the standard deduction). */
export function federalIncomeTax(taxableIncome: number, status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): number {
  const ti = Math.max(0, taxableIncome);
  if (ti === 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of bracketsFor(status, year, indexing)) {
    if (ti <= prev) break;
    const top = Math.min(ti, b.upTo);
    tax += (top - prev) * b.rate;
    prev = b.upTo;
  }
  return tax;
}

/** Marginal rate of the bracket containing taxableIncome (10% at or below the first threshold). */
export function marginalFederalRate(taxableIncome: number, status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): number {
  const ti = Math.max(0, taxableIncome);
  const brackets = bracketsFor(status, year, indexing);
  for (const b of brackets) if (ti <= b.upTo) return b.rate;
  return brackets[brackets.length - 1].rate;
}

// ---------------------------------------------------------------------------------------------
// FICA
// ---------------------------------------------------------------------------------------------

export interface FicaResult {
  oasdi: number;
  medicare: number;
  additionalMedicare: number;
  total: number;
  wageBase: number;
}

/** OASDI wage base: published 2025-2027; later years indexed by inflation from the last published year (rounded to $300). */
export function wageBase(year: number, inflation = INFLATION_DEFAULT): number {
  const years = Object.keys(FICA.wageBase).map(Number).sort((a, b) => a - b);
  const y = Math.floor(year);
  const known = FICA.wageBase[y];
  if (known) return known.value;
  const first = years[0];
  const last = years[years.length - 1];
  if (y < first) return FICA.wageBase[first].value;
  return roundTo(FICA.wageBase[last].value * Math.pow(1 + inflation, y - last), 300);
}

/**
 * Employee FICA on wages: 6.2% OASDI up to the wage base, 1.45% Medicare on all wages, plus 0.9% Additional Medicare
 * over the statutory (unindexed) threshold for the filing status. `oasdiExempt` models a non-covered public pension job.
 */
export function fica(
  wages: number,
  status: FilingStatus,
  year = TAX_YEAR,
  opts: { inflation?: number; oasdiExempt?: boolean } = {},
): FicaResult {
  const w = Math.max(0, wages);
  const base = wageBase(year, opts.inflation ?? INFLATION_DEFAULT);
  const oasdi = opts.oasdiExempt ? 0 : FICA.socialSecurityRate * Math.min(w, base);
  const medicare = FICA.medicareRate * w;
  const threshold = FICA.additionalMedicareThreshold[status] ?? FICA.additionalMedicareThreshold.single;
  const additionalMedicare = FICA.additionalMedicareRate * Math.max(0, w - threshold);
  return { oasdi, medicare, additionalMedicare, total: oasdi + medicare + additionalMedicare, wageBase: base };
}

// ---------------------------------------------------------------------------------------------
// State tax
// ---------------------------------------------------------------------------------------------

function graduated(income: number, brackets: { upTo: number; rate: number }[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (income <= prev) break;
    const top = Math.min(income, b.upTo);
    tax += (top - prev) * b.rate;
    prev = b.upTo;
  }
  return tax;
}

/** Interpolate an effective-rate curve (points sorted by income); flat beyond the ends. */
export function interpolateCurve(income: number, curve: { income: number; rate: number }[]): number {
  if (curve.length === 0) return 0;
  const pts = [...curve].sort((a, b) => a.income - b.income);
  if (income <= pts[0].income) return pts[0].rate;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (income <= b.income) {
      const t = b.income === a.income ? 0 : (income - a.income) / (b.income - a.income);
      return a.rate + t * (b.rate - a.rate);
    }
  }
  return pts[pts.length - 1].rate;
}

/** State income tax from a preset definition. `income` is AGI-like (gross less pre-tax deductions). */
export function stateTaxFromPreset(income: number, tax: StateTax, status: FilingStatus): number {
  const inc = Math.max(0, income);
  const mfj = status === 'mfj';
  switch (tax.type) {
    case 'none':
      return 0;
    case 'flat': {
      const sd = (mfj ? tax.standardDeductionMfj : tax.standardDeductionSingle) ?? 0;
      return Math.max(0, inc - sd) * tax.rate.value;
    }
    case 'brackets': {
      const sd = mfj ? tax.standardDeductionMfj : tax.standardDeductionSingle;
      const table = mfj ? tax.mfj.value : tax.single.value;
      return graduated(Math.max(0, inc - sd), table);
    }
    case 'effective':
      return inc * interpolateCurve(inc, tax.curve.value);
    default:
      return 0;
  }
}

/**
 * State income tax by state code. 'CUSTOM' applies opts.customRate to income; an unknown code yields 0 (the engine
 * flags it in data quality).
 */
export function stateTax(income: number, stateCode: string, status: FilingStatus, opts: { customRate?: number } = {}): number {
  if (stateCode === 'CUSTOM') return Math.max(0, income) * Math.max(0, opts.customRate ?? 0);
  const preset = STATES[stateCode];
  if (!preset) return 0;
  return stateTaxFromPreset(income, preset.tax, status);
}

// ---------------------------------------------------------------------------------------------
// Other helpers
// ---------------------------------------------------------------------------------------------

/**
 * Long-term capital gains tax: the gain stacks on top of ordinary taxable income across the 0% / 15% / 20% thresholds
 * (indexed, rounded to $50). NIIT is not included.
 */
export function ltcgTax(gain: number, ordinaryTaxableIncome: number, status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): number {
  const g = Math.max(0, gain);
  if (g === 0) return 0;
  const f = indexFactor(year, indexing);
  const t = LIMITS_2026.ltcg[status] ?? LIMITS_2026.ltcg.single;
  const zeroTo = roundTo(t.value.zeroTo * f, 50);
  const fifteenTo = roundTo(t.value.fifteenTo * f, 50);
  const start = Math.max(0, ordinaryTaxableIncome);
  const g0 = Math.min(g, Math.max(0, zeroTo - start));
  const g15 = Math.min(g - g0, Math.max(0, fifteenTo - Math.max(start, zeroTo)));
  const g20 = g - g0 - g15;
  return 0.15 * g15 + 0.2 * g20;
}

/** §221 student loan interest deduction: up to $2,500, phased out linearly over the MAGI range (indexed, $5,000 rounding). */
export function studentLoanInterestDeduction(interestPaid: number, magi: number, status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): number {
  const ded = Math.min(Math.max(0, interestPaid), LIMITS_2026.studentLoanInterest.max.value);
  if (ded === 0) return 0;
  const f = indexFactor(year, indexing);
  const r = LIMITS_2026.studentLoanInterest.phaseOut[status] ?? LIMITS_2026.studentLoanInterest.phaseOut.single;
  const lo = roundTo(r.value.lo * f, 5000);
  const hi = roundTo(r.value.hi * f, 5000);
  if (magi <= lo) return ded;
  if (magi >= hi) return 0;
  return ded * ((hi - magi) / (hi - lo));
}

export interface IncomeTaxBreakdown {
  standardDeduction: number;
  taxableIncome: number;
  federalTax: number;
  marginalRate: number;
}

/** Convenience: AGI-like income -> standard deduction -> taxable -> tax. */
export function federalTaxOnIncome(agiLike: number, status: FilingStatus, year = TAX_YEAR, indexing = INFLATION_DEFAULT): IncomeTaxBreakdown {
  const sd = standardDeduction(status, year, indexing);
  const ti = Math.max(0, agiLike - sd);
  return { standardDeduction: sd, taxableIncome: ti, federalTax: federalIncomeTax(ti, status, year, indexing), marginalRate: marginalFederalRate(ti, status, year, indexing) };
}
