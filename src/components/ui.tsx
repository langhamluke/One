import { useEffect, useState, type ReactNode } from 'react';
import type { Insight } from '../lib/types';

export const money = (x: number, digits = 0) =>
  (x < 0 ? '-$' : '$') +
  Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const CHART_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

const ICON: Record<Insight['severity'], string> = { good: '✅', info: '💡', warn: '⚠️', alert: '🚨' };

export function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null;
  return (
    <div className="stack">
      {items.map((i) => (
        <div key={i.id} className={`insight ${i.severity}`}>
          <div className="dot" aria-hidden>{ICON[i.severity]}</div>
          <div>
            <h3>{i.title}</h3>
            <p className="small muted" style={{ marginTop: 2 }}>{i.detail}</p>
            {i.learn && <div className="learn">📚 <strong>Learn:</strong> {i.learn}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Circular 0–100 gauge. */
export function ScoreRing({ score, size = 132, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? 'var(--good)' : score >= 70 ? 'var(--c5)' : score >= 50 ? 'var(--warn)' : 'var(--alert)';
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} role="img" aria-label={`Score ${score} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={12} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: size / 4, fontWeight: 800, lineHeight: 1 }}>{score}</div>
          {label && <div className="tiny muted">{label}</div>}
        </div>
      </div>
    </div>
  );
}

/** Number input that lets the user clear the field while typing. */
export function NumberInput({
  value,
  onChange,
  money: isMoney,
  suffix,
  min = 0,
  step,
  ...rest
}: { value: number; onChange: (n: number) => void; money?: boolean; suffix?: string; min?: number; step?: number; 'aria-label'?: string; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);
  const input = (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      min={min}
      step={step ?? 'any'}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.max(min, n));
      }}
      onBlur={() => setText(String(value))}
    />
  );
  if (isMoney) return <div className="money">{input}</div>;
  if (suffix)
    return (
      <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
        {input}
        <span className="muted small">{suffix}</span>
      </div>
    );
  return input;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <div key={i.label} className="legend-row">
          <span className="swatch" style={{ background: i.color }} />
          <span style={{ flex: 1 }}>{i.label}</span>
          <strong className="num">{i.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="disclaimer">
      Sprout is an educational tool, not a financial advisor. Projections use simplified assumptions and are not guarantees.
      Nothing here is a recommendation to buy or sell any security. Talk with a parent, guardian, or qualified professional
      before making big money decisions.
    </p>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(m: string | null) => void>();
export function celebrate(message: string) {
  listeners.forEach((l) => l(message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => listeners.forEach((l) => l(null)), 2800);
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMsg);
    return () => void listeners.delete(setMsg);
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}
