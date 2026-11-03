import { Copy, Plus, Trash2 } from 'lucide-react';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { usePrefs } from '@/state/prefs';
import { useAdvisorView } from './PlanLayout';
import { Button, Chip, Field, Note, NumberInput, Panel, Select, Slider, SourceLine, Table, TextInput, Toggle, VerifyTag, cx, td, tdNum, th, thNum } from '@/components/ui';
import { LadderChart } from '@/components/charts/LadderChart';
import { SalaryChart } from '@/components/charts/SalaryChart';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { PATH_COLORS, REC } from '@/components/charts/common';
import { OCCUPATIONS, WAGES_AS_OF, WAGES_SOURCE, listMetros, listOccupations } from '@shared/data/careers';
import { defaultCareerPath, type CareerPath, type LadderLevel, type Track } from '@shared/lib/inputs';
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from '@/lib/format';

function uid(): string {
  return `path-${Math.random().toString(36).slice(2, 7)}`;
}

function customLevel(title: string, years: number, p50: number): LadderLevel {
  return { title, years, bonusPct: 0, band: { value: { p10: p50 * 0.8, p25: p50 * 0.9, p50, p75: p50 * 1.1, p90: p50 * 1.2 }, source: 'Self-reported (custom ladder)', asOf: '2026-11', verified: false } };
}

export function CareerPage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error } = useDerived();
  const advisor = useAdvisorView();
  const basis = usePrefs((s) => s.basis);
  const occupations = listOccupations();
  const metros = listMetros();
  const occOptions = [...occupations.map((o) => ({ value: o.code, label: o.title, group: o.industry })), { value: 'custom', label: 'Custom ladder (self-reported)', group: 'Custom' }];
  const activeIdx = state.careerPaths.findIndex((p) => p.id === state.activePathId);
  const activePath = state.careerPaths[activeIdx] ?? state.careerPaths[0];
  const activeOcc = activePath ? OCCUPATIONS[activePath.occupationCode] : undefined;
  const wi = state.whatIf;
  const retirementAge = wi.retireAtOverride ?? state.profile.retirementAge;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        <Panel title="Career paths" subtitle={`${state.careerPaths.length} of 4`} actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} disabled={state.careerPaths.length >= 4} onClick={() => update((s) => { const p = defaultCareerPath(uid()); p.name = `Path ${s.careerPaths.length + 1}`; if (occupations.length && !OCCUPATIONS[p.occupationCode]) p.occupationCode = occupations[0].code; s.careerPaths.push(p); })}>Add path</Button>}>
          <div className="flex flex-col gap-3">
            {state.careerPaths.map((p, i) => (
              <PathEditor key={p.id} p={p} i={i} active={p.id === state.activePathId} occOptions={occOptions} metros={metros.map((m) => ({ value: m.key, label: m.name }))} canRemove={state.careerPaths.length > 1} />
            ))}
          </div>
        </Panel>

        <Panel title="What if" collapseKey="career.whatif">
          <div className="flex flex-col gap-4">
            <Slider id="wi-promo" label="Promotion delay" value={wi.promotionDelayYears} min={0} max={5} step={1} format={(v) => `${v} yr${v === 1 ? '' : 's'}`} onChange={(v) => update((s) => { s.whatIf.promotionDelayYears = v; })} help="Push every promotion later by this many years." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider id="wi-gap" label="Layoff gap" value={wi.layoffGapMonths} min={0} max={24} step={1} format={(v) => `${v} mo`} onChange={(v) => update((s) => { s.whatIf.layoffGapMonths = v; })} help="Zero-income months inserted into the path." />
              <Slider id="wi-gapyear" label="Layoff in year" value={wi.layoffYearOffset} min={0} max={30} step={1} format={(v) => `year ${v}`} onChange={(v) => update((s) => { s.whatIf.layoffYearOffset = v; })} />
            </div>
            <Slider id="wi-extra" label="Extra savings rate" value={wi.extraSavingsRatePct} min={0} max={0.3} step={0.01} format={(v) => fmtPct(v, 0)} onChange={(v) => update((s) => { s.whatIf.extraSavingsRatePct = v; })} help="Additional taxable investing as a share of pay." />
            <Slider id="wi-cut" label="Spending cut" value={wi.spendingCut} min={0} max={Math.max(1000, Math.round(state.profile.livingExpenses * 0.5 / 500) * 500)} step={500} format={(v) => `${fmtMoney(v)}/yr`} onChange={(v) => update((s) => { s.whatIf.spendingCut = v; })} />
            <div className="flex items-center gap-3">
              <Toggle id="wi-retire-on" checked={wi.retireAtOverride != null} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v ? s.profile.retirementAge : undefined; })} label="Retire-at override" />
              {wi.retireAtOverride != null && (
                <div className="flex-1"><Slider id="wi-retire" label="Retire at" value={wi.retireAtOverride} min={45} max={75} step={1} format={(v) => `${v}`} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v; })} /></div>
              )}
            </div>
            <div className="rounded-md border border-line-2 p-3">
              <Toggle id="gs-on" checked={wi.gradSchool.enabled} onChange={(v) => update((s) => { s.whatIf.gradSchool.enabled = v; })} label="Grad school" description="Pause income, add tuition, then re-enter at a higher level" />
              {wi.gradSchool.enabled && (
                <div className="grid gap-3 sm:grid-cols-2 mt-3">
                  <Field label="Starts in" htmlFor="gs-start"><NumberInput id="gs-start" value={wi.gradSchool.startYearOffset} min={0} max={20} step={1} suffix="yrs" onChange={(v) => update((s) => { s.whatIf.gradSchool.startYearOffset = v ?? 0; })} /></Field>
                  <Field label="Length" htmlFor="gs-years"><NumberInput id="gs-years" value={wi.gradSchool.years} min={1} max={8} step={1} suffix="yrs" onChange={(v) => update((s) => { s.whatIf.gradSchool.years = v ?? 2; })} /></Field>
                  <Field label="Annual cost" htmlFor="gs-cost"><NumberInput id="gs-cost" value={wi.gradSchool.annualCost} min={0} max={200000} step={1000} prefix="$" onChange={(v) => update((s) => { s.whatIf.gradSchool.annualCost = v ?? 0; })} /></Field>
                  <Field label="Financed with loans" htmlFor="gs-fin"><NumberInput id="gs-fin" value={wi.gradSchool.financedPct} scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.whatIf.gradSchool.financedPct = v ?? 0; })} /></Field>
                  <Field label="Loan rate" htmlFor="gs-rate"><NumberInput id="gs-rate" value={wi.gradSchool.loanRate} scale={100} digits={2} min={0} max={0.2} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.whatIf.gradSchool.loanRate = v ?? 0; })} /></Field>
                  <Field label="Income during school" htmlFor="gs-inc"><NumberInput id="gs-inc" value={wi.gradSchool.incomeDuring} min={0} max={200000} step={1000} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.whatIf.gradSchool.incomeDuring = v ?? 0; })} /></Field>
                  <Field label="Post-school occupation" htmlFor="gs-occ"><Select id="gs-occ" value={wi.gradSchool.postOccupationCode ?? ''} onChange={(e) => update((s) => { s.whatIf.gradSchool.postOccupationCode = e.target.value || undefined; })} options={[{ value: '', label: 'Same occupation' }, ...occupations.map((o) => ({ value: o.code, label: o.title, group: o.industry }))]} /></Field>
                  <Field label="Re-enter at level" htmlFor="gs-level"><NumberInput id="gs-level" value={wi.gradSchool.postLevelIndex} min={0} max={6} step={1} onChange={(v) => update((s) => { s.whatIf.gradSchool.postLevelIndex = v ?? 1; })} /></Field>
                  <Field label="Salary premium" htmlFor="gs-prem" help="Applied when staying in the same occupation."><NumberInput id="gs-prem" value={wi.gradSchool.postPremium} scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.whatIf.gradSchool.postPremium = v ?? 0; })} /></Field>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        {activePath && (
          activeOcc ? (
            <div className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium text-sm">{activeOcc.title}</span>
              <span className="text-ink-3">SOC {activeOcc.soc}</span>
              <span>Median <span className="num">{fmtMoney(activeOcc.oews.value.p50)}</span>{advisor && !activeOcc.oews.verified && <VerifyTag source={activeOcc.oews.source} asOf={activeOcc.oews.asOf} note={activeOcc.oews.note} url={activeOcc.oews.url} />}</span>
              <span>Employment <span className="num">{fmtNum(activeOcc.employment.value)}</span>{advisor && !activeOcc.employment.verified && <VerifyTag source={activeOcc.employment.source} asOf={activeOcc.employment.asOf} />}</span>
              <span>Growth 2024–34 <span className="num">{fmtPct(activeOcc.growth.value, 0, { sign: true })}</span>{advisor && !activeOcc.growth.verified && <VerifyTag source={activeOcc.growth.source} asOf={activeOcc.growth.asOf} />}</span>
              <Chip tone={activeOcc.layoffRisk === 'high' ? 'warn' : 'neutral'}>layoff risk {activeOcc.layoffRisk}</Chip>
              <span className="w-full"><SourceLine source={activeOcc.oews.source || WAGES_SOURCE} asOf={activeOcc.oews.asOf || WAGES_AS_OF} url={activeOcc.oews.url} verified={activeOcc.oews.verified} showVerify={advisor} /></span>
            </div>
          ) : activePath.occupationCode !== 'custom' ? (
            <Note tone="warn">No wage data for this occupation — enter a custom ladder; it will be flagged as self-reported.</Note>
          ) : (
            <Note tone="warn"><span className="inline-flex items-center gap-2"><VerifyTag label="Self-reported" source="Custom ladder entered by the client" asOf="2026-11" /> Custom ladder in use for the active path.</span></Note>
          )
        )}
        {error ? <EngineUnavailable error={advisor ? error : undefined} /> : derived ? (
          <>
            <Panel title="Career ladder comparison">
              <LadderChart paths={derived.paths} activeId={state.activePathId} startAge={state.profile.age} retirementAge={retirementAge} />
              <div className="mt-2">
                <SalaryChart paths={derived.paths} activeId={state.activePathId} basis={basis} inflation={state.assumptions.inflation} retirementAge={retirementAge} />
              </div>
              <ul className="mt-2 flex flex-wrap gap-3 text-xxs text-ink-3">
                {derived.paths.map((p, i) => <li key={p.pathId} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: p.pathId === state.activePathId ? REC : PATH_COLORS[i % 4] }} aria-hidden />{p.name}{p.pathId === state.activePathId ? ' (active)' : ''}</li>)}
              </ul>
            </Panel>
            <Panel title="Comparison">
              <Table caption="Career path comparison">
                <thead>
                  <tr>
                    <th className={th}>Metric</th>
                    {derived.paths.map((p) => <th key={p.pathId} className={cx(thNum, p.pathId === state.activePathId && 'text-rec')}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Starting salary', (p: typeof derived.paths[number]) => fmtMoney(p.startingSalary)],
                    ['Peak salary', (p: typeof derived.paths[number]) => fmtMoney(p.peakSalary)],
                    ['Lifetime earnings', (p: typeof derived.paths[number]) => fmtCompact(p.lifetimeEarnings)],
                    ['Net worth at retirement', (p: typeof derived.paths[number]) => fmtCompact(p.netWorthAtRetirement)],
                    ['P(success)', (p: typeof derived.paths[number]) => (p.pathId === state.activePathId ? fmtPct(derived.mc.successProbability, 0) : '—')],
                    ['Debt-free age', (p: typeof derived.paths[number]) => (p.debtFreeAge == null ? (derived.debt.totalBalance ? 'Never' : 'Now') : String(p.debtFreeAge))],
                  ] as const).map(([label, fn]) => (
                    <tr key={label}>
                      <td className={td}>{label}</td>
                      {derived.paths.map((p) => <td key={p.pathId} className={cx(tdNum, p.pathId === state.activePathId && 'font-medium')}>{fn(p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-xxs text-ink-3 mt-2">Nominal dollars. P(success) runs for the active path only.</p>
            </Panel>
          </>
        ) : <Panel title="Career ladder comparison"><p className="text-sm text-ink-3">Computing…</p></Panel>}
      </div>
    </div>
  );
}

function PathEditor({ p, i, active, occOptions, metros, canRemove }: { p: CareerPath; i: number; active: boolean; occOptions: { value: string; label: string; group?: string }[]; metros: { value: string; label: string }[]; canRemove: boolean }) {
  const update = usePlanStore((s) => s.update);
  const set = <K extends keyof CareerPath>(k: K, v: CareerPath[K]) => update((s) => { (s.careerPaths[i] as CareerPath)[k] = v; });
  const occ = OCCUPATIONS[p.occupationCode];
  const levels: LadderLevel[] = p.occupationCode === 'custom' ? p.customLevels ?? [] : occ?.levels ?? [];
  const color = active ? REC : PATH_COLORS[i % 4];
  return (
    <div className={cx('rounded-md border p-3', active ? 'border-rec' : 'border-line-2')}>
      <div className="flex items-center gap-2 mb-3">
        <input type="radio" name="active-path" id={`ap-${p.id}`} checked={active} onChange={() => update((s) => { s.activePathId = p.id; })} className="accent-rec h-3.5 w-3.5" />
        <label htmlFor={`ap-${p.id}`} className="text-xs font-medium" style={{ color }}>{active ? 'Active path' : 'Make active'}</label>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" aria-hidden />} aria-label={`Duplicate ${p.name}`} onClick={() => update((s) => { if (s.careerPaths.length >= 4) return; const c = structuredClone(p); c.id = uid(); c.name = `${p.name} copy`; s.careerPaths.splice(i + 1, 0, c); })}>Duplicate</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} aria-label={`Remove ${p.name}`} disabled={!canRemove} onClick={() => update((s) => { s.careerPaths.splice(i, 1); if (s.activePathId === p.id) s.activePathId = s.careerPaths[0].id; })}>Remove</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`cp-name-${p.id}`}><TextInput id={`cp-name-${p.id}`} value={p.name} onChange={(e) => set('name', e.target.value)} maxLength={30} /></Field>
        <Field label="Occupation" htmlFor={`cp-occ-${p.id}`}>
          <Select id={`cp-occ-${p.id}`} value={p.occupationCode} onChange={(e) => update((s) => { const cp = s.careerPaths[i]; cp.occupationCode = e.target.value; cp.startLevelIndex = 0; cp.yearsOverrides = {}; if (e.target.value === 'custom' && !cp.customLevels?.length) cp.customLevels = [customLevel('Entry', 2, 60000), customLevel('Mid', 3, 80000), customLevel('Senior', 99, 105000)]; })} options={occOptions.some((o) => o.value === p.occupationCode) ? occOptions : [{ value: p.occupationCode, label: `${p.occupationCode} (no data)`, group: 'Missing' }, ...occOptions]} />
        </Field>
        <Field label="Metro" htmlFor={`cp-metro-${p.id}`}><Select id={`cp-metro-${p.id}`} value={p.metro} onChange={(e) => set('metro', e.target.value)} options={metros} /></Field>
        <Field label="Track" htmlFor={`cp-track-${p.id}`} help="Where in the pay band you land: low = 25th, mid = median, high = 75th percentile."><Select id={`cp-track-${p.id}`} value={p.track} onChange={(e) => set('track', e.target.value as Track)} options={[{ value: 'low', label: 'Low (p25)' }, { value: 'mid', label: 'Mid (p50)' }, { value: 'high', label: 'High (p75)' }]} /></Field>
        <Field label="Start level" htmlFor={`cp-start-${p.id}`}><Select id={`cp-start-${p.id}`} value={String(p.startLevelIndex)} onChange={(e) => set('startLevelIndex', Number(e.target.value))} options={levels.length ? levels.map((l, li) => ({ value: String(li), label: `${li + 1}. ${l.title}` })) : [{ value: '0', label: '1. Entry' }]} /></Field>
        <Field label="Merit raise (real)" htmlFor={`cp-merit-${p.id}`}><NumberInput id={`cp-merit-${p.id}`} value={p.meritRaise} scale={100} digits={1} min={0} max={0.15} step={0.005} suffix="%/yr" onChange={(v) => set('meritRaise', v ?? 0)} /></Field>
        <Field label="Bonus override" htmlFor={`cp-bonus-${p.id}`}><NumberInput id={`cp-bonus-${p.id}`} value={p.bonusPctOverride} allowEmpty placeholder="level default" scale={100} min={0} max={1} step={0.01} suffix="%" onChange={(v) => set('bonusPctOverride', v)} /></Field>
        <Field label="Starts in" htmlFor={`cp-offset-${p.id}`} help="Years until this path starts paying; 0 = already working."><NumberInput id={`cp-offset-${p.id}`} value={p.startYearOffset} min={0} max={10} step={1} suffix="yrs" onChange={(v) => set('startYearOffset', v ?? 0)} /></Field>
        <Field label="Income before start" htmlFor={`cp-pre-${p.id}`}><NumberInput id={`cp-pre-${p.id}`} value={p.preStartIncome} min={0} max={500000} step={1000} prefix="$" suffix="/yr" onChange={(v) => set('preStartIncome', v ?? 0)} /></Field>
        <Field label="Industry drift" htmlFor={`cp-drift-${p.id}`} help="Extra real wage growth beyond merit raises."><NumberInput id={`cp-drift-${p.id}`} value={p.industryDrift} scale={100} digits={1} min={-0.05} max={0.05} step={0.005} suffix="%/yr" onChange={(v) => set('industryDrift', v ?? 0)} /></Field>
      </div>
      {levels.length > 0 && (
        <div className="mt-3">
          <div className="label-caps mb-1">Years in level {p.occupationCode === 'custom' && <VerifyTag label="Self-reported" source="Custom ladder entered by the client" asOf="2026-11" />}</div>
          {p.occupationCode === 'custom' ? (
            <Table caption="Custom ladder levels">
              <thead><tr><th className={th}>Title</th><th className={thNum}>Years</th><th className={thNum}>p25</th><th className={thNum}>p50</th><th className={thNum}>p75</th><th className={th}></th></tr></thead>
              <tbody>
                {(p.customLevels ?? []).map((l, li) => (
                  <tr key={li}>
                    <td className={td}><label className="sr-only" htmlFor={`cl-t-${p.id}-${li}`}>Level {li + 1} title</label><TextInput id={`cl-t-${p.id}-${li}`} value={l.title} onChange={(e) => update((s) => { s.careerPaths[i].customLevels![li].title = e.target.value; })} className="!min-h-[30px] !py-1" /></td>
                    <td className={tdNum}><NumberInput id={`cl-y-${p.id}-${li}`} aria-label={`Level ${li + 1} years`} compact value={l.years} min={1} max={99} step={1} onChange={(v) => update((s) => { s.careerPaths[i].customLevels![li].years = v ?? 1; })} /></td>
                    {(['p25', 'p50', 'p75'] as const).map((k) => (
                      <td key={k} className={tdNum}><NumberInput id={`cl-${k}-${p.id}-${li}`} aria-label={`Level ${li + 1} ${k}`} compact value={l.band.value[k]} min={0} max={5_000_000} step={1000} prefix="$" onChange={(v) => update((s) => { const b = s.careerPaths[i].customLevels![li].band.value; b[k] = v ?? 0; b.p10 = Math.min(b.p10, b.p25 * 0.9); b.p90 = Math.max(b.p90, b.p75 * 1.1); })} /></td>
                    ))}
                    <td className={td}><Button size="sm" variant="ghost" aria-label={`Remove level ${li + 1}`} onClick={() => update((s) => { s.careerPaths[i].customLevels!.splice(li, 1); })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {levels.map((l, li) => (
                <Field key={li} label={`${li + 1}. ${l.title}`} htmlFor={`yo-${p.id}-${li}`} inline>
                  <NumberInput id={`yo-${p.id}-${li}`} compact value={p.yearsOverrides[li] ?? l.years} min={1} max={99} step={1} suffix="yrs" onChange={(v) => update((s) => { if (v == null || v === l.years) delete s.careerPaths[i].yearsOverrides[li]; else s.careerPaths[i].yearsOverrides[li] = v; })} />
                </Field>
              ))}
            </div>
          )}
          {p.occupationCode === 'custom' && <Button size="sm" className="mt-2" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => update((s) => { s.careerPaths[i].customLevels = [...(s.careerPaths[i].customLevels ?? []), customLevel('New level', 3, 90000)]; })}>Add level</Button>}
        </div>
      )}
    </div>
  );
}
