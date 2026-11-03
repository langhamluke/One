/**
 * ENGINE ENTRY POINT (contract).
 * computeDerived(state) runs the whole plan: risk profile -> allocation/glide path -> career/pay
 * simulation per path -> taxes/limits/cash flow ledger -> Monte Carlo -> alerts/actions -> data quality.
 *
 * Implementation lives in the sibling modules; this file only orchestrates.
 * MUST stay pure (no React, no Node-only APIs) so it runs in the browser and on the server.
 */
import type { PlanState } from './inputs';
import type { Derived } from './derived';

export interface EngineOptions {
  /** Override Monte Carlo sims (UI uses fewer while dragging sliders) */
  sims?: number;
  /** Skip Monte Carlo (fast previews) */
  skipMonteCarlo?: boolean;
}

export function computeDerived(_state: PlanState, _opts: EngineOptions = {}): Derived {
  throw new Error('engine not implemented yet');
}
