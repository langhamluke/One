import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import {
  CLASS_FUNDS,
  OPT_CLASSES,
  PROFILE_RISK_AVERSION,
  afterTaxAssumptions,
  optimizeUtility,
  rebalanceTaxCost,
  utility,
  type AccountType,
  type TaxSettings,
  RISK_FREE,
  badYear,
  contributionPlan,
  currentMix,
  efficientFrontier,
  evaluate,
  maxReturn,
  maxSharpe,
  minVolatility,
  portfolioForProfile,
  projectGrowth,
  rebalanceTrades,
  riskContributions,
  type OptClass,
  type Weights,
} from '../lib/optimizer';
import { pct } from '../lib/portfolio';
import { RISK_PROFILE_LABELS, type RiskProfile } from '../lib/types';
import { CHART_COLORS, Card, Disclaimer, Legend, NumberInput, Segmented, money, tooltipStyle } from '../components/ui';

const CLASS_LABEL: Record<OptClass, string> = {
  usStocks: 'U.S. stocks',
  intlStocks: 'International stocks',
  emStocks: 'Emerging markets',
  bonds: 'Bonds',
  cash: 'Cash',
  realEstate: 'Real estate (REITs)',
};

const PROFILE_BLURB: Record<RiskProfile, string> = {
  cautious: 'Smaller swings, slower growth. Good for money you need in a few years.',
  balanced: 'A middle path between growth and stability.',
  growth: 'Mostly stocks for long-term growth, with a bond cushion.',
  aggressive: 'Nearly all stocks. Biggest long-run growth, and the biggest drops along the way.',
};

type Objective = 'utility' | 'return' | 'risk' | 'sharpe' | 'tax' | 'custom';
const OBJECTIVES: { value: Objective; label: string; blurb: string }[] = [
  { value: 'utility', label: 'My risk tolerance', blurb: 'Maximizes your utility: the best trade-off between return and risk at the risk tolerance you set.' },
  { value: 'return', label: 'Return', blurb: 'Maximizes expected return within the diversification limits. Expect the biggest swings.' },
  { value: 'risk', label: 'Risk', blurb: 'Minimizes volatility: the smallest swings this set of assets can achieve.' },
  { value: 'sharpe', label: 'Sharpe ratio', blurb: 'Maximizes the Sharpe ratio: the most expected return per unit of risk taken.' },
  {
    value: 'tax',
    label: 'Taxes',
    blurb: 'Maximizes your utility after taxes. In a taxable account, interest from bonds, cash, and REITs is taxed every year at income-tax rates, while stock funds mostly grow untaxed until you sell. So the tax-aware mix leans toward stock funds.',
  },
  { value: 'custom', label: 'Build your own', blurb: 'Drag the sliders and watch the risk and return numbers update.' },
];
const BRACKETS = [0.1, 0.12, 0.22, 0.24];
/** Long-term gains and qualified dividends are 0% for single filers under $49,450 of taxable income (2026), which lines up with the 10–12% brackets. */
const qualifiedRateFor = (ordinary: number) => (ordinary <= 0.12 ? 0 : 0.15);

export default function Optimizer() {
  const { holdings, profile, setProfile } = useStore();
  const risk = profile.riskProfile;
  const frontier = useMemo(() => efficientFrontier(), []);
  const best = maxSharpe(frontier);
  const [objective, setObjective] = useState<Objective>('utility');
  const [riskAversion, setRiskAversion] = useState(PROFILE_RISK_AVERSION[risk]);
  const [account, setAccount] = useState<AccountType>('taxable');
  const [ordinaryRate, setOrdinaryRate] = useState(0.12);
  const [gainShare, setGainShare] = useState(0.2);
  const tax: TaxSettings = { account, ordinaryRate, qualifiedRate: qualifiedRateFor(ordinaryRate) };
  const [custom, setCustom] = useState<Weights>(() => portfolioForProfile(frontier, risk).weights);
  const customSum = OPT_CLASSES.reduce((t, c) => t + custom[c], 0);
  const target =
    objective === 'sharpe'
      ? best
      : objective === 'risk'
        ? minVolatility(frontier)
        : objective === 'return'
          ? maxReturn(frontier)
          : objective === 'custom'
            ? evaluate(Object.fromEntries(OPT_CLASSES.map((c) => [c, customSum ? custom[c] / customSum : 0])) as Weights)
            : objective === 'tax'
              ? optimizeUtility(riskAversion, { assumptions: afterTaxAssumptions(tax) })
              : optimizeUtility(riskAversion);
  const rc = riskContributions(target.weights);
  const worst = badYear(target);
  const mix = useMemo(() => currentMix(holdings), [holdings]);

  const [mode, setMode] = useState<'contribute' | 'rebalance'>('contribute');
  const [contribution, setContribution] = useState(100);
  const [monthly, setMonthly] = useState(100);
  const [years, setYears] = useState(Math.max(10, 65 - profile.age));

  const trades = mode === 'rebalance' ? rebalanceTrades(mix, target.weights) : contributionPlan(mix, target.weights, contribution);
  const projection = useMemo(
    () => projectGrowth({ start: mix.investable, monthly, years, expectedReturn: target.expectedReturn, volatility: target.volatility }),
    [mix.investable, monthly, years, target.expectedReturn, target.volatility],
  );
  const end = projection[projection.length - 1];

  const targetMix = OPT_CLASSES.map((c, i) => ({ cls: c, value: target.weights[c], color: CHART_COLORS[i] })).filter((d) => d.value > 0.001);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portfolio optimizer</h1>
          <p className="muted">Find a mix that matches how much risk you’re comfortable with, then get a step-by-step plan to get there.</p>
        </div>
      </div>

      <Card title="1 · Your utility function">
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          Economists describe how much you value return versus how much you dislike risk with a <strong>utility function</strong>. Sprout uses the standard
          mean–variance form:
        </p>
        <p className="serif" style={{ fontSize: '1.7rem', margin: '10px 0' }}>U = E[r] − ½ · A · σ²</p>
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          E[r] is expected return, σ is volatility, and A is your <strong>risk aversion</strong>. A higher A means each unit of risk costs you more, so the
          best portfolio holds more bonds and cash.
        </p>
        <div className="grid g2 mt" style={{ alignItems: 'end' }}>
          <label className="field">
            <span className="row between"><span>Risk aversion (A)</span><strong className="num" style={{ color: 'var(--text)' }}>{riskAversion.toFixed(1)}</strong></span>
            <input type="range" min={1} max={10} step={0.1} value={riskAversion} onChange={(e) => setRiskAversion(Number(e.target.value))} />
            <span className="row between tiny"><span>1 · Comfortable with big swings</span><span>10 · Avoids losses</span></span>
          </label>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Presets</div>
            <Segmented<RiskProfile>
              value={risk}
              onChange={(r) => {
                setProfile({ riskProfile: r });
                setRiskAversion(PROFILE_RISK_AVERSION[r]);
              }}
              options={(Object.keys(RISK_PROFILE_LABELS) as RiskProfile[]).map((r) => ({ value: r, label: RISK_PROFILE_LABELS[r] }))}
            />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{PROFILE_BLURB[risk]}</p>

        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Optimize for</div>
          <Segmented<Objective> value={objective} onChange={setObjective} options={OBJECTIVES.map(({ value, label }) => ({ value, label }))} />
          <p className="small muted" style={{ marginTop: 8, maxWidth: '75ch' }}>{OBJECTIVES.find((o) => o.value === objective)!.blurb}</p>
        </div>

        {objective === 'tax' && <TaxSettingsForm account={account} setAccount={setAccount} ordinaryRate={ordinaryRate} setOrdinaryRate={setOrdinaryRate} />}

        {objective === 'custom' && (
          <div className="grid g3 mt" style={{ gap: 12 }}>
            {OPT_CLASSES.map((c) => (
              <label key={c} className="field">
                <span className="row between"><span>{CLASS_LABEL[c]}</span><strong className="num">{pct(customSum ? custom[c] / customSum : 0)}</strong></span>
                <input type="range" min={0} max={100} value={Math.round(custom[c] * 100)} onChange={(e) => setCustom({ ...custom, [c]: Number(e.target.value) / 100 })} />
              </label>
            ))}
            <p className="tiny muted" style={{ gridColumn: '1 / -1' }}>Sliders are scaled so the mix always adds up to 100%.</p>
          </div>
        )}
      </Card>

      <div className="grid g2 mt">
        <Card title={objective === 'custom' ? '2 · Your custom mix' : '2 · Your optimal mix'}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Legend items={targetMix.map((d) => ({ label: CLASS_LABEL[d.cls], value: pct(d.value), color: d.color }))} />
            </div>
            <div className="stack" style={{ minWidth: 160 }}>
              <div>
                <div className="stat-label">{objective === 'tax' ? 'Long-run return after tax (est.)' : 'Long-run return (est.)'}</div>
                <div className="stat-value">{pct(target.expectedReturn, 1)}</div>
              </div>
              <div><div className="stat-label">Typical yearly swing</div><div className="stat-value">±{pct(target.volatility, 1)}</div></div>
              <div><div className="stat-label">Sharpe ratio</div><div className="stat-value">{target.sharpe.toFixed(2)}</div></div>
              <div><div className="stat-label">Your utility (A = {riskAversion.toFixed(1)})</div><div className="stat-value">{pct(utility(target, riskAversion), 2)}</div></div>
              <div><div className="stat-label">A bad year (1 in 20)</div><div className="stat-value" style={{ color: 'var(--alert)' }}>{pct(worst, 0)}</div></div>
            </div>
          </div>
          <div className="stack mt small">
            {targetMix.map((d) => (
              <div key={d.cls} className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span>{CLASS_LABEL[d.cls]}</span>
                <span className="muted">e.g. {CLASS_FUNDS[d.cls].join(' · ')}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Simpler option: a single target-date index fund or a three-fund portfolio (U.S. + international + bonds) gets you very close.
          </p>
        </Card>

        <Card title="Where your risk really comes from">
          <p className="small muted" style={{ marginBottom: 10 }}>
            Dollars and risk aren’t the same thing. Stocks swing far more than bonds, so they usually supply most of a portfolio’s ups and downs.
          </p>
          <div className="stack">
            {OPT_CLASSES.filter((c) => target.weights[c] > 0.001).map((c) => (
              <div key={c}>
                <div className="row between small"><strong>{CLASS_LABEL[c]}</strong><span className="muted num">{pct(target.weights[c])} of money, <strong style={{ color: 'var(--text)' }}>{pct(Math.max(0, rc[c]))} of risk</strong></span></div>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div className="bar" style={{ height: 6 }}><span style={{ width: `${target.weights[c] * 100}%`, background: 'var(--c7)' }} /></div>
                  <div className="bar" style={{ height: 6 }}><span style={{ width: `${Math.max(0, rc[c]) * 100}%`, background: 'var(--c3)' }} /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt"><Legend items={[{ label: 'Share of money', value: '', color: 'var(--c7)' }, { label: 'Share of risk', value: '', color: 'var(--c3)' }]} /></div>
        </Card>
      </div>

      <Card title="3 · Your action plan" className="mt" action={
        <Segmented
          value={mode}
          onChange={setMode}
          options={[{ value: 'contribute', label: 'Invest new money' }, { value: 'rebalance', label: 'Full rebalance' }]}
        />
      }>
        {mix.investable <= 0 && mode === 'rebalance' ? (
          <p className="muted">Add holdings on the Portfolio page to see a rebalancing plan, or switch to “Invest new money”.</p>
        ) : (
          <>
            {mode === 'contribute' ? (
              <div className="row" style={{ marginBottom: 12 }}>
                <span>I’m about to invest</span>
                <div style={{ width: 140 }}><NumberInput money value={contribution} onChange={setContribution} aria-label="Contribution" /></div>
                <span className="small muted">We’ll steer it toward what’s underweight, with no selling needed.</span>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <p className="small muted">
                  Buys and sells to match your target exactly. Selling at a profit in a taxable account triggers capital-gains tax, so many people rebalance with
                  new money instead.
                </p>
                <TaxSettingsForm account={account} setAccount={setAccount} ordinaryRate={ordinaryRate} setOrdinaryRate={setOrdinaryRate} />
                {account === 'taxable' && (
                  <div className="row mt" style={{ alignItems: 'flex-end', gap: 20 }}>
                    <label className="field" style={{ width: 240 }}>
                      Share of what you sell that is profit: {pct(gainShare)}
                      <input type="range" min={0} max={1} step={0.05} value={gainShare} onChange={(e) => setGainShare(Number(e.target.value))} />
                    </label>
                    <p className="small" style={{ flex: 1, minWidth: 240 }}>
                      Estimated tax from this rebalance: <strong>{money(rebalanceTaxCost(trades, gainShare, tax.qualifiedRate))}</strong> if you’ve held for over a year
                      ({pct(tax.qualifiedRate)} rate), or <strong>{money(rebalanceTaxCost(trades, gainShare, ordinaryRate))}</strong> if under a year
                      ({pct(ordinaryRate)}, taxed like income).
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Asset class</th><th>You have</th><th>Target</th><th>Action</th><th>Fund ideas</th></tr></thead>
                <tbody>
                  {trades.length === 0 && <tr><td colSpan={5} className="muted">You’re already on target. Nothing to do.</td></tr>}
                  {trades.map((t) => (
                    <tr key={t.cls}>
                      <td>{CLASS_LABEL[t.cls]}</td>
                      <td className="num">{money(t.current)}</td>
                      <td className="num">{money(t.target)}</td>
                      <td><span className={`pill ${t.amount >= 0 ? 'good' : 'warn'}`}>{t.amount >= 0 ? 'Buy' : 'Sell'} {money(Math.abs(t.amount))}</span></td>
                      <td className="small muted">{CLASS_FUNDS[t.cls].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mix.excluded > 0 && (
              <p className="tiny muted" style={{ marginTop: 8 }}>
                {money(mix.excluded)} in crypto/commodities is left out of the optimizer because its long-run behavior is too unpredictable to model. We left it as is.
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="4 · What could it grow to?" className="mt">
        <div className="row" style={{ gap: 20, marginBottom: 12 }}>
          <label className="field" style={{ width: 160 }}>Add each month<NumberInput money value={monthly} onChange={setMonthly} aria-label="Monthly" /></label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>For {years} years (until age {profile.age + years})
            <input type="range" min={1} max={50} value={years} onChange={(e) => setYears(Number(e.target.value))} />
          </label>
        </div>
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <div><div className="stat-label">You put in</div><div className="stat-value">{money(end.contributed)}</div></div>
          <div><div className="stat-label">Typical outcome</div><div className="stat-value" style={{ color: 'var(--good)' }}>{money(end.p50)}</div></div>
          <div><div className="stat-label">Range (bad to great)</div><div className="stat-value small" style={{ fontSize: '1.1rem' }}>{money(end.p10)} – {money(end.p90)}</div></div>
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={projection.map((p) => ({ ...p, band: [p.p10, p.p90] }))} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis tickFormatter={(v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`)} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={56} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => (Array.isArray(v) ? `${money(Number(v[0]))} – ${money(Number(v[1]))}` : money(Number(v)))} labelFormatter={(y) => `Year ${y}`} />
              <Area dataKey="band" name="10th–90th percentile" fill="var(--c1)" fillOpacity={0.15} stroke="none" />
              <Line dataKey="p50" name="Typical (median)" stroke="var(--c1)" strokeWidth={2.5} dot={false} />
              <Line dataKey="contributed" name="Money you put in" stroke="var(--c7)" strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Based on 2,000 simulated markets. The shaded band shows outcomes between the unlucky 10% and the lucky 10%, before inflation and taxes.
        </p>
      </Card>

      <details className="card mt">
        <summary><strong>How does this optimizer work?</strong></summary>
        <div className="stack small" style={{ marginTop: 10 }}>
          <p>
            It uses <strong>mean–variance optimization</strong>, the Nobel-winning idea from Harry Markowitz. Mixing assets that don’t move in lockstep can lower risk
            without lowering expected return. For each risk level, it finds the mix with the highest expected return.
          </p>
          <p>
            Plain Markowitz is famous for wild, all-or-nothing answers when its return forecasts are even slightly off. So, like many professional robo-advisors, we
            start from <strong>market-implied (Black–Litterman equilibrium) returns</strong>: what the world’s investors collectively expect, based on how they hold
            these assets. We also cap each asset class so the result stays diversified.
          </p>
          <p>
            Expected returns ({OPT_CLASSES.map((c) => `${CLASS_LABEL[c]} ${pct(evaluate({ ...zero(), [c]: 1 }).expectedReturn, 1)}`).join(', ')}) are long-run
            estimates, <strong>not predictions</strong>. Real returns will differ, sometimes by a lot. Cash is treated as “risk-free” at {pct(RISK_FREE, 1)}.
          </p>
          <p>
            <strong>Why not just optimize on past returns?</strong> Whatever did best over the last 10–20 years (recently tech stocks and gold) dominates a
            backward-looking optimizer, but past winners often don’t repeat. Real drops can also be worse than the “bad year” estimate: the S&P 500 fell about
            57% from 2007 to 2009 and about 34% in early 2020.
          </p>
          <div className="grid g2" style={{ gap: 10 }}>
            <p><strong>Volatility (σ)</strong>: how much returns typically swing in a year. Higher means a bumpier ride.</p>
            <p><strong>Sharpe ratio</strong>: (return − cash rate) ÷ volatility. Extra return earned for each unit of risk taken.</p>
            <p><strong>Diversification</strong>: owning assets that don’t all move together, so one bad stretch doesn’t sink everything.</p>
            <p><strong>Max Sharpe portfolio</strong>: the mix with the highest Sharpe ratio, the best return per unit of risk.</p>
            <p><strong>Rebalancing</strong>: nudging your mix back to target, ideally with new money so you don’t trigger taxes.</p>
          </div>
        </div>
      </details>
      <Disclaimer />
    </>
  );
}

function TaxSettingsForm(p: { account: AccountType; setAccount: (a: AccountType) => void; ordinaryRate: number; setOrdinaryRate: (r: number) => void }) {
  return (
    <div className="grid g2 mt" style={{ alignItems: 'end' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Account type</div>
        <Segmented<AccountType> value={p.account} onChange={p.setAccount} options={[{ value: 'taxable', label: 'Taxable brokerage' }, { value: 'roth', label: 'Roth IRA' }]} />
      </div>
      {p.account === 'taxable' ? (
        <label className="field">Your federal income-tax bracket
          <select value={p.ordinaryRate} onChange={(e) => p.setOrdinaryRate(Number(e.target.value))}>
            {BRACKETS.map((b) => <option key={b} value={b}>{pct(b)}{b <= 0.12 ? ' (0% on long-term gains)' : ' (15% on long-term gains)'}</option>)}
          </select>
        </label>
      ) : (
        <p className="small muted">In a Roth IRA, growth and qualified withdrawals are tax-free, so taxes don’t change the optimal mix or the cost of rebalancing.</p>
      )}
    </div>
  );
}

const zero = () => Object.fromEntries(OPT_CLASSES.map((c) => [c, 0])) as Record<OptClass, number>;
