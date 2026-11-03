import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, EmptyState, ErrorNote, Loading, PageHeader, Panel, Stat, Table, TextInput, td, tdNum, th, thNum } from '@/components/ui';
import { admin as adminApi, clients as clientsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useSession } from '@/state/session';
import { useComputed } from '@/state/derived';
import { fmtDate, fmtDateTime, fmtPct } from '@/lib/format';
import { statusTone } from '@/pages/Proposals';
import type { AuditEntry, ClientDetail, ClientListItem } from '@shared/api';
import { PlaybookList } from '@/components/PlaybookList';

export function ClientsPage() {
  const [list, setList] = useState<ClientListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  useEffect(() => {
    clientsApi.list().then(setList).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, []);
  const rows = list.filter((c) => !q || c.displayName.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page>
      <PageHeader title="Clients" subtitle={`${list.length} client${list.length === 1 ? '' : 's'}`} actions={<><label htmlFor="client-q" className="sr-only">Search clients</label><TextInput id="client-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="!w-56" /></>} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading ? <Loading /> : rows.length === 0 ? <EmptyState title="No clients" detail="Clients appear here once an administrator invites them and assigns them to you." /> : (
        <Panel>
          <Table caption="Clients">
            <thead><tr><th className={th}>Client</th><th className={th}>Status</th><th className={thNum}>Plan</th><th className={th}>Plan updated</th><th className={thNum}>Pending</th><th className={th}>Advisors</th><th className={th}>Last login</th><th className={th}></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={td}><Link to={`/clients/${c.id}`} className="font-medium">{c.displayName}</Link><div className="text-xxs text-ink-3">{c.email}</div></td>
                  <td className={td}><Chip tone={c.status === 'active' ? 'ok' : c.status === 'invited' ? 'warn' : 'neutral'}>{c.status}</Chip></td>
                  <td className={tdNum}>{c.planVersion ? `v${c.planVersion}` : '—'}</td>
                  <td className={td}>{fmtDate(c.planUpdatedAt)}</td>
                  <td className={tdNum}>{c.pendingProposals > 0 ? <Chip tone="warn">{c.pendingProposals}</Chip> : '0'}</td>
                  <td className={td}>{c.advisorNames.join(', ') || '—'}</td>
                  <td className={td}>{fmtDate(c.lastLoginAt)}</td>
                  <td className={td}><Link to={`/clients/${c.id}/plan/profile`}><Button size="sm">Open plan</Button></Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </Page>
  );
}

export function ClientDetailPage() {
  const { clientId = '' } = useParams();
  const { me } = useSession();
  const [d, setD] = useState<ClientDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    clientsApi.get(clientId).then(setD).catch((e) => setError(errorMessage(e)));
    if (me?.user.role === 'admin') adminApi.audit(100).then((r) => setAudit(r.entries.filter((a) => a.targetId === clientId || a.actorId === clientId).slice(0, 12))).catch(() => undefined);
  }, [clientId, me?.user.role]);
  const { derived } = useComputed(d?.plan?.state ?? null, 300);
  if (error) return <Page><ErrorNote>{error}</ErrorNote></Page>;
  if (!d) return <Page><Loading /></Page>;
  const pending = d.proposals.filter((p) => p.status === 'submitted');
  return (
    <Page>
      <PageHeader
        title={d.client.displayName}
        subtitle={<span>{d.client.email} · <Chip tone={d.client.status === 'active' ? 'ok' : 'warn'}>{d.client.status}</Chip> · last login {fmtDate(d.client.lastLoginAt)}</span>}
        actions={<Link to={`/clients/${clientId}/plan/profile`}><Button variant="primary">Open plan</Button></Link>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Plan status">
          {d.plan && d.plan.version > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Approved version" value={`v${d.plan.version}`} sub={`${fmtDate(d.plan.updatedAt)} · ${d.plan.updatedByName ?? ''}`} />
              {derived && <Stat label="P(success)" value={fmtPct(derived.headline.successProbability, 0)} />}
              {derived && <Stat label="Alerts" value={derived.alerts.length} />}
              {derived && <Stat label="Risk profile" value={derived.profile.risk} sub={derived.profile.provisional ? 'provisional' : derived.profile.horizon} />}
            </div>
          ) : <EmptyState title="No approved plan yet" detail="Open the plan to enter the intake and save the first version." />}
        </Panel>
        <Panel title="Proposals" subtitle={pending.length ? `${pending.length} pending` : undefined}>
          {d.proposals.length === 0 ? <p className="text-sm text-ink-3">None.</p> : (
            <ul className="divide-y divide-line-2">
              {d.proposals.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0"><Link to={`/proposals/${p.id}`} className="text-sm font-medium truncate block">{p.title}</Link><div className="text-xxs text-ink-3">{fmtDate(p.updatedAt)} · by {p.authorName}</div></div>
                  <Chip tone={statusTone(p.status)}>{p.status}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top actions">
          {derived ? <PlaybookList actions={derived.actions} limit={3} compact /> : <p className="text-sm text-ink-3">Engine not available.</p>}
        </Panel>
        <Panel title="Recent events" className="md:col-span-2 xl:col-span-3">
          {audit.length === 0 ? <p className="text-sm text-ink-3">{me?.user.role === 'admin' ? 'No recent events.' : 'Audit events are visible to administrators.'}</p> : (
            <Table caption="Recent audit events for this client">
              <thead><tr><th className={th}>When</th><th className={th}>Actor</th><th className={th}>Action</th><th className={th}>Target</th></tr></thead>
              <tbody>{audit.map((a) => <tr key={a.id}><td className={td}>{fmtDateTime(a.at)}</td><td className={td}>{a.actorName ?? '—'}</td><td className={td}><code className="num text-xs">{a.action}</code></td><td className={td}>{a.targetType ? `${a.targetType} ${a.targetId ?? ''}` : '—'}</td></tr>)}</tbody>
            </Table>
          )}
        </Panel>
      </div>
    </Page>
  );
}
