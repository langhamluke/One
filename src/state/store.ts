import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { PathId } from '../data/airlines';
import { DEFAULT_ASSUMPTIONS, DEFAULT_WHATIF, PERSONAS, blankState } from '../data/personas';
import type { Assumptions, Milestones, PlanState, Profile, WhatIf } from '../lib/inputs';
import type { SupplementAnswers } from '../lib/scoring';
import type { AssetClass } from '../lib/types';

export type Phase = 'preflight' | 'checklist' | 'flightplan' | 'cruise' | 'landing' | 'briefing';
export const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: 'preflight', label: 'PREFLIGHT', hint: 'Intake' },
  { id: 'checklist', label: 'CHECKLIST', hint: 'Risk questionnaire' },
  { id: 'flightplan', label: 'FLIGHT PLAN', hint: 'Career & airline compare' },
  { id: 'cruise', label: 'CRUISE', hint: 'Allocation & contributions' },
  { id: 'landing', label: 'LANDING', hint: 'Retirement projection' },
  { id: 'briefing', label: 'BRIEFING', hint: 'Printable summary' },
];

export interface UIState {
  phase: Phase;
  mode: 'client' | 'advisor';
  dollars: 'real' | 'nominal';
  personaId: string | null;
}

export interface Store extends PlanState {
  ui: UIState;
  setProfile: (patch: Partial<Profile>) => void;
  setAnswer: (qid: string, idx: number | null) => void;
  setSupplement: (sid: keyof SupplementAnswers, idx: number | null) => void;
  setPortfolioAmount: (n: number) => void;
  setAssumptions: (patch: Partial<Assumptions>) => void;
  setCma: (asset: AssetClass, field: 'mean' | 'vol', value: number) => void;
  setWhatIf: (patch: Partial<WhatIf>) => void;
  resetWhatIf: () => void;
  setMilestone: (path: PathId, key: keyof Milestones, value: number) => void;
  setSelectedPaths: (paths: PathId[]) => void;
  setActivePath: (path: PathId) => void;
  setUI: (patch: Partial<UIState>) => void;
  loadPersona: (id: string) => void;
  newClient: () => void;
  importJSON: (text: string) => { ok: boolean; error?: string };
  exportJSON: () => string;
}

/** localStorage access wrapped in try/catch (private windows, blocked storage, quota). */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

const isMajorStage = (s: Profile['stage']) => ['major_fo', 'major_ca', 'cargo_fo', 'cargo_ca'].includes(s);

const planOnly = (s: Store): PlanState => ({
  profile: s.profile, answers: s.answers, portfolioAmount: s.portfolioAmount, supplement: s.supplement,
  assumptions: s.assumptions, whatIf: s.whatIf, selectedPaths: s.selectedPaths, activePath: s.activePath,
});

/** Merge a possibly-partial/old saved state onto current defaults. */
function hydrate(raw: Partial<PlanState>): PlanState {
  const d = blankState();
  return {
    ...d,
    ...raw,
    profile: { ...d.profile, ...(raw.profile ?? {}) },
    assumptions: { ...DEFAULT_ASSUMPTIONS, ...(raw.assumptions ?? {}), cma: { ...DEFAULT_ASSUMPTIONS.cma, ...(raw.assumptions?.cma ?? {}) } },
    whatIf: { ...DEFAULT_WHATIF, ...(raw.whatIf ?? {}) },
    answers: { ...(raw.answers ?? {}) },
    supplement: { ...(raw.supplement ?? {}) },
  };
}

const initial = PERSONAS[0].make();

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initial,
      ui: { phase: 'preflight', mode: 'advisor', dollars: 'real', personaId: PERSONAS[0].id },

      setProfile: (patch) =>
        set((s) => {
          const profile = { ...s.profile, ...patch };
          if (profile.retireAge > 65) profile.retireAge = 65;
          let { selectedPaths, activePath } = s;
          if (patch.stage && isMajorStage(patch.stage) !== isMajorStage(s.profile.stage)) {
            selectedPaths = isMajorStage(patch.stage) ? ['stay'] : ['envoy-aa', 'regional-swa'];
            activePath = selectedPaths[0];
            profile.targetPaths = selectedPaths;
          }
          if (patch.targetPaths) {
            selectedPaths = patch.targetPaths.length ? patch.targetPaths : selectedPaths;
            if (!selectedPaths.includes(activePath)) activePath = selectedPaths[0];
          }
          return { profile, selectedPaths, activePath };
        }),
      setAnswer: (qid, idx) => set((s) => ({ answers: { ...s.answers, [qid]: idx } })),
      setSupplement: (sid, idx) => set((s) => ({ supplement: { ...s.supplement, [sid]: idx } })),
      setPortfolioAmount: (n) => set({ portfolioAmount: Math.max(1000, n) }),
      setAssumptions: (patch) => set((s) => ({ assumptions: { ...s.assumptions, ...patch } })),
      setCma: (asset, field, value) =>
        set((s) => ({ assumptions: { ...s.assumptions, cma: { ...s.assumptions.cma, [asset]: { ...s.assumptions.cma[asset], [field]: value } } } })),
      setWhatIf: (patch) => set((s) => ({ whatIf: { ...s.whatIf, ...patch } })),
      resetWhatIf: () => set({ whatIf: { ...DEFAULT_WHATIF } }),
      setMilestone: (path, key, value) =>
        set((s) => ({ profile: { ...s.profile, milestones: { ...s.profile.milestones, [path]: { ...(s.profile.milestones[path] ?? {}), [key]: value } } } })),
      setSelectedPaths: (paths) =>
        set((s) => ({ selectedPaths: paths, activePath: paths.includes(s.activePath) ? s.activePath : paths[0], profile: { ...s.profile, targetPaths: paths } })),
      setActivePath: (path) => set({ activePath: path }),
      setUI: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
      loadPersona: (id) => {
        const p = PERSONAS.find((x) => x.id === id);
        if (!p) return;
        set((s) => ({ ...p.make(), ui: { ...s.ui, personaId: id } }));
      },
      newClient: () => set((s) => ({ ...blankState(), ui: { ...s.ui, personaId: null, phase: 'preflight' } })),
      importJSON: (text) => {
        try {
          const obj = JSON.parse(text);
          const raw = obj?.app === 'flight-plan' ? obj.state : obj;
          if (!raw || typeof raw !== 'object' || !raw.profile) return { ok: false, error: 'Not a Flight Plan client file.' };
          set((s) => ({ ...hydrate(raw), ui: { ...s.ui, personaId: null } }));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
        }
      },
      exportJSON: () => JSON.stringify({ app: 'flight-plan', version: 1, exported: new Date().toISOString(), state: planOnly(get()) }, null, 2),
    }),
    {
      name: 'flight-plan-session-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ ...planOnly(s), ui: s.ui }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlanState> & { ui?: UIState };
        if (!p.profile) return current;
        return { ...current, ...hydrate(p), ui: { ...current.ui, ...(p.ui ?? {}) } };
      },
    },
  ),
);

export const selectPlanState = (s: Store): PlanState => planOnly(s);
