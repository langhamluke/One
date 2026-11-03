/**
 * The engine is the only source of numbers. This provider memoizes computeDerived(state) once per state change
 * (150 ms debounce + 200 sims while a slider is being dragged, full sims on settle) and never lets a throw reach
 * the screens: they get { derived: null, error } and render a placeholder.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Derived } from '@shared/lib/derived';
import type { PlanState } from '@shared/lib/inputs';
import { computeDerived } from '@shared/lib/engine';
import { usePlanStore } from './plan';

export interface DerivedCtx {
  derived: Derived | null;
  error: string | null;
  /** True while a newer state is waiting to be computed */
  stale: boolean;
  /** Fewer sims were used for this result (slider drag) */
  preview: boolean;
  approvedDerived: Derived | null;
  state: PlanState;
}

const Ctx = createContext<DerivedCtx | null>(null);

function safeCompute(state: PlanState, sims?: number): { derived: Derived | null; error: string | null } {
  try {
    return { derived: computeDerived(state, sims ? { sims } : {}), error: null };
  } catch (e) {
    return { derived: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function DerivedProvider({ children }: { children: ReactNode }) {
  const state = usePlanStore((s) => s.state);
  const dragging = usePlanStore((s) => s.dragging);
  const approvedState = usePlanStore((s) => s.approved?.state ?? null);
  const [result, setResult] = useState<{ derived: Derived | null; error: string | null; forState: PlanState | null; preview: boolean }>({ derived: null, error: null, forState: null, preview: false });
  const lastFull = useRef<PlanState | null>(null);

  useEffect(() => {
    const delay = dragging ? 150 : 0;
    const t = setTimeout(() => {
      const sims = dragging ? 200 : undefined;
      const r = safeCompute(state, sims);
      if (!dragging) lastFull.current = state;
      setResult({ ...r, forState: state, preview: !!dragging });
    }, delay);
    return () => clearTimeout(t);
  }, [state, dragging]);

  const approvedDerived = useMemo(() => (approvedState ? safeCompute(approvedState).derived : null), [approvedState]);

  const value = useMemo<DerivedCtx>(
    () => ({ derived: result.derived, error: result.error, stale: result.forState !== state, preview: result.preview, approvedDerived, state }),
    [result, state, approvedDerived],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDerived(): DerivedCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDerived outside DerivedProvider');
  return v;
}

/** One-off compute for review screens (approved vs draft). Memoized by reference. */
export function useComputed(state: PlanState | null | undefined, sims = 400): { derived: Derived | null; error: string | null } {
  return useMemo(() => (state ? safeCompute(state, sims) : { derived: null, error: null }), [state, sims]);
}
