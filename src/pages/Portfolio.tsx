import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../store';
import { analyzePortfolio, feeDrag, pct, pctFine } from '../lib/portfolio';
import { ASSET_CLASS_LABELS, ASSET_CLASSES, type AssetClass, type HoldingKind } from '../lib/types';
import { findSecurity, searchSecurities } from '../data/securities';
import { holdingFrom, loadSampleData } from '../data/sample';
import { Bar, CHART_COLORS, Card, Disclaimer, Insights, Legend, NumberInput, ScoreRing, celebrate, money, ConfirmButton } from '../components/ui';

const KIND_LABEL: Record<HoldingKind, string> = { etf: 'ETF', mutualFund: 'Mutual fund', stock: 'Stock', crypto: 'Crypto', cash: 'Cash' };
const SECTORS = ['Technology', 'Communication', 'Consumer Discretionary', 'Consumer Staples', 'Financials', 'Health Care', 'Energy', 'Industrials', 'Utilities', 'Materials', 'Real Estate'];

export default function Portfolio() {
  const { holdings, profile, addHolding, updateHolding, removeHolding, setHoldings } = useStore();
  const a = useMemo(() => analyzePortfolio(holdings, profile.riskProfile), [holdings, profile.riskProfile]);

  const classData = ASSET_CLASSES.map((c, i) => ({ name: ASSET_CLASS_LABELS[c], value: a.byClass[c], color: CHART_COLORS[i] })).filter((d) => d.value > 0.0005);
  const sectorData = a.bySector.slice(0, 8).map((s, i) => ({ name: s.sector, value: s.weight, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const drag = feeDrag(a.total, 100, 0.07, a.weightedExpenseRatio, 40);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your portfolio</h1>
          <p className="muted">See what you own, how spread out it is, and how to make it stronger.</p>
        </div>
        <div className="row">
          {holdings.length === 0 && <button onClick={loadSampleData}>Try sample portfolio</button>}
          {holdings.length > 0 && (
            <ConfirmButton label="Clear all" confirmLabel="Remove every holding?" onConfirm={() => setHoldings([])} />
          )}
        </div>
      </div>

      <AddHolding
        onAdd={(h) => {
          addHolding(h);
          celebrate(`Added ${h.symbol} · 5 XP`);
        }}
      />

      {holdings.length === 0 ? (
        <Card className="mt">
          <div className="empty">
            <p>Add an investment above, like <strong>VTI</strong>, <strong>AAPL</strong>, or <strong>VOO</strong>, to see your diversification score.</p>
            <p className="small" style={{ marginTop: 6 }}>Not investing yet? Add what you’re <em>thinking</em> of buying to test it first.</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid g3 mt">
            <Card title="Diversification score" className="span2">
              <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <ScoreRing score={a.score} label="out of 100" />
                  <div style={{ fontWeight: 700, marginTop: 6 }}>{a.grade}</div>
                  <div className="small muted">{money(a.total)} total</div>
                </div>
                <div className="stack" style={{ flex: 1, minWidth: 240 }}>
                  {a.components.map((c) => (
                    <div key={c.key}>
                      <div className="row between small"><strong>{c.label}</strong><span className="num muted">{Math.round(c.points)}/{c.max}</span></div>
                      <Bar value={c.points / c.max} color={c.points / c.max > 0.75 ? 'var(--good)' : c.points / c.max > 0.4 ? 'var(--warn)' : 'var(--alert)'} />
                      <p className="tiny muted" style={{ marginTop: 3 }}>{c.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card title="What you own">
              <Donut data={classData} />
              <Legend items={classData.map((d) => ({ label: d.name, value: pct(d.value), color: d.color }))} />
            </Card>
          </div>

          <div className="grid g3 mt">
            <Card title="Tips to improve" className="span2" action={<Link to="/optimizer" className="btn">Open optimizer</Link>}>
              <Insights items={a.insights} />
            </Card>
            <div className="stack">
              <Card title="By industry">
                <Legend items={sectorData.map((d) => ({ label: d.name, value: pct(d.value), color: d.color }))} />
                <p className="tiny muted" style={{ marginTop: 8 }}>“Broad market” means index funds that already own every industry.</p>
              </Card>
              <Card title="Fees">
                <div className="stat-value">{pctFine(a.weightedExpenseRatio)}</div>
                <p className="small muted">average yearly fund fee · {money(a.annualFees, 2)}/yr today</p>
                {a.weightedExpenseRatio > 0 && (
                  <p className="small" style={{ marginTop: 8 }}>
                    Over 40 years, adding $100/month at a hypothetical 7% return, these fees would cost about <strong>{money(drag.lost)}</strong>.
                  </p>
                )}
              </Card>
            </div>
          </div>

          <Card title="Holdings" className="mt">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Investment</th><th>Type</th><th style={{ width: 150 }}>Value</th><th>Weight</th><th>Fee</th><th /></tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const w = a.total ? h.value / a.total : 0;
                    return (
                      <tr key={h.id}>
                        <td><strong>{h.symbol}</strong><div className="tiny muted">{h.name}</div></td>
                        <td><span className={`pill ${h.kind === 'crypto' ? 'alert' : h.kind === 'stock' ? 'warn' : 'good'}`}>{KIND_LABEL[h.kind]}</span></td>
                        <td><NumberInput money value={h.value} onChange={(v) => updateHolding(h.id, { value: v })} aria-label={`${h.symbol} value`} /></td>
                        <td className="num">{pct(w, 1)}</td>
                        <td className="num small muted">{h.kind === 'stock' || h.kind === 'crypto' ? '—' : pctFine(h.expenseRatio)}</td>
                        <td><button className="ghost" aria-label={`Remove ${h.symbol}`} onClick={() => removeHolding(h.id)}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <Disclaimer />
    </>
  );
}

function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => pct(Number(v), 1)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

type NewHolding = Parameters<ReturnType<typeof useStore.getState>['addHolding']>[0];

function AddHolding({ onAdd }: { onAdd: (h: NewHolding) => void }) {
  const [query, setQuery] = useState('');
  const [value, setValue] = useState(100);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ name: '', kind: 'stock' as HoldingKind, cls: 'usStocks' as AssetClass, sector: 'Technology' });
  const symbol = query.trim().toUpperCase();
  const known = findSecurity(symbol);
  const suggestions = searchSecurities(query);

  const submit = () => {
    if (!symbol || value <= 0) return;
    if (known) {
      const { id: _id, ...h } = holdingFrom(known.symbol, value);
      void _id;
      onAdd(h);
    } else {
      const broad = custom.kind === 'etf' || custom.kind === 'mutualFund';
      onAdd({
        symbol,
        name: custom.name || symbol,
        kind: custom.kind,
        value,
        exposure: { [custom.cls]: 1 },
        sectors: custom.cls === 'bonds' ? { Bonds: 1 } : custom.cls === 'cash' ? { Cash: 1 } : custom.kind === 'crypto' ? { Crypto: 1 } : broad ? { 'Broad market': 1 } : { [custom.sector]: 1 },
        expenseRatio: broad ? 0.002 : 0,
      });
    }
    setQuery('');
    setValue(100);
  };

  return (
    <Card title="Add an investment">
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field" style={{ flex: '2 1 220px', position: 'relative' }}>Ticker or name
          <input
            value={query}
            placeholder="e.g. VTI, Apple, S&P 500"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off"
          />
          {open && suggestions.length > 0 && !known && (
            <div className="suggest">
              {suggestions.map((s) => (
                <button type="button" key={s.symbol} onMouseDown={() => { setQuery(s.symbol); setOpen(false); }}>
                  <strong style={{ width: 56 }}>{s.symbol}</strong> <span className="muted small">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="field" style={{ flex: '1 1 120px' }}>Amount invested ($)
          <NumberInput money value={value} onChange={setValue} aria-label="Amount" />
        </label>
        <button className="primary" type="submit" disabled={!symbol || value <= 0}>Add</button>
      </form>
      {known && <p className="small muted" style={{ marginTop: 8 }}><strong>{known.name}</strong>: {known.blurb}</p>}
      {symbol && !known && !open && (
        <div className="grid g4 mt" style={{ gap: 10 }}>
          <p className="small muted" style={{ gridColumn: '1 / -1' }}>We don’t know <strong>{symbol}</strong> yet. Tell us a bit about it so we can score it:</p>
          <label className="field">Name
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder={symbol} />
          </label>
          <label className="field">Type
            <select value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value as HoldingKind, cls: e.target.value === 'crypto' ? 'crypto' : custom.cls })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field">Asset class
            <select value={custom.cls} onChange={(e) => setCustom({ ...custom, cls: e.target.value as AssetClass })}>
              {ASSET_CLASSES.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>)}
            </select>
          </label>
          {custom.kind === 'stock' && (
            <label className="field">Industry
              <select value={custom.sector} onChange={(e) => setCustom({ ...custom, sector: e.target.value })}>
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </Card>
  );
}
