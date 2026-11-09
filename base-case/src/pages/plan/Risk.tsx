import { useState } from 'react';
import { usePlanStore } from '@/state/plan';
import { useDerived } from '@/state/derived';
import { useAdvisorView, useCockpit } from './PlanLayout';
import { Button, Chip, Field, NumberInput, Panel, RadioCards, Stat, VerifyTag, cx } from '@/components/ui';
import { RangeChart } from '@/components/charts/RangeChart';
import { RiskGauge } from '@/components/charts/RiskGauge';
import { AttitudeIndicator } from '@/components/charts/AttitudeIndicator';
import { EngineUnavailable } from '@/components/EngineUnavailable';
import { HORIZON_BANDS, QUESTIONNAIRE_SOURCE, RISK_BANDS, TEXT_VERIFIED, questionsFor, supplementFor } from '@shared/data/questionnaire';
import { fmtMoney } from '@/lib/format';

export function RiskPage() {
  const cockpit = useCockpit();
  return cockpit ? <ChecklistPage /> : <RiskPageClassic />;
}

/** Flight Plan "Checklist": one item at a time, the list of items with scores on the left, the attitude indicator on the right. */
function ChecklistPage() {
  const state = usePlanStore((s) => s.state);
  const update = usePlanStore((s) => s.update);
  const { derived, error } = useDerived();
  const advisor = useAdvisorView();
  const QUESTIONS = questionsFor(state.product);
  const SUPPLEMENT = supplementFor(state.product);
  const firstOpen = Math.max(0, QUESTIONS.findIndex((q) => state.answers[q.id] == null));
  const [idx, setIdx] = useState(firstOpen);
  const q = QUESTIONS[Math.min(idx, QUESTIONS.length - 1)];
  const answered = QUESTIONS.filter((x) => state.answers[x.id] != null).length;
  const amount = state.portfolioAmount;
  const fmtAmt = fmtMoney(amount);
  const value = state.answers[q.id];
  const points = (x: typeof q) => { const a = state.answers[x.id]; return a == null ? null : x.options[a]?.points ?? null; };
  const careerRisk = (() => {
    const s1 = state.supplement.s1;
    return s1 == null ? null : s1 >= 2 ? 'High' : s1 === 1 ? 'Moderate' : 'Low';
  })();
  const profile = derived?.profile;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Panel title="Investor checklist" className="lg:col-span-3 self-start" dense>
        <ol className="flex flex-col">
          {QUESTIONS.map((x, i) => {
            const pts = points(x);
            const cur = x.id === q.id;
            return (
              <li key={x.id} className={cx(i === 6 && 'mt-2 pt-2 border-t border-line-2')}>
                <button type="button" onClick={() => setIdx(i)} aria-current={cur ? 'step' : undefined} className={cx('flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-[12px] uppercase tracking-[0.1em] focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', cur ? 'bg-edit/10 text-edit' : pts != null ? 'text-ok' : 'text-ink-3 hover:text-ink')}>
                  <span className="num w-3 shrink-0 text-[11px]">{pts != null ? '✓' : '·'}</span>
                  <span className="flex-1 truncate">{x.short ?? `Q${i + 1}`}</span>
                  <span className="text-ink-4 text-[10px] tracking-normal">·······</span>
                  <span className="num w-4 text-right text-[12px]">{pts ?? ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-ink-3 num">{answered}/{QUESTIONS.length} complete</div>
      </Panel>

      <div className="lg:col-span-6 flex flex-col gap-4 min-w-0">
        <Panel
          title={<span>Item {idx + 1} of {QUESTIONS.length} · {q.section === 'risk' ? 'Risk tolerance' : 'Time horizon'}{advisor && !TEXT_VERIFIED && <VerifyTag label="Verify" source="Question text is a stand-in; replace with the verified questionnaire text" asOf="2026-11" />}</span>}
          actions={<Field label="Portfolio amount" htmlFor="q-amount" inline help="The hypothetical amount the questions refer to."><NumberInput id="q-amount" compact value={amount} min={1000} max={10_000_000} step={1000} prefix="$" onChange={(v) => update((s) => { s.portfolioAmount = v ?? 100000; })} /></Field>}
        >
          <p className="text-[17px] leading-6 mb-4"><span className="num text-ink-3 mr-2">Q{idx + 1}.</span>{q.text.replace('{{amount}}', fmtAmt)}</p>
          {q.id === 'q5' && q.ranges && (
            <div className="mb-3 flex flex-col gap-3">
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
              label: (
                <span className="flex items-center justify-between gap-3 w-full">
                  <span>{q.id === 'q5' && q.ranges ? `${o.label}: ${fmtMoney(q.ranges[i][3] * amount)} to ${fmtMoney(q.ranges[i][0] * amount)}` : o.label}</span>
                  <span className="num text-[11px] text-ink-3 shrink-0">{o.points} pt{o.points === 1 ? '' : 's'}</span>
                </span>
              ),
            }))}
          />
          <div className="mt-4 flex items-center justify-between">
            <Button disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>← Prev</Button>
            <Button variant={value != null ? 'primary' : 'secondary'} disabled={idx >= QUESTIONS.length - 1} onClick={() => setIdx((i) => Math.min(QUESTIONS.length - 1, i + 1))}>Next →</Button>
          </div>
        </Panel>

        <Panel title="Pilot supplement · not part of the class score" actions={careerRisk && <span className={cx('text-[11px] uppercase tracking-[0.14em]', careerRisk === 'High' ? 'text-warn' : careerRisk === 'Moderate' ? 'text-ink-2' : 'text-ok')}>Career risk {careerRisk}</span>}>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {SUPPLEMENT.map((sq) => (
              <div key={sq.id}>
                <p className="text-sm mb-2">{sq.text}</p>
                <RadioCards name={sq.id} value={state.supplement[sq.id] ?? null} onChange={(v) => update((s) => { s.supplement[sq.id] = v; })} options={sq.options.map((o) => ({ value: o.value, label: o.label }))} />
              </div>
            ))}
          </div>
          {derived && <p className="text-xs text-ink-3 mt-3">Feeds EICAS alerts and the emergency-fund target: <span className="num text-ink">{derived.emergency.monthsTarget} months</span> of expenses.</p>}
        </Panel>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-4 min-w-0">
        {error ? <EngineUnavailable error={advisor ? error : undefined} /> : (
          <>
            <Panel title="Attitude · risk profile" actions={profile?.provisional ? <Chip tone="warn">Provisional</Chip> : undefined}>
              <div className="flex flex-col items-center">
                <div className="flex w-full justify-between text-[9px] uppercase tracking-[0.14em] text-ink-3 px-1 mb-1"><span>Conservative</span><span>Aggressive</span></div>
                <AttitudeIndicator risk={profile?.riskScore ?? null} horizon={profile?.horizonScore ?? null} size={180} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded border border-line bg-paper p-2.5">
                  <div className="label-caps">Risk · Q1–Q6</div>
                  <div className="num text-[22px] leading-7">{profile?.riskScore ?? '—'}<span className="text-[12px] text-ink-3">/28</span></div>
                  <div className="text-xs text-rec">{profile?.risk ?? '—'}</div>
                </div>
                <div className="rounded border border-line bg-paper p-2.5">
                  <div className="label-caps">Horizon · Q7–Q10</div>
                  <div className="num text-[22px] leading-7">{profile?.horizonScore ?? '—'}<span className="text-[12px] text-ink-3">/20</span></div>
                  <div className="text-xs text-rec">{profile?.horizon ?? '—'}</div>
                </div>
              </div>
            </Panel>
            <Panel title="Score card" dense>
              <table className="w-full text-xs">
                <tbody>
                  {QUESTIONS.map((x, i) => (
                    <tr key={x.id} className="border-b border-line-2 last:border-0">
                      <td className="num py-1 text-ink-3 w-8">Q{i + 1}</td>
                      <td className="py-1">{x.short}</td>
                      <td className="num py-1 text-right">{points(x) ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line"><td colSpan={2} className="num py-1.5 uppercase tracking-[0.1em] text-ink-3">Risk (6–28)</td><td className="num py-1.5 text-right">{profile?.riskScore ?? '—'}</td></tr>
                  <tr><td colSpan={2} className="num py-1 uppercase tracking-[0.1em] text-ink-3">Horizon (4–20)</td><td className="num py-1 text-right">{profile?.horizonScore ?? '—'}</td></tr>
                </tbody>
              </table>
              <p className="text-[11px] text-ink-3 mt-2">Risk: {RISK_BANDS.map((b, i) => `${i === 0 ? 6 : RISK_BANDS[i - 1].max + 1}–${b.max} ${b.category}`).join(' · ')}. Horizon: {HORIZON_BANDS.map((b, i) => `${i === 0 ? 4 : HORIZON_BANDS[i - 1].max + 1}–${b.max} ${b.category.replace('-term', '')}`).join(' · ')}.</p>
            </Panel>
            {derived && (
              <Panel title="Emergency fund" dense>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Target" value={`${derived.emergency.monthsTarget} mo`} sub={fmtMoney(derived.emergency.target)} />
                  <Stat label="Current" value={`${derived.emergency.monthsCovered.toFixed(1)} mo`} sub={fmtMoney(derived.emergency.current)} />
                  <Stat label="Essentials" value={fmtMoney(derived.emergency.monthlyEssentials)} sub="per month" />
                </div>
              </Panel>
            )}
            <p className="text-xxs text-ink-3">{QUESTIONNAIRE_SOURCE}</p>
          </>
        )}
      </div>
    </div>
  );
}

function RiskPageClassic() {
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
