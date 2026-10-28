import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { buildActions, buildAlerts, type ActionItem, type Alert } from '../lib/alerts';
import type { PlanState } from '../lib/inputs';
import type { MCResult } from '../lib/montecarlo';
import { activePathOf, computePlan, monteCarloFor, type PlanResult } from '../lib/plan';
import { selectPlanState, useStore } from './store';

export interface Derived {
  state: PlanState;
  plan: PlanResult;
  mc: MCResult;
  alerts: Alert[];
  actions: ActionItem[];
}

const Ctx = createContext<Derived | null>(null);

export function usePlanState(): PlanState {
  return useStore(useShallow(selectPlanState));
}

export function DerivedProvider({ children }: { children: ReactNode }) {
  const state = usePlanState();
  const pathId = activePathOf(state);
  const plan = useMemo(() => computePlan(state, pathId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.profile, state.answers, state.assumptions, state.whatIf, state.supplement, pathId]);
  const mc = useMemo(() => monteCarloFor(plan, state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, state.assumptions.nSims, state.assumptions.seed, state.assumptions.cma]);
  const alerts = useMemo(() => buildAlerts(state, plan, mc), [state, plan, mc]);
  const actions = useMemo(() => buildActions(state, plan), [state, plan]);
  const value = useMemo(() => ({ state, plan, mc, alerts, actions }), [state, plan, mc, alerts, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDerived(): Derived {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDerived outside DerivedProvider');
  return v;
}

/** Convert a nominal amount at plan-year index to the user's display basis. */
export function useMoney() {
  const dollars = useStore((s) => s.ui.dollars);
  return {
    dollars,
    conv: (nominal: number, index: number) => (dollars === 'real' ? nominal / index : nominal),
    label: dollars === 'real' ? "today's $" : 'nominal $',
  };
}
