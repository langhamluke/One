import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useStore } from '../store';
import {
  CLASS_FUNDS,
  OPT_CLASSES,
  DEFAULT_ASSUMPTIONS,
  PROFILE_TARGET_VOL,
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
import { CHART_COLORS, Card, Disclaimer, Legend, NumberInput, Segmented, money } from '../components/ui';

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

type Strategy = 'profile' | 'sharpe' | 'minvol' | 'maxret' | 'custom';
const STRATEGY_BLURB: Record<Exclude<Strategy, 'profile'>, string> = {
  sharpe: 'Max Sharpe ("tangency") portfolio: the most expected return per unit of risk.',
  minvol: 'Minimum volatility: the smallest swings this mix of assets can achieve.',
  maxret: 'Maximum return: the highest expected return within the diversification limits. Expect big swings.',
  custom: 'Build your own: drag the sliders and watch your point move on the frontier chart.',
};

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' };

export default function Optimizer() {
  const { holdings, profile, setProfile } = useStore();
  const risk = profile.riskProfile;
  const frontier = useMemo(() => efficientFrontier(), []);
  const best = maxSharpe(frontier);
  const [strategy, setStrategy] = useState<Strategy>('profile');
  const [custom, setCustom] = useState<Weights>(() => portfolioForProfile(frontier, risk).weights);
  const customSum = OPT_CLASSES.reduce((t, c) => t + custom[c], 0);
  const target =
    strategy === 'sharpe'
      ? best
      : strategy === 'minvol'
        ? minVolatility(frontier)
        : strategy === 'maxret'
          ? maxReturn(frontier)
          : strategy === 'custom'
            ? evaluate(Object.fromEntries(OPT_CLASSES.map((c) => [c, customSum ? custom[c] / customSum : 0])) as Weights)
            : portfolioForProfile(frontier, risk);
  const rc = riskContributions(target.weights);
  const worst = badYear(target);
  const mix = useMemo(() => currentMix(holdings), [holdings]);
  const current = mix.investable > 0 ? evaluate(mix.weights) : null;

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

  const frontierPts = frontier.map((p) => ({ x: +(p.volatility * 100).toFixed(2), y: +(p.expectedReturn * 100).toFixed(2) }));
  const targetMix = OPT_CLASSES.map((c, i) => ({ cls: c, value: target.weights[c], color: CHART_COLORS[i] })).filter((d) => d.value > 0.001);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portfolio optimizer</h1>
          <p className="muted">Find a mix that matches how much risk you’re comfortable with, then get a step-by-step plan to get there.</p>
        </div>
      </div>

      <Card title="1 · Choose a strategy">
        <Segmented<Strategy>
          value={strategy}
          onChange={setStrategy}
          options={[
            { value: 'profile', label: 'Match my risk level' },
            { value: 'sharpe', label: 'Max Sharpe' },
            { value: 'minvol', label: 'Min volatility' },
            { value: 'maxret', label: 'Max return' },
            { value: 'custom', label: 'Build your own' },
          ]}
        />
        {strategy === 'profile' && (
          <div style={{ marginTop: 12 }}>
            <Segmented<RiskProfile>
              value={risk}
              onChange={(r) => setProfile({ riskProfile: r })}
              options={(Object.keys(RISK_PROFILE_LABELS) as RiskProfile[]).map((r) => ({ value: r, label: RISK_PROFILE_LABELS[r] }))}
            />
            <p className="small muted" style={{ marginTop: 8 }}>
              {PROFILE_BLURB[risk]} Typical yearly swing: about ±{pct(PROFILE_TARGET_VOL[risk])}.
            </p>
          </div>
        )}
        {strategy !== 'profile' && <p className="small muted" style={{ marginTop: 8 }}>{STRATEGY_BLURB[strategy]}</p>}
        {strategy === 'custom' && (
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
        <Card title={strategy === 'custom' ? '2 · Your custom mix' : '2 · Your target mix'}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Legend items={targetMix.map((d) => ({ label: CLASS_LABEL[d.cls], value: pct(d.value), color: d.color }))} />
            </div>
            <div className="stack" style={{ minWidth: 160 }}>
              <div><div className="stat-label">Long-run return (est.)</div><div className="stat-value">{pct(target.expectedReturn, 1)}</div></div>
              <div><div className="stat-label">Typical yearly swing</div><div className="stat-value">±{pct(target.volatility, 1)}</div></div>
              <div><div className="stat-label">Sharpe ratio</div><div className="stat-value">{target.sharpe.toFixed(2)}</div></div>
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

        <Card title="The efficient frontier">
          <p className="small muted" style={{ marginBottom: 8 }}>
            Each point on the curve is the highest expected return for that level of risk. Below the curve means you’re taking risk you aren’t paid for.
          </p>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="Risk" unit="%" domain={[0, 'auto']} tick={{ fill: 'var(--muted)', fontSize: 12 }} label={{ value: 'Risk (yearly swing)', position: 'insideBottom', offset: -10, fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis type="number" dataKey="y" name="Return" unit="%" domain={['auto', 'auto']} tick={{ fill: 'var(--muted)', fontSize: 12 }} width={44} />
                <ZAxis range={[40, 40]} />
                <Tooltip cursor={false} contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
                <Scatter name="Frontier" data={frontierPts} fill="var(--c7)" line={{ stroke: 'var(--c7)', strokeWidth: 2 }} shape="circle" />
                <Scatter name="Your target" data={[{ x: +(target.volatility * 100).toFixed(2), y: +(target.expectedReturn * 100).toFixed(2) }]} fill="var(--c1)" shape="star" />
                <Scatter name="Best return per unit of risk" data={[{ x: +(best.volatility * 100).toFixed(2), y: +(best.expectedReturn * 100).toFixed(2) }]} fill="var(--c3)" shape="diamond" />
                {current && <Scatter name="You today" data={[{ x: +(current.volatility * 100).toFixed(2), y: +(current.expectedReturn * 100).toFixed(2) }]} fill="var(--c8)" shape="triangle" />}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { label: 'Your target', value: '★', color: 'var(--c1)' },
              { label: 'Best return per unit of risk', value: '◆', color: 'var(--c3)' },
              ...(current ? [{ label: 'Your portfolio today', value: '▲', color: 'var(--c8)' }] : []),
            ]}
          />
        </Card>
      </div>

      <div className="grid g2 mt">
        <Card title="Where your risk really comes from">
          <p className="small muted" style={{ marginBottom: 10 }}>
            Dollars and risk aren’t the same thing. Stocks swing far more than bonds, so they usually supply most of a portfolio’s ups and downs.
          </p>
          <div className="stack">
            {OPT_CLASSES.filter((c) => target.weights[c] > 0.001).map((c) => (
              <div key={c}>
                <div className="row between small"><strong>{CLASS_LABEL[c]}</strong><span className="muted num">{pct(target.weights[c])} of money → <strong style={{ color: 'var(--text)' }}>{pct(Math.max(0, rc[c]))} of risk</strong></span></div>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div className="bar" style={{ height: 6 }}><span style={{ width: `${target.weights[c] * 100}%`, background: 'var(--c7)' }} /></div>
                  <div className="bar" style={{ height: 6 }}><span style={{ width: `${Math.max(0, rc[c]) * 100}%`, background: 'var(--c3)' }} /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt"><Legend items={[{ label: 'Share of money', value: '', color: 'var(--c7)' }, { label: 'Share of risk', value: '', color: 'var(--c3)' }]} /></div>
        </Card>
        <Card title="Correlation: who moves together?">
          <p className="small muted" style={{ marginBottom: 10 }}>
            +1 means two assets move in lockstep. 0 means they’re unrelated. Low numbers are the secret sauce of diversification.
          </p>
          <CorrelationMatrix />
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
              <p className="small muted" style={{ marginBottom: 12 }}>
                Buys and sells to match your target exactly. Selling in a taxable account can trigger taxes, so many people rebalance with new money instead.
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Asset class</th><th>You have</th><th>Target</th><th>Action</th><th>Fund ideas</th></tr></thead>
                <tbody>
                  {trades.length === 0 && <tr><td colSpan={5} className="muted">You’re already on target. Nothing to do. 🎉</td></tr>}
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
          <div><div className="stat-label">Range (bad → great)</div><div className="stat-value small" style={{ fontSize: '1.1rem' }}>{money(end.p10)} – {money(end.p90)}</div></div>
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
            <p><strong>Correlation (ρ)</strong>: from −1 to +1, how closely two assets move together. Lower means better diversification.</p>
            <p><strong>Efficient frontier</strong>: the curve of best-possible portfolios. Every point gives the most return for its risk.</p>
            <p><strong>Tangency portfolio</strong>: the frontier point with the highest Sharpe ratio (the ◆ on the chart).</p>
            <p><strong>Rebalancing</strong>: nudging your mix back to target, ideally with new money so you don’t trigger taxes.</p>
          </div>
        </div>
      </details>
      <Disclaimer />
    </>
  );
}

function CorrelationMatrix() {
  const short: Record<OptClass, string> = { usStocks: 'US', intlStocks: 'Intl', emStocks: 'EM', bonds: 'Bond', cash: 'Cash', realEstate: 'REIT' };
  const color = (r: number) => `color-mix(in srgb, var(--c3) ${Math.round(Math.abs(r) * 85)}%, var(--surface))`;
  return (
    <div className="table-wrap">
      <table style={{ tableLayout: 'fixed', minWidth: 340 }}>
        <thead>
          <tr><th />{OPT_CLASSES.map((c) => <th key={c} style={{ textAlign: 'center', padding: 4 }}>{short[c]}</th>)}</tr>
        </thead>
        <tbody>
          {OPT_CLASSES.map((ci, i) => (
            <tr key={ci}>
              <th style={{ padding: 4 }}>{short[ci]}</th>
              {OPT_CLASSES.map((cj, j) => {
                const r = DEFAULT_ASSUMPTIONS.correlation[i][j];
                return (
                  <td key={cj} title={`${CLASS_LABEL[ci]} vs ${CLASS_LABEL[cj]}: ${r}`} style={{ textAlign: 'center', padding: '8px 2px', background: color(r), fontSize: '0.8rem', fontWeight: 600, border: '2px solid var(--surface)' }}>
                    {r.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const zero = () => Object.fromEntries(OPT_CLASSES.map((c) => [c, 0])) as Record<OptClass, number>;
