import type { ActionItem } from '@shared/lib/types';
import { Chip, cx } from '@/components/ui';
import { fmtMoney } from '@/lib/format';

export type ActionStatus = 'Done' | 'Next' | 'Later';

export function actionStatus(a: ActionItem, idx: number): ActionStatus {
  const t = `${a.title} ${a.detail}`.toLowerCase();
  if (/\b(done|complete|funded|on track|already)\b/.test(t)) return 'Done';
  return idx === 0 ? 'Next' : 'Later';
}

export function PlaybookList({ actions, limit, compact }: { actions: ActionItem[]; limit?: number; compact?: boolean }) {
  const sorted = [...actions].sort((a, b) => a.rank - b.rank);
  let nextAssigned = false;
  const rows = (limit ? sorted.slice(0, limit) : sorted).map((a, i) => {
    let s = actionStatus(a, i);
    if (s !== 'Done') {
      s = nextAssigned ? 'Later' : 'Next';
      nextAssigned = true;
    }
    return { a, s };
  });
  if (rows.length === 0) return <p className="text-sm text-ink-3">No actions yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line-2">
      {rows.map(({ a, s }, i) => (
        <li key={a.id} className={cx('flex gap-3 py-2', compact && 'py-1.5')}>
          <span className="num text-sm text-ink-4 w-5 shrink-0 text-right">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('font-medium', compact ? 'text-xs' : 'text-sm')}>{a.title}</span>
              <Chip tone={s === 'Done' ? 'ok' : s === 'Next' ? 'rec' : 'neutral'}>{s}</Chip>
            </div>
            {!compact && <div className="text-xs text-ink-3">{a.detail}</div>}
          </div>
          {a.amount != null && <span className="num text-sm text-ink-2 shrink-0">{fmtMoney(a.amount)}/yr</span>}
        </li>
      ))}
    </ol>
  );
}
