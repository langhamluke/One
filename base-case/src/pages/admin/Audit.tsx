import { useCallback, useEffect, useState } from 'react';
import { Page } from '@/components/shell/AppShell';
import { Button, EmptyState, ErrorNote, Loading, PageHeader, Panel, Table, TextInput, td, th } from '@/components/ui';
import { admin as adminApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { fmtDateTime } from '@/lib/format';
import type { AuditEntry } from '@shared/api';

const PAGE = 50;

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const r = await adminApi.audit(PAGE, before);
      setEntries((xs) => (before ? [...xs, ...r.entries] : r.entries));
      setNext(r.nextBefore);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = entries.filter((e) => !q || `${e.action} ${e.actorName ?? ''} ${e.targetType ?? ''} ${e.targetId ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page>
      <PageHeader title="Audit log" subtitle="Every login, change and review." actions={<><label htmlFor="audit-q" className="sr-only">Filter</label><TextInput id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter loaded rows" className="!w-56" /></>} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {entries.length === 0 && !loading ? <EmptyState title="No events" /> : (
        <Panel>
          <Table caption="Audit log">
            <thead><tr><th className={th}>When</th><th className={th}>Actor</th><th className={th}>Action</th><th className={th}>Target</th><th className={th}>IP</th><th className={th}>Details</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap`}>{fmtDateTime(e.at)}</td>
                  <td className={td}>{e.actorName ?? <span className="text-ink-3">system</span>}</td>
                  <td className={td}><code className="num text-xs">{e.action}</code></td>
                  <td className={td}>{e.targetType ? <span className="text-xs">{e.targetType} <span className="num text-ink-3">{e.targetId}</span></span> : '—'}</td>
                  <td className={`${td} num text-xs`}>{e.ip ?? '—'}</td>
                  <td className={td}><code className="num text-xxs text-ink-3 break-all">{Object.keys(e.metadata ?? {}).length ? JSON.stringify(e.metadata) : ''}</code></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-ink-3 num">{rows.length} of {entries.length} loaded</span>
            {loading ? <Loading /> : next ? <Button onClick={() => load(next)}>Load older</Button> : <span className="text-xs text-ink-3">End of log</span>}
          </div>
        </Panel>
      )}
    </Page>
  );
}
