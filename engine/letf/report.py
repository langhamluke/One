"""Markdown + SMS report formatting."""
from __future__ import annotations

from datetime import date

import pandas as pd


def fmt(x, nd=2):
    try:
        if x is None or (isinstance(x, float) and pd.isna(x)):
            return "n/a"
        return f"{x:,.{nd}f}"
    except Exception:
        return str(x)


def markdown(run: dict) -> str:
    L = [f"# LETF options engine — {run['as_of']}", ""]
    L.append(f"Provider: {run['provider']} | Account: ${run['account']:,.0f} | Sentiment: {run['sentiment'].get('score', 0):+.2f} ({run['sentiment'].get('model')}, n={run['sentiment'].get('n_items', 0)})")
    if run["sentiment"].get("risk_flags"):
        L.append("Risk chatter: " + ", ".join(f"{k}×{v}" for k, v in list(run["sentiment"]["risk_flags"].items())[:6]))
    L.append("")
    L.append("## Catalysts (next 10 days)")
    for c in run["catalysts"]:
        L.append(f"- {c.day.isoformat()} ({c.days_until(run['today'])}d) **{c.kind}** {c.label} w={c.weight}")
    L.append("")
    for sym, g in run["gex"].items():
        s = g["summary"]
        L.append(f"## {sym} gamma ({s['dte_filter']}) — spot {fmt(s['spot'])}")
        L.append(f"- Regime: **{s['regime'].upper()} GAMMA** | flip {fmt(s['flip'])} (profile {fmt(s['flip_profile'])}, cumulative {fmt(s['flip_cumulative'])}) | total GEX {fmt(s['total_gex_$bn_per_1pct'], 2)} $bn/1%")
        L.append(f"- Call wall {fmt(s['call_wall'])} | Put wall {fmt(s['put_wall'])} | Max pain {fmt(s['max_pain'])} | 1σ move {fmt(s.get('em_iv_move_pct', 0) * 100 if s.get('em_iv_move_pct') else None)}% (straddle {fmt(s.get('em_straddle_move_pct', 0) * 100 if s.get('em_straddle_move_pct') else None)}%)")
        if g.get("mapped"):
            for dst, lv in g["mapped"].items():
                L.append(f"- Mapped to {dst}: " + ", ".join(f"{x.type} {fmt(x.price)}" for x in lv if x.type in ("flip", "callwall", "putwall", "maxpain")))
        L.append("")
    L.append("## Signals")
    for sym, sg in run["signals"].items():
        L.append(f"### {sym}: **{sg.direction}** score {sg.score:+.2f} | trend {sg.trend} | vol {sg.vol_regime} | IV rank {sg.iv_rank:.0f}")
        for r in sg.reasons:
            L.append(f"- {r}")
        L.append("")
    L.append("## Recommended contracts (singles, EV-ranked)")
    for sym, df in run["ranked"].items():
        if df is None or df.empty:
            L.append(f"- {sym}: no contract passes filters")
            continue
        top = df.head(5)
        L.append(f"**{sym}**")
        L.append("")
        L.append("| exp | dte | type | strike | bid/ask | IV | Δ | OI | vol | EV/prem | POP | P(2x) | Kelly | #ctr | premium |")
        L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for _, r in top.iterrows():
            L.append(f"| {r['expiration']} | {r['dte']} | {r['type']} | {fmt(r['strike'])} | {fmt(r['bid'])}/{fmt(r['ask'])} | {r['iv'] * 100:.0f}% | {fmt(r['delta'])} | {r['oi']} | {r['volume']} | {r['ev_on_premium'] * 100:+.0f}% | {r['pop'] * 100:.0f}% | {r['p_2x'] * 100:.0f}% | {r['kelly_f'] * 100:.1f}% | {r['contracts']} | ${r['premium_$']:,.0f} |")
        L.append("")
    if run.get("event_sales"):
        L.append("## Defined-risk premium sales into events (spreads; disabled unless allow_spreads)")
        for sym, e in run["event_sales"].items():
            L.append(f"- {sym}: {e}")
    return "\n".join(L) + "\n"


def sms(run: dict) -> str:
    parts = []
    for sym, sg in run["signals"].items():
        if sg.direction == "NONE":
            continue
        b = run["best"].get(sym)
        if b is not None:
            parts.append(f"{sym} {sg.direction.replace('LONG_', '')} {b['expiration']} {b['strike']:g} @{b['ask']:.2f} EV{b['ev_on_premium'] * 100:+.0f}% POP{b['pop'] * 100:.0f}%")
        else:
            parts.append(f"{sym} {sg.direction} s={sg.score:+.2f} (no liquid contract)")
    if not parts:
        return ""
    return "LETF: " + "; ".join(parts)
