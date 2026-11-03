import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Printer, Upload, UserCog } from 'lucide-react';
import { useDerived } from '@/state/derived';
import { usePlanStore } from '@/state/plan';
import { usePrefs } from '@/state/prefs';
import { useUser, isStaff } from '@/state/session';
import { Button, Dialog, Readout, Select, cx, useToast } from '@/components/ui';
import { fmtCompact, fmtMonths, fmtPct } from '@/lib/format';
import { exportPlan, importPlan } from '@shared/lib/inputs';
import { PERSONAS } from '@shared/data/personas';
import type { Headline } from '@shared/lib/derived';

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line bg-paper-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded px-2 py-0.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', value === o.value ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-3')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ReadoutStrip({ basePath }: { basePath: string }) {
  const { derived, approvedDerived, error, stale } = useDerived();
  const mode = usePlanStore((s) => s.mode);
  const replace = usePlanStore((s) => s.replace);
  const state = usePlanStore((s) => s.state);
  const { basis, setBasis, viewMode, setViewMode } = usePrefs();
  const user = useUser();
  const staff = isStaff(user?.role);
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [persona, setPersona] = useState(PERSONAS[0]?.key ?? '');

  const h: Headline | null = derived?.headline ?? null;
  const a: Headline | null = mode === 'draft' ? approvedDerived?.headline ?? null : null;

  const delta = (cur: number | null | undefined, base: number | null | undefined, fmt: (x: number, o: { sign: boolean }) => string, higherIsBetter = true) => {
    if (cur == null || base == null || !Number.isFinite(cur) || !Number.isFinite(base)) return { text: undefined, good: null as boolean | null };
    const d = cur - base;
    if (Math.abs(d) < 1e-9) return { text: 'no change', good: null as boolean | null };
    return { text: `${fmt(d, { sign: true })} vs approved`, good: higherIsBetter ? d > 0 : d < 0 };
  };
  const ageDelta = (cur: number | null | undefined, base: number | null | undefined) => {
    if (cur == null || base == null) return { text: undefined, good: null as boolean | null };
    const d = cur - base;
    if (d === 0) return { text: 'no change', good: null as boolean | null };
    return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)} yrs vs approved`, good: d < 0 };
  };

  const items = h
    ? [
        { label: 'Net worth', value: fmtCompact(h.netWorth), d: delta(h.netWorth, a?.netWorth, fmtCompact), hint: 'Investable assets plus other assets minus all debt balances today.' },
        { label: 'Savings rate', value: fmtPct(h.savingsRate, 0), d: delta(h.savingsRate, a?.savingsRate, (x, o) => fmtPct(x, 1, o)), hint: 'Employee savings this year as a share of gross pay (employer contributions excluded).' },
        { label: 'P(success)', value: fmtPct(h.successProbability, 0), d: delta(h.successProbability, a?.successProbability, (x, o) => fmtPct(x, 1, o)), hint: 'Share of Monte Carlo simulations that fund the retirement income target through life expectancy.' },
        { label: 'Retirement P50', value: fmtCompact(h.medianAtRetirementReal), d: delta(h.medianAtRetirementReal, a?.medianAtRetirementReal, fmtCompact), hint: "Median simulated portfolio at retirement, in today's dollars." },
        { label: 'Emergency fund', value: fmtMonths(h.emergencyMonthsCovered), d: delta(h.emergencyMonthsCovered, a?.emergencyMonthsCovered, (x, o) => `${o.sign && x > 0 ? '+' : ''}${x.toFixed(1)} mo`), hint: 'Months of essential spending covered by cash on hand.' },
        { label: 'Debt-free age', value: h.debtFreeAge == null ? (derived?.debt.totalBalance ? 'Never' : 'Now') : String(h.debtFreeAge), d: ageDelta(h.debtFreeAge, a?.debtFreeAge), hint: 'Age at which every debt is paid off in the active path.' },
      ]
    : [];

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportPlan(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `base-case-plan-${state.profile.nickname || 'plan'}.json`;
    el.click();
    URL.revokeObjectURL(url);
  };
  const doImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      replace(importPlan(parsed));
      toast('Plan imported into the current draft', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not import this file', 'danger');
    }
  };
  const loadPersona = () => {
    const p = PERSONAS.find((x) => x.key === persona);
    if (p) {
      replace(structuredClone(p.state));
      toast(`Loaded persona: ${p.name}`, 'ok');
    }
    setPersonaOpen(false);
  };

  return (
    <div data-readout-strip className="sticky top-0 lg:top-0 z-30 border-b border-line bg-paper-2/95 backdrop-blur">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-2 flex flex-col xl:flex-row xl:items-center gap-2">
        <div className="flex gap-5 overflow-x-auto flex-1 min-w-0 pb-0.5" aria-live="polite" aria-atomic="true" aria-busy={stale} role="status">
          {error && <span className="text-xs text-ink-3 py-2">Engine not available — readouts will appear once the plan engine loads.</span>}
          {!error && !h && <span className="text-xs text-ink-3 py-2">Computing…</span>}
          {items.map((it) => (
            <div key={it.label} className="shrink-0"><Readout label={it.label} value={it.value} delta={it.d.text} deltaGood={it.d.good} hint={it.hint} size="md" /></div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
          <Seg label="Dollar basis" value={basis} options={[{ value: 'today', label: "Today's $" }, { value: 'nominal', label: 'Nominal' }]} onChange={setBasis} />
          {staff && <Seg label="View" value={viewMode} options={[{ value: 'client', label: 'Client view' }, { value: 'advisor', label: 'Advisor view' }]} onChange={setViewMode} />}
          {staff && <Button size="sm" icon={<UserCog className="h-3.5 w-3.5" aria-hidden />} onClick={() => setPersonaOpen(true)}>Load demo persona</Button>}
          <Button size="sm" icon={<Download className="h-3.5 w-3.5" aria-hidden />} onClick={doExport}>Export JSON</Button>
          <Button size="sm" icon={<Upload className="h-3.5 w-3.5" aria-hidden />} onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import plan JSON" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          <Button size="sm" icon={<Printer className="h-3.5 w-3.5" aria-hidden />} onClick={() => { navigate(`${basePath}/summary`); setTimeout(() => window.print(), 400); }}>Print</Button>
        </div>
      </div>
      <Dialog open={personaOpen} onClose={() => setPersonaOpen(false)} title="Load demo persona" footer={<><Button onClick={() => setPersonaOpen(false)}>Cancel</Button><Button variant="primary" onClick={loadPersona}>Load into draft</Button></>}>
        <p className="text-sm text-ink-2 mb-3">Replaces every input in the current draft with the persona's inputs. Personas are fictional.</p>
        <label htmlFor="persona-select" className="text-xs font-medium text-ink-2">Persona</label>
        <Select id="persona-select" value={persona} onChange={(e) => setPersona(e.target.value)} options={PERSONAS.map((p) => ({ value: p.key, label: `${p.name} — ${p.tagline}` }))} />
      </Dialog>
    </div>
  );
}
