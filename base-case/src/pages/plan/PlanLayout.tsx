import { createContext, useContext, useEffect } from 'react';
import { Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { usePlanStore } from '@/state/plan';
import { DerivedProvider } from '@/state/derived';
import { useSession, isStaff } from '@/state/session';
import { usePrefs } from '@/state/prefs';
import { ReadoutStrip } from '@/components/shell/ReadoutStrip';
import { DraftBanner } from '@/components/shell/DraftBanner';
import { PhaseStepper } from '@/components/shell/PhaseStepper';
import { ErrorNote, Loading } from '@/components/ui';
import { Page } from '@/components/shell/AppShell';

export interface PlanRoute {
  basePath: string;
  clientId: string | null;
  /** Viewer is the client (proposal workflow) rather than staff editing directly */
  clientMode: boolean;
}
const Ctx = createContext<PlanRoute>({ basePath: '/plan', clientId: null, clientMode: true });
export const usePlanRoute = () => useContext(Ctx);

/** Advisor view = staff user with the Advisor toggle on. */
export function useAdvisorView(): boolean {
  const { me } = useSession();
  const viewMode = usePrefs((s) => s.viewMode);
  return isStaff(me?.user.role) && viewMode === 'advisor';
}

export function PlanLayout() {
  const { clientId } = useParams();
  const [sp] = useSearchParams();
  const proposalId = sp.get('proposal');
  const { me, product } = useSession();
  const role = me?.user.role ?? 'client';
  const staff = isStaff(role);
  const { load, loaded, loading, loadError, reset } = usePlanStore();

  useEffect(() => {
    if (staff && !clientId) return;
    void load({ clientId: clientId ?? null, proposalId, role, product: product.key });
    return () => reset();
  }, [clientId, proposalId, role, staff, load, reset, product.key]);

  if (staff && !clientId) return <Navigate to="/clients" replace />;
  if (!staff && clientId) return <Navigate to="/plan/profile" replace />;

  const basePath = clientId ? `/clients/${clientId}/plan` : '/plan';
  const route: PlanRoute = { basePath, clientId: clientId ?? null, clientMode: !staff };

  return (
    <Ctx.Provider value={route}>
      <DerivedProvider>
        <DraftBanner clientMode={!staff} />
        <ReadoutStrip basePath={basePath} />
        <Page>
          <div className="mb-4"><PhaseStepper basePath={basePath} /></div>
          {loadError && <div className="mb-4"><ErrorNote>Could not load the plan: {loadError}</ErrorNote></div>}
          {loading && !loaded ? <Loading label="Loading plan" /> : <Outlet />}
        </Page>
      </DerivedProvider>
    </Ctx.Provider>
  );
}
