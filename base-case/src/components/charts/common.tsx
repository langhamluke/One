import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Button, Table, cx, td, tdNum, th, thNum } from '@/components/ui';

export const PATH_COLORS = ['#14161A', '#7A3EF0', '#0F8B8D', '#C2410C'];
export const REC = '#7A3EF0';
export const INK4 = '#9A9FA6';
export const INK3 = '#6B7078';
export const LINE = '#DAD7CF';
export const ASSET_COLORS: Record<string, string> = {
  uslc: '#3B5B8C', ussmid: '#6C8CC1', intl: '#8FA8C8', em: '#B9C9DE', bonds: '#B08B5B', tips: '#D2B48C', cash: '#E6D7BE',
};

export function pathColor(index: number, active: boolean): string {
  return active ? REC : PATH_COLORS[index % PATH_COLORS.length];
}

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function useAnim(): boolean {
  const reduced = useReducedMotion();
  return !reduced;
}

export const tooltipStyle = {
  contentStyle: { background: '#FFFFFF', border: '1px solid #DAD7CF', borderRadius: 6, boxShadow: '0 8px 24px rgba(20,22,26,0.12)', fontSize: 12, padding: '6px 8px' },
  labelStyle: { color: '#6B7078', fontFamily: 'IBM Plex Mono', fontSize: 11 },
  itemStyle: { color: '#14161A', fontFamily: 'IBM Plex Mono', padding: 0 },
};

/** Chart container with a "Show table" toggle for a text alternative. */
export function ChartFrame({ title, description, children, columns, rows, className, caption }: {
  title?: ReactNode; description: string; children: ReactNode; columns: { key: string; label: string; numeric?: boolean }[]; rows: Record<string, ReactNode>[]; className?: string; caption?: string;
}) {
  const [table, setTable] = useState(false);
  return (
    <figure className={cx('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 mb-1">
        {title ? <figcaption className="text-xs font-medium text-ink-2">{title}</figcaption> : <span />}
        <Button size="sm" variant="ghost" aria-pressed={table} onClick={() => setTable((v) => !v)}>{table ? 'Show chart' : 'Show table'}</Button>
      </div>
      {table ? (
        <Table caption={caption ?? description} className="max-h-72 overflow-y-auto">
          <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? thNum : th}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className={c.numeric ? tdNum : td}>{r[c.key]}</td>)}</tr>)}</tbody>
        </Table>
      ) : (
        <div role="img" aria-label={description} className="min-w-0">{children}</div>
      )}
    </figure>
  );
}
