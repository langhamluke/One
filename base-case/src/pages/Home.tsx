import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { useSession } from '@/state/session';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, EmptyState, ErrorNote, Loading, PageHeader, Panel, Stat, Table, td, th, thNum, tdNum } from '@/components/ui';
import { clients as clientsApi, data as dataApi, plans, proposals as proposalsApi, admin as adminApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import type { ClientListItem, DataStatus, PlanRecord, ProposalSummary, UserSummary } from '@shared/api';
import { useComputed } from '@/state/derived';
import { PlaybookList } from '@/components/PlaybookList';
import { fmtDate, fmtPct } from '@/lib/format';

function ClientHome() {
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [props, setProps] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([plans.me().catch(() => null), proposalsApi.list()])
      .then(([p, pr]) => { setPlan(p); setProps(pr); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  const { derived, error: engineError } = useComputed(plan?.state);
  const draft = props.find((p) => p.status === 'draft');
  const submitted = props.filter((p) => p.status === 'submitted');
  if (loading) return <Loading />;
  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Plan status">
          {plan && plan.version > 0 ? (
            <div className="flex flex-col gap-2">
              <Stat label="Approved version" value={`v${plan.version}`} sub={`${fmtDate(plan.updatedAt)}${plan.updatedByName ? ` by ${plan.updatedByName}` : ''}`} />
              {derived && <Stat label="P(success)" value={fmtPct(derived.headline.successProbability, 0)} />}
              <Link to="/plan/profile" className="text-sm inline-flex items-center gap-1">Open plan <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
            </div>
          ) : (
            <EmptyState title="No approved plan yet" detail="Start with your profile; your advisor approves the first version." action={<Link to="/plan/profile"><Button variant="primary">Start my plan</Button></Link>} />
          )}
        </Panel>
        <Panel title="Open draft">
          {draft ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">{draft.title}</div>
              <div className="text-xs text-ink-3">Last edited {fmtDate(draft.updatedAt)}</div>
              <Link to="/plan/profile"><Button variant="rec">Continue draft</Button></Link>
            </div>
          ) : submitted.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm">{submitted.length} proposal{submitted.length === 1 ? '' : 's'} waiting for review</div>
              <Link to="/proposals" className="text-sm">View proposals</Link>
            </div>
          ) : (
            <EmptyState title="No draft open" detail="Any change you make on the plan screens starts a draft for your advisor to review." />
          )}
        </Panel>
        <Panel title="Ask the assistant">
          <p className="text-sm text-ink-2 mb-3">Ask how a number is produced, what a term means or what to do next. The assistant explains; it never changes your plan.</p>
          <Link to="/assistant"><Button icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}>Open assistant</Button></Link>
        </Panel>
        <Panel title="Top actions" className="md:col-span-2">
          {engineError ? <p className="text-sm text-ink-3">Engine not available.</p> : derived ? <PlaybookList actions={derived.actions} limit={3} /> : <p className="text-sm text-ink-3">Open your plan to see actions.</p>}
        </Panel>
        <Panel title="Alerts">
          {derived ? (
            <div className="flex flex-col gap-2">
              <Stat label="Active alerts" value={derived.alerts.filter((a) => !a.advisorOnly).length} />
              <Link to="/plan/plan" className="text-sm">See the alert ledger</Link>
            </div>
          ) : <p className="text-sm text-ink-3">—</p>}
        </Panel>
      </div>
    </>
  );
}

function AdvisorHome() {
  const [list, setList] = useState<ClientListItem[]>([]);
  const [queue, setQueue] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([clientsApi.list(), proposalsApi.list({ status: 'submitted' })])
      .then(([c, q]) => { setList(c); setQueue(q); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Loading />;
  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Clients" className="xl:col-span-3" actions={<Link to="/clients" className="text-xs">All clients</Link>}>
          {list.length === 0 ? <EmptyState title="No clients assigned yet" /> : (
            <Table caption="Clients">
              <thead><tr><th className={th}>Client</th><th className={thNum}>Plan</th><th className={th}>Updated</th><th className={thNum}>Pending</th></tr></thead>
              <tbody>
                {list.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td className={td}><Link to={`/clients/${c.id}`}>{c.displayName}</Link><div className="text-xxs text-ink-3">{c.email}</div></td>
                    <td className={tdNum}>{c.planVersion ? `v${c.planVersion}` : '—'}</td>
                    <td className={td}>{fmtDate(c.planUpdatedAt)}</td>
                    <td className={tdNum}>{c.pendingProposals > 0 ? <Chip tone="warn">{c.pendingProposals}</Chip> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel title="Review queue" className="xl:col-span-2" actions={<Link to="/proposals" className="text-xs">All proposals</Link>}>
          {queue.length === 0 ? <EmptyState title="Nothing to review" /> : (
            <ul className="divide-y divide-line-2">
              {queue.map((p) => (
                <li key={p.id} className="py-2">
                  <Link to={`/proposals/${p.id}`} className="text-sm font-medium">{p.title}</Link>
                  <div className="text-xxs text-ink-3">{p.clientName} · submitted {fmtDate(p.submittedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function AdminHome() {
  const { me } = useSession();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [queue, setQueue] = useState<ProposalSummary[]>([]);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([adminApi.users(), proposalsApi.list({ status: 'submitted' }), dataApi.status().catch(() => null)])
      .then(([u, q, s]) => { setUsers(u); setQueue(q); setStatus(s); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Loading />;
  const invited = users.filter((u) => u.status === 'invited').length;
  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Users & invites">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Users" value={users.length} />
            <Stat label="Open invites" value={invited} />
            <Stat label="Advisors" value={users.filter((u) => u.role === 'advisor').length} />
            <Stat label="Clients" value={users.filter((u) => u.role === 'client').length} />
          </div>
          <Link to="/admin/users" className="text-sm mt-3 inline-block">Manage users</Link>
        </Panel>
        <Panel title="Pending reviews">
          <Stat label="Submitted proposals" value={queue.length} />
          <Link to="/proposals" className="text-sm mt-3 inline-block">Open review queue</Link>
        </Panel>
        <Panel title="Data status">
          {status ? (
            <div className="flex flex-col gap-1 text-xs">
              <div className="grid grid-cols-2 gap-1 num">
                <span className="text-ink-3">IRS limits</span><span>{status.asOf.irs}</span>
                <span className="text-ink-3">Tax tables</span><span>{status.asOf.tax}</span>
                <span className="text-ink-3">Wages (OEWS)</span><span>{status.asOf.wages}</span>
                <span className="text-ink-3">Loan rules</span><span>{status.asOf.loans}</span>
                <span className="text-ink-3">SSA</span><span>{status.asOf.ssa}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone={status.unverifiedCount > 0 ? 'warn' : 'ok'}>{status.unverifiedCount} unverified of {status.totalCount}</Chip>
                {status.staleCount > 0 && <Chip tone="danger">{status.staleCount} stale</Chip>}
              </div>
              <Link to="/data" className="mt-1">Data & sources</Link>
            </div>
          ) : <p className="text-sm text-ink-3">Status unavailable.</p>}
        </Panel>
        <Panel title="Assistant">
          <Stat label="Mode" value={me?.firm.assistantMode === 'claude' ? 'Claude' : 'Offline explainer'} sub={me?.firm.assistantMode === 'claude' ? 'API key configured' : 'No API key: rule-based explanations only'} />
          <Link to="/admin/settings" className="text-sm mt-3 inline-block">Settings</Link>
        </Panel>
      </div>
    </>
  );
}

export function HomePage() {
  const { me } = useSession();
  const role = me?.user.role ?? 'client';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <Page>
      <PageHeader title={`${greet}, ${me?.user.displayName.split(' ')[0] ?? ''}`} subtitle={role === 'client' ? 'Your plan at a glance.' : role === 'advisor' ? 'Your clients and what needs review.' : 'Firm overview.'} />
      {role === 'client' ? <ClientHome /> : role === 'advisor' ? <AdvisorHome /> : <AdminHome />}
    </Page>
  );
}
