import { useMemo } from 'react';
import { AltitudeChart, type AltPoint } from '../components/AltitudeChart';
import { Field, NumberInput, Panel, Select, Slider, Stat, Toggle } from '../components/ui';
import { AIRLINES, type PathId } from '../data/airlines';
import { fmtK, fmtPct } from '../lib/format';
import { pathLabel } from '../lib/payroll';
import { computePlan, monteCarloFor } from '../lib/plan';
import { useDerived, useMoney } from '../state/derived';
import { keyWaypoints } from './Cruise';
import { useStore } from '../state/store';

export function Landing() {
  const { state, plan, mc } = useDerived();
  const setWhatIf = useStore((s) => s.setWhatIf);
  const resetWhatIf = useStore((s) => s.resetWhatIf);
  const setAssumptions = useStore((s) => s.setAssumptions);
  const { dollars, label: moneyLabel } = useMoney();
  const mode = useStore((s) => s.ui.mode);
  const a = state.assumptions;
  const w = state.whatIf;
  const p = state.profile;
  const ret = plan.retirement;
  const infl = a.inflation;
  const real = dollars === 'real';

  const data: AltPoint[] = useMemo(() => mc.bands.map((b, i) => {
    const f = real ? Math.pow(1 + infl, i) : 1;
    const p10 = b.p10 / f, p50 = b.p50 / f, p90 = b.p90 / f;
    return { age: p.age + i, p10, p50, p90, band: [p10, p90] };
  }), [mc, real, infl, p.age]);

  const idx = ret.indexAtRetirement;
  const atR = mc.atRetirement;
  const required = ret.requiredBalanceReal * (real ? 1 : idx);
  const success = mc.successProb;
  const tone = success >= 0.85 ? 'ok' : success >= 0.7 ? 'caution' : 'warn';
  const fourPct = 0.04 * (atR.p50 / idx);

  const fedexLegacy = p.employer === 'fedex' && (p.stage === 'cargo_fo' || p.stage === 'cargo_ca');
  const pensionCompare = useMemo(() => {
    if (!fedexLegacy) return null;
    return (['legacy', 'mbcb'] as const).map((opt) => {
      const s = { ...state, assumptions: { ...state.assumptions, fedexOption: opt } };
      const pl = computePlan(s, plan.pathId);
      const m = monteCarloFor(pl, s);
      return { opt, pl, m };
    });
  }, [fedexLegacy, state, plan.pathId]);

  const pathOptions = state.selectedPaths.map((id) => ({ value: id, label: pathLabel(id, p.stage, p.employer) }));
  const whatIfActive = w.upgradeDelay || w.furloughYears || w.retireAt60 || w.pathOverride || w.deferralBump;
  const last = plan.rows[plan.rows.length - 1];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title={`Altitude Tape · Portfolio Value by Age · ${moneyLabel}`}
          right={<span className="text-[11px] text-dim">{mc.nSims.toLocaleString()} simulations · seed {mc.seed}</span>}>
          <div className="mb-3 grid grid-cols-2 gap-4 border-b border-edge pb-3 sm:grid-cols-4">
            <Stat label={`P10 at ${plan.retireAge}`} value={fmtK(real ? atR.p10 / idx : atR.p10)} sub={real ? `${fmtK(atR.p10)} nominal` : `${fmtK(atR.p10 / idx)} today's $`} />
            <Stat label={`P50 at ${plan.retireAge}`} tone="plan" value={fmtK(real ? atR.p50 / idx : atR.p50)} sub={real ? `${fmtK(atR.p50)} nominal` : `${fmtK(atR.p50 / idx)} today's $`} />
            <Stat label={`P90 at ${plan.retireAge}`} value={fmtK(real ? atR.p90 / idx : atR.p90)} sub={real ? `${fmtK(atR.p90)} nominal` : `${fmtK(atR.p90 / idx)} today's $`} />
            <Stat label="P(success)" tone={tone} value={fmtPct(success)} sub={`income funded to ${a.planToAge}`} />
          </div>
          <AltitudeChart data={data} retireAge={plan.retireAge} target={required}
            waypoints={keyWaypoints(plan.career.waypoints)} height={mode === 'advisor' ? 540 : 420} />
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-dim">
            <span><span className="mr-1.5 inline-block w-5 border-t-2 border-plan align-middle" />Median (P50)</span>
            <span><span className="mr-1.5 inline-block h-2.5 w-5 bg-plan/20 align-middle" />P10–P90 cone</span>
            <span><span className="mr-1.5 inline-block w-5 border-t border-dashed border-plan align-middle" />Required at {plan.retireAge} for target income at a 4% initial withdrawal</span>
          </div>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="What If" right={whatIfActive ? <button type="button" className="btn" onClick={resetWhatIf}>Reset</button> : <span className="text-[11px] text-dim">instant recompute</span>}>
            <div className="grid gap-4">
              <Field label="Captain upgrade later by"><Slider ariaLabel="Upgrade delay years" value={w.upgradeDelay} min={0} max={5} onChange={(v) => setWhatIf({ upgradeDelay: v })} format={(v) => `${v} yr`} /></Field>
              <Field label="Furlough" help="Zero pay for N years starting after the first year at the major (or next year if already there); seniority freezes."><Slider ariaLabel="Furlough years" value={w.furloughYears} min={0} max={3} onChange={(v) => setWhatIf({ furloughYears: v })} format={(v) => `${v} yr`} /></Field>
              <Field label="Raise deferral by"><Slider ariaLabel="Deferral increase" value={w.deferralBump} min={0} max={20} onChange={(v) => setWhatIf({ deferralBump: v })} format={(v) => `+${v}%`} /></Field>
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.1em] text-dim">Retire at 60</span>
                <Toggle ariaLabel="Retire at 60" checked={w.retireAt60} onChange={(v) => setWhatIf({ retireAt60: v })} label={w.retireAt60 ? 'On' : 'Off'} />
              </div>
              {pathOptions.length > 1 && (
                <Field label="Airline path">
                  <Select ariaLabel="Airline path" value={(w.pathOverride ?? state.activePath) as PathId} onChange={(v) => setWhatIf({ pathOverride: v === state.activePath ? null : v })} options={pathOptions} />
                </Field>
              )}
            </div>
          </Panel>

          <Panel title="Retirement Income">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target % of take-home" help="Default 70% of final-year take-home pay.">
                <NumberInput ariaLabel="Target income percent" kind="pct" suffix="%" value={a.targetIncomePct} min={20} max={120} step={5} onChange={(v) => setAssumptions({ targetIncomePct: v })} />
              </Field>
              <Field label="Social Security / yr" help="Today's dollars, from ssa.gov estimate.">
                <NumberInput ariaLabel="Social Security estimate" kind="usd" value={a.socialSecurity} min={0} onChange={(v) => setAssumptions({ socialSecurity: v })} />
              </Field>
              <Field label="SS start age"><NumberInput ariaLabel="Social Security start age" value={a.ssStartAge} min={62} max={70} step={1} onChange={(v) => setAssumptions({ ssStartAge: v })} /></Field>
              <Field label="Plan to age" advisor><NumberInput ariaLabel="Plan to age" value={a.planToAge} min={80} max={105} step={1} onChange={(v) => setAssumptions({ planToAge: v })} /></Field>
              <Field label="Tax on withdrawals" advisor help="Effective rate used to gross up the income need.">
                <NumberInput ariaLabel="Retirement tax rate" kind="pct" suffix="%" value={a.retirementTaxRate * 100} min={0} max={40} step={1} onChange={(v) => setAssumptions({ retirementTaxRate: v / 100 })} />
              </Field>
              <Field label="Simulations" advisor>
                <NumberInput ariaLabel="Number of simulations" value={a.nSims} min={100} max={5000} step={100} onChange={(v) => setAssumptions({ nSims: Math.round(v) })} />
              </Field>
              <Field label="Random seed" advisor className="col-span-2">
                <NumberInput ariaLabel="Random seed" value={a.seed} min={1} onChange={(v) => setAssumptions({ seed: Math.round(v) })} />
              </Field>
            </div>
            <table className="num mt-4 w-full text-[12px]">
              <tbody>
                <Row k="Final-year take-home" v={fmtK(last ? last.takeHome / last.index : 0)} />
                <Row k={`Target income (${a.targetIncomePct}%)`} v={fmtK(ret.targetIncomeReal)} hi />
                <Row k={`Social Security from ${a.ssStartAge}`} v={`− ${fmtK(ret.ssReal)}`} />
                {ret.pensionNominal > 0 && <Row k="FedEx legacy pension (no COLA)" v={`− ${fmtK(ret.pensionReal)}`} />}
                <Row k={`Portfolio need, yr 1 (grossed ${fmtPct(a.retirementTaxRate)})`} v={fmtK(ret.firstYearNeedReal)} />
                <Row k="4% of P50 balance" v={fmtK(fourPct)} tone={fourPct >= ret.firstYearNeedReal ? 'text-ok' : 'text-caution'} />
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-dim">All values in today's dollars.</p>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Account Mix at ${plan.retireAge} · Expected Case · ${moneyLabel}`}>
          <AccountMix />
        </Panel>
        {pensionCompare ? (
          <Panel title="FedEx Pension Election · Legacy vs. MBCB" right={<span className="text-[11px] text-caution">Window Apr–May 30, 2027</span>}>
            <div className="grid grid-cols-2 gap-3">
              {pensionCompare.map(({ opt, pl, m }) => {
                const on = a.fedexOption === opt;
                return (
                  <button key={opt} type="button" aria-pressed={on} onClick={() => setAssumptions({ fedexOption: opt })}
                    className={`rounded border p-3 text-left transition-colors ${on ? 'border-sel bg-sel/[0.06]' : 'border-edge hover:border-[#3a4c63]'}`}>
                    <div className={`text-[12px] font-bold tracking-wider ${on ? 'text-sel' : 'text-white'}`}>{opt === 'legacy' ? 'STAY IN LEGACY PENSION' : 'ELECT CASH BALANCE (MBCB)'}</div>
                    <dl className="num mt-2 grid gap-1 text-[12px]">
                      <div className="flex justify-between"><dt className="font-sans text-dim">Pension at {pl.retireAge}</dt><dd>{fmtK(pl.retirement.pensionNominal)}/yr</dd></div>
                      <div className="flex justify-between"><dt className="font-sans text-dim">MBCB balance</dt><dd>{fmtK((pl.rows.at(-1)?.balances.mbcb ?? 0) / pl.retirement.indexAtRetirement)}</dd></div>
                      <div className="flex justify-between"><dt className="font-sans text-dim">P50 portfolio</dt><dd>{fmtK(m.atRetirement.p50 / pl.retirement.indexAtRetirement)}</dd></div>
                      <div className="flex justify-between"><dt className="font-sans text-dim">P(success)</dt><dd className={m.successProb >= 0.85 ? 'text-ok' : m.successProb >= 0.7 ? 'text-caution' : 'text-warn'}>{fmtPct(m.successProb)}</dd></div>
                    </dl>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11.5px] leading-snug text-dim">
              Legacy: up to <span className="text-caution">{fmtK(AIRLINES.fedex.retirement.pension!.maxAnnualBenefit.value)}</span>/yr nominal at full service (derived, VERIFY), FAE cap {fmtK(AIRLINES.fedex.retirement.pension!.faeCap.value)}, no COLA modelled.
              MBCB: legacy service frozen at end-2027, then ≈9% (2028) / ≈10% pay credits invested with the portfolio; floor = total company credits. Today's $ except pension (nominal). Verify against CBA Section 28.
            </p>
          </Panel>
        ) : (
          <Panel title="Reading the Projection">
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-dim">
              <li><span className="text-white">Cone:</span> 80% of simulated outcomes fall between P10 and P90. The magenta median is the flight plan, not a promise.</li>
              <li><span className="text-white">Success</span> means the target income (less Social Security{ret.pensionNominal > 0 ? ' and pension' : ''}) is funded every year to age {a.planToAge}.</li>
              <li><span className="text-white">Contributions</span> follow the career simulation; unsaved surplus cash flow is assumed spent.</li>
              <li>Returns are lognormal and correlated across asset classes; capital-market assumptions are illustrative.</li>
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, hi = false, tone }: { k: string; v: string; hi?: boolean; tone?: string }) {
  return (
    <tr className="border-b border-edge/40">
      <td className="py-1 font-sans text-dim">{k}</td>
      <td className={`py-1 text-right ${tone ?? (hi ? 'text-plan' : 'text-white')}`}>{v}</td>
    </tr>
  );
}

function AccountMix() {
  const { plan } = useDerived();
  const { conv } = useMoney();
  const last = plan.rows[plan.rows.length - 1];
  if (!last) return null;
  const b = last.balances;
  const items = [
    { k: 'Pre-tax 401(k)/IRA', v: b.pretax, c: '#6F93C7' },
    { k: 'Roth (401(k) + IRA)', v: b.roth, c: '#9DB4D6' },
    { k: 'HSA', v: b.hsa, c: '#4E6F9E' },
    { k: 'Taxable brokerage', v: b.taxable, c: '#A89F8C' },
    { k: 'Cash balance plan (MBCB)', v: b.mbcb, c: '#C9BFA6' },
  ].filter((x) => x.v > 1);
  const total = items.reduce((s, x) => s + x.v, 0);
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-sm border border-edge" role="img" aria-label="Account mix at retirement">
        {items.map((x) => <div key={x.k} style={{ width: `${(x.v / total) * 100}%`, background: x.c }} title={`${x.k}: ${fmtK(conv(x.v, last.index))}`} />)}
      </div>
      <table className="num mt-3 w-full text-[12px]">
        <tbody>
          {items.map((x) => (
            <tr key={x.k} className="border-b border-edge/40">
              <td className="py-1 font-sans text-dim"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: x.c }} />{x.k}</td>
              <td className="py-1 text-right">{fmtK(conv(x.v, last.index))}</td>
              <td className="w-14 py-1 text-right text-dim">{fmtPct(x.v / total)}</td>
            </tr>
          ))}
          <tr><td className="pt-1.5 font-sans text-dim">Total (expected-return case)</td><td className="pt-1.5 text-right text-white">{fmtK(conv(total, last.index))}</td><td /></tr>
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-dim">Pre-tax dollars are taxed on withdrawal; Roth and HSA (for medical) are not. Tax diversification gives flexibility in retirement.</p>
    </div>
  );
}
