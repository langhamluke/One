import type { Alert, Severity } from '@shared/lib/types';
import { Chip, cx } from '@/components/ui';
import { fmtMoney } from '@/lib/format';

const SECTIONS: { sev: Severity; label: string; bar: string }[] = [
  { sev: 'warning', label: 'Warning', bar: 'bg-danger' },
  { sev: 'caution', label: 'Caution', bar: 'bg-warn' },
  { sev: 'advisory', label: 'Advisory', bar: 'bg-ink-4' },
];

export function AlertLedger({ alerts, advisor, compact, limit, variant }: { alerts: Alert[]; advisor: boolean; compact?: boolean; limit?: number; variant?: 'ledger' | 'eicas' }) {
  const visible = alerts.filter((a) => advisor || !a.advisorOnly);
  if (visible.length === 0) return <p className="text-sm text-ink-3">{variant === 'eicas' ? 'No messages. Every parameter is inside its limits.' : 'No alerts. The plan is within every threshold we check.'}</p>;
  if (variant === 'eicas') return <Eicas alerts={visible} compact={compact} limit={limit} />;
  let budget = limit ?? Infinity;
  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map((s) => {
        const rows = visible.filter((a) => a.severity === s.sev).slice(0, Math.max(0, budget));
        budget -= rows.length;
        if (rows.length === 0) return null;
        return (
          <div key={s.sev}>
            <div className="label-caps mb-1">{s.label} · {visible.filter((a) => a.severity === s.sev).length}</div>
            <ul className="flex flex-col gap-1.5">
              {rows.map((a) => (
                <li key={a.id} className="flex gap-2 rounded-md border border-line-2 bg-paper-2 overflow-hidden">
                  <span className={cx('w-1.5 shrink-0', s.bar)} aria-hidden />
                  <div className={cx('min-w-0 py-1.5 pr-2', compact ? 'text-xs' : 'text-sm')}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{a.title}</span>
                      {a.advisorOnly && <Chip tone="neutral">Advisor</Chip>}
                      {a.value != null && <span className="num text-xs text-ink-3">{fmtMoney(a.value)}</span>}
                    </div>
                    <div className="text-ink-3 text-xs">{a.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Counts of warnings and cautions, styled as the original's EICAS header chips. Use next to the panel title. */
export function EicasCounts({ alerts, advisor }: { alerts: Alert[]; advisor: boolean }) {
  const visible = alerts.filter((a) => advisor || !a.advisorOnly);
  const w = visible.filter((a) => a.severity === 'warning').length;
  const c = visible.filter((a) => a.severity === 'caution').length;
  return (
    <span className="inline-flex items-center gap-1.5">
      {w > 0 && <span className="rounded-sm border border-danger bg-danger/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.12em] text-danger">Warning {w}</span>}
      {c > 0 && <span className="rounded-sm border border-warn bg-warn/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.12em] text-warn">Caution {c}</span>}
    </span>
  );
}

/** The original Flight Plan alert stack: warnings red, cautions amber, advisories white, uppercase mono, one line each. */
function Eicas({ alerts, compact, limit }: { alerts: Alert[]; compact?: boolean; limit?: number }) {
  const order: Severity[] = ['warning', 'caution', 'advisory'];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const rows = limit ? sorted.slice(0, limit) : sorted;
  return (
    <ul className={cx('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
      {rows.map((a) => (
        <li key={a.id} className="min-w-0">
          <div className={cx('num uppercase tracking-[0.04em] leading-5', compact ? 'text-[11px]' : 'text-[12px]', a.severity === 'warning' ? 'text-danger' : a.severity === 'caution' ? 'text-warn' : 'text-ink')} title={a.detail}>
            {a.title}
            {a.advisorOnly && <span className="ml-2 rounded-sm border border-line px-1 text-[9px] text-ink-3 align-middle">Advisor</span>}
          </div>
          {!compact && <div className="text-[11px] text-ink-3 leading-4">{a.detail}</div>}
        </li>
      ))}
      {limit && sorted.length > limit && <li className="text-[11px] text-ink-3">+{sorted.length - limit} more on the Cruise screen.</li>}
    </ul>
  );
}
