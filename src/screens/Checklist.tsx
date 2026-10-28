import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { QUESTIONS, QUESTIONNAIRE_FOOTNOTE, SUPPLEMENT, type Question } from '../data/questionnaire';
import { AttitudeIndicator } from '../components/AttitudeIndicator';
import { Field, NumberInput, Panel } from '../components/ui';
import { fmtUSD } from '../lib/format';
import { careerRisk, RISK_LABEL } from '../lib/scoring';
import { useDerived } from '../state/derived';
import { useStore } from '../state/store';

export function Checklist() {
  const answers = useStore((s) => s.answers);
  const setAnswer = useStore((s) => s.setAnswer);
  const amount = useStore((s) => s.portfolioAmount);
  const setAmount = useStore((s) => s.setPortfolioAmount);
  const supplement = useStore((s) => s.supplement);
  const setSupplement = useStore((s) => s.setSupplement);
  const { plan, state } = useDerived();
  const score = plan.score;
  const reduce = useReducedMotion();
  const firstOpen = QUESTIONS.findIndex((q) => answers[q.id] === undefined || answers[q.id] === null);
  const [cur, setCur] = useState(firstOpen === -1 ? 0 : firstOpen);
  const q = QUESTIONS[cur];
  const cr = careerRisk(supplement);
  const yearsToRetire = plan.retireAge - state.profile.age;

  const choose = (idx: number) => {
    setAnswer(q.id, idx);
    if (cur < QUESTIONS.length - 1) setTimeout(() => setCur((c) => Math.min(QUESTIONS.length - 1, c + 1)), reduce ? 0 : 280);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr_340px] lg:grid-cols-[240px_1fr]">
      {/* Checklist rail */}
      <Panel title="Investor Checklist" bodyClass="p-2">
        <ol>
          {QUESTIONS.map((x, i) => {
            const pts = score.perQuestion[i].points;
            const active = i === cur;
            return (
              <li key={x.id}>
                <button type="button" onClick={() => setCur(i)} aria-current={active ? 'step' : undefined}
                  className={`num flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] ${active ? 'bg-sel/10 text-sel' : pts !== null ? 'text-ok' : 'text-dim hover:text-white'}`}>
                  <span className="w-5 shrink-0">{pts !== null ? '✓' : `${x.n}.`}</span>
                  <span className="flex-1 truncate font-sans uppercase tracking-wider">{x.short}</span>
                  <span className="shrink-0 border-b border-dotted border-current/40 opacity-60" style={{ width: 18 }} />
                  <span className="w-8 shrink-0 text-right">{pts !== null ? `${pts}` : '—'}</span>
                </button>
                {i === 5 && <div className="mx-2 my-1 border-t border-edge" />}
              </li>
            );
          })}
        </ol>
        <div className="num mt-2 px-2 pb-1 text-[11px] text-dim">{score.answered}/10 COMPLETE</div>
      </Panel>

      {/* Question card */}
      <div className="grid content-start gap-4">
        <Panel title={`Item ${q.n} of 10 · ${q.group === 'risk' ? 'Risk tolerance' : 'Time horizon'}`}
          right={<Field label="Portfolio amount" help="Substitutes into the question text. Default $100,000."><div className="w-36"><NumberInput ariaLabel="Portfolio amount" kind="usd" value={amount} min={1000} onChange={setAmount} /></div></Field>}>
          <AnimatePresence mode="wait">
            <motion.div key={q.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.18 }}>
              <h3 className="text-[17px] leading-snug text-white">
                <span className="num mr-2 text-dim">Q{q.n}.</span>{q.text.replace('{AMT}', fmtUSD(amount))}
              </h3>
              {q.help && <p className="mt-1.5 text-[12px] text-caution">{q.help}</p>}
              {q.id === 'q9' && <p className="mt-1.5 text-[12px] text-dim">Reference: {yearsToRetire} years from age {state.profile.age} to a planned landing at {plan.retireAge}.</p>}
              {q.ranges ? (
                <RangeChooser q={q} amount={amount} value={answers[q.id] ?? null} onChoose={choose} />
              ) : (
                <fieldset className="mt-4">
                  <legend className="sr-only">{q.text.replace('{AMT}', fmtUSD(amount))}</legend>
                  <div className="grid gap-2">
                    {q.options.map((o, i) => {
                      const on = answers[q.id] === i;
                      return (
                        <label key={i} className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 transition-colors ${on ? 'border-sel bg-sel/10' : 'border-edge hover:border-[#3a4c63]'}`}>
                          <input type="radio" name={q.id} className="sr-only" checked={on} onChange={() => choose(i)} />
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-sel' : 'border-dim'}`}>{on && <span className="h-2 w-2 rounded-full bg-sel" />}</span>
                          <span className={`flex-1 text-[14px] ${on ? 'text-sel' : 'text-white'}`}>{o.label}</span>
                          <span className="num text-[12px] text-dim">{o.points} pt{o.points === 1 ? '' : 's'}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 flex justify-between">
            <button type="button" className="btn" disabled={cur === 0} onClick={() => setCur(cur - 1)}>← Prev</button>
            <button type="button" className="btn" disabled={cur === QUESTIONS.length - 1} onClick={() => setCur(cur + 1)}>Next →</button>
          </div>
        </Panel>

        <Panel title="Pilot Supplement · not part of the class score" right={<span className={`num text-[12px] ${cr.level === 'LOW' ? 'text-ok' : cr.level === 'MODERATE' ? 'text-white' : 'text-caution'}`}>CAREER RISK {cr.level}</span>}>
          <div className="grid gap-4 md:grid-cols-2">
            {SUPPLEMENT.map((sq) => (
              <fieldset key={sq.id}>
                <legend className="mb-1.5 text-[13px] text-white">{sq.text}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {sq.options.map((o, i) => {
                    const on = supplement[sq.id] === i;
                    return (
                      <label key={i} className={`cursor-pointer rounded border px-2.5 py-1 text-[12px] ${on ? 'border-sel bg-sel/10 text-sel' : 'border-edge text-dim hover:text-white'}`}>
                        <input type="radio" name={sq.id} className="sr-only" checked={on} onChange={() => setSupplement(sq.id, i)} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-dim">Feeds EICAS alerts and the emergency-fund target: <span className="num text-white">{plan.efMonths} months</span> of expenses.</p>
        </Panel>
      </div>

      {/* Instruments */}
      <div className="grid content-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
        <Panel title="Attitude · Risk Profile">
          <div className="flex flex-col items-center">
            <AttitudeIndicator risk={score.risk} horizon={score.horizon} provisional={!score.complete} />
            <div className="mt-3 grid w-full grid-cols-2 gap-2">
              <div className="rounded border border-edge bg-[#080B10] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-dim">Risk · Q1–Q6</div>
                <div className="num text-2xl text-white">{score.risk}<span className="text-[12px] text-dim">/28</span></div>
                <div className="text-[12px] text-plan">{score.complete ? RISK_LABEL[score.riskCategory] : '—'}</div>
              </div>
              <div className="rounded border border-edge bg-[#080B10] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-dim">Horizon · Q7–Q10</div>
                <div className="num text-2xl text-white">{score.horizon}<span className="text-[12px] text-dim">/20</span></div>
                <div className="text-[12px] text-plan">{score.complete ? score.horizonCategory : '—'}</div>
              </div>
            </div>
            {!score.complete && <p className="mt-2 text-[12px] text-caution">Profile provisional until all 10 items are answered.</p>}
          </div>
        </Panel>
        <Panel title="Score Card">
          <table className="num w-full text-[12px]">
            <tbody>
              {score.perQuestion.map((r) => (
                <tr key={r.id} className={r.n === 7 ? 'border-t border-edge' : ''}>
                  <td className="py-0.5 text-dim">Q{r.n}</td>
                  <td className="py-0.5 font-sans text-dim">{QUESTIONS[r.n - 1].short}</td>
                  <td className={`py-0.5 text-right ${r.points !== null ? 'text-white' : 'text-faint'}`}>{r.points ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-edge"><td colSpan={2} className="pt-1.5 text-dim">RISK (6–28)</td><td className="pt-1.5 text-right text-white">{score.risk}</td></tr>
              <tr><td colSpan={2} className="text-dim">HORIZON (4–20)</td><td className="text-right text-white">{score.horizon}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-snug text-dim">
            Risk: 6–9 Conservative · 10–16 Moderate · 17–23 Assertive · 24–28 Aggressive. Horizon: 4–7 Short · 8–13 Intermediate · 14+ Long.
          </p>
        </Panel>
        <p className="px-1 text-[11px] leading-snug text-dim lg:col-span-2 xl:col-span-1">{QUESTIONNAIRE_FOOTNOTE}</p>
      </div>
    </div>
  );
}

function RangeChooser({ q, amount, value, onChoose }: { q: Question; amount: number; value: number | null; onChoose: (i: number) => void }) {
  const ranges = q.ranges!;
  const lo = 0.7, hi = 1.55;
  const H = 220, W = 520, pad = 44, colW = (W - pad - 10) / ranges.length;
  const y = (m: number) => 12 + ((hi - m) / (hi - lo)) * (H - 24);
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[620px]" aria-hidden="true">
        {[0.75, 1.0, 1.25, 1.5].map((m) => (
          <g key={m}>
            <line x1={pad} x2={W - 6} y1={y(m)} y2={y(m)} stroke={m === 1 ? '#3a4c63' : '#1B2533'} />
            <text x={pad - 6} y={y(m) + 4} fill="#8A99AD" fontSize="10" textAnchor="end" fontFamily="B612 Mono">{fmtUSD(m * amount, { compact: true })}</text>
          </g>
        ))}
        {ranges.map((r, i) => {
          const cx = pad + colW * i + colW / 2;
          const on = value === i;
          const color = on ? '#4FD1FF' : '#C9D4E2';
          return (
            <g key={i} className="cursor-pointer" onClick={() => onChoose(i)}>
              <rect x={cx - colW / 2 + 4} y={6} width={colW - 8} height={H - 12} rx="4" fill={on ? 'rgba(79,209,255,0.08)' : 'transparent'} stroke={on ? '#4FD1FF' : 'transparent'} />
              <rect x={cx - 9} y={y(r.high)} width={18} height={y(r.low) - y(r.high)} fill={on ? 'rgba(79,209,255,0.35)' : 'rgba(201,212,226,0.18)'} stroke={color} strokeWidth="1" />
              <line x1={cx - 14} x2={cx + 14} y1={y(r.median)} y2={y(r.median)} stroke={on ? '#4FD1FF' : '#fff'} strokeWidth="2" />
              <text x={cx} y={y(r.high) - 6} fill={color} fontSize="10" textAnchor="middle" fontFamily="B612 Mono">{fmtUSD(r.high * amount, { compact: true })}</text>
              <text x={cx} y={y(r.low) + 13} fill={color} fontSize="10" textAnchor="middle" fontFamily="B612 Mono">{fmtUSD(r.low * amount, { compact: true })}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 grid grid-cols-5 gap-2 text-center">
        {ranges.map((r, i) => (
          <button key={i} type="button" onClick={() => onChoose(i)} aria-pressed={value === i}
            aria-label={`Range ${i + 1}: high ${fmtUSD(r.high * amount)}, median ${fmtUSD(r.median * amount)}, low ${fmtUSD(r.low * amount)}`}
            className={`rounded border px-1 py-1.5 text-[11px] ${value === i ? 'border-sel bg-sel/10 text-sel' : 'border-edge text-dim hover:text-white'}`}>
            <div className="font-bold">#{i + 1} · {i + 1} pt{i ? 's' : ''}</div>
            <div className="num">med {fmtUSD(r.median * amount, { compact: true })}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-dim">Bars show the one-year high / low; the white tick is the median; the gridline is the starting value ({fmtUSD(amount)}). #5 is stated in the course handout; #1–#4 read off its chart.</p>
    </div>
  );
}
