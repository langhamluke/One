"""CLI and report writer for ``letf.backtest``.

    python -m letf.backtest --symbols TQQQ UPRO --parents QQQ SPY --start 2020-01-01 --out out/backtest

Writes summary.json, trades.csv, equity.csv, wfa.csv, mc.json, report.md (+ equity/drawdown PNGs when
matplotlib is importable). Runs: fixed-parameter backtest (combined portfolio and each symbol alone),
walk-forward analysis per symbol, trade-bootstrap Monte Carlo on each symbol's OOS trades, and optionally
the block-bootstrap path Monte Carlo (``--mc-paths N``).
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import pandas as pd

from . import backtest as bt

LIMITATIONS = """\
## Read this first: what these numbers are and are not

* **Option prices are synthetic.** No historical option chains were available, so every contract is priced
  with Black-Scholes from the index vol (VXN for QQQ, VIX for SPY; times |leverage| and capped at 2.5 for the
  leveraged ETFs), a simple strike skew (puts -0.6, calls -0.2 per ln(K/S)/sqrt(T)), a 3% half spread and a
  flat 4% rate. Real weekly option marks differ: term structure, real skew, event premia, wider spreads on
  TQQQ/UPRO, early assignment and liquidity gaps are all ignored.
* **The signal context is neutral.** Gamma regime, gamma walls, sentiment and catalyst pressure are not
  available historically, so those components of the score are zero in every backtest. Only the
  trend / mean-reversion core and the IV-regime filters are being tested.
* **Entry uses the next day's open** (no look-ahead); the IV used for entry pricing is the previous close's
  index vol. Exits are evaluated at the close with that day's close and vol.
* **Sizing**: 1% of equity per trade in whole contracts, at least one contract when cash covers it, which
  can mean more than 1% at small equity. Marks use liquidation value (mid minus half spread).
* **WFA in-sample selection** maximises in-sample Sharpe over a 324-point grid with a minimum of 8 trades;
  OOS windows are stitched with compounding. Positions open at a window edge are closed at that close.
* **Monte Carlo (trades)** resamples per-trade return on equity sequentially and ignores that trades overlap.
* **Therefore: these results are an upper bound on the signal's quality under a simplified market model,
  not a forecast of live performance.**
"""


def fmt_pct(x):
    return "n/a" if x is None or not np.isfinite(x) else f"{x * 100:.1f}%"


def fmt_num(x, d=2):
    return "n/a" if x is None or not np.isfinite(x) else f"{x:.{d}f}"


def metrics_table(ms: dict[str, dict]) -> str:
    rows = [("CAGR", "cagr", fmt_pct), ("Total return", "total_return", fmt_pct), ("Ann. vol", "ann_vol", fmt_pct),
            ("Sharpe", "sharpe", fmt_num), ("Sortino", "sortino", fmt_num), ("Max drawdown", "max_drawdown", fmt_pct),
            ("Calmar", "calmar", fmt_num), ("Trades", "n_trades", lambda x: str(int(x))), ("Win rate", "win_rate", fmt_pct),
            ("Profit factor", "profit_factor", fmt_num), ("Avg win $", "avg_win", lambda x: fmt_num(x, 0)),
            ("Avg loss $", "avg_loss", lambda x: fmt_num(x, 0)), ("Expectancy $/trade", "expectancy", lambda x: fmt_num(x, 0)),
            ("Expectancy % equity", "expectancy_pct_equity", fmt_pct), ("Avg hold (trading days)", "avg_hold_days", fmt_num),
            ("Exposure", "exposure", lambda x: fmt_pct(x) if x is not None else "n/a")]
    names = list(ms)
    out = ["| Metric | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
    for label, key, f in rows:
        vals = []
        for n in names:
            v = ms[n].get(key)
            try:
                vals.append(f(v) if v is not None else "n/a")
            except Exception:
                vals.append(str(v))
        out.append(f"| {label} | " + " | ".join(vals) + " |")
    for n in names:
        if ms[n].get("max_dd_peak"):
            out.append(f"\n{n}: max drawdown from {ms[n]['max_dd_peak']} to {ms[n]['max_dd_trough']}; exits {ms[n].get('exit_reasons', {})}")
    return "\n".join(out)


def yearly_table(ms: dict[str, dict]) -> str:
    years = sorted({y for m in ms.values() for y in m.get("yearly_returns", {})})
    names = list(ms)
    out = ["| Year | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
    for y in years:
        out.append(f"| {y} | " + " | ".join(fmt_pct(ms[n].get("yearly_returns", {}).get(y)) for n in names) + " |")
    return "\n".join(out)


def monthly_md(tab: dict) -> str:
    out = ["| Year | " + " | ".join(f"{m:02d}" for m in range(1, 13)) + " | Year |", "|---|" + "---|" * 13]
    for y in sorted(tab):
        cells = [fmt_pct(tab[y].get(m)) if m in tab[y] else "" for m in range(1, 13)]
        yr = np.prod([1 + v for v in tab[y].values()]) - 1
        out.append(f"| {y} | " + " | ".join(cells) + f" | {fmt_pct(yr)} |")
    return "\n".join(out)


def wfa_md(w: bt.WFAResult, grid_keys) -> str:
    if w.windows.empty:
        return "_No walk-forward windows (not enough history)._"
    cols = ["window", "is_start", "is_end", "oos_end"] + [f"best_{k}" for k in grid_keys] + ["is_sharpe", "is_trades", "fallback", "oos_trades", "oos_return", "oos_max_dd", "equity_end"]
    df = w.windows[cols].copy()
    df["is_sharpe"] = df["is_sharpe"].map(lambda x: fmt_num(x))
    df["oos_return"] = df["oos_return"].map(fmt_pct)
    df["oos_max_dd"] = df["oos_max_dd"].map(fmt_pct)
    df["equity_end"] = df["equity_end"].map(lambda x: f"{x:,.0f}")
    lines = ["| " + " | ".join(str(c).replace("best_", "") for c in cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(str(v) for v in r.to_numpy()) + " |")
    return "\n".join(lines)


def mc_md(mc: dict) -> str:
    if not mc or mc.get("n_trades", 1) == 0:
        return "_No trades to bootstrap._"
    lines = ["| Percentile | " + " | ".join(str(q) for q in bt.PCTS) + " |", "|---|" + "---|" * len(bt.PCTS)]
    for label, key, f in (("Final equity multiple", "final_equity_multiple_pct", lambda x: fmt_num(x, 3)), ("Max drawdown", "max_drawdown_pct", fmt_pct), ("Sharpe", "sharpe_pct", fmt_num)):
        if key in mc:
            lines.append(f"| {label} | " + " | ".join(f(mc[key][str(q)]) for q in bt.PCTS) + " |")
    lines.append("")
    lines.append(f"P(max DD > 30%) = {fmt_pct(mc.get('p_drawdown_gt_30'))}, P(max DD > 50%) = {fmt_pct(mc.get('p_drawdown_gt_50'))}, "
                 f"P(ending below start) = {fmt_pct(mc.get('p_loss'))}" + (f", n_trades = {mc['n_trades']}" if "n_trades" in mc else "") +
                 (f", n_sims = {mc['n_sims']}" if "n_sims" in mc else "") + (f", n_paths = {mc['n_paths']}" if "n_paths" in mc else ""))
    return "\n".join(lines)


def try_plots(out_dir: str, equities: dict[str, pd.Series]) -> list[str]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        return []
    written = []
    fig, ax = plt.subplots(figsize=(10, 5))
    for name, eq in equities.items():
        if len(eq):
            ax.plot(eq.index, eq / eq.iloc[0], label=name)
    ax.set_yscale("log"); ax.set_title("Equity (start = 1.0, log scale)"); ax.legend(); ax.grid(alpha=0.3)
    p = os.path.join(out_dir, "equity.png"); fig.tight_layout(); fig.savefig(p, dpi=120); plt.close(fig); written.append(p)
    fig, ax = plt.subplots(figsize=(10, 4))
    for name, eq in equities.items():
        if len(eq):
            ax.plot(eq.index, eq / eq.cummax() - 1, label=name)
    ax.set_title("Drawdown"); ax.legend(); ax.grid(alpha=0.3)
    p = os.path.join(out_dir, "drawdown.png"); fig.tight_layout(); fig.savefig(p, dpi=120); plt.close(fig); written.append(p)
    return written


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o) if np.isfinite(o) else None
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return str(o.date())
    if hasattr(o, "isoformat"):
        return o.isoformat()
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def build_parser():
    ap = argparse.ArgumentParser(prog="python -m letf.backtest", description="Synthetic-option backtest of the LETF signal rules")
    ap.add_argument("--symbols", nargs="+", default=["TQQQ", "UPRO"])
    ap.add_argument("--parents", nargs="+", default=None, help="parent per symbol (default TQQQ->QQQ, UPRO->SPY)")
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default=None)
    ap.add_argument("--out", default="out/backtest")
    ap.add_argument("--cache-dir", default=bt.default_cache_dir())
    ap.add_argument("--equity", type=float, default=100_000.0)
    ap.add_argument("--target-delta", type=float, default=0.35)
    ap.add_argument("--take-profit-x", type=float, default=2.0)
    ap.add_argument("--stop-loss-pct", type=float, default=0.5)
    ap.add_argument("--time-stop-dte", type=int, default=1)
    ap.add_argument("--max-premium-pct", type=float, default=0.01)
    ap.add_argument("--max-open", type=int, default=3)
    ap.add_argument("--min-dte", type=int, default=3)
    ap.add_argument("--max-dte", type=int, default=10)
    ap.add_argument("--wfa-start", default="2020-01-01")
    ap.add_argument("--no-wfa", action="store_true")
    ap.add_argument("--mc-trades", type=int, default=5000, help="trade-bootstrap simulations (0 = skip)")
    ap.add_argument("--mc-paths", type=int, default=0, help="block-bootstrap price paths to re-run (slow; 0 = skip)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--quiet", action="store_true")
    return ap


def run_cli(argv=None):
    args = build_parser().parse_args(argv)
    t0 = time.time()
    log = (lambda *a, **k: None) if args.quiet else print
    os.makedirs(args.out, exist_ok=True)
    symbols = [s.upper() for s in args.symbols]
    ds = bt.load_dataset(symbols, args.parents, args.cache_dir, None, args.end)  # keep full history for feature warm-up
    log(f"[data] {len(ds.index)} common days {ds.index[0].date()}..{ds.index[-1].date()} for {symbols} (cache {args.cache_dir})")
    base = bt.BacktestParams(target_delta=args.target_delta, take_profit_x=args.take_profit_x, stop_loss_pct=args.stop_loss_pct,
                             time_stop_dte=args.time_stop_dte, max_premium_pct=args.max_premium_pct, max_open_positions=args.max_open,
                             min_dte=args.min_dte, max_dte=args.max_dte, initial_equity=args.equity)
    eng = bt.Engine(ds, base)
    a, b = eng.window(args.start, args.end)

    # 1. fixed-parameter backtests: combined portfolio + each symbol alone
    runs = {}
    names = (["+".join(symbols)] if len(symbols) > 1 else []) + symbols
    for name in names:
        syms = name.split("+")
        r = eng.simulate(syms, base, a, b)
        runs[name] = (r, bt.compute_metrics(r))
        m = runs[name][1]
        log(f"[fixed] {name}: CAGR {fmt_pct(m.get('cagr'))} Sharpe {fmt_num(m.get('sharpe'))} maxDD {fmt_pct(m.get('max_drawdown'))} trades {m.get('n_trades')} win {fmt_pct(m.get('win_rate'))}")
    combined = names[0]
    runs[combined][0].trades.to_csv(os.path.join(args.out, "trades.csv"), index=False)
    eq_df = pd.DataFrame({n: r.equity for n, (r, _) in runs.items()})
    eq_df.to_csv(os.path.join(args.out, "equity.csv"))

    # 2. walk-forward per symbol (and combined when several)
    wfa = {}
    if not args.no_wfa:
        for name in names:
            t1 = time.time()
            w = bt.walk_forward(eng, name.split("+"), base, start=args.wfa_start, verbose=not args.quiet)
            wfa[name] = w
            log(f"[wfa] {name}: {len(w.windows)} windows, OOS CAGR {fmt_pct(w.oos_metrics.get('cagr'))} Sharpe {fmt_num(w.oos_metrics.get('sharpe'))} "
                f"maxDD {fmt_pct(w.oos_metrics.get('max_drawdown'))} trades {w.oos_metrics.get('n_trades')} profitable windows {fmt_pct(w.frac_profitable)} ({time.time() - t1:.1f}s)")
        parts = []
        for name, w in wfa.items():
            d = w.windows.copy(); d.insert(0, "run", name); parts.append(d)
        (pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()).to_csv(os.path.join(args.out, "wfa.csv"), index=False)
        for name, w in wfa.items():
            w.oos_trades.to_csv(os.path.join(args.out, f"wfa_oos_trades_{name.replace('+', '_')}.csv"), index=False)

    # 3. Monte Carlo
    mc = {}
    if args.mc_trades > 0:
        for name in names:
            src = wfa[name].oos_trades if name in wfa else runs[name][0].trades
            mc[name] = {"trade_bootstrap_oos" if name in wfa else "trade_bootstrap_fixed": bt.mc_trade_bootstrap(src, args.mc_trades, args.seed)}
    if args.mc_paths > 0:
        for name in names:
            t1 = time.time()
            mc.setdefault(name, {})["path_bootstrap"] = bt.mc_path_bootstrap(ds, name.split("+"), base, n_paths=args.mc_paths, seed=args.seed, verbose=not args.quiet)
            log(f"[mc-paths] {name}: done in {time.time() - t1:.0f}s")
    with open(os.path.join(args.out, "mc.json"), "w") as f:
        json.dump(mc, f, indent=2, default=_json_default)

    # 4. summary + report
    summary = {"symbols": symbols, "parents": ds.parent_of, "start": args.start, "end": str(ds.index[b - 1].date()), "params": base.to_dict(),
               "fixed": {n: m for n, (_, m) in runs.items()},
               "wfa": {n: {"n_windows": int(len(w.windows)), "frac_profitable_windows": w.frac_profitable, "oos": w.oos_metrics,
                           "param_path": w.windows[[c for c in w.windows.columns if c.startswith("best_")] + ["is_start", "is_end"]].to_dict("records")} for n, w in wfa.items()},
               "mc": mc, "runtime_s": round(time.time() - t0, 1), "limitations": LIMITATIONS}
    with open(os.path.join(args.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2, default=_json_default)
    pngs = try_plots(args.out, {**{n: r.equity for n, (r, _) in runs.items()}, **{f"WFA OOS {n}": w.oos_equity for n, w in wfa.items()}})
    write_report(args, ds, base, runs, wfa, mc, pngs, os.path.join(args.out, "report.md"))
    log(f"[done] wrote {args.out} in {time.time() - t0:.1f}s")
    return summary


def write_report(args, ds, base, runs, wfa, mc, pngs, path):
    L = []
    L.append(f"# LETF options backtest (synthetic option pricing)\n")
    L.append(f"Symbols {', '.join(runs)} | parents {ds.parent_of} | period {args.start} to {ds.index[-1].date()} | "
             f"start equity {base.initial_equity:,.0f} | generated {pd.Timestamp.now():%Y-%m-%d %H:%M}\n")
    L.append(LIMITATIONS)
    L.append("## Fixed parameters\n")
    L.append("```\n" + json.dumps(base.to_dict(), indent=1, default=_json_default) + "\n```\n")
    L.append("## Fixed-parameter backtest\n")
    L.append(metrics_table({n: m for n, (_, m) in runs.items()}) + "\n")
    L.append("### Yearly returns\n")
    L.append(yearly_table({n: m for n, (_, m) in runs.items()}) + "\n")
    for n, (_, m) in runs.items():
        L.append(f"### Monthly returns: {n}\n")
        L.append(monthly_md(m.get("monthly_returns", {})) + "\n")
    if wfa:
        L.append("## Walk-forward analysis (IS 12m / OOS 3m / step 3m)\n")
        L.append(f"Grid: {json.dumps(bt.DEFAULT_GRID)} ({next(iter(wfa.values())).n_combos} combinations), objective: in-sample Sharpe, min 8 trades. "
                 f"`fallback` windows had no qualifying combination and used the base parameters.\n")
        L.append("### OOS metrics (stitched, compounding)\n")
        L.append(metrics_table({n: w.oos_metrics for n, w in wfa.items()}) + "\n")
        for n, w in wfa.items():
            L.append(f"Profitable OOS windows, {n}: {fmt_pct(w.frac_profitable)} of {len(w.windows)}\n")
        for n, w in wfa.items():
            L.append(f"### Parameter path and per-window results: {n}\n")
            L.append(wfa_md(w, list(bt.DEFAULT_GRID)) + "\n")
            L.append("### OOS yearly returns: " + n + "\n")
            L.append(yearly_table({n: w.oos_metrics}) + "\n")
    if mc:
        L.append("## Monte Carlo\n")
        for n, d in mc.items():
            for kind, res in d.items():
                title = {"trade_bootstrap_oos": "Trade bootstrap of WFA OOS trades", "trade_bootstrap_fixed": "Trade bootstrap of fixed-parameter trades",
                         "path_bootstrap": "Block-bootstrap price paths (fixed parameters)"}[kind]
                L.append(f"### {n}: {title}\n")
                L.append(mc_md(res) + "\n")
    if pngs:
        L.append("## Charts\n")
        for p in pngs:
            L.append(f"![{os.path.basename(p)}]({os.path.basename(p)})\n")
    else:
        L.append("_Charts skipped: matplotlib not importable._\n")
    with open(path, "w") as f:
        f.write("\n".join(L))
