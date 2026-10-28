import type { ReactNode } from 'react';
import { ASSET_CLASSES } from '../data/models';
import { QUESTIONNAIRE_FOOTNOTE } from '../data/questionnaire';
import { Donut } from '../components/Donut';
import { AllocationLegend, GlideChart } from '../components/GlideChart';
import { ASSET_COLORS_PRINT } from '../components/assetColors';
import { fmtK, fmtPct } from '../lib/format';
import { pathLabel } from '../lib/payroll';
import { RISK_LABEL } from '../lib/scoring';
import { useDerived } from '../state/derived';
import { useStore } from '../state/store';

export const DISCLAIMER =
  'Prepared by Luke Langham for discussion purposes. Hypothetical projections based on stated assumptions and publicly reported contract terms as of October 2026; not investment, tax, or legal advice. Actual results will vary.';

const ALERT_INK = { warning: '#B42318', caution: '#9A5B00', advisory: '#1F2937' } as const;

export function Briefing() {
  const { state, plan, mc, alerts, actions } = useDerived();
  const mode = useStore((s) => s.ui.mode);
  const p = state.profile;
  const idx = plan.retirement.indexAtRetirement;
  const now = plan.glide[0];
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const shownAlerts = alerts.filter((a) => mode === 'advisor' || !a.advisorOnly).filter((a) => a.level !== 'advisory' || a.id.startsWith('envoy') || a.id === 'fdx' || a.id === 'rothcatch').slice(0, 7);
  const success = mc.successProb;
  const successInk = success >= 0.85 ? '#1B7F45' : success >= 0.7 ? '#9A5B00' : '#B42318';
  const wps = plan.career.waypoints;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-dim">One-page summary, Letter size. Use your browser's Print dialog (“Save as PDF” works offline). Background graphics are included automatically.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <article className="briefing-page mx-auto w-full max-w-[8.5in] bg-white p-[0.45in] text-[#111] shadow-2xl" style={{ fontSize: 10.5 }} aria-label="Printable Flight Plan summary">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#111] pb-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-28 items-center justify-center border border-dashed border-[#999] text-[9px] uppercase tracking-widest text-[#777]">Firm logo</div>
            <div>
              <div className="text-[18px] font-bold tracking-[0.18em]">FLIGHT PLAN</div>
              <div className="text-[10px] tracking-[0.1em] text-[#555]">PILOT FINANCIAL BRIEFING</div>
            </div>
          </div>
          <div className="text-right text-[10.5px] leading-snug">
            <div className="text-[14px] font-bold">{p.name}</div>
            <div>{date}</div>
            <div className="text-[#555]">Age {p.age} · {p.domicile} · {p.stateOfResidence}</div>
          </div>
        </header>

        {/* Row 1: profile / allocation / range */}
        <section className="mt-3 grid grid-cols-3 gap-3">
          <Box title="Risk Profile">
            <div className="text-[15px] font-bold" style={{ color: '#9C1A82' }}>{RISK_LABEL[plan.risk]}</div>
            <div className="text-[11px]">Time horizon: <b>{plan.horizon}</b></div>
            <div className="num mt-1 text-[10px] text-[#555]">Risk score {plan.score.risk}/28 · Horizon {plan.score.horizon}/20{plan.provisional ? ' · PROVISIONAL' : ''}</div>
            <div className="num mt-1.5 grid grid-cols-10 gap-px text-center text-[8.5px]">
              {plan.score.perQuestion.map((q) => <div key={q.id} className="border border-[#ccc] py-0.5"><div className="text-[#777]">Q{q.n}</div><div className="font-bold">{q.points ?? '–'}</div></div>)}
            </div>
          </Box>
          <Box title="Recommended Allocation Today">
            <div className="flex items-center gap-2">
              <Donut allocation={now} size={92} print />
              <table className="num flex-1 text-[9.5px]">
                <tbody>
                  {ASSET_CLASSES.filter((a) => now[a.id] > 0.5).map((a) => (
                    <tr key={a.id}><td><span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: ASSET_COLORS_PRINT[a.id] }} /><span className="font-sans">{a.short}</span></td><td className="text-right">{now[a.id].toFixed(0)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
          <Box title={`Projected at ${plan.retireAge} · Today's $`}>
            <div className="num grid grid-cols-3 gap-1 text-center">
              <div><div className="text-[9px] text-[#666]">P10</div><div className="text-[12.5px] font-bold">{fmtK(mc.atRetirement.p10 / idx)}</div></div>
              <div><div className="text-[9px] text-[#666]">P50</div><div className="text-[14px] font-bold" style={{ color: '#9C1A82' }}>{fmtK(mc.atRetirement.p50 / idx)}</div></div>
              <div><div className="text-[9px] text-[#666]">P90</div><div className="text-[12.5px] font-bold">{fmtK(mc.atRetirement.p90 / idx)}</div></div>
            </div>
            <div className="mt-1.5 text-[10.5px]">P(success) <b className="num" style={{ color: successInk }}>{fmtPct(success)}</b> for {state.assumptions.targetIncomePct}% of final take-home ({fmtK(plan.retirement.targetIncomeReal)}/yr) to age {state.assumptions.planToAge}.</div>
            <div className="num mt-0.5 text-[9.5px] text-[#555]">Nominal P50 {fmtK(mc.atRetirement.p50)} · {mc.nSims.toLocaleString()} sims</div>
          </Box>
        </section>

        {/* Career route */}
        <section className="mt-3">
          <Box title={`Career Route · ${pathLabel(plan.pathId, p.stage, p.employer)}`}>
            <div className="relative mt-1 flex justify-between">
              <div className="absolute left-3 right-3 top-[7px] h-[2px]" style={{ background: '#9C1A82' }} />
              {wps.map((w, i) => {
                const r = plan.rows.find((x) => x.age === w.age);
                return (
                  <div key={`${w.label}-${i}`} className="relative z-10 flex min-w-0 flex-1 flex-col items-center text-center">
                    <div className="h-[16px] w-[16px] rotate-45 border-2 bg-white" style={{ borderColor: '#9C1A82', transform: 'rotate(45deg) scale(0.7)' }} />
                    <div className="mt-0.5 text-[9px] font-bold leading-tight">{w.label}</div>
                    <div className="num text-[8.5px] text-[#555]">{w.year} · age {w.age}</div>
                    {w.kind !== 'end' && r && <div className="num text-[8.5px] text-[#555]">{fmtK(w.pay / r.index)}</div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 text-[9px] text-[#666]">Pay in today's dollars. Cumulative career earnings {fmtK(plan.rows.reduce((s, r) => s + r.gross / r.index, 0))}.</div>
          </Box>
        </section>

        {/* Glide path + actions */}
        <section className="mt-3 grid grid-cols-[1fr_1.15fr] gap-3">
          <Box title={`Glide Path · ${Math.round(now.equity)}% → ${Math.round(plan.glide[plan.retireAge - p.age]?.equity ?? 0)}% equity at ${plan.retireAge}`}>
            <GlideChart data={plan.glide.filter((g) => g.age <= plan.retireAge)} retireAge={plan.retireAge} height={150} print />
            <div className="mt-1 scale-[0.85] origin-left"><AllocationLegend print /></div>
          </Box>
          <Box title="Top 5 Action Items">
            <ol className="space-y-1.5">
              {actions.slice(0, 5).map((a, i) => (
                <li key={a.title} className="flex gap-2">
                  <span className="num flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#111] text-[9px] font-bold">{i + 1}</span>
                  <div><div className="text-[10.5px] font-bold leading-tight">{a.title}</div><div className="text-[9.5px] leading-snug text-[#444]">{a.detail}</div></div>
                </li>
              ))}
            </ol>
          </Box>
        </section>

        {/* Alerts */}
        <section className="mt-3">
          <Box title="Active Planning Alerts">
            <ul className="num grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9.5px]">
              {shownAlerts.map((a) => <li key={a.id} style={{ color: ALERT_INK[a.level] }} className="font-bold">{a.level === 'warning' ? '■ ' : a.level === 'caution' ? '▲ ' : '• '}{a.text}</li>)}
              {shownAlerts.length === 0 && <li>No active alerts.</li>}
            </ul>
          </Box>
        </section>

        <footer className="mt-3 border-t border-[#999] pt-2 text-[8.5px] leading-snug text-[#444]">
          <p>Assumptions: plan year 1 = 2027; inflation {fmtPct(state.assumptions.inflation, 1)}; pay growth after contract {fmtPct(state.assumptions.payGrowthAfterContract, 1)}; {p.creditHours} credit hrs/mo; profit sharing {state.assumptions.profitSharingOn ? `${state.assumptions.profitSharingPct}%` : 'excluded'}; Social Security {fmtK(state.assumptions.socialSecurity)}/yr from {state.assumptions.ssStartAge}; 2026 IRS limits and federal brackets; illustrative capital-market assumptions. FAA Part 121 mandatory retirement age 65.</p>
          <p className="mt-1">{QUESTIONNAIRE_FOOTNOTE}</p>
          <p className="mt-1.5 font-bold text-[#111]">{DISCLAIMER}</p>
        </footer>
      </article>
    </div>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full border border-[#bbb] p-2">
      <div className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#555]">{title}</div>
      {children}
    </div>
  );
}
