"""Server-rendered SVG charts. No JavaScript libraries, no external assets.

Colors come from CSS custom properties in app.css (categorical slots and
status colors), so dark mode and theming live in one place. Every chart has
native <title> tooltips on its marks and is paired in the template with a
table view of the same numbers.
"""

from __future__ import annotations

from html import escape

import numpy as np
import pandas as pd

W, H = 760, 260
PAD_L, PAD_R, PAD_T, PAD_B = 44, 16, 14, 30


def _nice_max(v: float) -> float:
    if v <= 0:
        return 1.0
    mag = 10 ** np.floor(np.log10(v))
    for m in (1, 2, 2.5, 5, 10):
        if v <= m * mag:
            return float(m * mag)
    return float(10 * mag)


def _axes(ymax: float, xlabels: list[str], n: int) -> tuple[str, callable, callable]:
    plot_w, plot_h = W - PAD_L - PAD_R, H - PAD_T - PAD_B
    def x(i: float) -> float:
        return PAD_L + plot_w * (i + 0.5) / max(n, 1)
    def y(v: float) -> float:
        return PAD_T + plot_h * (1 - v / ymax)
    parts = []
    for k in range(5):
        v = ymax * k / 4
        parts.append(f'<line class="grid" x1="{PAD_L}" x2="{W - PAD_R}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
        parts.append(f'<text class="tick" x="{PAD_L - 6}" y="{y(v) + 4:.1f}" text-anchor="end">{v:,.0f}</text>')
    step = max(1, int(np.ceil(n / 14)))
    for i, lab in enumerate(xlabels):
        if i % step == 0:
            parts.append(f'<text class="tick" x="{x(i):.1f}" y="{H - 8}" text-anchor="middle">{escape(lab)}</text>')
    return "".join(parts), x, y


def _path(xs: list[float], ys: list[float]) -> str:
    pts = [f"{'M' if i == 0 else 'L'}{a:.1f},{b:.1f}" for i, (a, b) in enumerate(zip(xs, ys, strict=True))]
    return " ".join(pts)


def hourly_chart(day: pd.DataFrame, title: str, show_baseline: bool = True, revised: pd.Series | None = None) -> str:
    """Forecast line with 80% band, baseline, actuals, and optional revised line."""
    n = len(day)
    labels = [f"{int(h)}" for h in day["hour"]]
    cols = ["high", "forecast", "baseline"] + (["actual"] if "actual" in day else [])
    ymax = _nice_max(float(np.nanmax(day[cols].to_numpy(dtype=float))) * 1.1)
    axes, x, y = _axes(ymax, labels, n)
    xs = [x(i) for i in range(n)]
    band = _path(xs, [y(v) for v in day["high"]]) + " " + " ".join(f"L{a:.1f},{y(v):.1f}" for a, v in zip(reversed(xs), reversed(day["low"].tolist()), strict=True)) + " Z"
    parts = [axes, f'<path class="band s1" d="{band}"/>']
    if show_baseline:
        parts.append(f'<path class="line s2" d="{_path(xs, [y(v) for v in day["baseline"]])}"/>')
    parts.append(f'<path class="line s1" d="{_path(xs, [y(v) for v in day["forecast"]])}"/>')
    if revised is not None:
        parts.append(f'<path class="line s3 dashed" d="{_path(xs, [y(v) for v in revised])}"/>')
    if "actual" in day:
        act = day["actual"].to_numpy(dtype=float)
        known = [(xs[i], act[i]) for i in range(n) if not np.isnan(act[i])]
        if known:
            parts.append(f'<path class="line ink" d="{_path([k[0] for k in known], [y(k[1]) for k in known])}"/>')
            for i, (px, v) in enumerate(known):
                parts.append(f'<circle class="dot ink" cx="{px:.1f}" cy="{y(v):.1f}" r="4"><title>{labels[i]}:00 actual {v:.0f}</title></circle>')
    for i in range(n):
        r = day.iloc[i]
        tip = f"{labels[i]}:00 forecast {r['forecast']:.0f} ({r['low']:.0f}-{r['high']:.0f}), 4-wk avg {r['baseline']:.0f}"
        if revised is not None:
            tip += f", revised {revised.iloc[i]:.0f}"
        parts.append(f'<rect class="hit" x="{xs[i] - (W - PAD_L - PAD_R) / n / 2:.1f}" y="{PAD_T}" width="{(W - PAD_L - PAD_R) / n:.1f}" height="{H - PAD_T - PAD_B}"><title>{escape(tip)}</title></rect>')
    legend = [("s1", "Model forecast"), ("s2", "4-week average")] if show_baseline else [("s1", "Model forecast")]
    if revised is not None:
        legend.append(("s3", "Revised (live)"))
    if "actual" in day and day["actual"].notna().any():
        legend.append(("ink", "Actual"))
    return _wrap(parts, title, legend)


def week_columns(daily: pd.DataFrame, title: str) -> str:
    """Daily totals: model vs baseline as paired columns."""
    n = len(daily)
    labels = [pd.Timestamp(d).strftime("%a %-m/%-d") for d in daily["date"]]
    ymax = _nice_max(float(daily[["forecast", "baseline"]].to_numpy().max()) * 1.1)
    axes, x, y = _axes(ymax, labels, n)
    bw = min(22.0, (W - PAD_L - PAD_R) / n / 2 - 4)
    parts = [axes]
    for i, r in daily.reset_index(drop=True).iterrows():
        for j, (col, cls) in enumerate((("baseline", "s2"), ("forecast", "s1"))):
            v = float(r[col])
            cx = x(i) + (j - 0.5) * (bw + 2)
            parts.append(f'<rect class="bar {cls}" x="{cx - bw / 2:.1f}" y="{y(v):.1f}" width="{bw:.1f}" height="{y(0) - y(v):.1f}" rx="4"><title>{escape(labels[i])} {col}: {v:,.0f}</title></rect>')
    return _wrap(parts, title, [("s2", "4-week average"), ("s1", "Model forecast")])


def accuracy_columns(acc: pd.DataFrame, title: str) -> str:
    """Weekly daily-WAPE, baseline vs model. Lower is better."""
    n = len(acc)
    labels = [pd.Timestamp(d).strftime("%-m/%-d") for d in acc["week_start"]]
    ymax = _nice_max(float(acc[["baseline", "model"]].to_numpy().max()) * 110)
    axes, x, y = _axes(ymax, labels, n)
    bw = min(22.0, (W - PAD_L - PAD_R) / n / 2 - 4)
    parts = [axes]
    for i, r in acc.reset_index(drop=True).iterrows():
        for j, (col, cls) in enumerate((("baseline", "s2"), ("model", "s1"))):
            v = float(r[col]) * 100
            cx = x(i) + (j - 0.5) * (bw + 2)
            parts.append(f'<rect class="bar {cls}" x="{cx - bw / 2:.1f}" y="{y(v):.1f}" width="{bw:.1f}" height="{y(0) - y(v):.1f}" rx="4"><title>week of {escape(labels[i])} {col}: {v:.1f}% error</title></rect>')
    return _wrap(parts, title, [("s2", "4-week average"), ("s1", "Model")], ylabel="daily error %")


def condition_bars(bc: pd.DataFrame, title: str) -> str:
    """Horizontal paired bars of hourly WAPE by condition."""
    rows = bc.reset_index()
    n = len(rows)
    h = 28 * n + 40
    xmax = _nice_max(float(rows[["baseline_wape", "model_wape"]].to_numpy().max()) * 110)
    lab_w = 230
    plot_w = W - lab_w - 60
    def x(v: float) -> float:
        return lab_w + plot_w * v / xmax
    parts = []
    for k in range(5):
        v = xmax * k / 4
        parts.append(f'<line class="grid" x1="{x(v):.1f}" x2="{x(v):.1f}" y1="10" y2="{h - 24}"/>')
        parts.append(f'<text class="tick" x="{x(v):.1f}" y="{h - 8}" text-anchor="middle">{v:.0f}%</text>')
    for i, r in rows.iterrows():
        cy = 20 + 28 * i
        parts.append(f'<text class="tick" x="{lab_w - 8}" y="{cy + 10}" text-anchor="end">{escape(str(r["condition"]))} ({int(r["hours"])}h)</text>')
        for j, (col, cls) in enumerate((("baseline_wape", "s2"), ("model_wape", "s1"))):
            v = float(r[col]) * 100
            parts.append(f'<rect class="bar {cls}" x="{lab_w}" y="{cy + j * 10:.1f}" width="{x(v) - lab_w:.1f}" height="8" rx="3"><title>{escape(str(r["condition"]))} {col.replace("_wape", "")}: {v:.1f}%</title></rect>')
    return _wrap(parts, title, [("s2", "4-week average"), ("s1", "Model")], height=h)


def staffing_heat(plan: pd.DataFrame, stations: list[str], title: str) -> str:
    """Hour x station headcount as a sequential heat grid (one hue, darker = more)."""
    hours = plan["hour"].tolist()
    n = len(hours)
    cell_w = (W - 150) / max(n, 1)
    cell_h = 22
    h = cell_h * (len(stations) + 1) + 30
    vmax = max(1, int(plan[stations].to_numpy().max()))
    parts = []
    for i, hr in enumerate(hours):
        parts.append(f'<text class="tick" x="{150 + cell_w * (i + 0.5):.1f}" y="14" text-anchor="middle">{int(hr)}</text>')
    for j, st in enumerate(stations):
        cy = 22 + cell_h * j
        parts.append(f'<text class="tick" x="142" y="{cy + 15}" text-anchor="end">{escape(st.replace("_", " "))}</text>')
        for i, (_, r) in enumerate(plan.iterrows()):
            v = int(r[st])
            step = 0 if v == 0 else min(6, 1 + int(5 * (v - 1) / max(vmax - 1, 1)))
            parts.append(f'<rect class="cell seq{step}" x="{150 + cell_w * i + 1:.1f}" y="{cy + 1}" width="{cell_w - 2:.1f}" height="{cell_h - 2}" rx="3"><title>{int(hours[i])}:00 {escape(st)}: {v}</title></rect>')
            if v:
                parts.append(f'<text class="cellval" x="{150 + cell_w * (i + 0.5):.1f}" y="{cy + 15}" text-anchor="middle">{v}</text>')
    cy = 22 + cell_h * len(stations)
    parts.append(f'<text class="tick strong" x="142" y="{cy + 15}" text-anchor="end">total</text>')
    for i, (_, r) in enumerate(plan.iterrows()):
        parts.append(f'<text class="cellval ink" x="{150 + cell_w * (i + 0.5):.1f}" y="{cy + 15}" text-anchor="middle">{int(r["total"])}</text>')
    return _wrap(parts, title, [], height=h)


def sparkline(values: list[float], width: int = 120, height: int = 28) -> str:
    if not values:
        return ""
    v = np.asarray(values, dtype=float)
    lo, hi = float(np.nanmin(v)), float(np.nanmax(v))
    rng = (hi - lo) or 1.0
    xs = [width * i / max(len(v) - 1, 1) for i in range(len(v))]
    ys = [height - 3 - (height - 6) * (val - lo) / rng for val in v]
    return (f'<svg class="spark" viewBox="0 0 {width} {height}" width="{width}" height="{height}" aria-hidden="true">'
            f'<path class="line s1" d="{_path(xs, ys)}"/><circle class="dot s1" cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="3"/></svg>')


def _wrap(parts: list[str], title: str, legend: list[tuple[str, str]], height: int = H, ylabel: str = "") -> str:
    leg = "".join(f'<span class="key"><i class="sw {cls}"></i>{escape(lab)}</span>' for cls, lab in legend)
    yl = f'<div class="ylabel">{escape(ylabel)}</div>' if ylabel else ""
    return (f'<figure class="chart"><figcaption><span class="ctitle">{escape(title)}</span><span class="legend">{leg}</span></figcaption>{yl}'
            f'<svg viewBox="0 0 {W} {height}" role="img" aria-label="{escape(title)}">{"".join(parts)}</svg></figure>')
