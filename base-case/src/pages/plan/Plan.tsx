import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { useAdvisorView, useCockpit } from './PlanLayout';
import { Chip, Field, NumberInput, Panel, Slider, SourceLine, Stat, Table, VerifyTag, cx, td, tdNum, th, thNum } from '@/components/ui';
import { AllocationDonut } from '@/components/charts/AllocationDonut';
import { GlideChart } from '@/components/charts/GlideChart';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { PlaybookList } from '@/components/PlaybookList';
import { AlertLedger, EicasCounts } from '@/components/AlertLedger';
import { MODEL_EQUITY } from '@shared/data/models';
import { LIMITS_2026, IRS_YEAR, LIMITS_2027_PUBLISHED } from '@shared/data/irs2026';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, type HorizonCategory, type RiskCategory } from '@shared/lib/types';
import { fmtAge, fmtMoney, fmtPct } from '@/lib/format';

const RISKS: RiskCategory[] = ['Conservative', 'Moderate', 'Assertive', 'Aggressive'];
const HORIZONS: HorizonCategory[] = ['Short-term', 'Intermediate', 'Long-term'];

export function PlanPage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error } = useDerived();
  const advisor = useAdvisorView();
  const cockpit = useCockpit();
  const a = state.assumptions;
  const retirementAge = state.whatIf.retireAtOverride ?? state.profile.retirementAge;

  if (error) return <EngineUnavailable error={advisor ? error : undefined} />;
  if (!derived) return <Panel title="Plan"><p className="text-sm text-ink-3">Computing…</p></Panel>;

  const yr1 = derived.active.rows[derived.active.firstIncomeYearIndex] ?? derived.active.rows[0];
  const limits = [
    { label: `401(k) deferral limit (${IRS_YEAR})`, s: LIMITS_2026.electiveDeferral, capped: yr1?.limits.deferralCapped },
    { label: 'Catch-up (50+)', s: LIMITS_2026.catchUp50 },
    { label: 'Super catch-up (60–63)', s: LIMITS_2026.catchUp60to63 },
    { label: '§415(c) annual additions', s: LIMITS_2026.annualAdditions415c, capped: yr1?.limits.s415cCapped },
    { label: 'IRA limit', s: LIMITS_2026.ira, note: yr1 ? `Roth IRA: ${yr1.limits.rothIra}${yr1.limits.rothIra === 'partial' ? ` (${fmtMoney(yr1.limits.rothIraAllowed)})` : ''}` : undefined },
    { label: 'HSA (self)', s: LIMITS_2026.hsa.self },
    { label: 'HSA (family)', s: LIMITS_2026.hsa.family },
  ];

  const allocPanel = (
        <Panel title={cockpit ? "Recommended allocation · today" : "Model allocation"} subtitle={<span className={cockpit ? "ml-auto text-rec" : undefined}>{derived.profile.risk} · {derived.profile.horizon}</span>}>
          <AllocationDonut allocation={derived.allocation} equity={derived.modelEquity} />
          <div className="mt-4">
            <div className="label-caps mb-1">Model matrix (equity %)</div>
            <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-px bg-line-2 rounded overflow-hidden text-xxs">
              <div className="bg-paper-2 p-1" />
              {HORIZONS.map((h) => <div key={h} className="bg-paper-2 p-1 text-center text-ink-3 truncate">{h}</div>)}
              {RISKS.map((r) => (
                <div key={r} className="contents">
                  <div className="bg-paper-2 p-1 text-ink-3 truncate">{r}</div>
                  {HORIZONS.map((h) => {
                    const hit = r === derived.profile.risk && h === derived.profile.horizon;
                    return <div key={h} className={cx('p-1 text-center num', hit ? (cockpit ? 'bg-paper-2 text-rec ring-1 ring-inset ring-rec' : 'bg-rec text-white font-medium') : 'bg-paper-2')} aria-current={hit ? 'true' : undefined}>{Math.round(MODEL_EQUITY[r][h] * 100)}</div>;
                  })}
                </div>
              ))}
            </div>
            {a.equityOverride != null && <p className="text-xxs text-warn mt-1">Equity override in effect: {fmtPct(a.equityOverride, 0)}.</p>}
          </div>
        </Panel>
  );
  const glidePanel = (
        <Panel title={cockpit ? "Glide path · equity by age" : "Glide path"} subtitle={cockpit ? <span className="ml-auto"><span className="num text-ink">{fmtPct(derived.modelEquity, 0)}</span> now → <span className="num text-rec">{fmtPct(a.landingEquity, 0)}</span> at {retirementAge}</span> : undefined}>
          <GlideChart glidePath={derived.glidePath} retirementAge={retirementAge} height={cockpit ? 240 : 160} />
          <div className="mt-3">
            <Slider id="gl-landing" label="Landing equity at retirement" value={a.landingEquity} min={0.1} max={0.9} step={0.05} format={(v) => fmtPct(v, 0)} onChange={(v) => update((s) => { s.assumptions.landingEquity = v; })} help="Equity share the portfolio glides to by retirement." />
          </div>
        </Panel>
  );
  const emergencyPanel = (
        <Panel title="Emergency fund">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Target" value={fmtMoney(derived.emergency.target)} sub={`${derived.emergency.monthsTarget} months`} />
            <Stat label="Current" value={fmtMoney(derived.emergency.current)} sub={`${derived.emergency.monthsCovered.toFixed(1)} months`} />
            <Stat label="Status" value={<Chip tone={derived.emergency.monthsCovered >= derived.emergency.monthsTarget ? 'ok' : derived.emergency.monthsCovered >= derived.emergency.monthsTarget / 2 ? 'warn' : 'danger'}>{derived.emergency.monthsCovered >= derived.emergency.monthsTarget ? 'Funded' : 'Short'}</Chip>} />
          </div>
          <div className="mt-2 h-1.5 rounded-pill bg-line-2 overflow-hidden" aria-hidden><div className="h-full bg-rec" style={{ width: `${Math.min(100, (derived.emergency.current / Math.max(1, derived.emergency.target)) * 100)}%` }} /></div>
          <p className="text-xs text-ink-3 mt-2">{derived.emergency.reason}</p>
        </Panel>
  );
  const debtPanel = (
        <Panel title="Debt">
          {derived.debt.totalBalance <= 0 && state.debts.length === 0 ? <p className="text-sm text-ink-3">No debts entered.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Total balance" value={fmtMoney(derived.debt.totalBalance)} />
              <Stat label="Monthly payment" value={fmtMoney(derived.debt.monthlyPayment)} />
              <Stat label="Highest rate" value={fmtPct(derived.debt.highestRate, 2)} sub={derived.debt.highInterestBalance > 0 ? `${fmtMoney(derived.debt.highInterestBalance)} high-interest` : undefined} />
              <Stat label="Payoff age" value={fmtAge(derived.debt.payoffAge)} />
              <Stat label="Total interest" value={fmtMoney(derived.debt.totalInterest)} />
              <Stat label="Forgiven" value={fmtMoney(derived.debt.forgivenTotal)} sub={derived.debt.studentLoanBalance > 0 ? `${fmtMoney(derived.debt.studentLoanBalance)} student loans` : undefined} />
            </div>
          )}
        </Panel>
  );
  const assumptionsPanel = (
    <>
        {advisor && (
          <Panel title="Assumptions" subtitle="advisor" collapseKey="plan.assumptions">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Inflation" htmlFor="as-infl"><NumberInput id="as-infl" value={a.inflation} scale={100} digits={2} min={0} max={0.1} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.assumptions.inflation = v ?? 0.025; })} /></Field>
              <Field label="Indexing (brackets/limits)" htmlFor="as-idx"><NumberInput id="as-idx" value={a.indexing} allowEmpty placeholder="= inflation" scale={100} digits={2} min={0} max={0.1} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.assumptions.indexing = v; })} /></Field>
              <Field label="Glide years before retirement" htmlFor="as-glide"><NumberInput id="as-glide" value={a.glideYears} min={0} max={45} step={1} suffix="yrs" onChange={(v) => update((s) => { s.assumptions.glideYears = v ?? 25; })} /></Field>
              <Field label="Landing equity" htmlFor="as-land"><NumberInput id="as-land" value={a.landingEquity} scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.assumptions.landingEquity = v ?? 0.45; })} /></Field>
              <Field label="Equity override" htmlFor="as-eq" help="Bypasses the model matrix."><NumberInput id="as-eq" value={a.equityOverride} allowEmpty placeholder="model" scale={100} min={0} max={1} step={0.05} suffix="%" onChange={(v) => update((s) => { s.assumptions.equityOverride = v; })} /></Field>
              <Field label="Monte Carlo sims" htmlFor="as-sims"><NumberInput id="as-sims" value={a.mcSims} min={100} max={5000} step={100} onChange={(v) => update((s) => { s.assumptions.mcSims = v ?? 1000; })} /></Field>
              <Field label="Seed" htmlFor="as-seed"><NumberInput id="as-seed" value={a.seed} min={0} max={2_147_483_647} step={1} onChange={(v) => update((s) => { s.assumptions.seed = v ?? 1; })} /></Field>
              <Field label="Income replacement" htmlFor="as-repl"><NumberInput id="as-repl" value={a.incomeReplacement} scale={100} min={0.2} max={1.2} step={0.05} suffix="%" onChange={(v) => update((s) => { s.assumptions.incomeReplacement = v ?? 0.7; })} /></Field>
              <Field label="Retirement spending override" htmlFor="as-rso"><NumberInput id="as-rso" value={a.retirementSpendingOverride} allowEmpty placeholder="replacement" min={0} max={2_000_000} step={1000} prefix="$" suffix="/yr" onChange={(v) => update((s) => { s.assumptions.retirementSpendingOverride = v; })} /></Field>
              <Field label="SS claim age" htmlFor="as-ssage"><NumberInput id="as-ssage" value={a.ssClaimAge} min={62} max={70} step={1} onChange={(v) => update((s) => { s.assumptions.ssClaimAge = v ?? 67; })} /></Field>
              <Field label="SS override (annual, today's $)" htmlFor="as-ssov"><NumberInput id="as-ssov" value={a.ssOverrideAnnual} allowEmpty placeholder="estimate" min={0} max={200000} step={500} prefix="$" onChange={(v) => update((s) => { s.assumptions.ssOverrideAnnual = v; })} /></Field>
              <Field label="SS haircut" htmlFor="as-sshc"><NumberInput id="as-sshc" value={a.ssHaircut} scale={100} min={0} max={0.5} step={0.01} suffix="%" onChange={(v) => update((s) => { s.assumptions.ssHaircut = v ?? 0; })} /></Field>
              <Field label="Tax gross-up on withdrawals" htmlFor="as-gu"><NumberInput id="as-gu" value={a.taxGrossUp} scale={100} min={0} max={0.5} step={0.01} suffix="%" onChange={(v) => update((s) => { s.assumptions.taxGrossUp = v ?? 0.15; })} /></Field>
              <Field label="Life expectancy" htmlFor="as-life"><NumberInput id="as-life" value={a.lifeExpectancy} min={70} max={110} step={1} onChange={(v) => update((s) => { s.assumptions.lifeExpectancy = v ?? 95; })} /></Field>
              <Field label="Emergency months default" htmlFor="as-em"><NumberInput id="as-em" value={a.emergencyMonthsDefault} min={1} max={24} step={1} suffix="mo" onChange={(v) => update((s) => { s.assumptions.emergencyMonthsDefault = v ?? 6; })} /></Field>
              <Field label="Cash yield" htmlFor="as-cy"><NumberInput id="as-cy" value={a.cashYield} scale={100} digits={2} min={0} max={0.1} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.assumptions.cashYield = v ?? 0.035; })} /></Field>
              <Field label="Lifestyle creep (real)" htmlFor="as-lc"><NumberInput id="as-lc" value={a.lifestyleCreep} scale={100} digits={2} min={0} max={0.05} step={0.0025} suffix="%/yr" onChange={(v) => update((s) => { s.assumptions.lifestyleCreep = v ?? 0; })} /></Field>
            </div>
            <div className="mt-4">
              <div className="label-caps mb-1">Capital-market assumptions</div>
              <Table caption="Capital market assumptions">
                <thead><tr><th className={th}>Asset class</th><th className={thNum}>Return</th><th className={thNum}>Volatility</th></tr></thead>
                <tbody>
                  {ASSET_CLASSES.map((k) => (
                    <tr key={k}>
                      <td className={td}>{ASSET_CLASS_LABELS[k]}</td>
                      <td className={tdNum}><NumberInput id={`cma-r-${k}`} aria-label={`${ASSET_CLASS_LABELS[k]} expected return`} compact value={a.cma[k].ret} scale={100} digits={2} min={-0.05} max={0.2} step={0.0025} suffix="%" onChange={(v) => update((s) => { s.assumptions.cma[k].ret = v ?? 0; })} /></td>
                      <td className={tdNum}><NumberInput id={`cma-v-${k}`} aria-label={`${ASSET_CLASS_LABELS[k]} volatility`} compact value={a.cma[k].vol} scale={100} digits={2} min={0} max={0.6} step={0.005} suffix="%" onChange={(v) => update((s) => { s.assumptions.cma[k].vol = v ?? 0; })} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-xxs text-ink-3 mt-1">Illustrative assumptions, not forecasts. <VerifyTag label="Assumption" source="Base Case CMA defaults (illustrative)" asOf="2026-11" /></p>
            </div>
          </Panel>
        )}
    </>
  );
  const playbookPanel = (
        <Panel title={cockpit ? "Fuel planning · order of operations" : "Playbook · order of operations"}>
          <PlaybookList actions={derived.actions} />
        </Panel>
  );
  const taxAndLimits = (
        <div className={cx("grid gap-4", cockpit ? "md:grid-cols-2" : "md:grid-cols-2")}>
          <Panel title={`Taxes · ${derived.tax.year}`} subtitle="first income year">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              {([
                ['Gross income', derived.tax.gross], ['− Pre-tax deductions', derived.tax.pretaxDeductions], ['− Standard deduction', derived.tax.standardDeduction], ['Taxable income', derived.tax.taxableIncome],
                ['Federal tax', derived.tax.federalTax], ['State tax', derived.tax.stateTax], ['FICA', derived.tax.fica], ['Take-home', derived.tax.takeHome],
              ] as const).map(([k, v]) => (
                <div key={k} className="contents"><dt className={cx('text-ink-3', (k === 'Take-home' || k === 'Taxable income') && 'font-medium text-ink')}>{k}</dt><dd className={cx('num text-right', k === 'Take-home' && 'font-medium')}>{fmtMoney(v)}</dd></div>
              ))}
            </dl>
            <div className="mt-2 flex gap-2 flex-wrap"><Chip>Effective {fmtPct(derived.tax.effectiveRate, 1)}</Chip><Chip>Marginal federal {fmtPct(derived.tax.marginalFederalRate, 0)}</Chip></div>
          </Panel>

          <Panel title={`Contribution limits · ${IRS_YEAR}`}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {limits.map((l) => (
                <li key={l.label} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div>{l.label}</div>
                    {advisor && <SourceLine source={l.s.source} asOf={l.s.asOf} verified={l.s.verified} url={l.s.url} note={l.s.note} showVerify />}
                    {l.note && <div className="text-xxs text-ink-3">{l.note}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.capped && <Chip tone="warn">Capped</Chip>}
                    <span className="num">{fmtMoney(l.s.value)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {advisor && (
              <p className="text-xxs text-ink-3 mt-2 flex items-center gap-1 flex-wrap">2027 deferral projection {fmtMoney(LIMITS_2027_PUBLISHED.projectedElectiveDeferral.value)} <VerifyTag source={LIMITS_2027_PUBLISHED.projectedElectiveDeferral.source} asOf={LIMITS_2027_PUBLISHED.projectedElectiveDeferral.asOf} note={LIMITS_2027_PUBLISHED.projectedElectiveDeferral.note} /> (not used in math).</p>
            )}
          </Panel>
        </div>
  );
  const alertsPanel = (
    <Panel title={cockpit ? 'EICAS · alerts' : 'Alerts'} actions={cockpit ? <EicasCounts alerts={derived.alerts} advisor={advisor} /> : undefined}>
      <AlertLedger alerts={derived.alerts} advisor={advisor} variant={cockpit ? 'eicas' : 'ledger'} />
    </Panel>
  );

  if (cockpit) {
    // The original Cruise screen: allocation beside the glide path, fuel planning beside limits and taxes, then
    // emergency fund and debt, the alert stack and (advisor) the assumptions and capital-market table.
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4 min-w-0">{allocPanel}</div>
          <div className="lg:col-span-8 min-w-0">{glidePanel}</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 min-w-0">{playbookPanel}</div>
          <div className="lg:col-span-7 min-w-0">{taxAndLimits}</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4 min-w-0">{emergencyPanel}</div>
          <div className="lg:col-span-4 min-w-0">{debtPanel}</div>
          <div className="lg:col-span-4 min-w-0">{alertsPanel}</div>
        </div>
        {assumptionsPanel}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        {allocPanel}
        {glidePanel}
        {emergencyPanel}
        {debtPanel}
        {assumptionsPanel}
      </div>

      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        {playbookPanel}
        {taxAndLimits}
        {alertsPanel}
      </div>
    </div>
  );
}
