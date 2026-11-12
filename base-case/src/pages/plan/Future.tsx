import { Link } from 'react-router-dom';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { usePrefs } from '@/state/prefs';
import { useAdvisorView, useCockpit, useSprout } from './PlanLayout';
import { habitsProjection } from '@shared/lib/sprout';
import { Button, Chip, Field, NumberInput, Panel, Readout, Select, Slider, Stat, Table, Toggle, cx, td, tdNum, th, thNum } from '@/components/ui';
import { ScenarioCone } from '@/components/charts/ScenarioCone';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { theme } from '@/components/charts/common';
import { listAirlinePaths } from '@shared/data/airlines';
import { FAA_RETIREMENT_AGE } from '@shared/lib/airline';
import { basisLabel, fmtCompact, fmtMoney, fmtPct, toBasis } from '@/lib/format';

export function FuturePage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error, preview } = useDerived();
  const advisor = useAdvisorView();
  const cockpit = useCockpit();
  const sprout = useSprout();
  const { basis, tables, toggleTable } = usePrefs();
  const wi = state.whatIf;
  const showTable = !!tables['future.years'];

  if (error) return <EngineUnavailable error={advisor ? error : undefined} />;
  if (!derived) return <Panel title={cockpit ? 'Landing' : 'Future'}><p className="text-sm text-ink-3">Computing…</p></Panel>;

  const ps = derived.mc.successProbability;
  const tone = ps >= 0.9 ? 'ok' : ps >= 0.75 ? 'warn' : 'danger';
  const barColor = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger';
  const infl = state.assumptions.inflation;
  const retIdx = derived.mc.ages.indexOf(derived.mc.retirementAge);
  const real = basis === 'today';
  const at = (arr: number[]) => arr[retIdx] ?? 0;
  const p10 = real ? at(derived.mc.p10Real) : at(derived.mc.p10);
  const p50 = real ? derived.mc.medianAtRetirementReal : derived.mc.medianAtRetirement;
  const p90 = real ? at(derived.mc.p90Real) : at(derived.mc.p90);
  const a = state.assumptions;
  const anyAirline = state.careerPaths.some((p) => p.kind === 'airline');
  const airlinePaths = state.careerPaths.filter((p) => p.kind === 'airline');

  // Sprout "Meet you at 30": the engine's expected path at 30 (today's dollars), the simple habit arithmetic behind
  // it, the cost of waiting five years, and the same habit in a savings account. Educational, never a promise.
  const meetAge = state.profile.age < 30 ? 30 : state.profile.age + 10;
  const rowAt = derived.active.rows.find((r) => r.age === meetAge) ?? derived.active.rows[derived.active.rows.length - 1];
  const atMeet = rowAt ? toBasis(rowAt.investable + rowAt.balances.cash + rowAt.balances.goals, rowAt.yearIndex, infl, 'today') : 0;
  const monthlySaving = (state.savings.taxableContribution + state.savings.iraContribution) / 12;
  const habits = habitsProjection(state, monthlySaving, derived.active.rows[0]?.expectedReturn ?? 0.06, meetAge);
  const meetPanel = sprout ? (
    <Panel title={`Meet you at ${meetAge}`} subtitle={`today's dollars · ${basisLabel('today')}`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={`Savings at ${meetAge}`} value={fmtCompact(atMeet)} sub="expected path" />
        <Stat label="You put in" value={fmtCompact(habits.contributed)} sub={`${fmtMoney(habits.monthly)}/mo for ${habits.years} yrs`} />
        <Stat label="Growth does" value={fmtCompact(Math.max(0, habits.at - habits.contributed))} sub={`at ${fmtPct(derived.active.rows[0]?.expectedReturn ?? 0, 1)}/yr`} />
        <Stat label="Waiting 5 years costs" value={fmtCompact(habits.costOfWaiting)} sub={`${fmtCompact(habits.later)} if you start at ${state.profile.age + 5}`} />
      </div>
      <p className="text-xs text-ink-2 mt-3">The same {fmtMoney(habits.monthly)} a month in a savings account at {fmtPct(a.cashYield, 1)} would be about {fmtCompact(habits.atCashYield)}. The difference is what time and a diversified mix of investments can do; it is also where the ups and downs live, which is why emergency money and next year's tuition stay in savings.</p>
      <p className="text-xxs text-ink-3 mt-2">Hypothetical and educational, not a promise. Real returns vary year to year and can be negative for years at a time; the number above uses the plan's expected-return path and the inputs you entered. Sprout never holds or moves money.</p>
    </Panel>
  ) : null;

  const yearTable = (
    <Panel title="Year by year" subtitle={cockpit ? `${derived.active.name} · ${basisLabel(basis)}` : undefined} actions={<Button size="sm" variant="ghost" aria-pressed={showTable} onClick={() => toggleTable('future.years')}>{showTable ? 'Hide table' : 'Show detail'}</Button>}>
      {showTable ? (
        <Table caption={`Year-by-year projection for ${derived.active.name} in ${basisLabel(basis)}`} className="max-h-[480px] overflow-y-auto">
          <thead className="sticky top-0 bg-paper-2">
            <tr><th className={thNum}>Age</th><th className={th}>Stage</th><th className={thNum}>Wages</th><th className={thNum}>Take-home</th><th className={thNum}>Saved</th><th className={thNum}>Debt</th><th className={thNum}>Net worth</th></tr>
          </thead>
          <tbody>
            {derived.active.rows.map((r) => {
              const b = (v: number) => fmtMoney(toBasis(v, r.yearIndex, infl, basis));
              const saved = r.employeePretax401k + r.employeeRoth401k + r.hsaEmployee + r.iraContribution + r.taxableContribution + r.emergencyTopUp + r.goalFunding;
              return (
                <tr key={r.yearIndex} className={cx(r.age === derived.mc.retirementAge && 'bg-rec-soft')}>
                  <td className={tdNum}>{r.age}</td>
                  <td className={td}><span className="text-xs text-ink-3">{r.stage}{r.stage === 'working' && r.levelTitle ? ` · ${r.levelTitle}` : ''}</span></td>
                  <td className={tdNum}>{b(r.wages + r.bonus)}</td>
                  <td className={tdNum}>{b(r.takeHome)}</td>
                  <td className={tdNum}>{b(saved)}</td>
                  <td className={tdNum}>{b(r.debtBalance)}</td>
                  <td className={cx(tdNum, r.netWorth < 0 && 'text-danger')}>{b(r.netWorth)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : <p className="text-sm text-ink-3">{cockpit ? `Cumulative career earnings ${fmtCompact(derived.active.rows.reduce((s, r) => s + toBasis(r.wages + r.bonus, r.yearIndex, infl, basis), 0))} over ${derived.active.rows.filter((r) => r.stage !== 'retired').length} years. Show detail for every projection year.` : `Show the table to read every projection year for the active path (${derived.active.name}).`}</p>}
    </Panel>
  );

  if (cockpit) {
    // Original Landing screen: altitude tape (cone) with the four readouts above it, what-ifs and retirement income on the right.
    const retRow = derived.active.rows.find((r) => r.age === derived.mc.retirementAge - 1) ?? derived.active.rows[derived.active.rows.length - 1];
    const finalTakeHome = retRow ? toBasis(retRow.takeHome, retRow.yearIndex, infl, 'today') : 0;
    const need = derived.mc.targetIncomeReal;
    const ssAnnual = derived.ss.annualAtClaim;
    const grossedNeed = Math.max(0, need - ssAnnual) / (1 - a.taxGrossUp);
    const mix = (() => {
      const r = derived.active.rows.find((x) => x.age === derived.mc.retirementAge) ?? retRow;
      if (!r) return [] as { key: string; label: string; value: number }[];
      const f = (v: number) => toBasis(v, r.yearIndex, infl, basis);
      return [
        { key: 'preTax', label: 'Pre-tax 401(k)/IRA', value: f(r.balances.preTax) },
        { key: 'roth', label: 'Roth (401(k) + IRA)', value: f(r.balances.roth) },
        { key: 'taxable', label: 'Taxable brokerage', value: f(r.balances.taxable) },
        { key: 'hsa', label: 'HSA', value: f(r.balances.hsa) },
        { key: 'cash', label: 'Cash', value: f(r.balances.cash) },
      ].filter((x) => x.value > 0);
    })();
    const mixTotal = mix.reduce((s, x) => s + x.value, 0);
    const mixColors = ['uslc', 'ussmid', 'bonds', 'intl', 'cash'];
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-8" title={`Altitude tape · portfolio value by age · ${basisLabel(basis)}`} subtitle={<span className="ml-auto">{derived.mc.sims.toLocaleString('en-US')} simulations · seed {derived.mc.seed}{preview ? ' · preview' : ''}</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-line-2 pb-3 mb-3">
              <Readout label={`P10 at ${derived.mc.retirementAge}`} value={fmtCompact(p10)} hint="Tenth percentile of simulated portfolio values at retirement: nine in ten runs end higher." />
              <div><Readout label={`P50 at ${derived.mc.retirementAge}`} value={<span className="text-rec">{fmtCompact(p50)}</span>} hint="Median simulated portfolio at retirement: the flight plan." /><div className="text-[11px] text-ink-3 num">{real ? `${fmtCompact(derived.mc.medianAtRetirement)} nominal` : `${fmtCompact(derived.mc.medianAtRetirementReal)} today's $`}</div></div>
              <Readout label={`P90 at ${derived.mc.retirementAge}`} value={fmtCompact(p90)} hint="Ninetieth percentile: one in ten runs ends higher." />
              <div><Readout label="P(success)" value={fmtPct(ps, 0)} tone={tone} hint="Share of simulations that fund the income target to the plan-to age." /><div className="text-[11px] text-ink-3">income funded to {a.lifeExpectancy}</div></div>
            </div>
            <ScenarioCone mc={derived.mc} basis={basis} inflation={infl} height={440} />
            <p className="mt-3 text-xxs text-ink-3">Hypothetical outcomes from an interactive analysis tool, not a forecast. Results vary with each use and over time as inputs, data and assumptions change. <Link to="/methodology" className="underline">Methodology and key assumptions</Link>.</p>
          </Panel>

          <div className="lg:col-span-4 flex flex-col gap-4 min-w-0">
            <Panel title="What if" subtitle={<span className="ml-auto">instant recompute</span>}>
              <div className="flex flex-col gap-4">
                {anyAirline && (
                  <>
                    <Slider id="fu-upgrade" label="Captain upgrade later by" value={wi.upgradeDelayYears} min={0} max={5} step={1} format={(v) => `${v} yr`} onChange={(v) => update((s) => { s.whatIf.upgradeDelayYears = v; })} />
                    <Slider id="fu-furlough" label="Furlough" value={wi.furloughYears} min={0} max={3} step={1} format={(v) => `${v} yr`} help="Zero-pay years right after joining the major; seniority frozen, longevity resumes on recall." onChange={(v) => update((s) => { s.whatIf.furloughYears = v; })} />
                  </>
                )}
                <Slider id="fu-extra" label="Raise deferral by" value={wi.extraSavingsRatePct} min={0} max={0.3} step={0.01} format={(v) => `+${Math.round(v * 100)}%`} onChange={(v) => update((s) => { s.whatIf.extraSavingsRatePct = v; })} />
                <Slider id="fu-cut" label="Spending cut" value={wi.spendingCut} min={0} max={Math.max(1000, Math.round(state.profile.livingExpenses * 0.5 / 500) * 500)} step={500} format={(v) => `${fmtMoney(v)}/yr`} onChange={(v) => update((s) => { s.whatIf.spendingCut = v; })} />
                <Toggle id="fu-retire60" checked={wi.retireAtOverride === 60} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v ? 60 : undefined; })} label="Retire at 60" description={anyAirline ? `Five years before the FAA limit of ${FAA_RETIREMENT_AGE}` : undefined} />
                {airlinePaths.length > 1 && (
                  <Field label="Airline path" htmlFor="fu-path">
                    <Select id="fu-path" value={state.activePathId} onChange={(e) => update((s) => { s.activePathId = e.target.value; })} options={state.careerPaths.map((p) => ({ value: p.id, label: p.kind === 'airline' ? (listAirlinePaths().find((d) => d.id === p.airline?.pathId)?.label ?? p.name) : p.name }))} />
                  </Field>
                )}
              </div>
            </Panel>

            <Panel title="Retirement income">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target % of take-home" htmlFor="ri-repl" help="Retirement spending as a share of final-year take-home pay."><NumberInput id="ri-repl" value={a.incomeReplacement} scale={100} min={0.2} max={1.2} step={0.05} suffix="%" onChange={(v) => update((s) => { s.assumptions.incomeReplacement = v ?? 0.7; })} /></Field>
                <Field label="Social Security / yr" htmlFor="ri-ss" help="Annual benefit in today's dollars; blank uses the estimate from simulated earnings."><NumberInput id="ri-ss" value={a.ssOverrideAnnual} allowEmpty placeholder={fmtMoney(derived.ss.annualAtClaim)} min={0} max={200000} step={500} prefix="$" onChange={(v) => update((s) => { s.assumptions.ssOverrideAnnual = v; })} /></Field>
                <Field label="SS start age" htmlFor="ri-ssage"><NumberInput id="ri-ssage" value={a.ssClaimAge} min={62} max={70} step={1} onChange={(v) => update((s) => { s.assumptions.ssClaimAge = v ?? 67; })} /></Field>
                <Field label="Plan to age" htmlFor="ri-life"><NumberInput id="ri-life" value={a.lifeExpectancy} min={70} max={110} step={1} onChange={(v) => update((s) => { s.assumptions.lifeExpectancy = v ?? 95; })} /></Field>
                <Field label="Tax on withdrawals" htmlFor="ri-tax" help="Gross-up applied to pre-tax withdrawals."><NumberInput id="ri-tax" value={a.taxGrossUp} scale={100} min={0} max={0.5} step={0.01} suffix="%" onChange={(v) => update((s) => { s.assumptions.taxGrossUp = v ?? 0.15; })} /></Field>
                <Field label="Simulations" htmlFor="ri-sims"><NumberInput id="ri-sims" value={a.mcSims} min={100} max={5000} step={100} onChange={(v) => update((s) => { s.assumptions.mcSims = v ?? 1000; })} /></Field>
                <Field label="Random seed" htmlFor="ri-seed" className="col-span-2"><NumberInput id="ri-seed" value={a.seed} min={0} max={2_147_483_647} step={1} onChange={(v) => update((s) => { s.assumptions.seed = v ?? 1; })} /></Field>
              </div>
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs border-t border-line-2 pt-3">
                <dt className="text-ink-2">Final-year take-home</dt><dd className="num text-right">{fmtCompact(finalTakeHome)}</dd>
                <dt className="text-ink-2">Target income ({fmtPct(a.incomeReplacement, 0)})</dt><dd className="num text-right text-rec">{fmtCompact(need)}</dd>
                <dt className="text-ink-2">Social Security from {derived.ss.claimAge}</dt><dd className="num text-right">− {fmtCompact(ssAnnual)}</dd>
                <dt className="text-ink-2">Portfolio need, yr 1 (grossed {fmtPct(a.taxGrossUp, 0)})</dt><dd className="num text-right">{fmtCompact(grossedNeed)}</dd>
                <dt className="text-ink-2">4% of P50 balance</dt><dd className="num text-right text-rec">{fmtCompact(derived.mc.medianAtRetirementReal * 0.04)}</dd>
              </dl>
              <p className="text-[11px] text-ink-3 mt-2">All values in today's dollars. Social Security {derived.ss.method === 'override' ? 'entered above' : derived.ss.method === 'estimated' ? 'estimated from simulated earnings' : 'not estimated'}{derived.ss.method !== 'override' && <Chip tone="neutral" className="ml-1">{derived.ss.method}</Chip>}.</p>
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`Account mix at ${derived.mc.retirementAge} · expected case · ${basisLabel(basis)}`}>
            {mix.length === 0 ? <p className="text-sm text-ink-3">No balances in the expected case.</p> : (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-sm" aria-hidden>
                  {mix.map((x, i) => <span key={x.key} style={{ width: `${(x.value / mixTotal) * 100}%`, background: theme.asset(mixColors[i % mixColors.length]) }} />)}
                </div>
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {mix.map((x, i) => (
                    <li key={x.key} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: theme.asset(mixColors[i % mixColors.length]) }} aria-hidden />
                      <span className="flex-1 text-ink-2">{x.label}</span>
                      <span className="num">{fmtCompact(x.value)}</span>
                      <span className="num w-10 text-right text-ink-3">{fmtPct(x.value / mixTotal, 0)}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 border-t border-line-2 pt-1 mt-1"><span className="flex-1 text-ink-2">Total (expected-return case)</span><span className="num">{fmtCompact(mixTotal)}</span><span className="w-10" /></li>
                </ul>
                <p className="text-[11px] text-ink-3 mt-2">Pre-tax dollars are taxed on withdrawal; Roth and HSA (for medical) are not. Tax diversification gives flexibility in retirement.</p>
              </>
            )}
          </Panel>
          <Panel title="Reading the projection">
            <div className="flex flex-col gap-2 text-sm">
              <p><span className="text-rec">Cone:</span> 80% of simulated outcomes fall between P10 and P90. The magenta median is the flight plan, not a promise.</p>
              <p><span className="text-rec">Success</span> means the target income (less Social Security) is funded every year to age {a.lifeExpectancy}.</p>
              <p><span className="text-rec">Contributions</span> follow the career simulation; unsaved surplus cash flow is assumed spent.</p>
              <p>Returns are lognormal and correlated across asset classes; capital-market assumptions are illustrative.</p>
            </div>
            <div className="mt-3 h-2 rounded-pill bg-line-2 overflow-hidden" role="meter" aria-valuenow={Math.round(ps * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Probability of success">
              <div className={cx('h-full', barColor)} style={{ width: `${Math.round(ps * 100)}%` }} />
            </div>
            <div className="flex justify-between text-xxs text-ink-3 num mt-1"><span>0</span><span>75</span><span>90</span><span>100</span></div>
          </Panel>
        </div>
        {yearTable}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        {meetPanel}
        <Panel title={sprout ? `All the way to ${derived.mc.retirementAge}` : 'Scenario cone'} subtitle={`${basisLabel(basis)} · ${derived.mc.sims} sims${preview ? ' (preview)' : ''}`}>
          <ScenarioCone mc={derived.mc} basis={basis} inflation={infl} />
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat label="P10 at retirement" value={fmtCompact(p10)} />
            <Stat label="P50 at retirement" value={fmtCompact(p50)} />
            <Stat label="P90 at retirement" value={fmtCompact(p90)} />
          </div>
          <p className="mt-3 text-xxs text-ink-3">Hypothetical outcomes from an interactive analysis tool, not a forecast. Results vary with each use and over time as inputs, data and assumptions change. <Link to="/methodology" className="underline">Methodology and key assumptions</Link>.</p>
        </Panel>
        {yearTable}
      </div>

      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        <Panel title="Probability of success">
          <Readout label="P(success)" value={fmtPct(ps, 0)} size="lg" tone={tone} hint="Share of simulations in which the portfolio funds the retirement income target through life expectancy." />
          <div className="mt-2 h-2.5 rounded-pill bg-line-2 overflow-hidden" role="meter" aria-valuenow={Math.round(ps * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Probability of success">
            <div className={cx('h-full', barColor)} style={{ width: `${Math.round(ps * 100)}%` }} />
          </div>
          <div className="flex justify-between text-xxs text-ink-3 num mt-1"><span>0</span><span>75</span><span>90</span><span>100</span></div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Retirement income target" value={fmtMoney(derived.mc.targetIncomeReal)} sub="per year, today's $" />
            <Stat label="Retire at" value={derived.mc.retirementAge} sub={`to age ${state.assumptions.lifeExpectancy}`} />
          </div>
          <div className="mt-3 text-xs text-ink-2 flex flex-wrap items-center gap-2">
            <span>Social Security: <span className="num">{fmtMoney(derived.ss.annualAtClaim)}</span>/yr at {derived.ss.claimAge}</span>
            <Chip tone={derived.ss.method === 'override' ? 'edit' : derived.ss.method === 'estimated' ? 'neutral' : 'warn'}>{derived.ss.method}</Chip>
          </div>
          <p className="text-xxs text-ink-3 mt-1">{derived.ss.note}</p>
        </Panel>

        <Panel title="What if" subtitle="live recompute">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Toggle id="fu-retire-on" checked={wi.retireAtOverride != null} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v ? s.profile.retirementAge : undefined; })} label="Retire at" />
              <div className="flex-1">{wi.retireAtOverride != null && <Slider id="fu-retire" label="Age" value={wi.retireAtOverride} min={45} max={75} step={1} onChange={(v) => update((s) => { s.whatIf.retireAtOverride = v; })} />}</div>
            </div>
            <Slider id="fu-extra" label="Extra savings rate" value={wi.extraSavingsRatePct} min={0} max={0.3} step={0.01} format={(v) => fmtPct(v, 0)} onChange={(v) => update((s) => { s.whatIf.extraSavingsRatePct = v; })} />
            <Slider id="fu-cut" label="Spending cut" value={wi.spendingCut} min={0} max={Math.max(1000, Math.round(state.profile.livingExpenses * 0.5 / 500) * 500)} step={500} format={(v) => `${fmtMoney(v)}/yr`} onChange={(v) => update((s) => { s.whatIf.spendingCut = v; })} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
