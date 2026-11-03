import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Page } from '@/components/shell/AppShell';
import { Button, Chip, Dialog, EmptyState, ErrorNote, Field, Loading, PageHeader, Panel, Table, TextArea, cx, td, tdNum, th, thNum, useToast, type Tone } from '@/components/ui';
import { plans as plansApi, proposals as proposalsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useSession, isStaff } from '@/state/session';
import { useComputed } from '@/state/derived';
import { diffStates, fmtDiffValue } from '@/lib/diff';
import { fmtAge, fmtCompact, fmtDate, fmtDateTime, fmtPct } from '@/lib/format';
import type { PlanRecord, Proposal, ProposalStatus, ProposalSummary } from '@shared/api';
import type { Headline } from '@shared/lib/derived';
import { EngineUnavailable } from '@/components/EngineUnavailable';

export function statusTone(s: ProposalStatus): Tone {
  return s === 'approved' ? 'ok' : s === 'submitted' ? 'warn' : s === 'rejected' ? 'danger' : s === 'draft' ? 'rec' : 'neutral';
}

export function ProposalsPage() {
  const { me } = useSession();
  const staff = isStaff(me?.user.role);
  const [list, setList] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ProposalStatus>(staff ? 'submitted' : 'all');
  useEffect(() => {
    proposalsApi.list().then(setList).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, []);
  const rows = list.filter((p) => filter === 'all' || p.status === filter);
  return (
    <Page>
      <PageHeader title={staff ? 'Review queue' : 'My proposals'} subtitle={staff ? 'Client drafts submitted for approval.' : 'Drafts and their review status.'} />
      <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filter by status">
        {(['all', 'submitted', 'draft', 'approved', 'rejected', 'withdrawn'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx('rounded-pill border px-2.5 py-0.5 text-xs capitalize focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', filter === f ? 'bg-ink text-paper border-ink' : 'bg-paper-2 border-line text-ink-2')}>{f}</button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading ? <Loading /> : rows.length === 0 ? <EmptyState title="No proposals" detail={staff ? 'Nothing is waiting for review.' : 'Edit any plan screen to start a draft.'} /> : (
        <Panel>
          <Table caption="Proposals">
            <thead><tr><th className={th}>Title</th>{staff && <th className={th}>Client</th>}<th className={th}>Status</th><th className={th}>Updated</th><th className={thNum}>Base</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={td}><Link to={`/proposals/${p.id}`} className="font-medium">{p.title}</Link>{p.note && <div className="text-xxs text-ink-3 truncate max-w-xs">{p.note}</div>}</td>
                  {staff && <td className={td}>{p.clientName}</td>}
                  <td className={td}><Chip tone={statusTone(p.status)}>{p.status}</Chip></td>
                  <td className={td}>{fmtDate(p.updatedAt)}</td>
                  <td className={tdNum}>v{p.baseVersion}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </Page>
  );
}

function HeadlineCol({ h, label, base }: { h: Headline | null; label: string; base?: Headline | null }) {
  const rows: { k: string; v: string; good: boolean | null }[] = h
    ? [
        { k: 'Net worth', v: fmtCompact(h.netWorth), good: base ? h.netWorth > base.netWorth ? true : h.netWorth < base.netWorth ? false : null : null },
        { k: 'Savings rate', v: fmtPct(h.savingsRate, 1), good: base ? h.savingsRate > base.savingsRate ? true : h.savingsRate < base.savingsRate ? false : null : null },
        { k: 'P(success)', v: fmtPct(h.successProbability, 0), good: base ? h.successProbability > base.successProbability ? true : h.successProbability < base.successProbability ? false : null : null },
        { k: "Retirement P50 (today's $)", v: fmtCompact(h.medianAtRetirementReal), good: base ? h.medianAtRetirementReal > base.medianAtRetirementReal ? true : h.medianAtRetirementReal < base.medianAtRetirementReal ? false : null : null },
        { k: 'Emergency fund', v: `${h.emergencyMonthsCovered.toFixed(1)} mo`, good: base ? h.emergencyMonthsCovered > base.emergencyMonthsCovered ? true : h.emergencyMonthsCovered < base.emergencyMonthsCovered ? false : null : null },
        { k: 'Debt-free age', v: fmtAge(h.debtFreeAge), good: base && h.debtFreeAge != null && base.debtFreeAge != null ? h.debtFreeAge < base.debtFreeAge ? true : h.debtFreeAge > base.debtFreeAge ? false : null : null },
      ]
    : [];
  return (
    <div>
      <div className="label-caps mb-2">{label}</div>
      {!h ? <p className="text-xs text-ink-3">Not available</p> : (
        <dl className="flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.k} className="flex justify-between gap-2 text-sm"><dt className="text-ink-3">{r.k}</dt><dd className={cx('num font-medium', r.good === true && 'text-ok', r.good === false && 'text-danger')}>{r.v}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function ProposalReviewPage() {
  const { id = '' } = useParams();
  const { me } = useSession();
  const staff = isStaff(me?.user.role);
  const navigate = useNavigate();
  const toast = useToast();
  const [p, setP] = useState<Proposal | null>(null);
  const [approved, setApproved] = useState<PlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const pr = await proposalsApi.get(id);
      setP(pr);
      const plan = staff ? await plansApi.get(pr.clientId).catch(() => null) : await plansApi.me().catch(() => null);
      setApproved(plan);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, staff]);
  useEffect(() => { void load(); }, [load]);

  const draftD = useComputed(p?.state);
  const approvedD = useComputed(approved?.state);
  if (error) return <Page><ErrorNote>{error}</ErrorNote></Page>;
  if (!p) return <Page><Loading /></Page>;
  const diff = approved ? diffStates(approved.state, p.state) : [];

  const act = async (fn: () => Promise<Proposal>, msg: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setP(r);
      setDialog(null);
      toast(msg, 'ok');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title={p.title}
        subtitle={<span>{p.clientName} · by {p.authorName} · <Chip tone={statusTone(p.status)}>{p.status}</Chip> · base v{p.baseVersion}{p.submittedAt ? ` · submitted ${fmtDateTime(p.submittedAt)}` : ''}</span>}
        actions={
          <>
            {staff && p.status === 'submitted' && <><Button variant="danger" onClick={() => { setNote(''); setDialog('reject'); }}>Reject</Button><Button variant="primary" onClick={() => { setNote(''); setDialog('approve'); }}>Approve</Button></>}
            {p.status === 'submitted' && (p.authorId === me?.user.id || !staff) && <Button onClick={() => act(() => proposalsApi.withdraw(p.id), 'Proposal withdrawn')}>Withdraw</Button>}
            {p.status === 'draft' && !staff && <Button variant="rec" onClick={() => navigate('/plan/profile')}>Continue editing</Button>}
            {p.status === 'draft' && staff && <Button variant="rec" onClick={() => navigate(`/clients/${p.clientId}/plan/profile?proposal=${p.id}`)}>Open draft</Button>}
            {staff && <Link to={`/clients/${p.clientId}`} className="text-sm">Client overview</Link>}
          </>
        }
      />
      {p.note && <Panel className="mb-4" title="Note"><p className="text-sm text-ink-2 whitespace-pre-wrap">{p.note}</p></Panel>}
      {p.reviewNote && <Panel className="mb-4" title={`Review note · ${p.reviewerName ?? ''}`}><p className="text-sm text-ink-2 whitespace-pre-wrap">{p.reviewNote}</p></Panel>}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Headline" subtitle="approved vs draft" className="lg:col-span-5">
          {draftD.error && !draftD.derived ? <EngineUnavailable compact /> : (
            <div className="grid grid-cols-2 gap-4">
              <HeadlineCol h={approvedD.derived?.headline ?? null} label={`Approved v${approved?.version ?? '—'}`} />
              <HeadlineCol h={draftD.derived?.headline ?? null} label="Draft" base={approvedD.derived?.headline ?? null} />
            </div>
          )}
        </Panel>
        <Panel title="Changed fields" subtitle={`${diff.length}`} className="lg:col-span-7">
          {diff.length === 0 ? <p className="text-sm text-ink-3">{approved ? 'No differences from the approved plan.' : 'No approved plan to compare against.'}</p> : (
            <Table caption="Field-level differences between the approved plan and the draft" className="max-h-[520px] overflow-y-auto">
              <thead className="sticky top-0 bg-paper-2"><tr><th className={th}>Field</th><th className={thNum}>Approved</th><th className={thNum}>Draft</th></tr></thead>
              <tbody>
                {diff.map((r) => (
                  <tr key={r.path}>
                    <td className={td}><div>{r.label}</div><div className="num text-xxs text-ink-4">{r.path}</div></td>
                    <td className={cx(tdNum, 'text-ink-3')}>{fmtDiffValue(r.before)}</td>
                    <td className={cx(tdNum, 'font-medium')}>{fmtDiffValue(r.after)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
      <Dialog open={dialog != null} onClose={() => setDialog(null)} title={dialog === 'approve' ? 'Approve proposal' : 'Reject proposal'} footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant={dialog === 'approve' ? 'primary' : 'danger'} loading={busy} onClick={() => act(() => (dialog === 'approve' ? proposalsApi.approve(p.id, note) : proposalsApi.reject(p.id, note)), dialog === 'approve' ? 'Approved: the plan is now the new version' : 'Rejected')}>{dialog === 'approve' ? 'Approve' : 'Reject'}</Button></>}>
        <Field label="Note to the client" htmlFor="review-note"><TextArea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={dialog === 'approve' ? 'What you checked and anything to watch' : 'What to change before resubmitting'} /></Field>
        {dialog === 'approve' && <p className="text-xxs text-ink-3 mt-2">Approving replaces the approved plan with this draft as version {(approved?.version ?? 0) + 1}.</p>}
      </Dialog>
    </Page>
  );
}
