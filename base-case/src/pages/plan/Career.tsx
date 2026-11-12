import { Copy, Plus, Trash2 } from 'lucide-react';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { usePrefs } from '@/state/prefs';
import { useAdvisorView } from './PlanLayout';
import { Button, Chip, Field, Note, NumberInput, Panel, Select, Slider, SourceLine, Table, TextInput, Toggle, VerifyTag, cx, td, tdNum, th, thNum, Stat } from '@/components/ui';
import { LadderChart } from '@/components/charts/LadderChart';
import { SalaryChart } from '@/components/charts/SalaryChart';
import { EarningsBars } from '@/components/charts/EarningsBars';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { theme } from '@/components/charts/common';
import { OCCUPATIONS, WAGES_AS_OF, WAGES_SOURCE, listMetros, listOccupations } from '@shared/data/careers';
import { AIRLINES, AIRLINES_AS_OF, STAY_DEFAULTS, airlinePathName, listAirlinePaths, milestonesFor, resolveAirlines, type AirlinePathChoice, type ExcessHandling, type Milestones } from '@shared/data/airlines';
import { defaultAirlineConfig, defaultAirlinePath, defaultCareerPath, defaultPilotProfile, isPilotPlan, type CareerKind, type CareerPath, type LadderLevel, type Track } from '@shared/lib/inputs';
import { FAA_RETIREMENT_AGE } from '@shared/lib/airline';
import { productConfig } from '@shared/product';
import { studentIncome, studentYears } from '@shared/lib/sprout';
import { fmtCompact, fmtMoney, fmtNum, fmtPct, toBasis } from '@/lib/format';

function uid(): string {
  return `path-${Math.random().toString(36).slice(2, 7)}`;
}

function customLevel(title: string, years: number, p50: number): LadderLevel {
  return { title, years, bonusPct: 0, band: { value: { p10: p50 * 0.8, p25: p50 * 0.9, p50, p75: p50 * 1.1, p90: p50 * 1.2 }, source: 'Self-reported (custom ladder)', asOf: '2026-11', verified: false } };
}

const MILESTONE_FIELDS: { key: keyof Milestones; label: string; help: string }[] = [
  { key: 'toRegional', label: 'Years to regional', help: 'Students and CFIs: years until the first regional job.' },
  { key: 'regionalCaUpgrade', label: 'Regional CA upgrade', help: 'Years at the regional before the captain upgrade.' },
  { key: 'toMajor', label: 'Years to major', help: 'Years at the regional before the major hires (or the flow).' },
  { key: 'majorCaUpgrade', label: 'Major CA upgrade', help: 'Years at the major before the captain upgrade.' },
  { key: 'widebody', label: 'Widebody after CA', help: 'Years after the major captain upgrade before a widebody seat; 0 = never.' },
];

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
  const activeOcc = activePath && activePath.kind !== 'airline' ? OCCUPATIONS[activePath.occupationCode] : undefined;
  const wi = state.whatIf;
  const pilot = isPilotPlan(state);
  const anyAirline = state.careerPaths.some((p) => p.kind === 'airline');
  const anyLadder = state.careerPaths.some((p) => p.kind !== 'airline');
  const product = productConfig(state.product);
  const retirementAge = Math.min(wi.retireAtOverride ?? state.profile.retirementAge, anyAirline && activePath?.kind === 'airline' ? FAA_RETIREMENT_AGE : 999);
  const pp = state.profile.pilot ?? defaultPilotProfile();
  const sprout = state.product === 'sprout';
  const studentPanel = sprout ? (() => {
    const inc = studentIncome(state);
    const yrs = studentYears(state);
    const occ = activeOcc?.title ?? activePath?.name ?? 'your career';
    return (
      <Panel title="Pay now" subtitle={yrs > 0 ? `${yrs} student year${yrs === 1 ? '' : 's'}, then ${occ}` : `${occ} starts this year`} actions={inc.practice ? <Chip tone="warn">Practice paycheck</Chip> : undefined}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Per year" value={fmtMoney(inc.total)} sub={inc.wages > 0 && inc.allowance > 0 ? `${fmtMoney(inc.wages)} pay + ${fmtMoney(inc.allowance)} allowance` : inc.wages > 0 ? 'job pay' : inc.allowance > 0 ? 'allowance' : 'nothing yet'} />
          <Stat label="Hourly" value={inc.hourlyWage > 0 ? fmtMoney(inc.hourlyWage) : '—'} sub={inc.floored ? `${state.profile.stateCode} minimum wage` : inc.selfReported ? 'entered by you' : inc.wageSource ? 'BLS median' : undefined} />
          <Stat label="Hours a week" value={inc.wages > 0 ? `${inc.hoursSchoolYear} / ${inc.hoursSummer}` : '—'} sub="school year / summer" />
          <Stat label="Career starts" value={String(state.profile.graduationYear)} sub={yrs > 0 ? `age ${state.profile.age + yrs}` : 'now'} />
        </div>
        <p className="text-xs text-ink-3 mt-2">{inc.practice ? 'The practice paycheck is a stand-in so the budget is real; it is not income you have. ' : ''}Change the job, hours and the career you are aiming for on the You screen. Add a second path below to compare two careers.</p>
      </Panel>
    );
  })() : null;

  const addPath = () =>
    update((s) => {
      const n = s.careerPaths.length + 1;
      const kind: CareerKind = product.defaultCareerKind === 'airline' || (s.careerPaths.length > 0 && s.careerPaths.every((p) => p.kind === 'airline')) ? 'airline' : 'ladder';
      if (kind === 'airline') {
        const used = new Set(s.careerPaths.map((p) => p.airline?.pathId));
        const next = listAirlinePaths().find((d) => !used.has(d.id))?.id ?? 'stay';
        s.careerPaths.push(defaultAirlinePath(uid(), next, next === 'stay' ? 'Stay put' : listAirlinePaths().find((d) => d.id === next)?.label ?? `Path ${n}`));
        if (!s.profile.pilot) s.profile.pilot = defaultPilotProfile();
      } else {
        const p = defaultCareerPath(uid());
        p.name = `Path ${n}`;
        if (occupations.length && !OCCUPATIONS[p.occupationCode]) p.occupationCode = occupations[0].code;
        s.careerPaths.push(p);
      }
    });

  const pathsPanel = (
        <Panel title={pilot ? "Target paths · compare up to 4" : "Career paths"} subtitle={`${state.careerPaths.length} of 4`} actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} disabled={state.careerPaths.length >= 4} onClick={addPath}>Add path</Button>}>
          <div className={cx(pilot ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-3")}>
            {state.careerPaths.map((p, i) => (
              <PathEditor key={p.id} p={p} i={i} active={p.id === state.activePathId} occOptions={occOptions} metros={metros.map((m) => ({ value: m.key, label: m.name }))} canRemove={state.careerPaths.length > 1} pilotStage={pp.stage} pilotEmployer={pp.employer} />
            ))}
          </div>
          {pilot && !state.profile.pilot && <Note tone="warn" className="mt-3">Set your current position on the {productConfig(state.product).phases[0].label} screen; airline paths start from it.</Note>}
        </Panel>
  );
  const whatIfPanel = (
        <Panel title="What if" collapseKey="career.whatif">
          <div className="flex flex-col gap-4">
            {anyAirline && (
              <>
                <Slider id="wi-upgrade" label="Upgrade delay" value={wi.upgradeDelayYears} min={0} max={5} step={1} format={(v) => `${v} yr${v === 1 ? '' : 's'}`} onChange={(v) => update((s) => { s.whatIf.upgradeDelayYears = v; })} help="Push both captain upgrades later by this many years (airline paths)." />
                <Slider id="wi-furlough" label="Furlough" value={wi.furloughYears} min={0} max={3} step={1} format={(v) => `${v} yr${v === 1 ? '' : 's'}`} onChange={(v) => update((s) => { s.whatIf.furloughYears = v; })} help="Zero-pay years right after joining the major; seniority is frozen and longevity resumes on recall." />
                <Toggle id="wi-retire60" checked={wi.retireAtOverride === 60} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v ? 60 : undefined; })} label="Retire at 60" description={`Five years before the FAA limit of ${FAA_RETIREMENT_AGE}`} />
              </>
            )}
            {anyLadder && (
              <>
                <Slider id="wi-promo" label="Promotion delay" value={wi.promotionDelayYears} min={0} max={5} step={1} format={(v) => `${v} yr${v === 1 ? '' : 's'}`} onChange={(v) => update((s) => { s.whatIf.promotionDelayYears = v; })} help="Push every promotion later by this many years (occupation paths)." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Slider id="wi-gap" label="Layoff gap" value={wi.layoffGapMonths} min={0} max={24} step={1} format={(v) => `${v} mo`} onChange={(v) => update((s) => { s.whatIf.layoffGapMonths = v; })} help="Zero-income months inserted into the path." />
                  <Slider id="wi-gapyear" label="Layoff in year" value={wi.layoffYearOffset} min={0} max={30} step={1} format={(v) => `year ${v}`} onChange={(v) => update((s) => { s.whatIf.layoffYearOffset = v; })} />
                </div>
              </>
            )}
            <Slider id="wi-extra" label="Extra savings rate" value={wi.extraSavingsRatePct} min={0} max={0.3} step={0.01} format={(v) => fmtPct(v, 0)} onChange={(v) => update((s) => { s.whatIf.extraSavingsRatePct = v; })} help="Additional taxable investing as a share of pay." />
            <Slider id="wi-cut" label="Spending cut" value={wi.spendingCut} min={0} max={Math.max(1000, Math.round(state.profile.livingExpenses * 0.5 / 500) * 500)} step={500} format={(v) => `${fmtMoney(v)}/yr`} onChange={(v) => update((s) => { s.whatIf.spendingCut = v; })} />
            <div className="flex items-center gap-3">
              <Toggle id="wi-retire-on" checked={wi.retireAtOverride != null && wi.retireAtOverride !== 60} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v ? s.profile.retirementAge : undefined; })} label="Retire-at override" />
              {wi.retireAtOverride != null && wi.retireAtOverride !== 60 && (
                <div className="flex-1"><Slider id="wi-retire" label="Retire at" value={wi.retireAtOverride} min={45} max={anyAirline ? FAA_RETIREMENT_AGE : 75} step={1} format={(v) => `${v}`} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v; })} /></div>
              )}
            </div>
            {anyLadder && (
              <div className="rounded-md border border-line-2 p-3">
                <Toggle id="gs-on" checked={wi.gradSchool.enabled} onChange={(v) => update((s) => { s.whatIf.gradSchool.enabled = v; })} label="Grad school" description="Pause income, add tuition, then re-enter at a higher level (occupation paths)" />
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
            )}
          </div>
        </Panel>
  );
  const headerBlock = (
    <>
        {activePath && activePath.kind === 'airline' ? (
          <AirlineHeader path={activePath} state={state} advisor={advisor} rateNow={derived?.active.rows[Math.max(0, derived.active.firstIncomeYearIndex)]?.airline} />
        ) : activePath && (
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
    </>
  );
  const results = (
    <>
        {error ? <EngineUnavailable error={advisor ? error : undefined} /> : derived ? (
          <>
            <Panel title={pilot ? 'Navigation display · career route' : anyAirline ? 'Career route comparison' : 'Career ladder comparison'} subtitle={pilot ? <span className="ml-auto">Click a route to make it the active flight plan · pay in {basis === 'today' ? "today's $" : 'nominal $'}</span> : undefined}>
              <LadderChart paths={derived.paths} activeId={state.activePathId} startAge={state.profile.age} retirementAge={retirementAge} />
              {!pilot && <div className="mt-2">
                <SalaryChart paths={derived.paths} activeId={state.activePathId} basis={basis} inflation={state.assumptions.inflation} retirementAge={retirementAge} />
              </div>}
              <ul className="mt-2 flex flex-wrap gap-3 text-xxs text-ink-3">
                {derived.paths.map((p, i) => <li key={p.pathId} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: p.pathId === state.activePathId ? theme.rec : theme.paths[i % 4] }} aria-hidden />{p.name}{p.pathId === state.activePathId ? ' (active)' : ''}</li>)}
              </ul>
            </Panel>
            {pilot && (
              <div className="grid gap-4 lg:grid-cols-12">
                <Panel className="lg:col-span-7" title={`Annual gross pay by age · ${basis === 'today' ? "today's $" : 'nominal $'}`}>
                  <SalaryChart paths={derived.paths} activeId={state.activePathId} basis={basis} inflation={state.assumptions.inflation} retirementAge={retirementAge} />
                </Panel>
                <Panel className="lg:col-span-5" title={`Career earnings vs. retirement (P50) · ${basis === 'today' ? "today's $" : 'nominal $'}`}>
                  <EarningsBars paths={derived.paths} activeId={state.activePathId} basis={basis} inflation={state.assumptions.inflation} retirementAge={retirementAge} startAge={state.profile.age} />
                </Panel>
              </div>
            )}
            <Panel title="Comparison">
              <Table caption="Career path comparison">
                <thead>
                  <tr>
                    <th className={th}>Metric</th>
                    {derived.paths.map((p) => <th key={p.pathId} className={cx(thNum, '!whitespace-normal', p.pathId === state.activePathId && 'text-rec')}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Starting pay', (p: typeof derived.paths[number]) => fmtMoney(toBasis(p.startingSalary, Math.max(0, p.firstIncomeYearIndex), state.assumptions.inflation, basis))],
                    ['Peak pay', (p: typeof derived.paths[number]) => fmtMoney(p.rows.reduce((m, r) => Math.max(m, toBasis(r.wages, r.yearIndex, state.assumptions.inflation, basis)), 0))],
                    ['Lifetime earnings', (p: typeof derived.paths[number]) => fmtCompact(p.rows.reduce((s, r) => s + toBasis(r.wages + r.bonus + r.equityComp, r.yearIndex, state.assumptions.inflation, basis), 0))],
                    ...(anyAirline ? [['Company retirement money', (p: typeof derived.paths[number]) => fmtCompact(p.rows.reduce((s, r) => s + toBasis(r.employer401k + r.employerCashBalance + r.cashInLieu, r.yearIndex, state.assumptions.inflation, basis), 0))] as const] : []),
                    ['Net worth at retirement', (p: typeof derived.paths[number]) => fmtCompact(toBasis(p.netWorthAtRetirement, Math.max(0, retirementAge - state.profile.age), state.assumptions.inflation, basis))],
                    ['P(success)', (p: typeof derived.paths[number]) => (p.pathId === state.activePathId ? fmtPct(derived.mc.successProbability, 0) : '—')],
                    ['Debt-free age', (p: typeof derived.paths[number]) => (p.debtFreeAge == null ? (derived.debt.totalBalance ? 'Never' : 'Now') : String(p.debtFreeAge))],
                  ] as const).map(([label, fn]) => (
                    <tr key={label}>
                      <td className={`${td} whitespace-nowrap`}>{label}</td>
                      {derived.paths.map((p) => <td key={p.pathId} className={cx(tdNum, p.pathId === state.activePathId && 'font-medium')}>{fn(p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-xxs text-ink-3 mt-2">{basis === 'today' ? "Today's dollars" : 'Nominal dollars'}. P(success) runs for the active path only.{anyAirline ? ' Company retirement money = 401(k) contributions, cash balance credits and cash in lieu over the career.' : ''}</p>
            </Panel>
          </>
        ) : <Panel title="Career comparison"><p className="text-sm text-ink-3">Computing…</p></Panel>}
    </>
  );

  if (pilot) {
    // The original Flight Plan screen: navigation display across the top, pay and earnings charts, the comparison
    // table, then the route editors and what-ifs.
    return (
      <div className="flex flex-col gap-4">
        {headerBlock}
        {results}
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8 min-w-0">{pathsPanel}</div>
          <div className="lg:col-span-4 min-w-0">{whatIfPanel}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        {pathsPanel}
        {whatIfPanel}
      </div>

      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        {studentPanel}
        {headerBlock}
        {results}
      </div>
    </div>
  );
}

/** Active airline path: carriers, pay unit, company money and contract facts, with VERIFY tags in Advisor view. */
function AirlineHeader({ path, state, advisor, rateNow }: { path: CareerPath; state: ReturnType<typeof usePlanStore.getState>['state']; advisor: boolean; rateNow?: { id: string; seat?: string; fleet?: string; longevity?: number; rate?: number; caRateAsFo?: boolean } }) {
  const cfg = path.airline ?? defaultAirlineConfig();
  const pp = state.profile.pilot ?? defaultPilotProfile();
  const { regional, major } = resolveAirlines(cfg.pathId, pp.stage, pp.employer);
  const carriers = [regional, major].filter((x): x is NonNullable<typeof x> => !!x).map((id) => AIRLINES[id]);
  const payUnit = (u: string) => (u === 'TFP' ? 'per TFP' : u === 'salary' ? 'annual' : 'per hour');
  return (
    <div className="card px-4 py-3 text-xs flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium text-sm">{airlinePathName(cfg.pathId, pp.stage, pp.employer)}</span>
        {rateNow?.rate != null && <span>Rate now <span className="num">{AIRLINES[rateNow.id as keyof typeof AIRLINES]?.payUnit === 'salary' ? fmtMoney(rateNow.rate) : `$${rateNow.rate.toFixed(2)}`}</span> {payUnit(AIRLINES[rateNow.id as keyof typeof AIRLINES]?.payUnit ?? 'hour')}{rateNow.seat ? ` · ${rateNow.fleet === 'WB' ? 'widebody ' : ''}${rateNow.seat}${rateNow.caRateAsFo ? ' (CA rate)' : ''} yr ${rateNow.longevity}` : ''}</span>}
        <span className="text-ink-3">{pp.creditHours} credit hrs/mo</span>
      </div>
      {carriers.map((al) => (
        <div key={al.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-2 pt-2">
          <span className="font-medium">{al.name}</span>
          <Chip>{al.kind}</Chip>
          <span>Pay {payUnit(al.payUnit)}</span>
          <span className="inline-flex items-center gap-1">Company 401(k) <span className="num">{fmtPct(al.retirement.companyPct.value / 100, 0)}</span>{advisor && !al.retirement.companyPct.verified && <VerifyTag source={al.retirement.companyPct.source} asOf={al.retirement.companyPct.asOf} note={al.retirement.companyPct.note} url={al.retirement.companyPct.url} />}</span>
          {al.retirement.mbcbPct && al.id !== 'fedex' && <span className="inline-flex items-center gap-1">MBCB <span className="num">{fmtPct(al.retirement.mbcbPct.value / 100, 0)}</span>{advisor && !al.retirement.mbcbPct.verified && <VerifyTag source={al.retirement.mbcbPct.source} asOf={al.retirement.mbcbPct.asOf} />}</span>}
          {(al.kind === 'major' || al.kind === 'cargo') && <span className="inline-flex items-center gap-1">Excess above §415(c): {cfg.excessHandlingOverride ?? al.retirement.excessHandling.value}{advisor && !cfg.excessHandlingOverride && !al.retirement.excessHandling.verified && <VerifyTag source={al.retirement.excessHandling.source} asOf={al.retirement.excessHandling.asOf} note={al.retirement.excessHandling.note} url={al.retirement.excessHandling.url} />}</span>}
          {(al.kind === 'major' || al.kind === 'cargo') && <span className="inline-flex items-center gap-1">Amendable {al.amendable.value}{advisor && !al.amendable.verified && <VerifyTag source={al.amendable.source} asOf={al.amendable.asOf} note={al.amendable.note} url={al.amendable.url} />}</span>}
          {al.raises.length > 0 && <span>Raises {al.raises.map((r) => `${r.effective.slice(0, 4)} +${r.pct.value}%`).join(', ')}</span>}
          {al.notes.length > 0 && <span className="w-full text-ink-3">{al.notes.join(' ')}</span>}
          {advisor && <span className="w-full"><SourceLine source={al.narrowbody.fo[11].source} asOf={al.narrowbody.fo[11].asOf} url={al.narrowbody.fo[11].url} verified={al.narrowbody.fo[11].verified} showVerify /></span>}
        </div>
      ))}
      <p className="text-xxs text-ink-3">Rates are nominal contract rates as of {AIRLINES_AS_OF}; interpolated steps and proxy scales carry VERIFY tags on the Data &amp; sources page.</p>
    </div>
  );
}

function PathEditor({ p, i, active, occOptions, metros, canRemove, pilotStage, pilotEmployer }: { p: CareerPath; i: number; active: boolean; occOptions: { value: string; label: string; group?: string }[]; metros: { value: string; label: string }[]; canRemove: boolean; pilotStage: ReturnType<typeof defaultPilotProfile>['stage']; pilotEmployer: ReturnType<typeof defaultPilotProfile>['employer'] }) {
  const update = usePlanStore((s) => s.update);
  const set = <K extends keyof CareerPath>(k: K, v: CareerPath[K]) => update((s) => { (s.careerPaths[i] as CareerPath)[k] = v; });
  const occ = OCCUPATIONS[p.occupationCode];
  const levels: LadderLevel[] = p.occupationCode === 'custom' ? p.customLevels ?? [] : occ?.levels ?? [];
  const color = active ? theme.rec : theme.paths[i % 4];
  const airline = p.kind === 'airline';
  const cfg = p.airline ?? defaultAirlineConfig();
  const setAir = <K extends keyof NonNullable<CareerPath['airline']>>(k: K, v: NonNullable<CareerPath['airline']>[K]) => update((s) => { const cp = s.careerPaths[i]; cp.airline = { ...(cp.airline ?? defaultAirlineConfig()), [k]: v }; });
  const defaults = cfg.pathId === 'stay' ? STAY_DEFAULTS : milestonesFor(cfg.pathId, {});
  const { regional, major } = airline ? resolveAirlines(cfg.pathId, pilotStage, pilotEmployer) : { regional: null, major: null };
  const involvesEnvoy = regional === 'envoy';
  const involvesFedex = major === 'fedex';
  const pathOptions = [...listAirlinePaths().map((d) => ({ value: d.id, label: d.label })), { value: 'stay', label: pilotEmployer === 'none' ? 'Stay at a typical regional' : `Stay at ${AIRLINES[pilotEmployer].name}` }];
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
        <Field label="Kind" htmlFor={`cp-kind-${p.id}`} help="Airline paths follow seat and longevity pay scales; occupation paths follow a salary ladder.">
          <Select id={`cp-kind-${p.id}`} value={airline ? 'airline' : 'ladder'} onChange={(e) => update((s) => { const cp = s.careerPaths[i]; const kind = e.target.value as CareerKind; cp.kind = kind; if (kind === 'airline') { cp.airline = cp.airline ?? defaultAirlineConfig(); if (!s.profile.pilot) s.profile.pilot = defaultPilotProfile(); } })} options={[{ value: 'airline', label: 'Airline (seat & longevity)' }, { value: 'ladder', label: 'Occupation ladder' }]} />
        </Field>
        {airline ? (
          <>
            <Field label="Airline path" htmlFor={`cp-air-${p.id}`} help="Regional → major progression, or stay at the current employer.">
              <Select id={`cp-air-${p.id}`} value={cfg.pathId} onChange={(e) => update((s) => { const cp = s.careerPaths[i]; const pathId = e.target.value as AirlinePathChoice; cp.airline = { ...(cp.airline ?? defaultAirlineConfig()), pathId, milestones: {} }; if (!cp.name || /→|Stay/.test(cp.name) || /^Path \d/.test(cp.name)) cp.name = pathOptions.find((o) => o.value === pathId)?.label ?? cp.name; })} options={pathOptions} />
            </Field>
            <Field label="Profit sharing" htmlFor={`cp-ps-${p.id}`} help="Share of base pay in regional and major years."><NumberInput id={`cp-ps-${p.id}`} value={cfg.profitSharingPct} scale={100} digits={1} min={0} max={0.3} step={0.005} suffix="% of pay" onChange={(v) => setAir('profitSharingPct', v ?? 0)} /></Field>
            <Field label="Pay growth after contract" htmlFor={`cp-pg-${p.id}`} help="Nominal growth per year after the last dated contract raise."><NumberInput id={`cp-pg-${p.id}`} value={cfg.payGrowthAfterContract} scale={100} digits={1} min={0} max={0.1} step={0.005} suffix="%/yr" onChange={(v) => setAir('payGrowthAfterContract', v ?? 0.03)} /></Field>
            <Field label="§415(c) excess handling" htmlFor={`cp-ex-${p.id}`} help="What the carrier does with company money above the annual-additions cap; blank = the carrier's rule."><Select id={`cp-ex-${p.id}`} value={cfg.excessHandlingOverride ?? ''} onChange={(e) => setAir('excessHandlingOverride', (e.target.value || undefined) as ExcessHandling | undefined)} options={[{ value: '', label: "Carrier's rule" }, { value: 'cash', label: 'Taxable cash in lieu' }, { value: 'mbcb', label: 'Cash balance plan' }, { value: 'forfeit', label: 'Forfeited' }]} /></Field>
            {involvesEnvoy && <div className="sm:col-span-2"><Toggle id={`cp-envoy-${p.id}`} checked={cfg.envoyCaRateRule} onChange={(v) => setAir('envoyCaRateRule', v)} label="Envoy pays FOs at the captain rate after 750 hours" description="Applies from longevity year 2; switch off if it no longer applies to your hire date" /></div>}
            {involvesFedex && <Field label="FedEx retirement election" htmlFor={`cp-fdx-${p.id}`} help="Legacy pension or the market-based cash balance plan (from 2028). Pilots who join FedEx after June 2026 get the MBCB only."><Select id={`cp-fdx-${p.id}`} value={cfg.fedexOption} onChange={(e) => setAir('fedexOption', e.target.value as 'legacy' | 'mbcb')} options={[{ value: 'legacy', label: 'Legacy pension (default)' }, { value: 'mbcb', label: 'Switch to MBCB in 2028' }]} /></Field>}
          </>
        ) : (
          <>
            <Field label="Occupation" htmlFor={`cp-occ-${p.id}`}>
              <Select id={`cp-occ-${p.id}`} value={p.occupationCode} onChange={(e) => update((s) => { const cp = s.careerPaths[i]; cp.occupationCode = e.target.value; cp.startLevelIndex = 0; cp.yearsOverrides = {}; if (e.target.value === 'custom' && !cp.customLevels?.length) cp.customLevels = [customLevel('Entry', 2, 60000), customLevel('Mid', 3, 80000), customLevel('Senior', 99, 105000)]; })} options={occOptions.some((o) => o.value === p.occupationCode) ? occOptions : [{ value: p.occupationCode, label: `${p.occupationCode} (no data)`, group: 'Missing' }, ...occOptions]} />
            </Field>
            <Field label="Metro" htmlFor={`cp-metro-${p.id}`}><Select id={`cp-metro-${p.id}`} value={p.metro} onChange={(e) => set('metro', e.target.value)} options={metros} /></Field>
            <Field label="Track" htmlFor={`cp-track-${p.id}`} help="Where in the pay band you land: low = 25th, mid = median, high = 75th percentile."><Select id={`cp-track-${p.id}`} value={p.track} onChange={(e) => set('track', e.target.value as Track)} options={[{ value: 'low', label: 'Low (p25)' }, { value: 'mid', label: 'Mid (p50)' }, { value: 'high', label: 'High (p75)' }]} /></Field>
            <Field label="Start level" htmlFor={`cp-start-${p.id}`}><Select id={`cp-start-${p.id}`} value={String(p.startLevelIndex)} onChange={(e) => set('startLevelIndex', Number(e.target.value))} options={levels.length ? levels.map((l, li) => ({ value: String(li), label: `${li + 1}. ${l.title}` })) : [{ value: '0', label: '1. Entry' }]} /></Field>
            <Field label="Raise within level" help="Nominal annual raise inside a level (inflation plus merit). Promotions add the jump between level pay bands." htmlFor={`cp-merit-${p.id}`}><NumberInput id={`cp-merit-${p.id}`} value={p.meritRaise} scale={100} digits={1} min={0} max={0.15} step={0.005} suffix="%/yr" onChange={(v) => set('meritRaise', v ?? 0)} /></Field>
            <Field label="Bonus override" htmlFor={`cp-bonus-${p.id}`}><NumberInput id={`cp-bonus-${p.id}`} value={p.bonusPctOverride} allowEmpty placeholder="level default" scale={100} min={0} max={1} step={0.01} suffix="%" onChange={(v) => set('bonusPctOverride', v)} /></Field>
            <Field label="Starts in" htmlFor={`cp-offset-${p.id}`} help="Years until this path starts paying; 0 = already working."><NumberInput id={`cp-offset-${p.id}`} value={p.startYearOffset} min={0} max={10} step={1} suffix="yrs" onChange={(v) => set('startYearOffset', v ?? 0)} /></Field>
            <Field label="Income before start" htmlFor={`cp-pre-${p.id}`}><NumberInput id={`cp-pre-${p.id}`} value={p.preStartIncome} min={0} max={500000} step={1000} prefix="$" suffix="/yr" onChange={(v) => set('preStartIncome', v ?? 0)} /></Field>
            <Field label="Industry drift" htmlFor={`cp-drift-${p.id}`} help="Extra real wage growth beyond merit raises."><NumberInput id={`cp-drift-${p.id}`} value={p.industryDrift} scale={100} digits={1} min={-0.05} max={0.05} step={0.005} suffix="%/yr" onChange={(v) => set('industryDrift', v ?? 0)} /></Field>
          </>
        )}
      </div>
      {airline && (
        <div className="mt-3">
          <div className="label-caps mb-1">Milestones (years)</div>
          <div className="grid gap-2 grid-cols-1 xl:grid-cols-2">
            {MILESTONE_FIELDS.filter((m) => {
              if (m.key === 'toRegional') return pilotStage === 'student' || pilotStage === 'cfi';
              if (m.key === 'regionalCaUpgrade') return !!regional && pilotStage !== 'regional_ca';
              if (m.key === 'toMajor') return !!regional && !!major;
              if (m.key === 'majorCaUpgrade') return !!major && !(pilotStage === 'major_ca' || pilotStage === 'cargo_ca');
              if (m.key === 'widebody') return !!major && !!AIRLINES[major].widebody;
              return true;
            }).map((m) => (
              <Field key={m.key} label={m.label} htmlFor={`ms-${p.id}-${m.key}`} help={m.help}>
                <NumberInput id={`ms-${p.id}-${m.key}`} value={cfg.milestones[m.key] ?? defaults[m.key]} min={0} max={40} step={1} suffix="yrs" onChange={(v) => update((s) => { const cp = s.careerPaths[i]; const air = { ...(cp.airline ?? defaultAirlineConfig()) }; const ms = { ...air.milestones }; if (v == null || v === defaults[m.key]) delete ms[m.key]; else ms[m.key] = v; cp.airline = { ...air, milestones: ms }; })} />
              </Field>
            ))}
          </div>
        </div>
      )}
      {!airline && levels.length > 0 && (
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
            <div className="grid gap-2 grid-cols-1 xl:grid-cols-2">
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
