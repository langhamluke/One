import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Button, Table, cx, td, tdNum, th, thNum } from '@/components/ui';

/** Read a theme token off <html> at call time, so charts follow the product theme (paper vs cockpit). */
function cssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function rgbVar(name: string, fallback: string): string {
  const v = cssVar(name);
  return v ? `rgb(${v})` : fallback;
}

export const theme = {
  get rec() { return rgbVar('--c-rec', '#174D38'); },
  get edit() { return rgbVar('--c-edit', '#2E5E86'); },
  get ok() { return rgbVar('--c-ok', '#2B7A4B'); },
  get warn() { return rgbVar('--c-warn', '#B5740A'); },
  get danger() { return rgbVar('--c-danger', '#4D1717'); },
  get ink() { return rgbVar('--c-ink', '#1A1A1A'); },
  get ink2() { return rgbVar('--c-ink-2', '#3D3D3D'); },
  get ink3() { return rgbVar('--c-ink-3', '#6B6B6B'); },
  get ink4() { return rgbVar('--c-ink-4', '#9C9C9C'); },
  get line() { return rgbVar('--c-line', '#B4B7BB'); },
  get paper2() { return rgbVar('--c-paper-2', '#FFFFFF'); },
  get recSoft() { return rgbVar('--c-rec-soft', '#E3EDE7'); },
  get grid() { return cssVar('--chart-grid') || '#C8CBCF'; },
  get axis() { return cssVar('--chart-axis') || '#B4B7BB'; },
  get text() { return cssVar('--chart-text') || '#6B6B6B'; },
  get mono() { return cssVar('--font-mono') || 'IBM Plex Mono'; },
  get paths(): string[] {
    return [1, 2, 3, 4].map((i) => cssVar(`--c-path-${i}`) || ['#1A1A1A', '#174D38', '#0F6E6E', '#8A5A2B'][i - 1]);
  },
  asset(key: string): string {
    const fallback: Record<string, string> = { uslc: '#2F5F4A', ussmid: '#4F8068', intl: '#7FA592', em: '#AFC8BA', bonds: '#8B6F47', tips: '#B59B73', cash: '#D9C9AD' };
    return rgbVar(`--c-a-${key}`, fallback[key] ?? '#999999');
  },
};

export function pathColor(index: number, active: boolean): string {
  const p = theme.paths;
  return active ? theme.rec : p[index % p.length];
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

export function tooltipStyle() {
  return {
    contentStyle: { background: cssVar('--tooltip-bg') || '#FFFFFF', border: `1px solid ${theme.line}`, borderRadius: 6, boxShadow: cssVar('--shadow-pop') || '0 8px 24px rgba(20,22,26,0.12)', fontSize: 12, padding: '6px 8px', color: theme.ink },
    labelStyle: { color: theme.ink3, fontFamily: theme.mono, fontSize: 11 },
    itemStyle: { color: theme.ink, fontFamily: theme.mono, padding: 0 },
  };
}

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
