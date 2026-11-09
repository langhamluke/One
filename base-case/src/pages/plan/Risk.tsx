import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { useAdvisorView } from './PlanLayout';
import { Chip, Field, NumberInput, Panel, RadioCards, Stat, VerifyTag } from '@/components/ui';
import { RangeChart } from '@/components/charts/RangeChart';
import { RiskGauge } from '@/components/charts/RiskGauge';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { HORIZON_BANDS, QUESTIONNAIRE_SOURCE, RISK_BANDS, TEXT_VERIFIED, questionsFor, supplementFor } from '@shared/data/questionnaire';
import { fmtMoney } from '@/lib/format';

export function RiskPage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error } = useDerived();
  const advisor = useAdvisorView();
  const QUESTIONS = questionsFor(state.product);
  const SUPPLEMENT = supplementFor(state.product);
  const pilot = state.product === 'flight-plan';
  const answered = QUESTIONS.filter((q) => state.answers[q.id] != null).length;
  const amount = state.portfolioAmount;
  const fmtAmt = fmtMoney(amount);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-ink-2">Progress <span className="num font-medium text-ink">{answered} of {QUESTIONS.length}</span></div>
          <div className="h-1.5 w-40 rounded-pill bg-line-2 overflow-hidden" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-label="Questions answered">
            <div className="h-full bg-rec" style={{ width: `${(answered / QUESTIONS.length) * 100}%` }} />
          </div>
        </div>
        {QUESTIONS.map((q, qi) => {
          const value = state.answers[q.id];
          return (
            <Panel key={q.id} title={<span className="flex items-center gap-2"><span className="num text-ink-4">{qi + 1}</span><span>{q.section === 'risk' ? 'Risk tolerance' : 'Time horizon'}</span>{advisor && !TEXT_VERIFIED && <VerifyTag label="Verify" source="Question text is a stand-in; replace with the verified questionnaire text" asOf="2026-11" />}</span>} dense>
              <p className="text-sm mb-3">{q.text.replace('{{amount}}', fmtAmt)}</p>
              {q.id === 'q5' && q.ranges && (
                <div className="mb-3 flex flex-col gap-3">
                  <Field label="Amount to invest" htmlFor="q5-amount" inline>
                    <NumberInput id="q5-amount" value={amount} min={1000} max={10_000_000} step={1000} prefix="$" onChange={(v) => update((s) => { s.portfolioAmount = v ?? 100000; })} />
                  </Field>
                  <RangeChart amount={amount} ranges={q.ranges} selected={value ?? null} onSelect={(i) => update((s) => { s.answers.q5 = i; })} />
                  {q.help && <p className="text-xxs text-ink-3">{q.help.replace('{{amount}}', fmtAmt)}</p>}
                </div>
              )}
              <RadioCards
                name={q.id}
                value={value ?? null}
                onChange={(v) => update((s) => { s.answers[q.id] = v; })}
                options={q.options.map((o, i) => ({
                  value: i,
                  label: q.id === 'q5' && q.ranges ? `${o.label}: ${fmtMoney(q.ranges[i][3] * amount)} to ${fmtMoney(q.ranges[i][0] * amount)}` : o.label,
                }))}
              />
            </Panel>
          );
        })}
        <Panel title={pilot ? 'Pilot supplement' : 'Supplement'} subtitle={pilot ? 'not part of the class score; sets your emergency fund and career-risk alerts' : 'not scored; sets your emergency fund'}>
          <div className="flex flex-col gap-4">
            {SUPPLEMENT.map((sq) => (
              <div key={sq.id}>
                <p className="text-sm mb-2">{sq.text}</p>
                <RadioCards name={sq.id} value={state.supplement[sq.id] ?? null} onChange={(v) => update((s) => { s.supplement[sq.id] = v; })} options={sq.options.map((o) => ({ value: o.value, label: o.label }))} columns={2} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="lg:col-span-7 min-w-0">
        <div className="lg:sticky lg:top-[132px] flex flex-col gap-4">
          {error ? <EngineUnavailable error={advisor ? error : undefined} /> : derived ? (
            <>
              <Panel title="Your profile" actions={derived.profile.provisional ? <Chip tone="warn">Provisional</Chip> : <Chip tone="ok">Complete</Chip>}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <RiskGauge value={derived.profile.riskScore} min={6} max={28} label="Risk tolerance" category={derived.profile.risk} provisional={derived.profile.provisional} bands={RISK_BANDS.map((b) => ({ max: b.max, label: b.category }))} />
                  <RiskGauge value={derived.profile.horizonScore} min={4} max={20} label="Time horizon" category={derived.profile.horizon} provisional={derived.profile.provisional} bands={HORIZON_BANDS.map((b) => ({ max: b.max, label: b.category }))} />
                </div>
                <p className="text-xs text-ink-3 mt-2">
                  {derived.profile.provisional
                    ? `Answer all ${derived.profile.total} questions to replace the provisional profile. ${derived.profile.answered} answered so far.`
                    : `Risk ${derived.profile.riskScore} of 28 and horizon ${derived.profile.horizonScore} of 20 map to the ${derived.profile.risk} / ${derived.profile.horizon} model portfolio.`}
                </p>
              </Panel>
              <Panel title="Emergency fund">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Target" value={`${derived.emergency.monthsTarget} mo`} sub={fmtMoney(derived.emergency.target)} />
                  <Stat label="Current" value={`${derived.emergency.monthsCovered.toFixed(1)} mo`} sub={fmtMoney(derived.emergency.current)} />
                  <Stat label="Monthly essentials" value={fmtMoney(derived.emergency.monthlyEssentials)} />
                </div>
                <p className="text-xs text-ink-3 mt-2">{derived.emergency.reason}</p>
              </Panel>
            </>
          ) : <Panel title="Your profile"><p className="text-sm text-ink-3">Computing…</p></Panel>}
          <p className="text-xxs text-ink-3">{QUESTIONNAIRE_SOURCE}</p>
        </div>
      </div>
    </div>
  );
}
