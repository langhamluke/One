import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { useSession } from '@/state/session';
import { useAdvisorView } from './PlanLayout';
import { Button, Chip, cx } from '@/components/ui';
import { AllocationDonut } from '@/components/charts/AllocationDonut';
import { GlideChart } from '@/components/charts/GlideChart';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { admin } from '@/api/endpoints';
import { DEFAULT_DISCLAIMER } from '@/content/legal';
import { QUESTIONNAIRE_SOURCE } from '@shared/data/questionnaire';
import { fmtAge, fmtCompact, fmtMoney, fmtPct, toBasis } from '@/lib/format';
import { PATH_COLORS, REC } from '@/components/charts/common';

export function SummaryPage() {
  const state = usePlanStore((s) => s.state);
  const { derived, error } = useDerived();
  const { me } = useSession();
  const advisor = useAdvisorView();
  const [disclaimer, setDisclaimer] = useState(DEFAULT_DISCLAIMER);
  useEffect(() => {
    if (me?.user.role === 'admin') admin.settings().then((s) => { if (s.disclaimer) setDisclaimer(s.disclaimer); }).catch(() => undefined);
  }, [me?.user.role]);

  if (error) return <EngineUnavailable error={advisor ? error : undefined} />;
  if (!derived) return <p className="text-sm text-ink-3">Computing…</p>;

  const retIdx = derived.mc.ages.indexOf(derived.mc.retirementAge);
  const p10 = derived.mc.p10Real[retIdx];
  const p90 = derived.mc.p90Real[retIdx];
  const ps = derived.mc.successProbability;
  const a = state.assumptions;
  const alerts = derived.alerts.filter((x) => !x.advisorOnly).slice(0, 5);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const startAge = state.profile.age;
  const retAge = derived.mc.retirementAge;

  return (
    <div className="print-page flex flex-col gap-3">
      <div className="no-print flex justify-end">
        <Button variant="primary" icon={<Printer className="h-3.5 w-3.5" aria-hidden />} onClick={() => window.print()}>Print</Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-ink pb-2">
        <div>
          <div className="label-caps">{me?.firm.name ?? 'Base Case'}</div>
          <h1>Plan summary — {state.profile.nickname || 'Client'}</h1>
        </div>
        <div className="text-xs text-ink-3 num text-right">{date}<br />Active path: {derived.active.name}</div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-3"><div className="label-caps">Risk profile</div><div className="text-sm font-medium">{derived.profile.risk}</div><div className="num text-xs text-ink-3">score {derived.profile.riskScore ?? '—'} / 28{derived.profile.provisional ? ' · provisional' : ''}</div></div>
        <div className="card p-3"><div className="label-caps">Time horizon</div><div className="text-sm font-medium">{derived.profile.horizon}</div><div className="num text-xs text-ink-3">score {derived.profile.horizonScore ?? '—'} / 20</div></div>
        <div className="card p-3"><div className="label-caps">P(success)</div><div className={cx('num readout-value text-xl font-medium', ps >= 0.9 ? 'text-ok' : ps >= 0.75 ? 'text-warn' : 'text-danger')}>{fmtPct(ps, 0)}</div><div className="text-xs text-ink-3">retire at {retAge}</div></div>
        <div className="card p-3"><div className="label-caps">At retirement (today's $)</div><div className="num text-xs">P10 {fmtCompact(p10)}</div><div className="num text-sm font-medium">P50 {fmtCompact(derived.mc.medianAtRetirementReal)}</div><div className="num text-xs">P90 {fmtCompact(p90)}</div></div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="card p-3">
          <h2 className="mb-1">Allocation</h2>
          <AllocationDonut allocation={derived.allocation} equity={derived.modelEquity} size={110} frame={false} />
        </div>
        <div className="card p-3">
          <h2 className="mb-1">Glide path</h2>
          <GlideChart glidePath={derived.glidePath} retirementAge={retAge} height={110} frame={false} />
        </div>
        <div className="card p-3">
          <h2 className="mb-1">Career route</h2>
          <svg viewBox="0 0 300 70" className="w-full h-auto" role="img" aria-label={`Career route for ${derived.active.name}`}>
            {derived.paths.slice(0, 4).map((p, i) => {
              const y = 14 + i * 14;
              const x = (age: number) => 8 + ((age - startAge) / Math.max(1, retAge - startAge)) * 284;
              const color = p.pathId === state.activePathId ? REC : PATH_COLORS[i % 4];
              return (
                <g key={p.pathId}>
                  <line x1={x(startAge)} x2={x(retAge)} y1={y} y2={y} stroke={color} strokeWidth={p.pathId === state.activePathId ? 2.5 : 1.5} opacity={0.8} />
                  {p.waypoints.filter((w) => w.kind === 'promotion' || w.kind === 'start').map((w, wi) => <rect key={wi} x={x(w.age) - 2.5} y={y - 2.5} width={5} height={5} fill={color} />)}
                  <text x={x(startAge)} y={y - 4} fontSize="7" fill={color}>{p.name}</text>
                </g>
              );
            })}
            <text x={8} y={68} fontSize="7" fill="#6B6B6B" fontFamily="IBM Plex Mono">{startAge}</text>
            <text x={292} y={68} fontSize="7" fill="#6B6B6B" fontFamily="IBM Plex Mono" textAnchor="end">{retAge}</text>
          </svg>
          <div className="num text-xxs text-ink-3">Start {fmtMoney(toBasis(derived.active.startingSalary, Math.max(0, derived.active.firstIncomeYearIndex), state.assumptions.inflation, 'today'))} · peak {fmtMoney(derived.active.rows.reduce((m, r) => Math.max(m, toBasis(r.wages, r.yearIndex, state.assumptions.inflation, 'today')), 0))} (today's $) · debt-free {fmtAge(derived.active.debtFreeAge)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-3">
          <h2 className="mb-1">Top actions</h2>
          <ol className="text-xs flex flex-col gap-1">
            {derived.actions.slice(0, 5).map((x, i) => (
              <li key={x.id} className="flex gap-2"><span className="num text-ink-4 w-3">{i + 1}</span><span className="flex-1">{x.title}</span>{x.amount != null && <span className="num shrink-0">{fmtMoney(x.amount)}/yr</span>}</li>
            ))}
          </ol>
        </div>
        <div className="card p-3">
          <h2 className="mb-1">Active alerts</h2>
          {alerts.length === 0 ? <p className="text-xs text-ink-3">None.</p> : (
            <ul className="text-xs flex flex-col gap-1">
              {alerts.map((x) => (
                <li key={x.id} className="flex gap-2 items-start"><Chip tone={x.severity === 'warning' ? 'danger' : x.severity === 'caution' ? 'warn' : 'neutral'}>{x.severity}</Chip><span>{x.title}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="text-xxs text-ink-3 num">
        Assumptions: inflation {fmtPct(a.inflation, 1)} · landing equity {fmtPct(a.landingEquity, 0)} · income replacement {fmtPct(a.incomeReplacement, 0)} · SS claim {a.ssClaimAge} · life expectancy {a.lifeExpectancy} · {derived.mc.sims} sims (seed {derived.mc.seed}) · net worth today {fmtMoney(derived.headline.netWorth)} · savings rate {fmtPct(derived.headline.savingsRate, 1)}
      </div>
      <p className="text-xxs text-ink-3">{QUESTIONNAIRE_SOURCE}</p>
      <p className="text-xxs text-ink-3">{disclaimer}</p>
    </div>
  );
}
