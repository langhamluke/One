/**
 * Demo personas (fictional). Each exercises a different alert or what-if. Filled in by the data pass.
 */
import { defaultPlanState, type PlanState } from '../lib/inputs';

export interface Persona {
  key: string;
  name: string;
  tagline: string;
  /** Demo login email used by the seed script */
  email: string;
  state: PlanState;
}

export const PERSONAS: Persona[] = [
  { key: 'blank', name: 'New client', tagline: 'Empty intake', email: 'client@demo.basecase.local', state: defaultPlanState() },
];

export function personaByKey(key: string): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}
