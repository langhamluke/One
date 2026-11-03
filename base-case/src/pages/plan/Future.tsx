import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { usePrefs } from '@/state/prefs';
import { useAdvisorView } from './PlanLayout';
import { Button, Chip, Panel, Readout, Slider, Stat, Table, Toggle, cx, td, tdNum, th, thNum } from '@/components/ui';
import { ScenarioCone } from '@/components/charts/ScenarioCone';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { basisLabel, fmtCompact, fmtMoney, fmtPct, toBasis } from '@/lib/format';

export function FuturePage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error, preview } = useDerived();
  const advisor = useAdvisorView();
  const { basis, tables, toggleTable } = usePrefs();
  const wi = state.whatIf;
  const showTable = !!tables['future.years'];

  if (error) return <EngineUnavailable error={advisor ? error : undefined} />;
  if (!derived) return <Panel title="Future"><p className="text-sm text-ink-3">Computing…</p></Panel>;

  const ps = derived.mc.successProbability;
  const tone = ps >= 0.9 ? 'ok' : ps >= 0.75 ? 'warn' : 'danger';
  const barColor = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger';
  const infl = state.assumptions.inflation;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        <Panel title="Scenario cone" subtitle={`${basisLabel(basis)} · ${derived.mc.sims} sims${preview ? ' (preview)' : ''}`}>
          <ScenarioCone mc={derived.mc} basis={basis} inflation={infl} />
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat label="P10 at retirement" value={fmtCompact(basis === 'today' ? derived.mc.p10Real[derived.mc.ages.indexOf(derived.mc.retirementAge)] : derived.mc.p10[derived.mc.ages.indexOf(derived.mc.retirementAge)])} />
            <Stat label="P50 at retirement" value={fmtCompact(basis === 'today' ? derived.mc.medianAtRetirementReal : derived.mc.medianAtRetirement)} />
            <Stat label="P90 at retirement" value={fmtCompact(basis === 'today' ? derived.mc.p90Real[derived.mc.ages.indexOf(derived.mc.retirementAge)] : derived.mc.p90[derived.mc.ages.indexOf(derived.mc.retirementAge)])} />
          </div>
        </Panel>

        <Panel title="Year by year" actions={<Button size="sm" variant="ghost" aria-pressed={showTable} onClick={() => toggleTable('future.years')}>{showTable ? 'Hide table' : 'Show table'}</Button>}>
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
          ) : <p className="text-sm text-ink-3">Show the table to read every projection year for the active path ({derived.active.name}).</p>}
        </Panel>
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
