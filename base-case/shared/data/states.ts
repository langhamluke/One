/**
 * State income tax presets (tax year 2026). Flat-rate states carry the statutory rate; graduated states carry either a
 * bracket table (when corroborated) or an ESTIMATED effective-rate curve flagged verified:false. Local/city taxes excluded.
 * THIS SKELETON defines the shape; the data pass fills STATES with sourced values.
 */
import { sourced, type Sourced } from '../lib/types';

export const STATES_AS_OF = '2026-01';

export interface StateBracket {
  upTo: number;
  rate: number;
}

export type StateTax =
  | { type: 'none'; rate: Sourced<number> }
  | { type: 'flat'; rate: Sourced<number>; standardDeductionSingle?: number; standardDeductionMfj?: number }
  | { type: 'brackets'; single: Sourced<StateBracket[]>; mfj: Sourced<StateBracket[]>; standardDeductionSingle: number; standardDeductionMfj: number }
  | { type: 'effective'; curve: Sourced<{ income: number; rate: number }[]>; note: string };

export interface StatePreset {
  code: string;
  name: string;
  tax: StateTax;
}

export const STATES: Record<string, StatePreset> = {
  TX: { code: 'TX', name: 'Texas', tax: { type: 'none', rate: sourced(0, 'No state individual income tax', STATES_AS_OF, true) } },
  CO: { code: 'CO', name: 'Colorado', tax: { type: 'flat', rate: sourced(0.044, 'Colo. Rev. Stat. §39-22-104 (4.40% statutory; TABOR temporary reductions possible)', STATES_AS_OF, false, { note: 'Verify the 2026 rate (2024-25 were temporarily 4.25%)' }) } },
};

export function listStates(): StatePreset[] {
  return Object.values(STATES).sort((a, b) => a.name.localeCompare(b.name));
}
