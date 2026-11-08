/* Small, consistent UI kit. No third-party UI library. */
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, HelpCircle, Loader2, X } from 'lucide-react';
import { usePrefs } from '@/state/prefs';
import { usePlanStore } from '@/state/plan';

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'rec';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper border-ink hover:bg-ink-2',
  secondary: 'bg-paper-2 text-ink border-line hover:bg-paper-3',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-paper-3',
  danger: 'bg-paper-2 text-danger border-danger/40 hover:bg-danger-soft',
  rec: 'bg-rec text-white border-rec hover:opacity-90',
};
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        'focus-visible:ring-2 focus-visible:ring-edit focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-[34px] px-3 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel (card with optional collapse)
// ---------------------------------------------------------------------------------------------
export function Panel({
  title, subtitle, children, actions, collapseKey, defaultCollapsed = false, className, id, dense,
}: {
  title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; collapseKey?: string;
  defaultCollapsed?: boolean; className?: string; id?: string; dense?: boolean;
}) {
  const collapsed = usePrefs((s) => (collapseKey ? s.collapsed[collapseKey] ?? defaultCollapsed : false));
  const toggle = usePrefs((s) => s.toggleCollapsed);
  const bodyId = useId();
  return (
    <section id={id} className={cx('card', className)} aria-labelledby={title ? `${bodyId}-t` : undefined}>
      {title && (
        <header className={cx('flex items-center gap-2 px-4', dense ? 'py-2' : 'py-3', !collapsed && 'border-b border-line-2')}>
          {collapseKey ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-left -ml-1 pl-1 pr-1 rounded focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              onClick={() => toggle(collapseKey, defaultCollapsed)}
            >
              {collapsed ? <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden /> : <ChevronDown className="h-4 w-4 text-ink-3" aria-hidden />}
              <h2 id={`${bodyId}-t`}>{title}</h2>
            </button>
          ) : (
            <h2 id={`${bodyId}-t`}>{title}</h2>
          )}
          {subtitle && <span className="text-xs text-ink-3 truncate">{subtitle}</span>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
      )}
      {!collapsed && <div id={bodyId} className={cx(dense ? 'p-3' : 'p-4')}>{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Field + inputs
// ---------------------------------------------------------------------------------------------
export function Field({ label, htmlFor, hint, help, tag, children, className, inline }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; help?: string; tag?: ReactNode; children: ReactNode; className?: string; inline?: boolean;
}) {
  return (
    <div className={cx(inline ? 'flex items-center justify-between gap-3' : 'flex flex-col gap-1', 'min-w-0', className)}>
      <div className="flex items-center gap-1.5 min-w-0">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2 truncate">{label}</label>
        {help && <HelpTip text={help} />}
        {tag}
      </div>
      <div className={cx(inline && 'w-40 shrink-0')}>{children}</div>
      {hint && <p className="text-xxs text-ink-3">{hint}</p>}
    </div>
  );
}

export interface NumberInputProps {
  id: string;
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Displayed value = value * scale (e.g. 100 for fractions shown as %) */
  scale?: number;
  digits?: number;
  disabled?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  'aria-label'?: string;
  className?: string;
  compact?: boolean;
}

/** Number input whose prefix/suffix never overlap the number (flex siblings, not absolute overlays). */
export function NumberInput({ id, value, onChange, prefix, suffix, min, max, step, scale = 1, digits, disabled, placeholder, allowEmpty, className, compact, ...rest }: NumberInputProps) {
  const toDisplay = useCallback(
    (v: number | null | undefined) => {
      if (v == null || !Number.isFinite(v)) return '';
      const d = v * scale;
      const dg = digits ?? (Number.isInteger(d) ? 0 : 2);
      return dg === 0 ? Math.round(d).toLocaleString('en-US') : Number(d.toFixed(dg)).toLocaleString('en-US', { maximumFractionDigits: dg });
    },
    [scale, digits],
  );
  const [text, setText] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toDisplay(value));
  }, [value, focused, toDisplay]);

  const clampVal = (n: number) => {
    let v = n / scale;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };
  const parse = (s: string): number | null => {
    const cleaned = s.replace(/[,$%\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const commit = (s: string) => {
    const n = parse(s);
    if (n == null) {
      if (allowEmpty) onChange(undefined);
      else setText(toDisplay(value));
      return;
    }
    const v = clampVal(n);
    onChange(v);
    setText(toDisplay(v));
  };
  return (
    <div className={cx('input-base flex items-center gap-1 px-2', compact && 'min-h-[30px] py-1', disabled && 'bg-paper-3 text-ink-4', className)}>
      {prefix && <span className="num text-ink-3 text-xs select-none shrink-0" aria-hidden>{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="num flex-1 min-w-0 bg-transparent outline-none text-right text-sm"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          if (n != null) {
            const v = n / scale;
            if ((min == null || v >= min) && (max == null || v <= max)) onChange(v);
          }
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            const cur = value ?? min ?? 0;
            const v = clampVal((cur + (e.key === 'ArrowUp' ? step : -step)) * scale);
            onChange(v);
            setText(toDisplay(v));
          }
        }}
        aria-label={rest['aria-label']}
      />
      {suffix && <span className="num text-ink-3 text-xs select-none shrink-0" aria-hidden>{suffix}</span>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('input-base text-sm outline-none focus:border-edit', className)} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('input-base text-sm outline-none focus:border-edit min-h-[80px]', className)} />;
}

export interface SelectOption { value: string; label: string; group?: string; disabled?: boolean }
export function Select({ options, className, value, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, SelectOption[]>();
    for (const o of options) {
      const g = o.group ?? '';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    }
    return Array.from(m.entries());
  }, [options]);
  return (
    <div className="relative">
      <select {...rest} value={value} className={cx('input-base text-sm appearance-none pr-7 outline-none focus:border-edit cursor-pointer', className)}>
        {groups.map(([g, opts]) =>
          g ? (
            <optgroup key={g} label={g}>
              {opts.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
            </optgroup>
          ) : (
            opts.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)
          ),
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" aria-hidden />
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, description, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[20px] w-[36px] shrink-0 rounded-pill border p-0 transition-colors focus-visible:ring-2 focus-visible:ring-edit focus-visible:ring-offset-2 focus-visible:outline-none',
          checked ? 'bg-edit border-edit' : 'bg-paper-3 border-line',
          disabled && 'opacity-50',
        )}
      >
        <span className={cx('absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[16px]' : 'translate-x-0')} aria-hidden />
      </button>
      <label htmlFor={id} className="text-sm cursor-pointer min-w-0">
        <span className="font-medium text-ink-2">{label}</span>
        {description && <span className="block text-xxs text-ink-3 leading-tight">{description}</span>}
      </label>
    </div>
  );
}

export function Slider({ id, label, value, min, max, step = 1, onChange, format, help, disabled }: {
  id: string; label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; help?: string; disabled?: boolean;
}) {
  const setDragging = usePlanStore((s) => s.setDragging);
  const fmt = format ?? ((v: number) => String(v));
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <label htmlFor={id} className="text-xs font-medium text-ink-2 truncate">{label}</label>
          {help && <HelpTip text={help} />}
        </div>
        <output htmlFor={id} className="num text-sm text-ink shrink-0">{fmt(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onBlur={() => setDragging(false)}
        aria-valuetext={fmt(value)}
      />
    </div>
  );
}

export function RadioCards<T extends string | number>({ name, value, options, onChange, columns = 1 }: {
  name: string; value: T | null; options: { value: T; label: ReactNode; description?: ReactNode }[]; onChange: (v: T) => void; columns?: 1 | 2;
}) {
  return (
    <div role="radiogroup" className={cx('grid gap-2', columns === 2 ? 'sm:grid-cols-2' : '')}>
      {options.map((o) => {
        const checked = value === o.value;
        const id = `${name}-${String(o.value)}`;
        return (
          <label
            key={String(o.value)}
            htmlFor={id}
            className={cx(
              'flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors',
              checked ? 'border-rec bg-rec-soft' : 'border-line bg-paper-2 hover:bg-paper-3',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="mt-1 h-3.5 w-3.5 accent-rec focus-visible:ring-2 focus-visible:ring-edit"
            />
            <span className="text-sm min-w-0">
              <span className={cx(checked ? 'text-ink font-medium' : 'text-ink-2')}>{o.label}</span>
              {o.description && <span className="block text-xxs text-ink-3">{o.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Help tip & VERIFY tag (accessible popovers: hover + focus + click toggle)
// ---------------------------------------------------------------------------------------------
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !(t instanceof Element && t.closest('[data-floating]'))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Tooltip body rendered in a portal at a fixed position, so overflow/sticky ancestors (e.g. the readout strip)
 *  cannot clip it and it never pushes neighbouring layout. Stays within the viewport horizontally. */
function Floating({ anchor, width, id, children }: { anchor: HTMLElement | null; width: number; id: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
      setPos({ top: r.bottom + 4, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, width]);
  if (!pos) return null;
  return createPortal(
    <span role="tooltip" id={id} data-floating style={{ position: 'fixed', top: pos.top, left: pos.left, width }} className="z-[60] rounded-md border border-line bg-paper-2 p-2 text-xs text-ink-2 shadow-pop text-left font-normal normal-case tracking-normal">
      {children}
    </span>,
    document.body,
  );
}

export function HelpTip({ text, label = 'Explain this number' }: { text: string; label?: string }) {
  const { open, setOpen, ref } = usePopover();
  const id = useId();
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="text-ink-4 hover:text-ink-2 rounded focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && <Floating anchor={ref.current} width={256} id={id}>{text}</Floating>}
    </span>
  );
}

export function VerifyTag({ source, asOf, note, label = 'Verify', url }: { source?: string; asOf?: string; note?: string; label?: string; url?: string }) {
  const { open, setOpen, ref } = usePopover();
  const id = useId();
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="inline-flex items-center rounded-sm border border-warn/50 bg-warn-soft px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-warn leading-3 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <Floating anchor={ref.current} width={288} id={id}>
          <span className="block font-medium text-ink">Not verified against a primary source</span>
          {source && <span className="block mt-1">Source: {source}</span>}
          {asOf && <span className="block">As of: {asOf}</span>}
          {note && <span className="block mt-1 text-ink-3">{note}</span>}
          {url && <a className="block mt-1 break-all" href={url} target="_blank" rel="noreferrer noopener">{url}</a>}
        </Floating>
      )}
    </span>
  );
}

export function SourceLine({ source, asOf, verified, url, note, showVerify }: { source?: string; asOf?: string; verified?: boolean; url?: string; note?: string; showVerify?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xxs text-ink-3">
      <span>{source}{asOf ? ` · as of ${asOf}` : ''}</span>
      {url && <a href={url} target="_blank" rel="noreferrer noopener" className="text-edit">source</a>}
      {showVerify && verified === false && <VerifyTag source={source} asOf={asOf} note={note} url={url} />}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Readouts, stats, chips
// ---------------------------------------------------------------------------------------------
export function Readout({ label, value, delta, deltaGood, hint, size = 'md', tone }: {
  label: ReactNode; value: ReactNode; delta?: ReactNode; deltaGood?: boolean | null; hint?: string; size?: 'sm' | 'md' | 'lg'; tone?: 'ok' | 'warn' | 'danger';
}) {
  return (
    <div className="min-w-0">
      <div className="label-caps flex items-center gap-1 whitespace-nowrap">
        <span className="truncate">{label}</span>
        {hint && <HelpTip text={hint} />}
      </div>
      <div className={cx('num font-medium readout-value whitespace-nowrap', size === 'lg' ? 'text-[32px] leading-10' : size === 'sm' ? 'text-base leading-6' : 'text-[22px] leading-7', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
        {value}
      </div>
      {delta != null && (
        <div className={cx('num text-xxs', deltaGood == null ? 'text-ink-3' : deltaGood ? 'text-ok' : 'text-danger')}>{delta}</div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="label-caps leading-[14px]">{label}</div>
      <div className="num text-base font-medium">{value}</div>
      {sub && <div className="text-xxs text-ink-3">{sub}</div>}
    </div>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'rec' | 'edit' | 'neutral';
const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  rec: 'bg-rec-soft text-rec border-rec/30',
  edit: 'bg-edit-soft text-edit border-edit/30',
  neutral: 'bg-paper-3 text-ink-2 border-line',
};
export function Chip({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 rounded-pill border px-2 py-px text-xxs font-medium whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

// ---------------------------------------------------------------------------------------------
// Dialog (focus trapped)
// ---------------------------------------------------------------------------------------------
export function Dialog({ open, onClose, title, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose in a ref so the effect below depends only on `open`. Parents usually pass an inline
  // arrow function, which is a new identity on every render; depending on it re-ran the effect (and re-focused
  // the first button) on every keystroke inside the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    // Focus the first field rather than the close button, so typing can start immediately.
    const all = focusables();
    const first = all.find((f) => f.matches('input,select,textarea')) ?? all.find((f) => f.getAttribute('aria-label') !== 'Close') ?? all[0];
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0)) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('relative card w-full max-h-[90vh] overflow-auto shadow-pop focus:outline-none text-ink text-sm text-left', width === 'lg' ? 'max-w-3xl' : 'max-w-lg')}>
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line-2">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"><X className="h-4 w-4" aria-hidden /></button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-line-2">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Table / EmptyState / Loading
// ---------------------------------------------------------------------------------------------
export function Table({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cx('w-full overflow-x-auto', className)}>
      <table className="w-full text-sm border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export const th = 'label-caps text-left font-medium px-2 py-1.5 border-b border-line whitespace-nowrap';
export const thNum = `${th} text-right`;
export const td = 'px-2 py-1.5 border-b border-line-2 align-top';
export const tdNum = `${td} num text-right whitespace-nowrap`;

export function EmptyState({ title, detail, action, icon }: { title: ReactNode; detail?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-4 py-8 text-center">
      {icon && <div className="text-ink-4">{icon}</div>}
      <div className="font-medium text-ink-2">{title}</div>
      {detail && <div className="text-xs text-ink-3 max-w-md">{detail}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-3 py-6" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{children}</div>;
}

export function Note({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'rec' | 'ok'; className?: string }) {
  const t = tone === 'warn' ? 'border-warn/30 bg-warn-soft text-ink-2' : tone === 'rec' ? 'border-rec/30 bg-rec-soft text-ink-2' : tone === 'ok' ? 'border-ok/30 bg-ok-soft text-ink-2' : 'border-line bg-paper-3 text-ink-2';
  return <div className={cx('rounded-md border px-3 py-2 text-xs', t, className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="truncate">{title}</h1>
        {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------------------------
interface ToastItem { id: number; text: string; tone: 'ok' | 'danger' | 'neutral' }
const ToastCtx = createContext<{ toast: (text: string, tone?: ToastItem['tone']) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((text: string, tone: ToastItem['tone'] = 'neutral') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={cx('card px-3 py-2 text-sm shadow-pop border-l-4', t.tone === 'ok' ? 'border-l-ok' : t.tone === 'danger' ? 'border-l-danger' : 'border-l-ink-3')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v.toast;
}

/** Visually hidden but readable by screen readers */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
