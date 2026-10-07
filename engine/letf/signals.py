"""Regime classification and systematic signals.

The rules here are the single source of truth; the Pine indicator mirrors them.
Inputs are daily bars (DataFrame indexed by date with open/high/low/close) for
the parent symbol (QQQ or SPY) and the volatility index (VXN or VIX), plus
optional gamma levels, catalyst pressure and sentiment.

Signal score in [-1, 1]: positive favors long calls, negative favors long puts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class SignalParams:
    sma_long: int = 200
    ema_short: int = 20
    rsi_len: int = 5
    pullback_pct: float = 1.5        # % below 5-day high to qualify as a dip
    rsi_buy: float = 40.0
    rsi_sell: float = 60.0
    vol_pct_window: int = 252
    vol_extreme_pct: float = 90.0    # block long calls above this percentile
    vol_low_pct: float = 25.0        # block long puts below this percentile
    iv_rank_max_long: float = 60.0   # do not buy premium when IV rank is above this
    sentiment_weight: float = 0.15   # max contribution of sentiment to the score
    catalyst_weight: float = 0.15    # max contribution of catalyst pressure
    gamma_weight: float = 0.20       # contribution of gamma regime/level proximity
    min_abs_score: float = 0.35      # threshold to emit a signal


def rsi(close: pd.Series, n: int) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def percentile_rank(s: pd.Series, window: int) -> pd.Series:
    return s.rolling(window, min_periods=max(20, window // 4)).apply(lambda w: (w[:-1] < w[-1]).mean() * 100, raw=True)


def features(px: pd.DataFrame, vol: pd.DataFrame | None, p: SignalParams) -> pd.DataFrame:
    f = pd.DataFrame(index=px.index)
    c = px["close"]
    f["close"] = c
    f["sma_long"] = c.rolling(p.sma_long).mean()
    f["ema_short"] = c.ewm(span=p.ema_short, adjust=False).mean()
    f["rsi"] = rsi(c, p.rsi_len)
    f["hi5"] = px["high"].rolling(5).max()
    f["pullback_pct"] = (f["hi5"] - c) / f["hi5"] * 100
    f["ret1"] = c.pct_change()
    f["rv20"] = f["ret1"].rolling(20).std() * np.sqrt(252) * 100
    if vol is not None:
        v = vol["close"].reindex(px.index).ffill()
        f["vol"] = v
        f["vol_pct"] = percentile_rank(v, p.vol_pct_window)
        lo, hi = v.rolling(252, min_periods=60).min(), v.rolling(252, min_periods=60).max()
        f["iv_rank"] = (v - lo) / (hi - lo).replace(0, np.nan) * 100
        f["vrp"] = v - f["rv20"]  # implied minus realized: positive = premium rich
    else:
        f["vol"] = np.nan
        f["vol_pct"] = 50.0
        f["iv_rank"] = 50.0
        f["vrp"] = 0.0
    f["trend"] = np.select([(c > f["sma_long"]) & (c > f["ema_short"]), (c < f["sma_long"]) & (c < f["ema_short"])], ["UP", "DOWN"], "MIXED")
    return f


@dataclass
class SignalContext:
    gamma_regime: str = "unknown"        # positive / negative / unknown
    flip: Optional[float] = None
    call_wall: Optional[float] = None
    put_wall: Optional[float] = None
    sentiment: float = 0.0               # [-1, 1]
    catalyst_pressure: float = 0.0       # [0, 1]
    catalyst_labels: list[str] = field(default_factory=list)


@dataclass
class Signal:
    day: date
    direction: str          # LONG_CALL / LONG_PUT / NONE
    score: float
    components: dict
    reasons: list[str]
    trend: str
    vol_regime: str
    iv_rank: float


def vol_regime(pct: float) -> str:
    if np.isnan(pct):
        return "NORMAL"
    return "LOW" if pct < 25 else "EXTREME" if pct > 90 else "HIGH" if pct > 75 else "NORMAL"


def score_row(row: pd.Series, ctx: SignalContext, p: SignalParams) -> Signal:
    comps, reasons = {}, []
    c = row["close"]
    trend = row["trend"]
    vr = vol_regime(float(row.get("vol_pct", np.nan)))
    ivr = float(row.get("iv_rank", 50.0)) if not np.isnan(row.get("iv_rank", np.nan)) else 50.0

    # 1. Trend/mean-reversion core (the TASC/r-LETFs dip-buy in uptrends; bounce-sell in downtrends)
    core = 0.0
    if trend == "UP" and row["pullback_pct"] >= p.pullback_pct and row["rsi"] < p.rsi_buy:
        core = +0.6
        reasons.append(f"uptrend dip: {row['pullback_pct']:.1f}% off 5d high, RSI{p.rsi_len}={row['rsi']:.0f}")
    elif trend == "DOWN" and row["rsi"] > p.rsi_sell:
        core = -0.6
        reasons.append(f"downtrend bounce: RSI{p.rsi_len}={row['rsi']:.0f} below EMA{p.ema_short}")
    elif trend == "UP" and row["rsi"] < p.rsi_buy:
        core = +0.3
        reasons.append("uptrend, oversold short-term")
    elif trend == "DOWN" and row["rsi"] > 50:
        core = -0.3
        reasons.append("downtrend, relief bounce")
    comps["core"] = core

    # 2. Gamma regime: negative gamma amplifies moves (favor the trend direction), positive gamma dampens
    g = 0.0
    if ctx.gamma_regime == "negative":
        g = p.gamma_weight * (1 if core > 0 else -1 if core < 0 else 0)
        reasons.append("negative gamma: dealers chase, moves extend")
    elif ctx.gamma_regime == "positive":
        g = -0.5 * p.gamma_weight * np.sign(core)  # dampened; mean reversion favors fading, so trim conviction
        reasons.append("positive gamma: dealers dampen, expect pinning")
    if ctx.put_wall and c <= ctx.put_wall * 1.005 and core >= 0:
        g += 0.5 * p.gamma_weight
        reasons.append(f"at put wall {ctx.put_wall:.2f} (support)")
    if ctx.call_wall and c >= ctx.call_wall * 0.995 and core <= 0:
        g -= 0.5 * p.gamma_weight
        reasons.append(f"at call wall {ctx.call_wall:.2f} (resistance)")
    comps["gamma"] = g

    # 3. Sentiment promotes, never dominates
    s = float(np.clip(ctx.sentiment, -1, 1)) * p.sentiment_weight
    comps["sentiment"] = s

    # 4. Catalyst pressure increases conviction in the core direction (more movement expected)
    k = ctx.catalyst_pressure * p.catalyst_weight * np.sign(core) if core != 0 else 0.0
    comps["catalyst"] = k
    if ctx.catalyst_labels and core != 0:
        reasons.append("catalysts: " + ", ".join(ctx.catalyst_labels[:3]))

    score = float(np.clip(core + g + s + k, -1, 1))

    # 5. Hard filters for buying premium
    blocked = None
    if ivr > p.iv_rank_max_long:
        blocked = f"IV rank {ivr:.0f} > {p.iv_rank_max_long:.0f}: premium too rich to buy"
    if score > 0 and vr == "EXTREME":
        blocked = "vol regime EXTREME: no long calls"
    if score < 0 and vr == "LOW":
        blocked = "vol regime LOW: no long puts (no fear to fade)"
    direction = "NONE"
    if blocked:
        reasons.append("BLOCKED: " + blocked)
        score = 0.0
    elif score >= p.min_abs_score:
        direction = "LONG_CALL"
    elif score <= -p.min_abs_score:
        direction = "LONG_PUT"
    return Signal(day=row.name.date() if hasattr(row.name, "date") else row.name, direction=direction, score=score,
                  components=comps, reasons=reasons, trend=trend, vol_regime=vr, iv_rank=ivr)


def latest_signal(px: pd.DataFrame, vol: pd.DataFrame | None, ctx: SignalContext, p: SignalParams | None = None) -> tuple[Signal, pd.DataFrame]:
    p = p or SignalParams()
    f = features(px, vol, p)
    return score_row(f.iloc[-1], ctx, p), f


def event_premium_sale(row: pd.Series, cal_pressure: float, p: SignalParams) -> Optional[dict]:
    """Defined-risk short premium into an event: requires IV rank > 60 and implied
    above realized (positive VRP). Returns a recommendation dict (credit spread) or None.
    Disabled by default in config because the user currently trades singles only."""
    ivr = float(row.get("iv_rank", 0) or 0)
    vrp = float(row.get("vrp", 0) or 0)
    if cal_pressure >= 0.6 and ivr >= 60 and vrp > 0:
        return {"strategy": "credit_spread", "reason": f"event IV rank {ivr:.0f}, VRP {vrp:.1f} pts", "side": "put" if row["trend"] == "UP" else "call"}
    return None
