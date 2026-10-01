import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { creditCheckup, creditInsights, minimumPayment, multiPayoff, payoff, utilization, utilizationBand, type Strategy } from '../lib/credit';
import { Bar, Card, Disclaimer, Insights, NumberInput, ScoreRing, Segmented, money } from '../components/ui';

/** Average credit card APR on new offers was roughly 21–24% in Sept 2026 (WalletHub, LendingTree, Fed G.19). */
const TYPICAL_APR = 0.22;

const FREE_SCORE_LINKS = [
  { name: 'AnnualCreditReport.com', url: 'https://www.annualcreditreport.com', what: 'The official, federally authorized site for free weekly credit reports from Equifax, Experian, and TransUnion.' },
  { name: 'Experian', url: 'https://www.experian.com/consumer-products/free-credit-report.html', what: 'Free Experian report and FICO® Score.' },
  { name: 'Capital One CreditWise', url: 'https://www.capitalone.com/creditwise/', what: 'Free VantageScore® and monitoring. You don’t need to be a Capital One customer.' },
  { name: 'Discover Credit Scorecard', url: 'https://www.creditscorecard.com', what: 'Free FICO® Score. You don’t need to be a Discover customer.' },
  { name: 'Credit Karma', url: 'https://www.creditkarma.com', what: 'Free TransUnion and Equifax VantageScore® scores and alerts.' },
];

const STARTER_PATHS = [
  {
    title: 'Authorized user',
    who: 'Any age (issuer rules vary)',
    how: 'A parent or guardian adds you to their card. Their on-time history can show up on your credit report. You don’t even need to use the card.',
    watch: 'Only works if they pay on time and keep balances low. Their mistakes can show up on your report too.',
  },
  {
    title: 'Secured credit card',
    who: '18+',
    how: 'You put down a refundable deposit (often $200–$500) that becomes your limit. It works like a normal card and reports to the bureaus.',
    watch: 'Pick one with no annual fee that reports to all three bureaus and lets you “graduate” to an unsecured card.',
  },
  {
    title: 'Student credit card',
    who: '18+ (21+, or 18–20 with your own income or a co-signer)',
    how: 'An unsecured starter card with a low limit, made for students with little credit history. Some offer small cash-back rewards.',
    watch: 'Under the CARD Act, applicants under 21 must show independent income or have a co-signer. Skip any card with an annual fee.',
  },
  {
    title: 'Credit-builder loan',
    who: '18+',
    how: 'Offered by credit unions and some apps. You make small monthly payments into a locked savings account, get the money at the end, and build payment history.',
    watch: 'Check the fees and interest. Only take one if the monthly payment fits your budget.',
  },
];

export default function Credit() {
  const { cards, credit, addCard, updateCard, removeCard, setCredit } = useStore();
  const u = utilization(cards);
  const band = utilizationBand(u.overall);
  const check = creditCheckup(credit, u.overall);
  const insights = creditInsights(cards, credit);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Credit</h1>
          <p className="muted">Understand your credit, use cards the smart way, and build a score that saves you money later.</p>
        </div>
      </div>

      <div className="grid g3">
        <Card title="Credit health check" className="span2">
          <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <ScoreRing score={check.health} label="health" />
              <p className="tiny muted" style={{ maxWidth: 140, marginTop: 6 }}>An educational estimate, <strong>not</strong> your actual credit score.</p>
            </div>
            <div className="stack" style={{ flex: 1, minWidth: 240 }}>
              {check.factors.map((f) => (
                <div key={f.key}>
                  <div className="row between small"><strong>{f.label} <span className="muted">· {Math.round(f.weight * 100)}% of FICO</span></strong><span className="muted">{f.status}</span></div>
                  <Bar value={f.rating} color={f.rating > 0.75 ? 'var(--good)' : f.rating > 0.4 ? 'var(--warn)' : 'var(--alert)'} />
                  <p className="tiny muted" style={{ marginTop: 3 }}>{f.tip}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="About you">
          <div className="stack">
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={credit.hasCredit} onChange={(e) => setCredit({ hasCredit: e.target.checked })} />
              I have a credit card, loan, or am an authorized user
            </label>
            {credit.hasCredit && (
              <>
                <label className="field">Missed payments (last 2 years)<NumberInput value={credit.missedPayments} onChange={(v) => setCredit({ missedPayments: Math.round(v) })} step={1} /></label>
                <label className="field">Age of oldest account (years)<NumberInput value={credit.oldestAccountYears} onChange={(v) => setCredit({ oldestAccountYears: v })} step={0.5} /></label>
                <label className="field">Credit applications (last 12 months)<NumberInput value={credit.hardInquiries} onChange={(v) => setCredit({ hardInquiries: Math.round(v) })} step={1} /></label>
                <label className="field">Types of credit (card, student loan, car loan…)<NumberInput value={credit.accountTypes} onChange={(v) => setCredit({ accountTypes: Math.round(v) })} step={1} /></label>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid g3 mt">
        <Card title="Your cards" className="span2" action={<button className="primary" onClick={() => addCard({ name: `Card ${cards.length + 1}`, balance: 0, limit: 1000, apr: TYPICAL_APR })}>+ Add card</button>}>
          {cards.length === 0 ? (
            <div className="empty">No cards yet, and that’s totally fine. Check out the starter options below.</div>
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span>Overall utilization: <strong>{Math.round(u.overall * 100)}%</strong> <span className={`pill ${band.severity}`}>{band.label}</span></span>
                <span className="small muted">{money(u.balance)} of {money(u.limit)}</span>
              </div>
              <Bar value={u.overall} color={band.severity === 'good' ? 'var(--good)' : band.severity === 'warn' ? 'var(--warn)' : 'var(--alert)'} />
              <div className="table-wrap mt">
                <table>
                  <thead><tr><th>Card</th><th>Balance</th><th>Limit</th><th>APR %</th><th>Used</th><th>Min. payment</th><th /></tr></thead>
                  <tbody>
                    {cards.map((c) => (
                      <tr key={c.id}>
                        <td style={{ minWidth: 140 }}><input value={c.name} onChange={(e) => updateCard(c.id, { name: e.target.value })} aria-label="Card name" /></td>
                        <td style={{ width: 120 }}><NumberInput money value={c.balance} onChange={(v) => updateCard(c.id, { balance: v })} aria-label="Balance" /></td>
                        <td style={{ width: 120 }}><NumberInput money value={c.limit} onChange={(v) => updateCard(c.id, { limit: v })} aria-label="Limit" /></td>
                        <td style={{ width: 90 }}><NumberInput value={+(c.apr * 100).toFixed(2)} onChange={(v) => updateCard(c.id, { apr: v / 100 })} aria-label="APR" /></td>
                        <td className="num">{c.limit ? Math.round((c.balance / c.limit) * 100) : 0}%</td>
                        <td className="num">{money(minimumPayment(c.balance, c.apr), 2)}</td>
                        <td><button className="ghost" aria-label={`Remove ${c.name}`} onClick={() => removeCard(c.id)}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
        <Card title="Insights">
          {insights.length ? <Insights items={insights} /> : <p className="muted small">Add a card to get personalized tips.</p>}
        </Card>
      </div>

      <div className="grid g2 mt">
        <PayoffCalculator />
        {cards.filter((c) => c.balance > 0).length >= 2 ? <MultiCardPlan /> : <CheckRealScore />}
      </div>
      {cards.filter((c) => c.balance > 0).length >= 2 && <div className="mt"><CheckRealScore /></div>}

      <Card title="Starter credit: how to build credit from zero" className="mt">
        <div className="grid g4">
          {STARTER_PATHS.map((p) => (
            <div key={p.title} className="stack" style={{ gap: 6 }}>
              <h3>{p.title}</h3>
              <span className="pill info" style={{ alignSelf: 'flex-start' }}>{p.who}</span>
              <p className="small">{p.how}</p>
              <p className="tiny muted"><strong>Watch out:</strong> {p.watch}</p>
            </div>
          ))}
        </div>
        <div className="insight good mt">
          <span className="eyebrow tag">The simple recipe</span>
          <div>
            <p className="small muted">
              One card, one small recurring bill (like a streaming plan), autopay set to the <strong>full statement balance</strong>, and don’t touch it otherwise. That builds
              on-time history and low utilization, and you pay $0 in interest.
            </p>
          </div>
        </div>
      </Card>
      <Disclaimer />
    </>
  );
}

function PayoffCalculator() {
  const [balance, setBalance] = useState(1500);
  const [apr, setApr] = useState(TYPICAL_APR * 100);
  const [payment, setPayment] = useState(100);
  const min = useMemo(() => payoff(balance, apr / 100, 'minimum'), [balance, apr]);
  const fixed = useMemo(() => payoff(balance, apr / 100, payment), [balance, apr, payment]);
  const len = Math.min(Math.max(min.schedule.length, fixed.schedule.length), 361);
  const data = Array.from({ length: len }, (_, m) => ({ month: m, minimum: min.schedule[m]?.balance ?? 0, fixed: fixed.schedule[m]?.balance ?? 0 })).filter((_, i) => i % 3 === 0);
  const fmtTime = (m: number) => (Number.isFinite(m) ? `${Math.floor(m / 12)} yr ${m % 12} mo` : 'Never');

  return (
    <Card title="Payoff calculator: the minimum-payment trap">
      <div className="grid g3" style={{ gap: 10 }}>
        <label className="field">Balance<NumberInput money value={balance} onChange={setBalance} aria-label="Balance" /></label>
        <label className="field">APR<NumberInput value={apr} onChange={setApr} suffix="%" aria-label="APR" /></label>
        <label className="field">Your payment<NumberInput money value={payment} onChange={setPayment} aria-label="Monthly payment" /></label>
      </div>
      <div className="grid g2 mt" style={{ gap: 10 }}>
        <div className="insight alert">
          <span className="eyebrow tag">Minimum only</span><p className="small">{fmtTime(min.months)} · <strong>{Number.isFinite(min.totalInterest) ? money(min.totalInterest) : '∞'}</strong> interest</p>
        </div>
        <div className="insight good">
          <span className="eyebrow tag">{money(payment)} a month</span><p className="small">{fmtTime(fixed.months)} · <strong>{Number.isFinite(fixed.totalInterest) ? money(fixed.totalInterest) : '∞'}</strong> interest</p>
        </div>
      </div>
      {!Number.isFinite(fixed.months) && <p className="small" style={{ color: 'var(--alert)', marginTop: 8 }}>That payment doesn’t even cover the monthly interest. The balance would never shrink.</p>}
      <div style={{ height: 180, marginTop: 10 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, 'dataMax']}
              ticks={Array.from({ length: Math.floor(len / 12) + 1 }, (_, y) => y * 12).filter((_, i, a) => a.length <= 12 || i % Math.ceil(a.length / 12) === 0)}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(m) => `${m / 12}y`}
            />
            <YAxis tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={56} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} formatter={(v) => money(Number(v))} labelFormatter={(m) => `Month ${m}`} />
            <Line dataKey="minimum" name="Minimum only" stroke="var(--alert)" strokeWidth={2} dot={false} />
            <Line dataKey="fixed" name="Your payment" stroke="var(--good)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="tiny muted">Minimum assumed as the greater of $25 or 1% of the balance plus interest, a common issuer formula. Check your statement for yours.</p>
    </Card>
  );
}

function MultiCardPlan() {
  const cards = useStore((s) => s.cards);
  const [strategy, setStrategy] = useState<Strategy>('avalanche');
  const minTotal = cards.reduce((t, c) => t + minimumPayment(c.balance, c.apr), 0);
  const [budget, setBudget] = useState(Math.ceil(minTotal + 50));
  const plan = multiPayoff(cards, budget, strategy);
  const other = multiPayoff(cards, budget, strategy === 'avalanche' ? 'snowball' : 'avalanche');
  return (
    <Card title="Paying off multiple cards">
      <div className="row" style={{ marginBottom: 10 }}>
        <Segmented value={strategy} onChange={setStrategy} options={[{ value: 'avalanche', label: 'Avalanche (highest APR first)' }, { value: 'snowball', label: 'Snowball (smallest first)' }]} />
      </div>
      <label className="field" style={{ width: 200 }}>Total monthly budget<NumberInput money value={budget} onChange={setBudget} aria-label="Budget" /></label>
      {plan.feasible ? (
        <div className="stack mt">
          <p>Debt-free in <strong>{plan.months} months</strong>, paying <strong>{money(plan.totalInterest)}</strong> in interest.</p>
          {other.feasible && (
            <p className="small muted">
              {strategy === 'avalanche' ? 'Snowball' : 'Avalanche'} would take {other.months} months and cost {money(other.totalInterest)}.
              {strategy === 'avalanche' ? ' Avalanche saves the most money.' : ' Snowball gives quicker wins, which helps some people stay motivated.'}
            </p>
          )}
          <p className="small">Payoff order: {plan.order.map((id) => cards.find((c) => c.id === id)?.name).join(', then ')}</p>
        </div>
      ) : (
        <p className="small mt" style={{ color: 'var(--alert)' }}>You need at least {money(minTotal, 2)}/month to cover all minimum payments.</p>
      )}
    </Card>
  );
}

function CheckRealScore() {
  return (
    <Card title="Check your real credit score, free">
      <p className="small muted" style={{ marginBottom: 10 }}>
        Checking your own score is a “soft inquiry” and never hurts it. Under 18? You probably don’t have a credit file yet, and that’s normal.
      </p>
      <div className="stack">
        {FREE_SCORE_LINKS.map((l) => (
          <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="insight" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3>{l.name}</h3><p className="small muted">{l.what}</p>
          </a>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Sprout isn’t affiliated with these companies and doesn’t receive money from them. Beware of “free” sites that ask for a card number.</p>
    </Card>
  );
}
