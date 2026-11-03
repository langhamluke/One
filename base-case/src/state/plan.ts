/**
 * Working plan store. The draft lives in memory only and autosaves to the server:
 *  - 'draft'  : a proposal is open; PUT /api/proposals/:id debounced 1.5 s after each change.
 *  - 'direct' : advisor/admin editing the approved plan; PUT /api/plans/:clientId when they click Save.
 *  - 'view'   : client looking at the approved plan; the first edit creates a draft proposal.
 */
import { create } from 'zustand';
import type { PlanRecord, Proposal } from '@shared/api';
import { defaultPlanState, mergePlanState, type PlanState } from '@shared/lib/inputs';
import type { Role } from '@shared/lib/types';
import { plans, proposals } from '@/api/endpoints';
import { ApiError, errorMessage } from '@/api/client';

export type PlanMode = 'view' | 'draft' | 'direct';

interface PlanStore {
  clientId: string | null;
  role: Role | null;
  approved: PlanRecord | null;
  proposal: Proposal | null;
  state: PlanState;
  mode: PlanMode;
  loaded: boolean;
  loading: boolean;
  loadError: string | null;
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  saveError: string | null;
  dragging: boolean;
  load: (args: { clientId: string | null; proposalId?: string | null; role: Role }) => Promise<void>;
  update: (mutate: (draft: PlanState) => void) => void;
  replace: (state: PlanState) => void;
  startDraft: () => Promise<Proposal | null>;
  saveDirect: (reason?: string) => Promise<void>;
  submit: (title: string, note: string) => Promise<Proposal | null>;
  discard: () => Promise<void>;
  flush: () => Promise<void>;
  setDragging: (b: boolean) => void;
  reset: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let creating: Promise<Proposal | null> | null = null;
let loadSeq = 0;

export const usePlanStore = create<PlanStore>((set, get) => {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void get().flush();
    }, 1500);
  };

  return {
    clientId: null,
    role: null,
    approved: null,
    proposal: null,
    state: defaultPlanState(),
    mode: 'view',
    loaded: false,
    loading: false,
    loadError: null,
    dirty: false,
    saving: false,
    savedAt: null,
    saveError: null,
    dragging: false,

    reset: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      creating = null;
      set({ clientId: null, approved: null, proposal: null, state: defaultPlanState(), mode: 'view', loaded: false, loading: false, loadError: null, dirty: false, saving: false, savedAt: null, saveError: null });
    },

    load: async ({ clientId, proposalId, role }) => {
      const seq = ++loadSeq;
      if (timer) clearTimeout(timer);
      timer = null;
      set({ loading: true, loadError: null, role });
      try {
        let approved: PlanRecord | null = null;
        try {
          approved = role === 'client' || !clientId ? await plans.me() : await plans.get(clientId);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) approved = null;
          else throw e;
        }
        const effectiveClientId = clientId ?? approved?.clientId ?? null;
        let proposal: Proposal | null = null;
        if (proposalId) {
          proposal = await proposals.get(proposalId);
        } else if (role === 'client') {
          const drafts = await proposals.list({ status: 'draft' });
          if (drafts.length > 0) proposal = await proposals.get(drafts[0].id);
        }
        if (seq !== loadSeq) return;
        const isDraft = proposal != null && proposal.status === 'draft';
        const base = approved ? mergePlanState(approved.state) : defaultPlanState();
        set({
          clientId: effectiveClientId,
          approved: approved ? { ...approved, state: base } : null,
          proposal: isDraft ? proposal : null,
          state: isDraft && proposal ? mergePlanState(proposal.state) : proposal ? mergePlanState(proposal.state) : base,
          mode: isDraft ? 'draft' : role === 'client' ? 'view' : 'direct',
          loaded: true,
          loading: false,
          dirty: false,
          saveError: null,
          savedAt: isDraft && proposal ? proposal.updatedAt : null,
        });
      } catch (e) {
        if (seq !== loadSeq) return;
        set({ loading: false, loaded: true, loadError: errorMessage(e) });
      }
    },

    update: (mutate) => {
      const next = structuredClone(get().state);
      mutate(next);
      get().replace(next);
    },

    replace: (state) => {
      const { mode, role } = get();
      set({ state, dirty: true });
      if (mode === 'draft') {
        schedule();
      } else if (mode === 'view' && role === 'client') {
        set({ mode: 'draft' });
        void get().startDraft().then(() => schedule());
      }
    },

    startDraft: async () => {
      if (get().proposal) return get().proposal;
      if (creating) return creating;
      const { clientId, state, role } = get();
      creating = (async () => {
        try {
          const p = await proposals.create({ clientId: role === 'client' ? undefined : clientId ?? undefined, title: 'Draft', note: '', state });
          set({ proposal: p, mode: 'draft', savedAt: p.updatedAt, saveError: null });
          return p;
        } catch (e) {
          set({ saveError: errorMessage(e) });
          return null;
        } finally {
          creating = null;
        }
      })();
      return creating;
    },

    flush: async () => {
      const { proposal, state, mode, dirty } = get();
      if (mode !== 'draft' || !proposal || !dirty) return;
      set({ saving: true });
      try {
        const p = await proposals.update(proposal.id, { state });
        set({ saving: false, dirty: false, savedAt: p.updatedAt ?? new Date().toISOString(), saveError: null, proposal: { ...proposal, ...p, state } });
      } catch (e) {
        set({ saving: false, saveError: errorMessage(e) });
      }
    },

    saveDirect: async (reason) => {
      const { clientId, state } = get();
      if (!clientId) return;
      set({ saving: true });
      try {
        const rec = await plans.put(clientId, state, reason);
        set({ saving: false, dirty: false, savedAt: rec.updatedAt, approved: { ...rec, state: mergePlanState(rec.state) }, saveError: null });
      } catch (e) {
        set({ saving: false, saveError: errorMessage(e) });
        throw e;
      }
    },

    submit: async (title, note) => {
      if (timer) clearTimeout(timer);
      timer = null;
      let p = get().proposal ?? (await get().startDraft());
      if (!p) return null;
      if (get().dirty) await get().flush();
      p = await proposals.submit(p.id, { title, note });
      const base = get().approved?.state ?? defaultPlanState();
      set({ proposal: null, mode: get().role === 'client' ? 'view' : 'direct', state: base, dirty: false });
      return p;
    },

    discard: async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const p = get().proposal;
      if (p) {
        try {
          await proposals.remove(p.id);
        } catch (e) {
          set({ saveError: errorMessage(e) });
        }
      }
      const base = get().approved?.state ?? defaultPlanState();
      set({ proposal: null, mode: get().role === 'client' ? 'view' : 'direct', state: base, dirty: false, savedAt: null });
    },

    setDragging: (dragging) => {
      if (get().dragging !== dragging) set({ dragging });
    },
  };
});
