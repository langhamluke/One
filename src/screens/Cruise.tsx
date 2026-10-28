import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ASSET_CLASSES, MODELS, equityPct } from '../data/models';
import { IRS_2026 } from '../data/irs2026';
import { CMA_DEFAULT } from '../data/cma';
import { Donut } from '../components/Donut';
import { AllocationLegend, GlideChart } from '../components/GlideChart';
import { AdvisorOnly, Field, NumberInput, Panel, Slider } from '../components/ui';
import { ASSET_COLORS, CHART_ANIM } from '../components/assetColors';
import { fmtK, fmtPct, fmtUSD } from '../lib/format';
import { expectedReturn, portfolioVol } from '../lib/montecarlo';
import type { HorizonCategory, RiskCategory } from '../lib/types';
import { useDerived, useMoney } from '../state/derived';
import { useStore } from '../state/store';

const RISKS: RiskCategory[] = ['Conservative', 'Moderate', 'Assertive', 'Aggressive'];
const HORIZONS: HorizonCategory[] = ['Short-term', 'Intermediate', 'Long-term'];
const tick = { fill: '#8A99AD', fontSize: 11, fontFamily: 'B612 Mono' };

type StepStatus = 'done' | 'now' | 'next' | 'na';

export function Cruise() {
  const { state, plan } = useDerived();
  const setAssumptions = useStore((s) => s.setAssumptions);
  const setCma = useStore((s) => s.setCma);
  const { conv, label: moneyLabel } = useMoney();
  const a = state.assumptions;
  const p = state.profile;
  const now = plan.glide[0];
  const y0 = plan.rows[0];
  const startEq = equityPct(plan.model);
  const effLanding = Math.min(a.landingEquity, startEq);

  // ------------------------------------------------ order of operations
  const efTarget = plan.efMonths * p.monthlyExpenses;
  const highDebt = p.schoolDebt > 0 && p.schoolRate / 100 > (y0?.expReturn ?? 0.06);
  const max402g = Math.min(IRS_2026.electiveDeferral, y0?.gross ?? 0);
  const steps: { title: string; detail: string; status: StepStatus; amount?: string }[] = [
    { title: 'Emergency fund', detail: `${plan.efMonths} months of expenses (${fmtK(efTarget)}). Have ${fmtK(p.cash)}.`, status: p.cash >= efTarget ? 'done' : 'now', amount: fmtK(Math.max(0, efTarget - p.cash)) + ' to go' },
    { title: 'High-interest debt', detail: p.schoolDebt > 0 ? `Flight-school loan ${p.schoolRate}% vs. expected return ${fmtPct(y0?.expReturn ?? 0, 1)} → ${highDebt ? 'pay down first' : 'regular payments are fine'}.` : 'No flight-school debt.', status: p.schoolDebt <= 0 ? 'done' : highDebt ? 'now' : 'next', amount: p.schoolDebt > 0 ? fmtK(p.schoolDebt) : undefined },
    { title: 'Full 401(k) deferral', detail: `Deferring ${fmtK(y0?.employeeDeferral ?? 0)} of the ${fmtK(IRS_2026.electiveDeferral)} limit (${p.rothPct}% Roth). Company adds ${fmtK(y0?.company ?? 0)}.`, status: (y0?.employeeDeferral ?? 0) + 500 >= max402g ? 'done' : 'next', amount: `${fmtK(y0?.employeeDeferral ?? 0)} / ${fmtK(IRS_2026.electiveDeferral)}` },
    { title: 'HSA', detail: p.hsaEligible ? `Fund to the ${p.marital === 'married' || p.kids.length ? 'family' : 'self'} limit and invest it.` : 'Not HSA-eligible (no HDHP).', status: p.hsaEligible ? 'done' : 'na', amount: p.hsaEligible ? fmtK(y0?.hsa ?? 0) : undefined },
    { title: plan.firstBackdoor || plan.firstPartialRoth ? 'Roth IRA → Backdoor Roth' : 'Roth IRA', detail: p.rothIra ? (plan.firstBackdoor || plan.firstPartialRoth ? `Direct Roth until age ${(plan.firstPartialRoth ?? plan.firstBackdoor)!.age - 1}; backdoor Roth after the income phase-out.` : 'Direct Roth contributions; income below the phase-out.') : 'Not currently contributing.', status: p.rothIra ? 'done' : 'next', amount: fmtK(IRS_2026.ira) },
    { title: 'Taxable brokerage', detail: `${fmtUSD(p.monthlyTaxable)}/mo planned${plan.firstSpill ? `; add after-tax §415(c) spillover from age ${plan.firstSpill.age}` : ''}.`, status: p.monthlyTaxable > 0 ? 'done' : 'next', amount: p.monthlyTaxable > 0 ? `${fmtK(p.monthlyTaxable * 12)}/yr` : undefined },
  ];

  // ------------------------------------------------ 415(c) chart
  const dcData = plan.rows.filter((r) => r.gross > 0).map((r) => ({
    age: r.age,
    deferral: conv(r.employeeDeferral, r.index),
    company: conv(r.company, r.index),
    excess: conv(r.excess, r.index),
    limit: conv(IRS_2026.annualAdditions415c * r.index, r.index),
  }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_2fr]">
        <Panel title="Recommended Allocation · Today" right={<span className="text-[12px] text-plan">{plan.risk} / {plan.horizon}{plan.provisional ? ' · PROVISIONAL' : ''}</span>}>
          <div className="flex flex-wrap items-center gap-5">
            <Donut allocation={now} size={170} />
            <table className="num min-w-[180px] flex-1 text-[12.5px]">
              <tbody>
                {ASSET_CLASSES.map((ac) => (
                  <tr key={ac.id}>
                    <td className="py-0.5 pr-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: ASSET_COLORS[ac.id] }} /><span className="font-sans text-dim">{ac.label}</span></td>
                    <td className="py-0.5 text-right text-white">{now[ac.id].toFixed(0)}%</td>
                  </tr>
                ))}
                <tr className="border-t border-edge"><td className="pt-1 font-sans text-dim">Expected return / vol</td><td className="pt-1 text-right">{fmtPct(expectedReturn(now, a.cma), 1)} / {fmtPct(portfolioVol(now, a.cma), 1)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-dim">Generic asset classes; implement with low-cost diversified funds. Illustrative capital-market assumptions.</p>
        </Panel>

        <Panel title="Glide Path · Equity by Age" right={<span className="num text-[12px]"><span className="text-white">{startEq.toFixed(0)}%</span> <span className="text-dim">now →</span> <span className="text-plan">{effLanding.toFixed(0)}%</span> <span className="text-dim">at {plan.retireAge}</span></span>}>
          <GlideChart data={plan.glide.filter((g) => g.age <= plan.retireAge + 5)} retireAge={plan.retireAge} landing={effLanding}
            waypoints={keyWaypoints(plan.career.waypoints)} height={270} />
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label={`Landing equity at ${plan.retireAge} (drag)`} help="Equity % the glide path lands on at retirement. Never raised above today's model.">
              <Slider ariaLabel="Landing equity" plan value={a.landingEquity} min={20} max={70} onChange={(v) => setAssumptions({ landingEquity: v })} format={(v) => `${v}%`} />
            </Field>
            <AdvisorOnly>
              <Field label="Descent begins (yrs before)" help="Years before retirement the glide path starts reducing equity.">
                <div className="w-28"><NumberInput ariaLabel="Glide years" value={a.glideYears} min={5} max={40} step={1} suffix="yr" onChange={(v) => setAssumptions({ glideYears: v })} /></div>
              </Field>
            </AdvisorOnly>
          </div>
          <div className="mt-2"><AllocationLegend /></div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel title="Fuel Planning · Order of Operations">
          <ol className="grid gap-2">
            {steps.map((s, i) => (
              <li key={s.title} className={`flex gap-3 rounded border px-3 py-2 ${s.status === 'now' ? 'border-caution/60 bg-caution/[0.04]' : 'border-edge'}`}>
                <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${s.status === 'done' ? 'border-ok text-ok' : s.status === 'now' ? 'border-caution text-caution' : s.status === 'na' ? 'border-edge text-faint' : 'border-dim text-white'}`}>
                  {s.status === 'done' ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-[13px] font-bold tracking-wide ${s.status === 'na' ? 'text-dim' : 'text-white'}`}>{s.title.toUpperCase()}</span>
                    {s.amount && <span className="num shrink-0 text-[12px] text-dim">{s.amount}</span>}
                  </div>
                  <p className="text-[12px] leading-snug text-dim">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title={`§415(c) Annual Additions · ${moneyLabel}`} right={<span className="num text-[12px] text-dim">BINDS NEAR <span className="text-caution">{Number.isFinite(plan.bindPay415) ? fmtK(plan.bindPay415) : '—'}</span> PAY (2026)</span>}>
          <div className="h-[250px]">
            <ResponsiveContainer>
              <ComposedChart data={dcData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#1B2533" vertical={false} />
                <XAxis dataKey="age" tick={tick} tickLine={false} axisLine={{ stroke: '#243042' }} />
                <YAxis tick={tick} tickFormatter={fmtK} axisLine={false} tickLine={false} width={52} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#080B10', border: '1px solid #243042', fontFamily: 'B612 Mono', fontSize: 12 }} labelFormatter={(v) => `AGE ${v}`} formatter={(v: number) => fmtK(v)} />
                <Bar dataKey="deferral" name="Employee deferral" stackId="a" fill="#6F93C7" isAnimationActive={CHART_ANIM} />
                <Bar dataKey="company" name="Company contribution" stackId="a" fill="#9DB4D6" isAnimationActive={CHART_ANIM} />
                <Bar dataKey="excess" name="Spills over §415(c)" stackId="a" fill="#FFB020" isAnimationActive={CHART_ANIM} />
                <Line dataKey="limit" name="§415(c) limit" stroke="#E6EDF5" strokeDasharray="5 4" dot={false} strokeWidth={1.2} isAnimationActive={CHART_ANIM} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
            <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#6F93C7] align-middle" />Employee deferral</li>
            <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#9DB4D6] align-middle" />Company</li>
            <li><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-caution align-middle" />Excess (cash / MBCB per airline)</li>
            <li><span className="mr-1.5 inline-block w-4 border-t border-dashed border-white align-middle" />$72,000 limit (indexed)</li>
          </ul>
          <p className="mt-2 text-[11.5px] leading-snug text-dim">
            Company % × pay (capped at the {fmtK(IRS_2026.compLimit401a17)} §401(a)(17) limit) + employee deferral ≤ {fmtK(IRS_2026.annualAdditions415c)}; catch-ups sit outside the cap.
            With 18% company money and a {fmtK(IRS_2026.electiveDeferral)} deferral the cap binds at ({fmtK(IRS_2026.annualAdditions415c)} − {fmtK(IRS_2026.electiveDeferral)}) ÷ 18% ≈ <span className="num text-white">$263,889</span> of pay.
          </p>
          <RothStrip />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Model Portfolio Matrix · Equity %" right={<span className="text-[11px] text-dim">src/data/models.ts</span>}>
          <table className="num w-full text-center text-[12.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-dim"><th className="py-1 text-left font-normal">Risk \ Horizon</th>{HORIZONS.map((h) => <th key={h} className="py-1 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody>
              {RISKS.map((r) => (
                <tr key={r} className="border-t border-edge/60">
                  <td className="py-1.5 text-left font-sans text-dim">{r}</td>
                  {HORIZONS.map((h) => {
                    const on = r === plan.risk && h === plan.horizon;
                    return <td key={h} className="py-1.5"><span className={`inline-block min-w-[3.5rem] rounded px-2 py-0.5 ${on ? 'border border-plan text-plan' : 'text-white'}`}>{equityPct(MODELS[r][h]).toFixed(0)}%</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <AdvisorOnly>
          <Panel title="Capital Market Assumptions · Illustrative" right={<button type="button" className="btn" onClick={() => setAssumptions({ cma: structuredClone(CMA_DEFAULT) })}>Reset</button>}>
            <table className="w-full text-[12px]">
              <thead><tr className="text-[10px] uppercase tracking-wider text-dim"><th className="py-1 text-left font-normal">Asset class</th><th className="py-1 font-normal">Exp. return</th><th className="py-1 font-normal">Volatility</th></tr></thead>
              <tbody>
                {ASSET_CLASSES.map((ac) => (
                  <tr key={ac.id} className="border-t border-edge/60">
                    <td className="py-1 text-dim">{ac.label}</td>
                    <td className="w-28 px-1 py-1"><NumberInput ariaLabel={`${ac.label} expected return`} kind="pct" suffix="%" value={a.cma[ac.id].mean * 100} min={-5} max={20} step={0.1} onChange={(v) => setCma(ac.id, 'mean', v / 100)} /></td>
                    <td className="w-28 px-1 py-1"><NumberInput ariaLabel={`${ac.label} volatility`} kind="pct" suffix="%" value={a.cma[ac.id].vol * 100} min={0} max={60} step={0.5} onChange={(v) => setCma(ac.id, 'vol', v / 100)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-dim">Nominal, arithmetic, annual. Lognormal returns with a fixed correlation matrix (src/data/cma.ts). Not a forecast.</p>
          </Panel>
        </AdvisorOnly>
      </div>
    </div>
  );
}

function RothStrip() {
  const { plan } = useDerived();
  const rows = plan.rows.filter((r) => r.iraStatus !== 'off');
  if (!rows.length) return null;
  const color = { full: '#3DDC84', partial: '#FFB020', none: '#FFB020', off: '#243042' } as const;
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.12em] text-dim"><span>Roth IRA route by age</span><span><span className="text-ok">Direct</span> · <span className="text-caution">Partial / Backdoor</span></span></div>
      <div className="flex h-3 overflow-hidden rounded-sm border border-edge" role="img" aria-label="Roth IRA route by age">
        {rows.map((r) => <div key={r.age} className="h-full flex-1" style={{ background: color[r.iraStatus as 'full'], opacity: r.iraStatus === 'none' ? 0.65 : 1 }} title={`Age ${r.age}: ${r.iraStatus === 'full' ? 'direct Roth' : r.iraStatus === 'partial' ? 'partial direct + backdoor' : 'backdoor Roth'}`} />)}
      </div>
      <div className="num mt-0.5 flex justify-between text-[10px] text-dim"><span>{rows[0].age}</span><span>{rows[rows.length - 1].age}</span></div>
    </div>
  );
}

/** Major career events only, at least 4 years apart, so labels never collide. */
export function keyWaypoints(wps: { age: number; label: string; kind: string }[]) {
  const out: { age: number; label: string }[] = [];
  for (const w of wps) {
    if (!['flow', 'upgrade', 'widebody', 'furlough'].includes(w.kind) || w.label === 'CA PAY RATE') continue;
    if (out.length && w.age - out[out.length - 1].age < 4) continue;
    out.push(w);
  }
  return out;
}
