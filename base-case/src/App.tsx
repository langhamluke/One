import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from '@/state/session';
import { ToastProvider, Loading } from '@/components/ui';
import { AppShell } from '@/components/shell/AppShell';
import { LoginPage, InvitePage, MfaPage } from '@/pages/Auth';
import { HomePage } from '@/pages/Home';
import { PlanLayout } from '@/pages/plan/PlanLayout';
import { ProfilePage } from '@/pages/plan/Profile';
import { RiskPage } from '@/pages/plan/Risk';
import { CareerPage } from '@/pages/plan/Career';
import { PlanPage } from '@/pages/plan/Plan';
import { FuturePage } from '@/pages/plan/Future';
import { SummaryPage } from '@/pages/plan/Summary';
import { ProposalsPage, ProposalReviewPage } from '@/pages/Proposals';
import { AssistantPage } from '@/pages/Assistant';
import { PlaybookPage } from '@/pages/Playbook';
import { DataPage } from '@/pages/Data';
import { ClientsPage, ClientDetailPage } from '@/pages/Clients';
import { UsersPage } from '@/pages/admin/Users';
import { AuditPage } from '@/pages/admin/Audit';
import { SettingsPage } from '@/pages/admin/Settings';
import { AccountPage } from '@/pages/Account';
import { LegalPage } from '@/pages/Legal';
import { NotFoundPage } from '@/pages/NotFound';
import type { Role } from '@shared/lib/types';

function RequireAuth({ roles }: { roles?: Role[] }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <div className="p-8"><Loading label="Signing you in" /></div>;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me.mfaPending) return <Navigate to="/mfa" replace />;
  if (roles && !roles.includes(me.user.role)) return <NotFoundPage />;
  return <Outlet />;
}

function PlanRoutes() {
  return (
    <>
      <Route index element={<Navigate to="profile" replace />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="risk" element={<RiskPage />} />
      <Route path="career" element={<CareerPage />} />
      <Route path="plan" element={<PlanPage />} />
      <Route path="future" element={<FuturePage />} />
      <Route path="summary" element={<SummaryPage />} />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/mfa" element={<MfaPage />} />
            <Route path="/privacy" element={<LegalPage kind="privacy" />} />
            <Route path="/terms" element={<LegalPage kind="terms" />} />
            <Route path="/methodology" element={<LegalPage kind="methodology" />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/plan" element={<PlanLayout />}>{PlanRoutes()}</Route>
                <Route path="/clients/:clientId/plan" element={<PlanLayout />}>{PlanRoutes()}</Route>
                <Route path="/proposals" element={<ProposalsPage />} />
                <Route path="/proposals/:id" element={<ProposalReviewPage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/playbook" element={<PlaybookPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route element={<RequireAuth roles={['advisor', 'admin']} />}>
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/clients/:clientId" element={<ClientDetailPage />} />
                </Route>
                <Route element={<RequireAuth roles={['admin']} />}>
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/audit" element={<AuditPage />} />
                  <Route path="/admin/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
