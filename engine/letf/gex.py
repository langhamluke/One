"""Dealer gamma exposure, gamma flip, walls, max pain, vanna/charm exposure.

Input chain: pandas DataFrame with columns
    expiration (datetime64 or date), strike (float), type ('call'|'put'),
    iv (decimal, e.g. 0.25), open_interest (int), and optionally gamma, delta,
    vanna, charm (if absent they are computed with Black-Scholes from iv).
Conventions follow the SqueezeMetrics/SpotGamma "naive" model:
    GEX_contract = sign * gamma * OI * 100 * S^2 * 0.01   (dollars per 1% move)
    sign = +1 for calls (dealers assumed long), -1 for puts (dealers assumed short).
Levels are price levels of the *underlying the chain belongs to*; use
map_level() to project onto a leveraged ETF.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, date, time, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from . import bs

ET = ZoneInfo("America/New_York")
MULT = 100.0


def _as_of_utc(as_of: Optional[datetime]) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    if as_of.tzinfo is None:
        return as_of.replace(tzinfo=timezone.utc)
    return as_of.astimezone(timezone.utc)


def years_to_expiry(expirations, as_of: Optional[datetime] = None, settle_time=time(16, 0)) -> np.ndarray:
    """Year fraction from as_of to each expiration's 16:00 ET close. Floor at 15 minutes."""
    now = _as_of_utc(as_of)
    exps = pd.to_datetime(pd.Series(expirations)).dt.date
    out = np.empty(len(exps), dtype=float)
    for i, d in enumerate(exps):
        settle = datetime.combine(d, settle_time, tzinfo=ET).astimezone(timezone.utc)
        secs = (settle - now).total_seconds()
        out[i] = max(secs, 15 * 60) / (365.0 * 24 * 3600)
    return out


def prepare_chain(chain: pd.DataFrame, spot: float, as_of: Optional[datetime] = None, r: float = 0.04, q: float = 0.0) -> pd.DataFrame:
    """Normalize columns, compute T, sign, and any missing greeks."""
    df = chain.copy()
    df["type"] = df["type"].str.lower().str.strip()
    df = df[df["type"].isin(["call", "put"])]
    df["strike"] = df["strike"].astype(float)
    df["open_interest"] = pd.to_numeric(df.get("open_interest"), errors="coerce").fillna(0).astype(float)
    df["iv"] = pd.to_numeric(df.get("iv"), errors="coerce")
    df["expiration"] = pd.to_datetime(df["expiration"]).dt.date
    df["T"] = years_to_expiry(df["expiration"], as_of)
    df["cp"] = np.where(df["type"] == "call", 1.0, -1.0)
    df["sign"] = df["cp"]  # dealer sign convention: +calls, -puts
    iv = df["iv"].fillna(df["iv"].median()).clip(lower=0.01, upper=5.0).to_numpy()
    df["iv_used"] = iv
    S, K, T, cp = spot, df["strike"].to_numpy(), df["T"].to_numpy(), df["cp"].to_numpy()
    if "gamma" not in df or df["gamma"].isna().all():
        df["gamma"] = bs.gamma(S, K, T, r, iv, q)
    else:
        g = pd.to_numeric(df["gamma"], errors="coerce")
        df["gamma"] = g.fillna(pd.Series(bs.gamma(S, K, T, r, iv, q), index=df.index))
    if "delta" not in df or df["delta"].isna().all():
        df["delta"] = bs.delta(S, K, T, r, iv, cp, q)
    df["vanna"] = bs.vanna(S, K, T, r, iv, q)
    df["charm"] = bs.charm(S, K, T, r, iv, cp, q)
    df["dte"] = [(e - _as_of_utc(as_of).astimezone(ET).date()).days for e in df["expiration"]]
    return df.reset_index(drop=True)


def contract_exposures(df: pd.DataFrame, spot: float) -> pd.DataFrame:
    """Add GEX/DEX/VEX/CEX dollar columns per contract."""
    out = df.copy()
    oi = out["open_interest"].to_numpy()
    s = out["sign"].to_numpy()
    out["gex"] = s * out["gamma"].to_numpy() * oi * MULT * spot**2 * 0.01
    out["dex"] = out["delta"].to_numpy() * oi * MULT * spot  # dealer-agnostic delta notional
    out["vex"] = s * out["vanna"].to_numpy() * oi * MULT * spot * 0.01  # per 1 vol point
    out["cex"] = s * out["charm"].to_numpy() * oi * MULT * spot / 365.0  # per day
    return out


def by_strike(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("strike")
    res = pd.DataFrame({
        "call_gex": g.apply(lambda x: x.loc[x["type"] == "call", "gex"].sum(), include_groups=False),
        "put_gex": g.apply(lambda x: x.loc[x["type"] == "put", "gex"].sum(), include_groups=False),
        "net_gex": g["gex"].sum(),
        "call_oi": g.apply(lambda x: x.loc[x["type"] == "call", "open_interest"].sum(), include_groups=False),
        "put_oi": g.apply(lambda x: x.loc[x["type"] == "put", "open_interest"].sum(), include_groups=False),
        "vex": g["vex"].sum(),
        "cex": g["cex"].sum(),
    }).sort_index()
    return res


def gamma_flip_cumulative(strike_table: pd.DataFrame, spot: float) -> Optional[float]:
    """Zero crossing of cumulative net GEX (low->high strikes), nearest to spot, interpolated."""
    t = strike_table.sort_index()
    if t.empty or t["net_gex"].abs().sum() == 0:
        return None
    strikes = t.index.to_numpy(dtype=float)
    cum = t["net_gex"].cumsum().to_numpy()
    crossings = []
    for i in range(1, len(cum)):
        if cum[i - 1] == 0:
            crossings.append(strikes[i - 1])
        elif np.sign(cum[i - 1]) != np.sign(cum[i]):
            # linear interpolation
            x0, x1, y0, y1 = strikes[i - 1], strikes[i], cum[i - 1], cum[i]
            crossings.append(x0 + (0 - y0) * (x1 - x0) / (y1 - y0))
    if not crossings:
        return None
    return float(min(crossings, key=lambda x: abs(x - spot)))


def gamma_profile(df: pd.DataFrame, spot: float, r: float = 0.04, q: float = 0.0, span: float = 0.12, step: float = 0.0025) -> pd.DataFrame:
    """Total net GEX as a function of hypothetical spot (Perfiliev/jensolson method).

    Gamma is recomputed for every contract at each spot level, keeping each
    contract's IV fixed. Returns DataFrame(spot_level, net_gex).
    """
    levels = spot * np.arange(1 - span, 1 + span + 1e-9, step)
    K = df["strike"].to_numpy()
    T = df["T"].to_numpy()
    iv = df["iv_used"].to_numpy()
    oi = df["open_interest"].to_numpy()
    s = df["sign"].to_numpy()
    out = np.empty(len(levels))
    for i, S in enumerate(levels):
        g = bs.gamma(S, K, T, r, iv, q)
        out[i] = np.sum(s * g * oi * MULT * S**2 * 0.01)
    return pd.DataFrame({"spot_level": levels, "net_gex": out})


def gamma_flip_profile(profile: pd.DataFrame, spot: float) -> Optional[float]:
    x = profile["spot_level"].to_numpy()
    y = profile["net_gex"].to_numpy()
    crossings = []
    for i in range(1, len(y)):
        if np.sign(y[i - 1]) != np.sign(y[i]) and y[i - 1] != y[i]:
            crossings.append(x[i - 1] + (0 - y[i - 1]) * (x[i] - x[i - 1]) / (y[i] - y[i - 1]))
    if not crossings:
        return None
    return float(min(crossings, key=lambda c: abs(c - spot)))


def walls(strike_table: pd.DataFrame, spot: float, n: int = 3) -> dict:
    """Call wall = strike with largest positive call GEX at/above spot.
    Put wall = strike with most negative put GEX at/below spot.
    Also returns the top-n of each and the absolute largest regardless of side."""
    t = strike_table
    above = t[t.index >= spot]
    below = t[t.index <= spot]
    res: dict = {}
    if not above.empty and above["call_gex"].max() > 0:
        res["call_wall"] = float(above["call_gex"].idxmax())
        res["call_walls"] = [float(k) for k in above["call_gex"].nlargest(n).index]
    if not below.empty and below["put_gex"].min() < 0:
        res["put_wall"] = float(below["put_gex"].idxmin())
        res["put_walls"] = [float(k) for k in below["put_gex"].nsmallest(n).index]
    if not t.empty:
        res["abs_call_wall"] = float(t["call_gex"].idxmax())
        res["abs_put_wall"] = float(t["put_gex"].idxmin())
        res["max_net_gex_strike"] = float(t["net_gex"].idxmax())
        res["min_net_gex_strike"] = float(t["net_gex"].idxmin())
    return res


def max_pain(df: pd.DataFrame) -> Optional[float]:
    """Strike minimizing total intrinsic value paid to option holders at expiry."""
    if df.empty:
        return None
    strikes = np.sort(df["strike"].unique())
    calls = df[df["type"] == "call"]
    puts = df[df["type"] == "put"]
    K_c, oi_c = calls["strike"].to_numpy(), calls["open_interest"].to_numpy()
    K_p, oi_p = puts["strike"].to_numpy(), puts["open_interest"].to_numpy()
    if (oi_c.sum() + oi_p.sum()) == 0:
        return None
    pain = np.empty(len(strikes))
    for i, S in enumerate(strikes):
        pain[i] = np.sum(np.maximum(S - K_c, 0) * oi_c) + np.sum(np.maximum(K_p - S, 0) * oi_p)
    return float(strikes[int(np.argmin(pain))])


def expected_move(df: pd.DataFrame, spot: float, expiration=None) -> dict:
    """ATM straddle mid for the nearest (or given) expiry, plus IV-based 1-sigma move."""
    d = df.copy()
    if expiration is None:
        expiration = d["expiration"].min()
    d = d[d["expiration"] == expiration]
    if d.empty:
        return {}
    atm_k = d.iloc[(d["strike"] - spot).abs().argsort()[:1]]["strike"].iloc[0]
    atm = d[d["strike"] == atm_k]
    res = {"expiration": expiration, "atm_strike": float(atm_k)}
    if "mark" in atm and atm["mark"].notna().any():
        straddle = float(atm["mark"].sum())
        res["straddle_mid"] = straddle
        res["straddle_move_pct"] = straddle / spot
    iv = float(atm["iv_used"].mean())
    T = float(atm["T"].mean())
    res["iv_move_pct"] = iv * np.sqrt(T)
    res["iv_move_1sd"] = spot * iv * np.sqrt(T)
    return res


@dataclass
class GexResult:
    symbol: str
    spot: float
    as_of: datetime
    dte_filter: str
    total_gex: float
    flip_cumulative: Optional[float]
    flip_profile: Optional[float]
    call_wall: Optional[float]
    put_wall: Optional[float]
    max_pain: Optional[float]
    walls: dict
    expected_move: dict
    strike_table: pd.DataFrame = field(repr=False)
    profile: pd.DataFrame = field(repr=False)
    contracts: pd.DataFrame = field(repr=False)

    @property
    def flip(self) -> Optional[float]:
        return self.flip_profile if self.flip_profile is not None else self.flip_cumulative

    @property
    def regime(self) -> str:
        f = self.flip
        if f is None:
            return "unknown"
        return "positive" if self.spot >= f else "negative"

    def summary(self) -> dict:
        return {
            "symbol": self.symbol, "spot": self.spot, "as_of": self.as_of.isoformat(),
            "dte_filter": self.dte_filter, "total_gex_$bn_per_1pct": self.total_gex / 1e9,
            "flip": self.flip, "flip_cumulative": self.flip_cumulative, "flip_profile": self.flip_profile,
            "regime": self.regime, "call_wall": self.call_wall, "put_wall": self.put_wall,
            "max_pain": self.max_pain, **{f"em_{k}": v for k, v in self.expected_move.items()},
        }


DTE_FILTERS = {"0dte": (0, 0), "weekly": (0, 7), "monthly": (0, 45), "all": (0, 100000)}


def analyze(chain: pd.DataFrame, symbol: str, spot: float, as_of: Optional[datetime] = None,
            dte_filter: str = "all", r: float = 0.04, q: float = 0.0, profile_flip: bool = True) -> GexResult:
    as_of = _as_of_utc(as_of)
    df = prepare_chain(chain, spot, as_of, r, q)
    lo, hi = DTE_FILTERS.get(dte_filter, DTE_FILTERS["all"])
    df = df[(df["dte"] >= lo) & (df["dte"] <= hi)]
    df = contract_exposures(df, spot)
    table = by_strike(df) if not df.empty else pd.DataFrame(columns=["call_gex", "put_gex", "net_gex", "call_oi", "put_oi", "vex", "cex"])
    flip_c = gamma_flip_cumulative(table, spot) if not table.empty else None
    prof = gamma_profile(df, spot, r, q) if (profile_flip and not df.empty) else pd.DataFrame(columns=["spot_level", "net_gex"])
    flip_p = gamma_flip_profile(prof, spot) if not prof.empty else None
    w = walls(table, spot) if not table.empty else {}
    return GexResult(
        symbol=symbol, spot=spot, as_of=as_of, dte_filter=dte_filter,
        total_gex=float(df["gex"].sum()) if not df.empty else 0.0,
        flip_cumulative=flip_c, flip_profile=flip_p,
        call_wall=w.get("call_wall"), put_wall=w.get("put_wall"),
        max_pain=max_pain(df) if not df.empty else None, walls=w,
        expected_move=expected_move(df, spot) if not df.empty else {},
        strike_table=table, profile=prof, contracts=df,
    )


def map_level(level: float, src_spot: float, dst_spot: float) -> float:
    """Project a price level from the parent (e.g. QQQ) onto a leveraged ETF (e.g. TQQQ).

    Levels convert by ratio (moneyness). Gamma dollars are never rescaled.
    Note: a 3x ETF moves ~3x the parent's percent move, so a QQQ level that is
    1% away maps to a TQQQ level ~3% away. Use map_level_leveraged for that.
    """
    return level * dst_spot / src_spot


def map_level_leveraged(level: float, src_spot: float, dst_spot: float, leverage: float = 3.0) -> float:
    """Project by percent distance times leverage: a QQQ level x% away becomes
    a TQQQ level leverage*x% away. This is the correct daily-move mapping for
    3x ETFs over short horizons (ignores path dependence/decay)."""
    pct = level / src_spot - 1.0
    return dst_spot * (1.0 + leverage * pct)
