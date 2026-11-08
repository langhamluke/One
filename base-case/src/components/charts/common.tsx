import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Button, Table, cx, td, tdNum, th, thNum } from '@/components/ui';

export const PATH_COLORS = ['#1A1A1A', '#174D38', '#0F6E6E', '#8A5A2B'];
export const REC = '#174D38';
export const INK4 = '#9C9C9C';
export const INK3 = '#6B6B6B';
export const LINE = '#B4B7BB';
export const ASSET_COLORS: Record<string, string> = {
  uslc: '#2F5F4A', ussmid: '#4F8068', intl: '#7FA592', em: '#AFC8BA', bonds: '#8B6F47', tips: '#B59B73', cash: '#D9C9AD',
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
  contentStyle: { background: '#FFFFFF', border: '1px solid #B4B7BB', borderRadius: 6, boxShadow: '0 8px 24px rgba(20,22,26,0.12)', fontSize: 12, padding: '6px 8px' },
  labelStyle: { color: '#6B6B6B', fontFamily: 'IBM Plex Mono', fontSize: 11 },
  itemStyle: { color: '#1A1A1A', fontFamily: 'IBM Plex Mono', padding: 0 },
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
