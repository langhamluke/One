import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AIRLINES, type AirlineId, type PathId } from '../data/airlines';
import { RouteMap } from '../components/RouteMap';
import { AdvisorOnly, Field, NumberInput, Panel, Select, SourcedValue, Toggle, VerifyTag } from '../components/ui';
import { fmtDate, fmtK, fmtRate } from '../lib/format';
import { pathLabel, pathShort } from '../lib/payroll';
import { computePlan, monteCarloFor } from '../lib/plan';
import type { ExcessHandling } from '../lib/types';
import { useDerived, useMoney } from '../state/derived';
import { useStore } from '../state/store';
import { CHART_ANIM } from '../components/assetColors';

const ALT_COLORS = ['#E6EDF5', '#9DB4D6', '#C9BFA6', '#6F93C7'];
const DASH = ['', '6 4', '2 3', '10 3 2 3'];
const tick = { fill: '#8A99AD', fontSize: 11, fontFamily: 'B612 Mono' };
const EXCESS_LABEL: Record<ExcessHandling, string> = { cash: 'Paid as taxable cash', mbcb: 'Market-based cash balance plan', forfeit: 'Forfeited' };

export function FlightPlan() {
  const { state, plan: activePlan } = useDerived();
  const setActivePath = useStore((s) => s.setActivePath);
  const setAssumptions = useStore((s) => s.setAssumptions);
  const { conv, label: moneyLabel } = useMoney();
  const [showTable, setShowTable] = useState(false);
  const p = state.profile;
  const a = state.assumptions;
  const active = activePlan.pathId;

  const compare = useMemo(() => state.selectedPaths.map((id) => {
    const plan = computePlan(state, id);
    const mc = monteCarloFor(plan, state);
    return { id, plan, mc, label: pathLabel(id, p.stage, p.employer), short: pathShort(id, p.stage, p.employer) };
  }), [state, p.stage, p.employer]);

  const majors = [...new Set(compare.flatMap((c) => c.plan.rows.map((r) => r.airline)).filter((x): x is AirlineId => !!x && x !== 'cfi'))];

  const payData = useMemo(() => {
    const ages = compare[0]?.plan.rows.map((r) => r.age) ?? [];
    return ages.map((age, i) => {
      const row: Record<string, number> = { age };
      compare.forEach((c) => { const r = c.plan.rows[i]; if (r) row[c.id] = conv(r.gross, r.index); });
      return row;
    });
  }, [compare, conv]);

  const barData = compare.map((c) => ({
    name: c.short,
    earnings: c.plan.rows.reduce((s, r) => s + conv(r.gross, r.index), 0),
    retirement: conv(c.mc.atRetirement.p50, c.plan.retirement.indexAtRetirement),
    id: c.id,
  }));

  return (
    <div className="grid gap-4">
      <Panel title="Navigation Display · Career Route" right={<span className="text-[11px] text-dim">Click a route to make it the active flight plan · pay in {moneyLabel}</span>} bodyClass="p-2 sm:p-3">
        <RouteMap
          routes={compare.map((c) => ({
            id: c.id, label: c.short, sub: c.label, active: c.id === active,
            waypoints: c.plan.career.waypoints,
            conv: (w) => { const r = c.plan.rows.find((x) => x.age === w.age); return r ? conv(w.pay, r.index) : w.pay; },
          }))}
          startAge={p.age}
          endAge={activePlan.retireAge}
          onSelect={(id) => setActivePath(id as PathId)}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`Annual Gross Pay by Age · ${moneyLabel}`}>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <LineChart data={payData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#1B2533" vertical={false} />
                <XAxis dataKey="age" tick={tick} tickLine={false} axisLine={{ stroke: '#243042' }} />
                <YAxis tick={tick} tickFormatter={fmtK} axisLine={false} tickLine={false} width={56} />
                <Tooltip contentStyle={{ background: '#080B10', border: '1px solid #243042', fontFamily: 'B612 Mono', fontSize: 12 }} labelFormatter={(v) => `AGE ${v}`}
                  formatter={(v: number, k: string) => [fmtK(v), compare.find((c) => c.id === k)?.label ?? k]} />
                {compare.map((c, i) => (
                  <Line key={c.id} type="stepAfter" dataKey={c.id} dot={false} isAnimationActive={CHART_ANIM} animationDuration={800}
                    stroke={c.id === active ? '#FF4FD8' : ALT_COLORS[i % ALT_COLORS.length]} strokeWidth={c.id === active ? 2.5 : 1.4}
                    strokeDasharray={c.id === active ? '' : DASH[i % DASH.length]} strokeOpacity={c.id === active ? 1 : 0.8} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {compare.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={c.id === active ? '#FF4FD8' : ALT_COLORS[i % ALT_COLORS.length]} strokeWidth="2" strokeDasharray={c.id === active ? '' : DASH[i % DASH.length]} /></svg>
                <span className={c.id === active ? 'text-plan' : 'text-dim'}>{c.label}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`Career Earnings vs. Retirement (P50) · ${moneyLabel}`}>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={3}>
                <CartesianGrid stroke="#1B2533" vertical={false} />
                <XAxis dataKey="name" tick={{ ...tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#243042' }} interval={0} height={40} />
                <YAxis tick={tick} tickFormatter={fmtK} axisLine={false} tickLine={false} width={56} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#080B10', border: '1px solid #243042', fontFamily: 'B612 Mono', fontSize: 12 }} formatter={(v: number) => fmtK(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8A99AD' }} />
                <Bar dataKey="earnings" name="Cumulative career earnings" fill="#4E6F9E" radius={[2, 2, 0, 0]} isAnimationActive={CHART_ANIM} animationDuration={800} />
                <Bar dataKey="retirement" name={`Projected balance at ${activePlan.retireAge} (P50)`} fill="#C9D4E2" radius={[2, 2, 0, 0]} isAnimationActive={CHART_ANIM} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Retirement Benefits & Contracts by Airline" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-edge text-left text-[10px] uppercase tracking-[0.12em] text-dim">
                <th className="px-4 py-2 font-normal">Airline</th>
                <th className="px-3 py-2 font-normal">Company DC %</th>
                <th className="px-3 py-2 font-normal">Plan type</th>
                <th className="px-3 py-2 font-normal">Above §415(c)</th>
                <th className="px-3 py-2 font-normal">Amendable</th>
                <th className="px-3 py-2 font-normal">Top CA rate (2026)</th>
                <th className="px-3 py-2 font-normal">Pay unit</th>
              </tr>
            </thead>
            <tbody>
              {majors.map((id) => {
                const al = AIRLINES[id];
                const ex = al.retirement.excessHandling;
                const topCA = (al.widebody ?? al.narrowbody).ca[11];
                const exVal = a.excessOverrides[id] ?? ex.value;
                return (
                  <tr key={id} className="border-b border-edge/50 align-top">
                    <td className="px-4 py-2"><span className="text-white">{al.name}</span><div className="num text-[10px] text-dim">{al.code}</div></td>
                    <td className="px-3 py-2"><SourcedValue s={al.retirement.companyPct}>{al.retirement.companyPct.value}%</SourcedValue>
                      {al.retirement.mbcbPct && al.retirement.mbcbPct.value > 0 && <div className="text-[11px] text-dim">+ <SourcedValue s={al.retirement.mbcbPct}>{al.retirement.mbcbPct.value}%</SourcedValue> MBCB</div>}
                      {id === 'fedex' && <div className="text-[11px] text-dim">MBCB ≈<SourcedValue s={al.retirement.pension!.mbcbAltPct}>9–10%</SourcedValue></div>}
                    </td>
                    <td className="px-3 py-2 text-white">{al.retirement.planType}</td>
                    <td className="px-3 py-2">
                      <AdvisorOnly>
                        <div className="w-48">
                          <Select ariaLabel={`Excess handling for ${al.name}`} value={exVal} onChange={(v) => setAssumptions({ excessOverrides: { ...a.excessOverrides, [id]: v } })}
                            options={(['cash', 'mbcb', 'forfeit'] as ExcessHandling[]).map((x) => ({ value: x, label: EXCESS_LABEL[x] }))} />
                        </div>
                        {!a.excessOverrides[id] && <VerifyTag s={ex} />}
                      </AdvisorOnly>
                      <ClientText>{EXCESS_LABEL[exVal]}</ClientText>
                    </td>
                    <td className="px-3 py-2"><SourcedValue s={al.amendable}>{/^\d{4}/.test(al.amendable.value) ? fmtDate(al.amendable.value) : al.amendable.value}</SourcedValue></td>
                    <td className="px-3 py-2"><SourcedValue s={topCA}>{fmtRate(topCA.value)}</SourcedValue>{al.widebody && <span className="text-[10px] text-dim"> WB</span>}</td>
                    <td className="px-3 py-2 text-dim">{al.payUnit === 'TFP' ? 'per TFP' : al.payUnit === 'hour' ? 'per hour' : 'salary'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px] text-dim">Hover any value for its source and as-of date. Amber values with VERIFY are interpolated, estimated, or proxies (Advisor Mode).</div>
      </Panel>

      <AdvisorOnly>
        <Panel title="Career Assumptions · Advisor">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Profit sharing" help="Off by default for conservatism.">
              <div className="flex items-center gap-3">
                <Toggle ariaLabel="Profit sharing" checked={a.profitSharingOn} onChange={(v) => setAssumptions({ profitSharingOn: v, profitSharingPct: v && a.profitSharingPct === 0 ? 5 : a.profitSharingPct })} />
                <div className="w-24"><NumberInput ariaLabel="Profit sharing percent" kind="pct" suffix="%" value={a.profitSharingPct} min={0} max={30} step={1} onChange={(v) => setAssumptions({ profitSharingPct: v })} /></div>
              </div>
            </Field>
            <Field label="Pay growth after contract" help="Annual raise assumed once dated contract raises run out.">
              <NumberInput ariaLabel="Pay growth after contract" kind="pct" suffix="%" value={a.payGrowthAfterContract * 100} min={0} max={8} step={0.25} onChange={(v) => setAssumptions({ payGrowthAfterContract: v / 100 })} />
            </Field>
            <Field label="Inflation" help="Converts nominal to today's dollars and indexes IRS limits & brackets.">
              <NumberInput ariaLabel="Inflation" kind="pct" suffix="%" value={a.inflation * 100} min={0} max={8} step={0.25} onChange={(v) => setAssumptions({ inflation: v / 100 })} />
            </Field>
            {majors.includes('envoy') && <Field label="Envoy FO @ CA rate (750 hrs)" help="Envoy pays FOs captain rates after 750 Part 121 hours (modelled from longevity year 2).">
              <Toggle ariaLabel="Envoy captain-rate rule" checked={a.envoyCaRateRule} onChange={(v) => setAssumptions({ envoyCaRateRule: v })} label={a.envoyCaRateRule ? 'On' : 'Off'} />
            </Field>}
          </div>
        </Panel>
      </AdvisorOnly>

      <Panel title={`Year-by-Year · ${pathLabel(active, p.stage, p.employer)} · ${moneyLabel}`}
        right={<button type="button" className="btn" aria-expanded={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Hide' : 'Show'} detail</button>} bodyClass={showTable ? 'p-0' : 'px-4 py-3'}>
        {!showTable ? (
          <p className="text-[12px] text-dim">Cumulative career earnings <span className="num text-white">{fmtK(activePlan.rows.reduce((s, r) => s + conv(r.gross, r.index), 0))}</span> over {activePlan.rows.length} years. Federal 2026 brackets ({activePlan.status === 'mfj' ? 'MFJ' : 'single'}), FICA with the $184,500 SS wage base, state rate {(activePlan.stateRate * 100).toFixed(1)}%.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="num w-full text-[12px]">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-edge text-right text-[10px] uppercase tracking-wider text-dim">
                  {['Age', 'Year', 'Seat', 'Yr', 'Rate', 'Credit', 'Gross', 'Taxes', 'Take-home', '401(k)+Co', 'Balance'].map((h, i) => <th key={h} className={`px-2 py-2 font-normal ${i === 2 ? 'text-left' : ''}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {activePlan.rows.map((r) => (
                  <tr key={r.age} className="border-b border-edge/40 text-right">
                    <td className="px-2 py-1">{r.age}</td>
                    <td className="px-2 py-1 text-dim">{r.year}</td>
                    <td className="px-2 py-1 text-left font-sans">{r.label}</td>
                    <td className="px-2 py-1 text-dim">{r.longevity || ''}</td>
                    <td className="px-2 py-1">{r.rate ? <SourcedValue s={r.rate}>{r.airline === 'cfi' ? fmtK(r.rateNow) : fmtRate(r.rateNow)}</SourcedValue> : '—'}</td>
                    <td className="px-2 py-1 text-dim">{r.annualCredit || '—'}</td>
                    <td className="px-2 py-1">{fmtK(conv(r.gross, r.index))}</td>
                    <td className="px-2 py-1 text-dim">{fmtK(conv(r.taxes.total, r.index))}</td>
                    <td className="px-2 py-1">{fmtK(conv(r.takeHome, r.index))}</td>
                    <td className="px-2 py-1">{fmtK(conv(r.employeeDeferral + r.catchUp + r.company, r.index))}</td>
                    <td className="px-2 py-1 text-white">{fmtK(conv(r.balances.total, r.index))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ClientText({ children }: { children: ReactNode }) {
  const mode = useStore((s) => s.ui.mode);
  return mode === 'client' ? <span className="text-white">{children}</span> : null;
}
