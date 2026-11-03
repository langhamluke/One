import { useEffect, useState } from 'react';
import { Page } from '@/components/shell/AppShell';
import { Chip, EmptyState, ErrorNote, PageHeader, Panel, Stat, Table, VerifyTag, cx, td, th } from '@/components/ui';
import { data as dataApi, plans as plansApi } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useComputed } from '@/state/derived';
import { useSession } from '@/state/session';
import { usePlanStore } from '@/state/plan';
import { MARKET_CONTEXT } from '@shared/data/cma';
import type { DataStatus, PlanRecord } from '@shared/api';
import { fmtPct } from '@/lib/format';
import { EngineUnavailable } from '@/components/EngineUnavailable';

export function DataPage() {
  const { me } = useSession();
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'data' | 'user' | 'assumption' | 'unverified'>('all');
  const working = usePlanStore((s) => (s.loaded ? s.state : null));
  useEffect(() => {
    dataApi.status().then(setStatus).catch((e) => setError(errorMessage(e)));
    if (me?.user.role === 'client') plansApi.me().then(setPlan).catch(() => null);
  }, [me?.user.role]);
  const { derived, error: engineError } = useComputed(working ?? plan?.state ?? null, 200);
  const items = derived?.dataQuality.items ?? [];
  const rows = items.filter((i) => filter === 'all' || (filter === 'unverified' ? !i.verified : i.origin === filter));
  return (
    <Page>
      <PageHeader title="Data & sources" subtitle="Every real-world figure in use, with its source and as-of date. No silent numbers." />
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Panel title="System data status">
          {status ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="IRS limits" value={status.asOf.irs} />
              <Stat label="Tax tables" value={status.asOf.tax} />
              <Stat label="Wages (OEWS)" value={status.asOf.wages} />
              <Stat label="Loan rules" value={status.asOf.loans} />
              <Stat label="Social Security" value={status.asOf.ssa} />
              <Stat label="Unverified" value={`${status.unverifiedCount} / ${status.totalCount}`} sub={status.staleCount ? `${status.staleCount} stale` : 'none stale'} />
            </div>
          ) : <p className="text-sm text-ink-3">Loading…</p>}
        </Panel>
        <Panel title="Market context" subtitle="not used in math">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Fed funds target" value={`${fmtPct(MARKET_CONTEXT.fedFundsTarget.lo, 2)}–${fmtPct(MARKET_CONTEXT.fedFundsTarget.hi, 2)}`} sub={`${MARKET_CONTEXT.fedFundsTarget.source} · ${MARKET_CONTEXT.fedFundsTarget.asOf}`} />
            <Stat label="10-year Treasury" value={<span className="inline-flex items-center gap-1">{fmtPct(MARKET_CONTEXT.tenYearTreasury.value, 2)}{!MARKET_CONTEXT.tenYearTreasury.verified && <VerifyTag source={MARKET_CONTEXT.tenYearTreasury.source} asOf={MARKET_CONTEXT.tenYearTreasury.asOf} />}</span>} sub={`${MARKET_CONTEXT.tenYearTreasury.source} · ${MARKET_CONTEXT.tenYearTreasury.asOf}`} />
          </div>
        </Panel>
      </div>
      <Panel title="Ledger" subtitle={derived ? `${derived.dataQuality.items.length} items · ${derived.dataQuality.unverifiedCount} unverified · ${derived.dataQuality.userProvidedCount} self-reported` : undefined} actions={
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter ledger">
          {(['all', 'data', 'user', 'assumption', 'unverified'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx('rounded-pill border px-2 py-px text-xxs capitalize focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', filter === f ? 'bg-ink text-paper border-ink' : 'bg-paper-2 border-line text-ink-2')}>{f}</button>
          ))}
        </div>
      }>
        {engineError ? <EngineUnavailable compact /> : !derived ? <EmptyState title="No plan loaded" detail="Open a plan to list the data it uses." /> : rows.length === 0 ? <EmptyState title="No items" /> : (
          <Table caption="Data quality ledger">
            <thead><tr><th className={th}>Item</th><th className={th}>Value</th><th className={th}>Origin</th><th className={th}>Verified</th><th className={th}>As of</th><th className={th}>Source</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.key}>
                  <td className={td}><div>{i.label}</div><div className="num text-xxs text-ink-4">{i.key}</div></td>
                  <td className={cx(td, 'num whitespace-nowrap')}>{typeof i.value === 'number' ? i.value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : i.value}</td>
                  <td className={td}><Chip tone={i.origin === 'user' ? 'edit' : i.origin === 'assumption' ? 'neutral' : 'ok'}>{i.origin === 'user' ? 'self-reported' : i.origin}</Chip></td>
                  <td className={td}>{i.verified ? <Chip tone="ok">yes</Chip> : <VerifyTag source={i.source} asOf={i.asOf} note={i.note} url={i.url} />}</td>
                  <td className={cx(td, 'num whitespace-nowrap')}>{i.asOf}</td>
                  <td className={td}><div className="max-w-xs">{i.url ? <a href={i.url} target="_blank" rel="noreferrer noopener">{i.source}</a> : i.source}{i.note && <div className="text-xxs text-ink-3">{i.note}</div>}</div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Page>
  );
}
