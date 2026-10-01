import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import {
  CATEGORY_SUGGESTIONS,
  analyzeBudget,
  emergencyFundTarget,
  growthSeries,
  monthlyNeeded,
  monthsToGoal,
  smallHabitCost,
  type SpendType,
} from '../lib/savings';
import { Bar, Card, Disclaimer, Insights, NumberInput, Segmented, celebrate, money, ConfirmButton } from '../components/ui';

/** High-yield savings accounts paid roughly 4% APY in Oct 2026; the national average savings rate was ~0.4%. */
const HYSA_RATE = 0.04;
const AVG_SAVINGS_RATE = 0.004;

const TYPE_LABEL: Record<SpendType, string> = { need: 'Need', want: 'Want', save: 'Save' };
const TYPE_COLOR: Record<SpendType, string> = { need: 'var(--c2)', want: 'var(--c4)', save: 'var(--c1)' };

export default function Savings() {
  const s = useStore();
  const budget = useMemo(() => analyzeBudget(s.income, s.budget), [s.income, s.budget]);
  const ef = emergencyFundTarget(budget.needs);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Savings</h1>
          <p className="muted">Know where your money goes, set goals, and watch them fill up.</p>
        </div>
      </div>

      <Goals />

      <div className="grid g3 mt">
        <Card title="Monthly budget" className="span2">
          <div className="row" style={{ marginBottom: 14 }}>
            <label className="field" style={{ width: 200 }}>Money in per month
              <NumberInput money value={s.income} onChange={s.setIncome} aria-label="Monthly income" />
            </label>
            <p className="small muted" style={{ flex: 1, minWidth: 200 }}>Job, allowance, gig work, or aid refunds: whatever regularly comes in, after taxes.</p>
          </div>

          {s.income > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }}>
                {(['need', 'want', 'save'] as SpendType[]).map((t) => {
                  const v = t === 'need' ? budget.shares.needs : t === 'want' ? budget.shares.wants : budget.shares.savings;
                  return <div key={t} title={TYPE_LABEL[t]} style={{ width: `${Math.min(1, v) * 100}%`, background: TYPE_COLOR[t] }} />;
                })}
              </div>
              <div className="row small" style={{ marginTop: 6, gap: 16 }}>
                <span><span className="swatch" style={{ display: 'inline-block', background: TYPE_COLOR.need }} /> Needs {Math.round(budget.shares.needs * 100)}% <span className="muted">(guide 50%)</span></span>
                <span><span className="swatch" style={{ display: 'inline-block', background: TYPE_COLOR.want }} /> Wants {Math.round(budget.shares.wants * 100)}% <span className="muted">(guide 30%)</span></span>
                <span><span className="swatch" style={{ display: 'inline-block', background: TYPE_COLOR.save }} /> Savings {Math.round(budget.shares.savings * 100)}% <span className="muted">(guide 20%)</span></span>
                <span className="muted">Left over: <strong style={{ color: budget.unassigned < 0 ? 'var(--alert)' : 'var(--text)' }}>{money(budget.unassigned)}</strong></span>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Type</th><th style={{ width: 140 }}>Per month</th><th /></tr></thead>
              <tbody>
                {s.budget.map((l) => (
                  <tr key={l.id}>
                    <td style={{ minWidth: 160 }}><input value={l.label} onChange={(e) => s.updateBudgetLine(l.id, { label: e.target.value })} aria-label="Item name" /></td>
                    <td style={{ minWidth: 90 }}>
                      <select value={l.type} onChange={(e) => s.updateBudgetLine(l.id, { type: e.target.value as SpendType })} aria-label="Type">
                        {(['need', 'want', 'save'] as SpendType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                      </select>
                    </td>
                    <td><NumberInput money value={l.amount} onChange={(v) => s.updateBudgetLine(l.id, { amount: v })} aria-label={`${l.label} amount`} /></td>
                    <td><button className="ghost" aria-label={`Remove ${l.label}`} onClick={() => s.removeBudgetLine(l.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row mt">
            <span className="small muted">Quick add:</span>
            {CATEGORY_SUGGESTIONS.filter((c) => !s.budget.some((l) => l.label === c.label)).slice(0, 6).map((c) => (
              <button key={c.label} className="pill" style={{ border: 'none', cursor: 'pointer' }} onClick={() => s.addBudgetLine({ ...c, amount: 0 })}>+ {c.label}</button>
            ))}
            <button className="pill" style={{ border: 'none', cursor: 'pointer' }} onClick={() => s.addBudgetLine({ label: 'New item', amount: 0, type: 'want', category: 'Other' })}>+ Custom</button>
          </div>
        </Card>

        <div className="stack">
          <Card title="Insights"><Insights items={budget.insights} /></Card>
          <Card title="Emergency fund">
            <p className="small">
              Starter goal: <strong>{money(ef.starter)}</strong>. Full goal: <strong>{money(ef.full)}</strong>{' '}
              <span className="muted">(3 months of needs)</span>.
            </p>
            {!s.goals.some((g) => /emergency/i.test(g.name)) && (
              <button className="mt" onClick={() => { s.addGoal({ name: 'Emergency fund', target: ef.starter, deadline: '' }); celebrate('Goal created · +10 XP'); }}>
                + Create emergency fund goal
              </button>
            )}
          </Card>
        </div>
      </div>

      <div className="grid g2 mt">
        <CompoundCalculator />
        <HabitCalculator />
      </div>
      <Disclaimer />
    </>
  );
}

function Goals() {
  const { goals, addGoal, removeGoal, deposit } = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', target: 500, deadline: '' });
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  return (
    <Card title="Savings goals" action={<button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New goal'}</button>}>
      {adding && (
        <form
          className="row"
          style={{ alignItems: 'flex-end', marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim() || draft.target <= 0) return;
            addGoal({ ...draft, name: draft.name.trim() });
            celebrate('Goal created · 10 XP');
            setAdding(false);
            setDraft({ name: '', target: 500, deadline: '' });
          }}
        >
          <label className="field" style={{ flex: '2 1 180px' }}>What are you saving for?
            <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="New laptop, car, trip…" />
          </label>
          <label className="field" style={{ flex: '1 1 120px' }}>Target<NumberInput money value={draft.target} onChange={(v) => setDraft({ ...draft, target: v })} aria-label="Target" /></label>
          <label className="field" style={{ flex: '1 1 140px' }}>By (optional)<input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
          <button className="primary" type="submit">Save goal</button>
        </form>
      )}

      {goals.length === 0 && !adding && (
        <div className="empty">Saving is easier with a target. What do you want to save for?</div>
      )}

      <div className="grid g3">
        {goals.map((g) => {
          const progress = g.target ? g.saved / g.target : 0;
          const monthsLeft = g.deadline ? Math.max(1, Math.round((new Date(g.deadline).getTime() - Date.now()) / (30.44 * 864e5))) : 0;
          const perMonth = g.deadline ? monthlyNeeded(g.saved, g.target, monthsLeft, HYSA_RATE) : 0;
          const amt = amounts[g.id] ?? 20;
          const done = g.saved >= g.target;
          return (
            <div key={g.id} className="card" style={{ boxShadow: 'none' }}>
              <div className="row between">
                <h3>{g.name}</h3>
                <ConfirmButton label="Delete" confirmLabel="Confirm delete" ariaLabel={`Delete ${g.name}`} onConfirm={() => removeGoal(g.id)} />
              </div>
              <div className="row between" style={{ margin: '8px 0 4px' }}>
                <strong className="num">{money(g.saved)}</strong><span className="muted small num">of {money(g.target)}</span>
              </div>
              <Bar value={progress} color={done ? 'var(--good)' : undefined} />
              <p className="tiny muted" style={{ marginTop: 6 }}>
                {done
                  ? 'Goal reached. Well done.'
                  : g.deadline
                    ? `Save about ${money(perMonth)}/month to hit it by ${new Date(g.deadline + 'T00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.`
                    : `${Math.round(progress * 100)}% there. Keep going!`}
              </p>
              <div className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }}>
                <NumberInput money value={amt} onChange={(v) => setAmounts({ ...amounts, [g.id]: v })} aria-label={`Amount for ${g.name}`} />
                <button
                  className="primary"
                  disabled={amt <= 0}
                  onClick={() => {
                    deposit(g.id, amt);
                    celebrate(g.saved + amt >= g.target && !done ? `You reached “${g.name}”` : `${money(amt)} saved · 10 XP`);
                  }}
                >
                  Add
                </button>
                <button title="Withdraw" aria-label={`Withdraw from ${g.name}`} disabled={amt <= 0 || g.saved <= 0} onClick={() => deposit(g.id, -Math.min(amt, g.saved))}>−</button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CompoundCalculator() {
  const [start, setStart] = useState(500);
  const [monthly, setMonthly] = useState(50);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState<'avg' | 'hysa' | 'stocks'>('hysa');
  const r = rate === 'avg' ? AVG_SAVINGS_RATE : rate === 'hysa' ? HYSA_RATE : 0.07;
  const data = growthSeries(start, monthly, r, years);
  const last = data[data.length - 1];
  const goal = 10000;
  const months = monthsToGoal(start, goal, monthly, r);

  return (
    <Card title="Compound growth calculator">
      <div className="grid g3" style={{ gap: 10 }}>
        <label className="field">Start with<NumberInput money value={start} onChange={setStart} aria-label="Starting amount" /></label>
        <label className="field">Add monthly<NumberInput money value={monthly} onChange={setMonthly} aria-label="Monthly amount" /></label>
        <label className="field">Years: {years}<input type="range" min={1} max={45} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>
      </div>
      <div style={{ margin: '12px 0' }}>
        <Segmented
          value={rate}
          onChange={setRate}
          options={[
            { value: 'avg', label: 'Regular savings 0.4%' },
            { value: 'hysa', label: 'High-yield 4%' },
            { value: 'stocks', label: 'Stock index ~7%*' },
          ]}
        />
      </div>
      <div className="row between">
        <div><div className="stat-label">You put in</div><div className="stat-value">{money(last.contributed)}</div></div>
        <div><div className="stat-label">It grows to</div><div className="stat-value" style={{ color: 'var(--good)' }}>{money(last.balance)}</div></div>
        <div><div className="stat-label">Free money (interest)</div><div className="stat-value">{money(last.balance - last.contributed)}</div></div>
      </div>
      <div style={{ height: 180, marginTop: 10 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={48} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} formatter={(v) => money(Number(v))} labelFormatter={(y) => `Year ${y}`} />
            <Area dataKey="balance" name="Balance" stroke="var(--c1)" fill="var(--c1)" fillOpacity={0.2} strokeWidth={2} />
            <Area dataKey="contributed" name="You put in" stroke="var(--c7)" fill="var(--c7)" fillOpacity={0.1} strokeDasharray="4 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="tiny muted">
        {Number.isFinite(months) ? `At this pace you’d reach $10,000 in about ${Math.floor(months / 12)} yr ${months % 12} mo. ` : ''}
        Savings rates as of Oct 2026 and can change. *Stocks average around 7%/yr over long periods but can drop 30%+ in a bad year. Not guaranteed.
      </p>
    </Card>
  );
}

function HabitCalculator() {
  const [perWeek, setPerWeek] = useState(25);
  const [label, setLabel] = useState('Takeout & coffee');
  const r = smallHabitCost(perWeek, 0.07, 10);
  const half = smallHabitCost(perWeek / 2, 0.07, 10);
  return (
    <Card title="The small-habit calculator">
      <p className="small muted" style={{ marginBottom: 10 }}>No guilt here: spend on what you love. This just shows what small habits add up to, so you can choose on purpose.</p>
      <div className="grid g2" style={{ gap: 10 }}>
        <label className="field">Habit<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field">Per week<NumberInput money value={perWeek} onChange={setPerWeek} aria-label="Per week" /></label>
      </div>
      <div className="stack mt">
        <div className="insight info">
          <span className="eyebrow tag">Per year</span>
          <div className="stat-value">{money(r.perYear)}</div>
          <p className="small muted">What “{label}” costs you annually.</p>
        </div>
        <div className="insight good">
          <span className="eyebrow tag">Cut it in half and invest the rest</span>
          <div className="stat-value">{money(half.invested)}</div>
          <p className="small muted">after 10 years, investing the {money(perWeek / 2)} a week you save at a hypothetical 7% average return.</p>
        </div>
      </div>
    </Card>
  );
}
