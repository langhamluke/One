import { FEDERAL_2026, FICA_2026 } from '../data/tax2026';
import type { FilingStatus } from './types';

/** Progressive federal income tax on taxable income. `index` inflates bracket thresholds (1 = 2026). */
export function federalIncomeTax(taxable: number, status: FilingStatus, index = 1): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of FEDERAL_2026[status].brackets) {
    const upper = b.upTo === Infinity ? Infinity : b.upTo * index;
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * b.rate;
    lower = upper;
  }
  return tax;
}

export function marginalFederalRate(taxable: number, status: FilingStatus, index = 1): number {
  for (const b of FEDERAL_2026[status].brackets) {
    if (taxable <= b.upTo * index) return b.rate;
  }
  return 0.37;
}

export function standardDeduction(status: FilingStatus, index = 1): number {
  return FEDERAL_2026[status].standardDeduction * index;
}

/** Employee-side FICA on one earner's wages. */
export function ficaForEarner(wages: number, index = 1): { ss: number; medicare: number } {
  const w = Math.max(0, wages);
  return {
    ss: Math.min(w, FICA_2026.ssWageBase * index) * FICA_2026.ssRate,
    medicare: w * FICA_2026.medicareRate,
  };
}

export interface TaxInput {
  /** Pilot W-2 wages before pre-tax deferrals (includes profit sharing and any cash-in-lieu of excess DC) */
  wages: number;
  /** Pre-tax 401(k) deferrals (reduce income tax, not FICA) */
  pretaxDeferral: number;
  /** Payroll HSA (reduces income tax and FICA) */
  hsa: number;
  spouseWages: number;
  status: FilingStatus;
  stateRate: number;
  index?: number;
}

export interface TaxResult {
  federal: number;
  ss: number;
  medicare: number;
  addlMedicare: number;
  state: number;
  total: number;
  taxableIncome: number;
  agi: number;
  marginalFederal: number;
}

export function computeTaxes(i: TaxInput): TaxResult {
  const index = i.index ?? 1;
  const pilotFicaWages = Math.max(0, i.wages - i.hsa);
  const p = ficaForEarner(pilotFicaWages, index);
  const s = ficaForEarner(i.spouseWages, index);
  const medicareWages = i.status === 'mfj' ? pilotFicaWages + i.spouseWages : pilotFicaWages;
  const addlMedicare = Math.max(0, medicareWages - FICA_2026.addlMedicareThreshold[i.status]) * FICA_2026.addlMedicareRate;
  const agi = Math.max(0, i.wages - i.pretaxDeferral - i.hsa + (i.status === 'mfj' ? i.spouseWages : 0));
  const taxableIncome = Math.max(0, agi - standardDeduction(i.status, index));
  const federal = federalIncomeTax(taxableIncome, i.status, index);
  const state = taxableIncome * i.stateRate;
  const ss = p.ss + (i.status === 'mfj' ? s.ss : 0);
  const medicare = p.medicare + (i.status === 'mfj' ? s.medicare : 0);
  return {
    federal, ss, medicare, addlMedicare, state,
    total: federal + ss + medicare + addlMedicare + state,
    taxableIncome, agi,
    marginalFederal: marginalFederalRate(taxableIncome, i.status, index),
  };
}
