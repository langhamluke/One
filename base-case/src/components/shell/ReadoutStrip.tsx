import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Printer, Upload, UserCog } from 'lucide-react';
import { useDerived } from '@/state/derived';
import { usePlanStore } from '@/state/plan';
import { usePrefs } from '@/state/prefs';
import { useUser, isStaff, useProduct } from '@/state/session';
import { Button, Dialog, HelpTip, Readout, Select, cx, useToast } from '@/components/ui';
import { fmtCompact, fmtMoney, fmtMonths, fmtPct, toBasis } from '@/lib/format';
import { CURRENT_YEAR, defaultPilotProfile, exportPlan, importPlan, isPilotPlan } from '@shared/lib/inputs';
import { PILOT_STAGES } from '@shared/data/airlines';
import { FAA_RETIREMENT_AGE } from '@shared/lib/airline';
import { personasFor } from '@shared/data/personas';
import { productConfig } from '@shared/product';
import type { Derived, Headline } from '@shared/lib/derived';

function Seg<T extends string>({ value, options, onChange, label, cockpit }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; cockpit?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-md border border-line p-0.5', cockpit ? 'bg-[#0B1118] rounded' : 'bg-paper-2')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-2 py-0.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none transition-colors',
            cockpit && 'rounded-sm text-[11px] uppercase tracking-wider',
            value === o.value ? (cockpit ? 'bg-edit/15 text-edit' : 'bg-ink text-paper') : cockpit ? 'text-ink-3 hover:text-ink' : 'text-ink-2 hover:bg-paper-3',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STAGE_SHORT: Record<string, string> = {
  student: 'STUDENT', cfi: 'CFI', regional_fo: 'RGNL FO', regional_ca: 'RGNL CA', major_fo: 'MAJOR FO', major_ca: 'MAJOR CA', cargo_fo: 'CARGO FO', cargo_ca: 'CARGO CA',
};

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
  const product = useProduct();
  const fileRef = useRef<HTMLInputElement>(null);
  const PERSONAS = personasFor(state.product);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [persona, setPersona] = useState(PERSONAS[0]?.key ?? '');
  const cockpit = (state.product ?? product.key) === 'flight-plan';
  const sprout = (state.product ?? product.key) === 'sprout';

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

  // Sprout readouts: money in per month, savings rate, the starter/emergency fund, card balance, net worth, and what
  // today's habits grow to by 30 (today's dollars) instead of the retirement figures.
  const meetAge = state.profile.age < 30 ? 30 : state.profile.age + 10;
  const atAge = (d: Derived | null | undefined): number | null => {
    if (!d) return null;
    const r = d.active.rows.find((x) => x.age === meetAge) ?? d.active.rows[d.active.rows.length - 1];
    return r ? toBasis(r.investable + r.balances.cash + r.balances.goals, r.yearIndex, state.assumptions.inflation, 'today') : null;
  };
  const cardBalance = state.debts.filter((d) => d.kind === 'credit_card').reduce((t, d) => t + Math.max(0, d.balance), 0);
  const studentItems = h && derived
    ? [
        { label: 'Money in', value: `${fmtMoney(derived.tax.takeHome / 12)}/mo`, d: delta(derived.tax.takeHome, mode === 'draft' ? approvedDerived?.tax.takeHome : null, (x, o) => `${o.sign && x > 0 ? '+' : ''}${fmtMoney(x / 12)}/mo`), hint: `Take-home pay plus allowance per month in ${derived.tax.year}, after taxes.` },
        { label: 'Savings rate', value: fmtPct(h.savingsRate, 0), d: delta(h.savingsRate, a?.savingsRate, (x, o) => fmtPct(x, 1, o)), hint: 'Share of what comes in that goes to savings this year.' },
        { label: 'Emergency fund', value: fmtMoney(derived.emergency.current), d: delta(h.emergencyMonthsCovered, a?.emergencyMonthsCovered, (x, o) => `${o.sign && x > 0 ? '+' : ''}${x.toFixed(1)} mo`), hint: `Cash on hand against a target of ${fmtMoney(derived.emergency.target)} ($500 starter, then months of expenses).` },
        { label: 'Card balance', value: fmtMoney(cardBalance), d: { text: undefined, good: null as boolean | null }, hint: 'Total owed on credit cards today. Pay the statement balance in full and the card charges no interest.' },
        { label: 'Net worth', value: fmtCompact(h.netWorth), d: delta(h.netWorth, a?.netWorth, fmtCompact), hint: 'What you own minus what you owe, today.' },
        { label: `At ${meetAge}`, value: fmtCompact(atAge(derived) ?? 0), d: delta(atAge(derived), mode === 'draft' ? atAge(approvedDerived) : null, fmtCompact), hint: `Savings and investments at age ${meetAge} on the expected-return path, in today's dollars. Hypothetical, not a promise.` },
      ]
    : [];

  // Cockpit readouts (the original's six): age, seniority phase, annual comp, savings rate, net worth, projected retirement.
  const pilot = isPilotPlan(state);
  const pp = state.profile.pilot ?? defaultPilotProfile();
  const firstRow = derived ? derived.active.rows[Math.max(0, derived.active.firstIncomeYearIndex)] : undefined;
  const retAge = derived?.mc.retirementAge ?? state.profile.retirementAge;
  const cockpitItems = h && derived
    ? [
        { label: 'Age', value: String(state.profile.age), sub: pilot ? `${productConfig('flight-plan').phases[4].label} ${retAge}${retAge >= FAA_RETIREMENT_AGE ? ' · FAA max' : ''}` : `Retire at ${retAge}`, hint: 'Current age and the retirement age the projection uses. Airline flying ends at the FAA limit of 65.' },
        pilot
          ? { label: 'Seniority phase', value: STAGE_SHORT[pp.stage] ?? pp.stage.toUpperCase(), sub: `${(PILOT_STAGES.find((s) => s.value === pp.stage)?.label ?? '').toLowerCase()} · ${pp.hours.toLocaleString('en-US')} hrs`, hint: 'Where you are in the seniority progression today, from the Preflight screen.' }
          : { label: 'Emergency fund', value: fmtMonths(h.emergencyMonthsCovered), sub: 'months of essentials', hint: 'Months of essential spending covered by cash on hand.', d: delta(h.emergencyMonthsCovered, a?.emergencyMonthsCovered, (x, o) => `${o.sign && x > 0 ? '+' : ''}${x.toFixed(1)} mo`) },
        { label: 'Annual comp', value: fmtCompact((firstRow?.wages ?? 0) + (firstRow?.bonus ?? 0)), sub: `${CURRENT_YEAR + (firstRow?.yearIndex ?? 0)} projected gross`, hint: 'Gross pay in the first income year of the active path: rate × credit hours × 12 plus profit sharing for airline paths.' },
        { label: 'Savings rate', value: fmtPct(h.savingsRate, 0), sub: `${fmtPct(h.savingsRateWithEmployer, 0)} incl. company`, tone: 'warn' as const, bar: 'bg-warn', d: delta(h.savingsRate, a?.savingsRate, (x, o) => fmtPct(x, 1, o)), hint: 'Employee savings this year as a share of gross pay; the second figure adds company contributions.' },
        { label: 'Net worth', value: fmtCompact(h.netWorth), sub: 'assets − debts today', tone: h.netWorth < 0 ? ('warn' as const) : undefined, d: delta(h.netWorth, a?.netWorth, fmtCompact), hint: 'Investable assets plus other assets minus all debt balances today.' },
        { label: 'Proj. ret · P50', value: fmtCompact(h.medianAtRetirementReal), sub: `today's $ · P(s) ${fmtPct(h.successProbability, 0)}`, tone: 'warn' as const, bar: 'bg-warn', marker: true, d: delta(h.medianAtRetirementReal, a?.medianAtRetirementReal, fmtCompact), hint: "Median simulated portfolio at retirement in today's dollars, and the share of simulations that fund the income target to life expectancy." },
      ]
    : [];

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportPlan(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `${productConfig(state.product).exportTag}-plan-${state.profile.nickname || 'plan'}.json`;
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
    const p = PERSONAS.find((x) => x.key === persona) ?? PERSONAS[0];
    if (p) {
      replace(structuredClone(p.state));
      toast(`Loaded persona: ${p.name}`, 'ok');
    }
    setPersonaOpen(false);
  };

  const controls = (
    <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
      <Seg cockpit={cockpit} label="Dollar basis" value={basis} options={[{ value: 'today', label: "Today's $" }, { value: 'nominal', label: 'Nominal' }]} onChange={setBasis} />
      {staff && <Seg cockpit={cockpit} label="View" value={viewMode} options={[{ value: 'client', label: cockpit ? 'Client' : 'Client view' }, { value: 'advisor', label: cockpit ? 'Advisor' : 'Advisor view' }]} onChange={setViewMode} />}
      {staff && PERSONAS.length > 0 && <Button size="sm" icon={cockpit ? undefined : <UserCog className="h-3.5 w-3.5" aria-hidden />} onClick={() => setPersonaOpen(true)}>{cockpit ? 'Load demo pilot' : sprout ? 'Load demo student' : 'Load demo persona'}</Button>}
      <Button size="sm" icon={cockpit ? undefined : <Download className="h-3.5 w-3.5" aria-hidden />} onClick={doExport}>{cockpit ? 'Export' : 'Export JSON'}</Button>
      <Button size="sm" icon={cockpit ? undefined : <Upload className="h-3.5 w-3.5" aria-hidden />} onClick={() => fileRef.current?.click()}>{cockpit ? 'Import' : 'Import JSON'}</Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import plan JSON" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      <Button size="sm" icon={cockpit ? undefined : <Printer className="h-3.5 w-3.5" aria-hidden />} onClick={() => { navigate(`${basePath}/summary`); setTimeout(() => window.print(), 400); }}>Print</Button>
    </div>
  );

  const personaDialog = (
    <Dialog open={personaOpen} onClose={() => setPersonaOpen(false)} title={cockpit ? 'Load demo pilot' : sprout ? 'Load demo student' : 'Load demo persona'} footer={<><Button onClick={() => setPersonaOpen(false)}>Cancel</Button><Button variant="primary" onClick={loadPersona}>Load into draft</Button></>}>
      <p className="text-sm text-ink-2 mb-3">Replaces every input in the current draft with the persona's inputs. Personas are fictional.</p>
      <label htmlFor="persona-select" className="ui-label text-xs font-medium text-ink-2">Persona</label>
      <Select id="persona-select" value={PERSONAS.some((p) => p.key === persona) ? persona : PERSONAS[0]?.key ?? ''} onChange={(e) => setPersona(e.target.value)} options={PERSONAS.map((p) => ({ value: p.key, label: `${p.name} — ${p.tagline}` }))} />
    </Dialog>
  );

  if (cockpit) {
    return (
      <div data-readout-strip className="bg-paper">
        <div className="w-full px-4 sm:px-6 pt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(error || !h) && <span className="text-[11px] uppercase tracking-wider text-ink-3 mr-auto">{error ? 'Engine not available — readouts appear once the plan engine loads.' : 'Computing…'}</span>}
            {controls}
          </div>
          <div className="card grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 overflow-hidden" aria-live="polite" aria-atomic="true" aria-busy={stale} role="status">
            {cockpitItems.map((it, i) => (
              <div key={it.label} className={cx('relative min-w-0 px-4 pt-3 pb-3.5 border-line', i % 2 === 0 && 'border-r md:border-r', i % 3 !== 2 && 'md:border-r', i !== 5 && 'xl:border-r', i < 4 && 'border-b md:border-b', i < 3 && 'md:border-b', 'xl:border-b-0')}>
                <div className="label-caps flex items-center gap-1 whitespace-nowrap"><span className="truncate">{it.label}</span>{it.hint && <HelpTip text={it.hint} />}</div>
                <div className={cx('num text-[22px] leading-7 mt-1 whitespace-nowrap', it.tone === 'warn' ? 'text-warn' : 'text-ink')}>{it.value}</div>
                <div className="text-[11px] leading-4 text-ink-3 truncate">{it.d?.text ? <span className={cx('num', it.d.good == null ? 'text-ink-3' : it.d.good ? 'text-ok' : 'text-danger')}>{it.d.text}</span> : it.sub}</div>
                {it.bar && <span className={cx('absolute left-0 bottom-0 h-0.5', it.bar)} style={{ width: it.marker ? '88%' : '18%' }} aria-hidden />}
                {it.marker && <span className="absolute bottom-0 h-1.5 w-0.5 bg-rec" style={{ left: '90%' }} aria-hidden />}
              </div>
            ))}
          </div>
        </div>
        {personaDialog}
      </div>
    );
  }

  return (
    <div data-readout-strip className="lg:sticky lg:top-0 z-30 border-b border-line bg-paper-2/95 backdrop-blur">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-2 flex flex-col xl:flex-row xl:items-center gap-2">
        <div className="flex gap-5 overflow-x-auto flex-1 min-w-0 pb-0.5" aria-live="polite" aria-atomic="true" aria-busy={stale} role="status">
          {error && <span className="text-xs text-ink-3 py-2">Engine not available — readouts will appear once the plan engine loads.</span>}
          {!error && !h && <span className="text-xs text-ink-3 py-2">Computing…</span>}
          {(sprout ? studentItems : items).map((it) => (
            <div key={it.label} className="shrink-0"><Readout label={it.label} value={it.value} delta={it.d.text} deltaGood={it.d.good} hint={it.hint} size="md" /></div>
          ))}
        </div>
        {controls}
      </div>
      {personaDialog}
    </div>
  );
}
