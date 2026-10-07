"""Expected-value ranking of single-leg options.

For each candidate contract we simulate the underlying at expiry under a
model distribution that blends:
  * lognormal with the contract's own IV (market-implied width), and
  * a Student-t (df=4) fat-tailed version of the same width,
and shifts the center by a drift derived from the signal score:
  drift_pct = score * k * implied_1sigma_move   (k = `drift_k`, default 0.5)
So a +1 score expects a move of half the implied 1-sigma in the signal direction;
score 0 means the market's own distribution (EV ≈ -spread cost).

Outputs per contract: EV (dollars per contract), EV/premium (return on risk),
probability of profit at expiry, P(2x), Kelly fraction of bankroll, max loss.
Entry at ask, exit at bid proxy (we subtract half the spread again at exit).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from .gex import years_to_expiry


@dataclass
class RankParams:
    n_sims: int = 20000
    drift_k: float = 0.5
    t_df: float = 4.0
    t_blend: float = 0.5           # weight of fat-tailed component
    min_delta: float = 0.15
    max_delta: float = 0.65
    min_oi: int = 100
    min_volume: int = 10
    max_spread_pct: float = 0.12   # (ask-bid)/mid
    min_dte: int = 1
    max_dte: int = 14
    min_pop: float = 0.25
    account: float = 100_000.0
    max_premium_pct: float = 0.01  # per trade premium cap = 1% of account
    kelly_cap: float = 0.5         # use half-Kelly
    seed: int = 7


def simulate_terminal(spot: float, iv: float, T: float, drift_pct: float, p: RankParams, rng: np.random.Generator) -> np.ndarray:
    sig = iv * np.sqrt(max(T, 1e-6))
    n_t = int(p.n_sims * p.t_blend)
    n_n = p.n_sims - n_t
    z_n = rng.standard_normal(n_n)
    z_t = rng.standard_t(p.t_df, n_t) / np.sqrt(p.t_df / (p.t_df - 2))  # unit variance
    z = np.concatenate([z_n, z_t])
    mu = np.log1p(drift_pct) - 0.5 * sig**2
    return spot * np.exp(mu + sig * z)


def kelly_fraction(returns: np.ndarray, cap: float) -> float:
    """Kelly for a distribution of multiplicative returns R (-1 = total loss)."""
    if returns.mean() <= 0:
        return 0.0
    def neg_growth(f):
        g = np.log1p(np.clip(f * returns, -0.999999, None))
        return -g.mean()
    res = minimize_scalar(neg_growth, bounds=(0.0, 1.0), method="bounded")
    return float(min(max(res.x, 0.0), 1.0) * cap)


def rank_singles(chain: pd.DataFrame, spot: float, score: float, direction: str, as_of=None, p: RankParams | None = None,
                 symbol: str = "") -> pd.DataFrame:
    """Rank long calls (direction LONG_CALL) or long puts (LONG_PUT)."""
    p = p or RankParams()
    rng = np.random.default_rng(p.seed)
    want = "call" if direction == "LONG_CALL" else "put"
    df = chain.copy()
    df["type"] = df["type"].str.lower()
    df = df[df["type"] == want].copy()
    df["T"] = years_to_expiry(df["expiration"], as_of)
    df["dte"] = (df["T"] * 365).round().astype(int)
    df = df[(df["dte"] >= p.min_dte) & (df["dte"] <= p.max_dte)]
    for c in ("bid", "ask", "iv", "delta", "open_interest", "volume"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["bid", "ask", "iv"])
    df = df[(df["ask"] > 0) & (df["bid"] > 0)]
    df["mid"] = (df["bid"] + df["ask"]) / 2
    df["spread_pct"] = (df["ask"] - df["bid"]) / df["mid"]
    df["abs_delta"] = df["delta"].abs()
    liq = (df["open_interest"].fillna(0) >= p.min_oi) & (df["volume"].fillna(0) >= p.min_volume) & (df["spread_pct"] <= p.max_spread_pct)
    dl = (df["abs_delta"] >= p.min_delta) & (df["abs_delta"] <= p.max_delta)
    df["liquid"] = liq
    df = df[dl]
    if df.empty:
        return df
    sign = 1.0 if want == "call" else -1.0
    # Distribution width comes from the ATM IV of each expiry (the market's consensus
    # move), not from the strike's own skewed IV; otherwise richer OTM strikes get
    # rewarded with wider simulated distributions. The strike's IV only sets its price.
    full = chain.copy()
    full["type"] = full["type"].str.lower()
    full["iv"] = pd.to_numeric(full["iv"], errors="coerce")
    full["strike"] = pd.to_numeric(full["strike"], errors="coerce")
    atm_iv = {}
    for exp, grp in full.dropna(subset=["iv", "strike"]).groupby("expiration"):
        near = grp.iloc[(grp["strike"] - spot).abs().argsort()[:4]]
        atm_iv[exp] = float(near["iv"].median())
    rows = []
    cap_premium = p.account * p.max_premium_pct
    for _, r in df.iterrows():
        iv, T, K = float(r["iv"]), float(r["T"]), float(r["strike"])
        dist_iv = atm_iv.get(r["expiration"], iv)
        implied_move = dist_iv * np.sqrt(T)
        # score sign already encodes direction: LONG_PUT carries a negative score -> negative drift
        drift = score * p.drift_k * implied_move
        ST = simulate_terminal(spot, dist_iv, T, drift, p, rng)
        payoff = np.maximum(sign * (ST - K), 0.0)
        entry = float(r["ask"])
        exit_cost = (float(r["ask"]) - float(r["bid"])) / 2  # slippage proxy on exit
        pnl = payoff - entry - exit_cost
        ret = pnl / entry
        ev = float(pnl.mean()) * 100
        pop = float((pnl > 0).mean())
        p2x = float((payoff >= 2 * entry).mean())
        kelly = kelly_fraction(ret, p.kelly_cap)
        contracts = int(min(cap_premium, kelly * p.account) // (entry * 100)) if entry > 0 else 0
        rows.append({
            "symbol": symbol, "expiration": r["expiration"], "dte": int(r["dte"]), "type": want, "strike": K,
            "bid": float(r["bid"]), "ask": float(r["ask"]), "iv": iv, "delta": float(r["delta"]) if not np.isnan(r["delta"]) else np.nan,
            "oi": int(r["open_interest"]) if not np.isnan(r["open_interest"]) else 0, "volume": int(r["volume"]) if not np.isnan(r["volume"]) else 0,
            "spread_pct": float(r["spread_pct"]), "liquid": bool(r["liquid"]),
            "ev_$": ev, "ev_on_premium": ev / (entry * 100), "pop": pop, "p_2x": p2x, "kelly_f": kelly,
            "contracts": contracts, "premium_$": contracts * entry * 100, "max_loss_$": contracts * entry * 100,
            "breakeven": K + sign * entry, "implied_move_pct": implied_move * 100, "atm_iv": dist_iv, "model_drift_pct": drift * 100,
        })
    out = pd.DataFrame(rows)
    out = out[out["pop"] >= p.min_pop]
    # rank: liquid first, then EV on premium, then POP
    out = out.sort_values(["liquid", "ev_on_premium", "pop"], ascending=[False, False, False]).reset_index(drop=True)
    return out


def best(out: pd.DataFrame) -> Optional[pd.Series]:
    if out is None or out.empty:
        return None
    liquid = out[out["liquid"] & (out["ev_on_premium"] > 0)]
    if not liquid.empty:
        return liquid.iloc[0]
    pos = out[out["ev_on_premium"] > 0]
    return pos.iloc[0] if not pos.empty else None
