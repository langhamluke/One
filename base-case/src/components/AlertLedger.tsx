import type { Alert, Severity } from '@shared/lib/types';
import { Chip, cx } from '@/components/ui';
import { fmtMoney } from '@/lib/format';

const SECTIONS: { sev: Severity; label: string; bar: string }[] = [
  { sev: 'warning', label: 'Warning', bar: 'bg-danger' },
  { sev: 'caution', label: 'Caution', bar: 'bg-warn' },
  { sev: 'advisory', label: 'Advisory', bar: 'bg-ink-4' },
];

export function AlertLedger({ alerts, advisor, compact, limit }: { alerts: Alert[]; advisor: boolean; compact?: boolean; limit?: number }) {
  const visible = alerts.filter((a) => advisor || !a.advisorOnly);
  if (visible.length === 0) return <p className="text-sm text-ink-3">No alerts. The plan is within every threshold we check.</p>;
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
