import { useEffect, useId, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import type { Sourced } from '../lib/types';

export function Panel({ title, right, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5">
          <h2 className="panel-title">{title}</h2>
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function HelpTip({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-describedby={id} className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge text-[10px] text-dim hover:border-sel hover:text-sel focus-visible:border-sel" aria-label="Help">
        ?
      </button>
      <span id={id} role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-64 max-w-[70vw] -translate-x-1/2 rounded border border-edge bg-[#0E141C] p-2.5 text-[12px] font-normal normal-case leading-snug tracking-normal text-white shadow-xl group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function Field({ label, help, children, className = '', advisor = false }: { label: string; help?: string; children: ReactNode; className?: string; advisor?: boolean }) {
  const mode = useStore((s) => s.ui.mode);
  if (advisor && mode !== 'advisor') return null;
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center text-[11px] uppercase tracking-[0.1em] text-dim">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      {children}
    </label>
  );
}

type NumKind = 'usd' | 'pct' | 'int' | 'dec';

function fmtInput(v: number, kind: NumKind) {
  if (!Number.isFinite(v)) return '';
  if (kind === 'usd') return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (kind === 'dec' || kind === 'pct') return String(Math.round(v * 100) / 100);
  return String(Math.round(v));
}

export function NumberInput({ value, onChange, kind = 'int', min, max, step, ariaLabel, suffix, className = '' }: {
  value: number; onChange: (v: number) => void; kind?: NumKind; min?: number; max?: number; step?: number; ariaLabel?: string; suffix?: string; className?: string;
}) {
  const [text, setText] = useState(fmtInput(value, kind));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(fmtInput(value, kind)); }, [value, kind, focus]);
  const commit = () => {
    const n = Number(text.replace(/[^0-9.\-]/g, ''));
    if (text.trim() === '' || !Number.isFinite(n)) { setText(fmtInput(value, kind)); return; }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
    setText(fmtInput(v, kind));
  };
  return (
    <div className={`relative ${className}`}>
      {kind === 'usd' && <span className="num pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sel/70">$</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        className={`inp ${kind === 'usd' ? 'pl-5' : ''} ${suffix ? 'pr-9' : ''} text-right`}
        value={text}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); commit(); }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && step) {
            e.preventDefault();
            let v = value + (e.key === 'ArrowUp' ? step : -step);
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(v);
          }
        }}
      />
      {suffix && <span className="num pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-dim">{suffix}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  return <input type="text" aria-label={ariaLabel} className="inp font-sans" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string }) {
  return (
    <select className="inp" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; ariaLabel?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 text-[12px]"
    >
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${checked ? 'border-sel bg-sel/20' : 'border-edge bg-[#0B1118]'}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${checked ? 'left-[18px] bg-sel' : 'left-0.5 bg-dim'}`} />
      </span>
      {label && <span className={checked ? 'text-sel' : 'text-dim'}>{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded border border-edge bg-[#0B1118] p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-[12px]'} rounded-sm uppercase tracking-wider transition-colors ${on ? 'bg-sel/15 text-sel' : 'text-dim hover:text-white'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, ariaLabel, plan = false, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; ariaLabel: string; plan?: boolean; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" aria-label={ariaLabel} className={`w-full ${plan ? 'plan-range' : ''}`} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className={`num w-16 shrink-0 text-right ${plan ? 'text-plan' : 'text-sel'}`}>{format ? format(value) : value}</span>
    </div>
  );
}

/** Amber VERIFY tag (Advisor Mode only) for unverified data. */
export function VerifyTag({ s, force = false }: { s?: Sourced<unknown> | null; force?: boolean }) {
  const mode = useStore((st) => st.ui.mode);
  if (!s || s.verified || (mode !== 'advisor' && !force)) return null;
  const tip = `${s.source}${s.note ? ` — ${s.note}` : ''} (as of ${s.asOf})`;
  return (
    <span title={tip} className="ml-1.5 inline-flex items-center rounded-sm border border-caution/60 px-1 py-px text-[9px] font-bold tracking-widest text-caution">
      VERIFY
    </span>
  );
}

/** A sourced value: white if verified; amber with VERIFY in Advisor Mode if not. */
export function SourcedValue({ s, children }: { s: Sourced<unknown>; children: ReactNode }) {
  const mode = useStore((st) => st.ui.mode);
  const amber = !s.verified && mode === 'advisor';
  return (
    <span className={`num ${amber ? 'text-caution' : ''}`} title={`${s.source} (as of ${s.asOf})${s.note ? ` — ${s.note}` : ''}`}>
      {children}
      <VerifyTag s={s} />
    </span>
  );
}

export function AdvisorOnly({ children }: { children: ReactNode }) {
  const mode = useStore((s) => s.ui.mode);
  return mode === 'advisor' ? <>{children}</> : null;
}

export function Stat({ label, value, sub, tone = 'white' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'white' | 'ok' | 'plan' | 'caution' | 'warn' | 'sel' }) {
  const color = { white: 'text-white', ok: 'text-ok', plan: 'text-plan', caution: 'text-caution', warn: 'text-warn', sel: 'text-sel' }[tone];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</div>
      <div className={`num mt-0.5 text-xl ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-dim">{sub}</div>}
    </div>
  );
}
