"""Daily-bar backtester for the LETF single-option strategy.

What this does
--------------
* Signals: exactly the production rules (``signals.features`` + ``signals.score_row``)
  computed on the parent's daily bars (QQQ/SPY) with the parent's vol index (VXN/VIX).
* Trades: one long call / long put per signal on a trade symbol which may be the parent
  itself or a leveraged ETF (TQQQ/UPRO). Entry at the NEXT day's open, exits checked at
  each close (take profit, stop loss, time stop, signal flip, expiry).
* Option prices: SYNTHETIC. We have no historical chains, so every option is priced with
  Black-Scholes from the index vol (VXN/VIX, times |leverage| for the leveraged ETF,
  capped), a simple strike skew, and a bid/ask half spread.

Known limitations (read before trusting any number)
----------------------------------------------------
1. Option prices are Black-Scholes approximations from index vol. Real weekly option
   marks differ (term structure, real skew, event premia, wide spreads on TQQQ/UPRO).
2. ``SignalContext`` is neutral: no gamma regime, no gamma walls, no sentiment and no
   catalyst pressure are available historically, so those components of the score are
   zero. Only the trend / mean-reversion core and the vol filters are tested.
3. Sizing uses whole contracts; equity marks use liquidation value (mid minus half spread).
4. Results are therefore an upper bound on signal quality under a simplified market
   model, not a forecast of live performance.

Speed
-----
Scores are cached per signal-parameter set over the whole history (they are causal, so
slicing a window is equivalent to recomputing on that window with more warm-up). Option
value paths are precomputed as an ``[entry_day, holding_day]`` matrix per (symbol, delta,
call/put), exits are resolved with vectorised masks, and only the equity/sizing pass is a
Python loop over signal days. A one-year window simulates in about a millisecond, which
is what makes the 324-combination walk-forward grid tractable.
"""
from __future__ import annotations

import dataclasses
import itertools
import os
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np
import pandas as pd
from scipy.special import ndtri

from . import bs, signals
from .data import prices

LEVERAGE = {"TQQQ": 3.0, "UPRO": 3.0, "SPXL": 3.0, "SQQQ": -3.0, "SPXU": -3.0, "QLD": 2.0, "SSO": 2.0}
VOL_INDEX = {"QQQ": "VXN", "SPY": "VIX"}
DEFAULT_PARENTS = {"TQQQ": "QQQ", "UPRO": "SPY", "SQQQ": "QQQ", "SPXU": "SPY", "SPXL": "SPY", "QLD": "QQQ", "SSO": "SPY",
                   "QQQ": "QQQ", "SPY": "SPY"}
EXIT_REASONS = ["expiry", "take_profit", "stop_loss", "signal_flip", "time_stop", "end"]
DAY = np.timedelta64(1, "D")


def default_cache_dir() -> str:
    """<repo>/data/cache (repo = parent of engine/)."""
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    cand = os.path.join(repo, "data", "cache")
    return cand if os.path.isdir(cand) else "data/cache"


# --------------------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------------------
@dataclass
class BacktestParams:
    signal: signals.SignalParams = field(default_factory=signals.SignalParams)
    target_delta: float = 0.35
    min_dte: int = 3
    max_dte: int = 10
    take_profit_x: float = 2.0
    stop_loss_pct: float = 0.5
    time_stop_dte: int = 1
    max_premium_pct: float = 0.01
    max_open_positions: int = 3
    commission: float = 0.65          # $ per contract per side
    half_spread: float = 0.03         # entry at mid*(1+hs), exit/mark at mid*(1-hs)
    r: float = 0.04
    skew_put: float = -0.6
    skew_call: float = -0.2
    skew_floor: float = 0.5           # iv_strike >= floor * iv_atm
    skew_cap: float = 2.0             # iv_strike <= cap * iv_atm (deep ITM at tiny T)
    iv_cap: float = 2.5               # cap on leveraged-ETF IV
    initial_equity: float = 100_000.0
    min_one_contract: bool = True     # at least 1 contract when cash covers it

    def replace(self, **kw) -> "BacktestParams":
        sig_kw = {k: v for k, v in kw.items() if k in signals.SignalParams.__dataclass_fields__}
        own_kw = {k: v for k, v in kw.items() if k not in sig_kw}
        sig = dataclasses.replace(self.signal, **sig_kw) if sig_kw else self.signal
        return dataclasses.replace(self, signal=sig, **own_kw)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def strike_increment(symbol: str, spot: float) -> float:
    if symbol.upper() in ("QQQ", "SPY"):
        return 1.0
    return 1.0 if spot > 50 else 0.5


# --------------------------------------------------------------------------------------
# Data container
# --------------------------------------------------------------------------------------
@dataclass
class Dataset:
    """Bars aligned on one common DatetimeIndex.

    parents: parent symbol -> OHLC DataFrame (full history, used for features)
    vols:    parent symbol -> vol index DataFrame with 'close' (in vol points, e.g. 25.0)
    symbols: trade symbol -> OHLC DataFrame reindexed to ``index``
    parent_of: trade symbol -> parent symbol
    """
    index: pd.DatetimeIndex
    parents: dict
    vols: dict
    symbols: dict
    parent_of: dict

    @staticmethod
    def build(parents: dict, vols: dict, symbols: dict, parent_of: dict, start=None, end=None) -> "Dataset":
        idx = None
        for s, df in symbols.items():
            p = parent_of[s]
            common = parents[p].index.intersection(df.index)
            idx = common if idx is None else idx.intersection(common)
        idx = idx.sort_values()
        if start is not None:
            idx = idx[idx >= pd.Timestamp(start)]
        if end is not None:
            idx = idx[idx <= pd.Timestamp(end)]
        syms = {s: df.reindex(idx) for s, df in symbols.items()}
        return Dataset(idx, parents, vols, syms, parent_of)

    def leverage(self, symbol: str) -> float:
        if symbol == self.parent_of[symbol]:
            return 1.0
        return LEVERAGE.get(symbol.upper(), 1.0)

    def iv_series(self, symbol: str, iv_cap: float) -> np.ndarray:
        """ATM IV per day (decimal) for pricing options on ``symbol``: index vol/100 times |leverage|, capped."""
        p = self.parent_of[symbol]
        v = self.vols[p]["close"].reindex(self.index).ffill().to_numpy(dtype=float) / 100.0
        lev = abs(self.leverage(symbol))
        return np.minimum(v * lev, iv_cap)


def load_dataset(symbols: list[str], parents: list[str] | None, cache_dir: str, start=None, end=None) -> Dataset:
    parents = parents or [DEFAULT_PARENTS.get(s.upper(), s.upper()) for s in symbols]
    if len(parents) != len(symbols):
        raise ValueError("--parents must have one entry per --symbols entry")
    parent_of = {s.upper(): p.upper() for s, p in zip(symbols, parents)}

    def load(sym):
        df = prices.load_cached(cache_dir, sym)
        if df is None:
            raise FileNotFoundError(f"missing {prices.cache_path(cache_dir, sym)}")
        df = df.rename(columns=str.lower)
        df.index = pd.to_datetime(df.index).tz_localize(None)
        if "close" not in df.columns:
            raise ValueError(f"{sym}: no close column")
        out = pd.DataFrame(index=df.index)
        for c in ("open", "high", "low", "close"):   # vol-index files may lack OHLC; fall back to close
            out[c] = pd.to_numeric(df[c], errors="coerce") if c in df.columns else df["close"]
            out[c] = out[c].where(out[c] > 0, pd.to_numeric(df["close"], errors="coerce"))
        return out.dropna(subset=["close"]).astype(float)

    pxs, vols, syms = {}, {}, {}
    for s, p in parent_of.items():
        if p not in pxs:
            pxs[p] = load(p)
            vols[p] = load(VOL_INDEX[p])
        syms[s] = pxs[p] if s == p else load(s)
    return Dataset.build(pxs, vols, syms, parent_of, start, end)


# --------------------------------------------------------------------------------------
# Signals (cached per parameter set)
# --------------------------------------------------------------------------------------
class SignalCache:
    """direction (+1 call / -1 put / 0) and score per day, computed with the production rules."""

    def __init__(self, ds: Dataset, ctx: signals.SignalContext | None = None):
        self.ds = ds
        self.ctx = ctx or signals.SignalContext()   # neutral: no gamma / sentiment / catalysts available historically
        self._cache: dict = {}

    def get(self, parent: str, p: signals.SignalParams) -> tuple[np.ndarray, np.ndarray]:
        key = (parent, dataclasses.astuple(p))
        if key not in self._cache:
            px, vol = self.ds.parents[parent], self.ds.vols[parent]
            f = signals.features(px, vol, p)
            d = np.zeros(len(f), dtype=np.int8)
            sc = np.zeros(len(f), dtype=float)
            for i, (_, row) in enumerate(f.iterrows()):
                s = signals.score_row(row, self.ctx, p)
                d[i] = 1 if s.direction == "LONG_CALL" else -1 if s.direction == "LONG_PUT" else 0
                sc[i] = s.score
            dser = pd.Series(d, index=f.index).reindex(self.ds.index).fillna(0).astype(np.int8)
            sser = pd.Series(sc, index=f.index).reindex(self.ds.index).fillna(0.0)
            self._cache[key] = (dser.to_numpy(), sser.to_numpy())
        return self._cache[key]


# --------------------------------------------------------------------------------------
# Synthetic option pricing: templates per (symbol, delta, call/put)
# --------------------------------------------------------------------------------------
def skewed_iv(iv_atm, K, S, T, skew, floor, cap):
    m = 1.0 + skew * np.log(np.asarray(K, float) / np.asarray(S, float)) / np.sqrt(np.maximum(np.asarray(T, float), 1e-6))
    return np.asarray(iv_atm, float) * np.clip(m, floor, cap)


def strike_for_delta(S, iv, T, r, target_delta, cp):
    """Strike with |delta| = target under flat vol ``iv`` (closed form), before rounding."""
    d1 = ndtri(target_delta) * (1.0 if cp > 0 else -1.0)
    return S * np.exp(-d1 * iv * np.sqrt(T) + (r + 0.5 * iv**2) * T)


def choose_expiries(dates: pd.DatetimeIndex, min_dte: int, max_dte: int) -> np.ndarray:
    """Nearest Friday with min_dte <= DTE <= max_dte calendar days from each date (NaT if none)."""
    d = dates.values.astype("datetime64[D]")
    wd = dates.weekday.to_numpy()                  # Mon=0 .. Fri=4
    days_to_fri = (4 - wd) % 7
    out = np.full(len(d), np.datetime64("NaT", "D"), dtype="datetime64[D]")
    for shift in (0, 7, 14):
        dte = days_to_fri + shift
        ok = np.isnat(out) & (dte >= min_dte) & (dte <= max_dte)
        out[ok] = d[ok] + dte[ok] * DAY
    return out


@dataclass
class Templates:
    """For each possible entry day e (entry at that day's open): the contract and its value path.

    V[e, k]   liquidation value (mid*(1-hs), or intrinsic on expiry day) at the close of day e+k
    dte[e, k] calendar days to expiry at day e+k
    k_exp[e]  last k the position can exist (expiry day, or last data day)
    """
    symbol: str
    cp: int
    valid: np.ndarray
    strike: np.ndarray
    expiry: np.ndarray
    dte0: np.ndarray
    entry_px: np.ndarray
    iv_entry: np.ndarray
    V: np.ndarray
    dte: np.ndarray
    k_exp: np.ndarray
    at_expiry: np.ndarray   # bool [n, H]: day e+k is the expiry date

    @property
    def H(self):
        return self.V.shape[1]


def build_templates(ds: Dataset, symbol: str, cp: int, p: BacktestParams) -> Templates:
    df = ds.symbols[symbol]
    dates = ds.index
    n = len(dates)
    H = p.max_dte + 1
    opn = df["open"].to_numpy(float)
    cls = df["close"].to_numpy(float)
    iv_atm = ds.iv_series(symbol, p.iv_cap)
    skew = p.skew_call if cp > 0 else p.skew_put

    expiry = choose_expiries(dates, p.min_dte, p.max_dte)
    d_days = dates.values.astype("datetime64[D]")
    dte0 = (expiry - d_days) / DAY
    dte0 = np.where(np.isnat(expiry), np.nan, dte0.astype(float))
    T0 = dte0 / 365.0

    # Entry pricing: spot = this day's open, IV = previous day's vol index close (known at the signal close)
    iv_prev = np.concatenate([[np.nan], iv_atm[:-1]])
    valid = (~np.isnan(dte0)) & np.isfinite(opn) & np.isfinite(iv_prev) & (opn > 0) & (np.arange(n) >= 1)
    S0 = np.where(valid, opn, 1.0)
    ivp = np.where(valid, iv_prev, 0.2)
    T0s = np.where(valid, T0, 0.02)
    K_raw = strike_for_delta(S0, ivp, T0s, p.r, p.target_delta, cp)
    inc = np.array([strike_increment(symbol, s) for s in S0])
    K = np.round(K_raw / inc) * inc
    K = np.where(K <= 0, inc, K)
    iv0 = skewed_iv(ivp, K, S0, T0s, skew, p.skew_floor, p.skew_cap)
    mid0 = bs.price(S0, K, T0s, p.r, iv0, cp)
    entry_px = mid0 * (1.0 + p.half_spread)
    valid &= entry_px > 0.005
    entry_px = np.where(valid, entry_px, np.nan)

    # Value path at each later close
    E = np.arange(n)[:, None]
    Kk = np.arange(H)[None, :]
    J = E + Kk
    inb = J < n
    Jc = np.minimum(J, n - 1)
    dJ = d_days[Jc]
    dte = ((expiry[:, None] - dJ) / DAY).astype(float)
    dte = np.where(np.isnat(expiry)[:, None], np.nan, dte)
    alive = inb & (dte >= 0)
    S = cls[Jc]
    ivk = iv_atm[Jc]
    T = np.maximum(dte, 0) / 365.0
    with np.errstate(invalid="ignore", divide="ignore"):
        ivs = skewed_iv(np.where(np.isfinite(ivk), ivk, 0.2), K[:, None], np.where(S > 0, S, 1.0), np.maximum(T, 1 / 365), skew, p.skew_floor, p.skew_cap)
        mid = bs.price(np.where(S > 0, S, 1.0), K[:, None], np.maximum(T, 1e-8), p.r, ivs, cp)
    intrinsic = np.maximum(cp * (S - K[:, None]), 0.0)
    at_exp = alive & (dte == 0)
    V = np.where(at_exp, intrinsic, mid * (1.0 - p.half_spread))
    V = np.where(alive & np.isfinite(S) & np.isfinite(ivk), V, np.nan)
    # last k alive (expiry day, or last data day when the data ends first)
    k_exp = np.where(alive.any(1), alive.shape[1] - 1 - np.argmax(alive[:, ::-1], axis=1), 0)
    valid &= alive[:, 0] & np.isfinite(V[:, 0])
    return Templates(symbol, cp, valid, K, expiry, dte0, entry_px, iv0, V, dte, k_exp, at_exp)


@dataclass
class Exits:
    k_exit: np.ndarray     # holding days (0 = exit at the entry day's close)
    exit_px: np.ndarray
    reason: np.ndarray     # index into EXIT_REASONS


def resolve_exits(tpl: Templates, dirs: np.ndarray, take_profit_x: float, stop_loss_pct: float, time_stop_dte: int) -> Exits:
    """Vectorised exit rule: first close where TP / SL / time stop / signal flip / expiry hits."""
    n, H = tpl.V.shape
    J = np.minimum(np.arange(n)[:, None] + np.arange(H)[None, :], n - 1)
    inrange = np.arange(H)[None, :] <= tpl.k_exp[:, None]
    ent = tpl.entry_px[:, None]
    with np.errstate(invalid="ignore"):
        tp = tpl.V >= take_profit_x * ent
        sl = tpl.V <= (1.0 - stop_loss_pct) * ent
        ts = tpl.dte <= time_stop_dte
    fl = dirs[J] == -tpl.cp
    ex = np.arange(H)[None, :] == tpl.k_exp[:, None]
    any_ = (tp | sl | ts | fl | ex) & inrange
    k_exit = np.argmax(any_, axis=1)
    k_exit = np.where(any_.any(1), k_exit, tpl.k_exp)
    rows = np.arange(n)
    at = (rows, k_exit)
    reason = np.select(
        [tpl.at_expiry[at], tp[at], sl[at], fl[at], ts[at], ex[at]],
        [0, 1, 2, 3, 4, 5], default=5)
    exit_px = tpl.V[at]
    return Exits(k_exit.astype(np.int16), exit_px, reason.astype(np.int8))


# --------------------------------------------------------------------------------------
# Strategy simulation
# --------------------------------------------------------------------------------------
@dataclass
class SimResult:
    equity: pd.Series
    trades: pd.DataFrame
    exposure: float
    start_equity: float


TRADE_COLUMNS = ["signal_date", "entry_date", "exit_date", "symbol", "type", "strike", "expiry", "qty", "entry_price",
                 "exit_price", "pnl", "pnl_pct_equity", "reason", "signal_score", "hold_days", "dte_entry", "iv_entry", "equity_at_entry"]


class Engine:
    """Holds the per-symbol templates / signals / exits caches and runs simulations on index windows."""

    def __init__(self, ds: Dataset, base: BacktestParams | None = None, ctx: signals.SignalContext | None = None):
        self.ds = ds
        self.base = base or BacktestParams()
        self.signals = SignalCache(ds, ctx)
        self._tpl: dict = {}
        self._exits: dict = {}

    # ---- caches ----
    def templates(self, symbol: str, cp: int, p: BacktestParams) -> Templates:
        key = (symbol, cp, p.target_delta, p.min_dte, p.max_dte, p.half_spread, p.r, p.skew_put, p.skew_call, p.skew_floor, p.skew_cap, p.iv_cap)
        if key not in self._tpl:
            self._tpl[key] = build_templates(self.ds, symbol, cp, p)
        return self._tpl[key]

    def exits(self, symbol: str, cp: int, p: BacktestParams) -> Exits:
        sig_key = dataclasses.astuple(p.signal)
        key = (symbol, cp, sig_key, p.target_delta, p.min_dte, p.max_dte, p.half_spread, p.take_profit_x, p.stop_loss_pct, p.time_stop_dte, p.iv_cap)
        if key not in self._exits:
            dirs, _ = self.signals.get(self.ds.parent_of[symbol], p.signal)
            if self.ds.leverage(symbol) < 0:      # inverse ETF: a parent LONG_CALL signal means puts here
                dirs = -dirs
            self._exits[key] = resolve_exits(self.templates(symbol, cp, p), dirs, p.take_profit_x, p.stop_loss_pct, p.time_stop_dte)
        return self._exits[key]

    # ---- simulation ----
    def simulate(self, symbols: list[str], p: BacktestParams, a: int = 0, b: int | None = None, start_equity: float | None = None) -> SimResult:
        """Run the strategy on index window [a, b) with fresh cash ``start_equity``.

        Positions still open at b-1 are closed at that day's close (reason 'end').
        """
        ds = self.ds
        n = len(ds.index)
        b = n if b is None else min(b, n)
        eq0 = p.initial_equity if start_equity is None else start_equity
        cash_delta = np.zeros(n)
        marks = np.zeros(n)
        held = np.zeros(n, dtype=bool)
        cash_cum = None  # lazily recomputed
        last_exit = {s: -1 for s in symbols}
        trades = []

        per_sym = {}
        any_sig = np.zeros(n, dtype=bool)
        for s in symbols:
            dirs, scores = self.signals.get(ds.parent_of[s], p.signal)
            flip = ds.leverage(s) < 0
            d_eff = -dirs if flip else dirs
            per_sym[s] = (d_eff, scores,
                          {1: (self.templates(s, 1, p), self.exits(s, 1, p)), -1: (self.templates(s, -1, p), self.exits(s, -1, p))})
            any_sig[a:b] |= d_eff[a:b] != 0
        cand_days = np.nonzero(any_sig)[0]
        cand_days = cand_days[(cand_days >= a) & (cand_days < b - 1)]

        comm = p.commission
        pending = {}  # entry day -> cash already committed by same-day entries (not yet in cash_delta prefix)
        for s_day in cand_days:
            open_cnt = sum(1 for x in last_exit.values() if x > s_day)
            cash_now = eq0 + cash_delta[: s_day + 1].sum()
            equity_now = cash_now + marks[s_day]
            for sym in symbols:
                d_eff, scores, tpls = per_sym[sym]
                d = int(d_eff[s_day])
                if d == 0 or last_exit[sym] > s_day or open_cnt >= p.max_open_positions:
                    continue
                e = s_day + 1
                tpl, ex = tpls[d]
                if not tpl.valid[e]:
                    continue
                entry = float(tpl.entry_px[e])
                k = int(ex.k_exit[e])
                x = e + k
                exit_px, reason = float(ex.exit_px[e]), int(ex.reason[e])
                if x > b - 1:                       # window ends first: close at the last day's close
                    x = b - 1
                    k = x - e
                    exit_px, reason = float(tpl.V[e, k]), 5
                if not np.isfinite(exit_px):
                    continue
                cost_per = entry * 100.0 + comm
                avail = cash_now - pending.get(e, 0.0)
                qty = int(np.floor(equity_now * p.max_premium_pct / (entry * 100.0)))
                if qty == 0 and p.min_one_contract and avail >= cost_per:
                    qty = 1
                qty = min(qty, int(np.floor(avail / cost_per)))
                if qty <= 0:
                    continue
                cash_delta[e] -= qty * cost_per
                cash_delta[x] += qty * (exit_px * 100.0 - comm)
                pending[e] = pending.get(e, 0.0) + qty * cost_per
                marks[e:x] += qty * 100.0 * tpl.V[e, : x - e]
                held[e: x + 1] = True
                last_exit[sym] = x
                open_cnt += 1
                pnl = qty * ((exit_px - entry) * 100.0 - 2 * comm)
                trades.append((ds.index[s_day], ds.index[e], ds.index[x], sym, "call" if d > 0 else "put", float(tpl.strike[e]),
                               pd.Timestamp(tpl.expiry[e]), qty, entry, exit_px, pnl, pnl / equity_now, EXIT_REASONS[reason],
                               float(scores[s_day]), k, float(tpl.dte0[e]), float(tpl.iv_entry[e]), equity_now))
        equity = eq0 + np.cumsum(cash_delta) + marks
        eq = pd.Series(equity[a:b], index=ds.index[a:b], name="equity")
        tr = pd.DataFrame(trades, columns=TRADE_COLUMNS)
        exposure = float(held[a:b].mean()) if b > a else 0.0
        return SimResult(eq, tr, exposure, eq0)

    def window(self, start=None, end=None) -> tuple[int, int]:
        idx = self.ds.index
        a = 0 if start is None else int(idx.searchsorted(pd.Timestamp(start), side="left"))
        b = len(idx) if end is None else int(idx.searchsorted(pd.Timestamp(end), side="left"))
        return a, b


# --------------------------------------------------------------------------------------
# Metrics
# --------------------------------------------------------------------------------------
def max_drawdown(equity: pd.Series) -> tuple[float, Optional[pd.Timestamp], Optional[pd.Timestamp]]:
    if len(equity) == 0:
        return 0.0, None, None
    peak = equity.cummax()
    dd = equity / peak - 1.0
    trough = dd.idxmin()
    mdd = float(dd.min())
    peak_date = equity.loc[:trough].idxmax()
    return mdd, peak_date, trough


def _f(x):
    x = float(x)
    return x if np.isfinite(x) else 0.0


def compute_metrics(res: SimResult) -> dict:
    eq = res.equity
    tr = res.trades
    out = {}
    if len(eq) < 2:
        return {"n_trades": int(len(tr))}
    r = eq.pct_change().dropna()
    years = max((eq.index[-1] - eq.index[0]).days / 365.25, 1e-9)
    total = eq.iloc[-1] / res.start_equity - 1.0
    cagr = (eq.iloc[-1] / res.start_equity) ** (1 / years) - 1.0 if eq.iloc[-1] > 0 else -1.0
    vol = r.std() * np.sqrt(252)
    sharpe = r.mean() / r.std() * np.sqrt(252) if r.std() > 0 else 0.0
    dstd = float(np.sqrt((np.minimum(r, 0.0) ** 2).mean()))   # downside deviation over all days (rf = 0)
    sortino = r.mean() / dstd * np.sqrt(252) if dstd > 0 else 0.0
    mdd, pk, tr_d = max_drawdown(eq)
    out.update(start=str(eq.index[0].date()), end=str(eq.index[-1].date()), years=round(years, 3),
               start_equity=res.start_equity, final_equity=_f(eq.iloc[-1]), total_return=_f(total), cagr=_f(cagr),
               ann_vol=_f(vol), sharpe=_f(sharpe), sortino=_f(sortino), max_drawdown=_f(mdd),
               max_dd_peak=str(pk.date()) if pk is not None else None, max_dd_trough=str(tr_d.date()) if tr_d is not None else None,
               calmar=_f(cagr / abs(mdd)) if mdd < 0 else 0.0, exposure=_f(res.exposure))
    n = len(tr)
    out["n_trades"] = int(n)
    if n:
        pnl = tr["pnl"].to_numpy()
        wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
        out.update(win_rate=_f(len(wins) / n), profit_factor=_f(wins.sum() / -losses.sum()) if losses.sum() < 0 else (float("inf") if wins.sum() > 0 else 0.0),
                   avg_win=_f(wins.mean()) if len(wins) else 0.0, avg_loss=_f(losses.mean()) if len(losses) else 0.0,
                   expectancy=_f(pnl.mean()), expectancy_pct_equity=_f(tr["pnl_pct_equity"].mean()),
                   avg_hold_days=_f(tr["hold_days"].mean()), trades_per_year=_f(n / years),
                   exit_reasons={k: int(v) for k, v in tr["reason"].value_counts().items()},
                   by_symbol={s: {"n": int(len(g)), "win_rate": _f((g["pnl"] > 0).mean()), "pnl": _f(g["pnl"].sum())} for s, g in tr.groupby("symbol")})
    else:
        out.update(win_rate=0.0, profit_factor=0.0, avg_win=0.0, avg_loss=0.0, expectancy=0.0, expectancy_pct_equity=0.0,
                   avg_hold_days=0.0, trades_per_year=0.0, exit_reasons={}, by_symbol={})
    out["yearly_returns"] = yearly_returns(eq, res.start_equity)
    out["monthly_returns"] = monthly_table(eq, res.start_equity)
    return out


def yearly_returns(eq: pd.Series, start_equity: float) -> dict:
    ye = eq.resample("YE").last()
    prev = pd.concat([pd.Series([start_equity]), ye.iloc[:-1]]).to_numpy()
    return {str(d.year): _f(v / p - 1.0) for d, v, p in zip(ye.index, ye.to_numpy(), prev)}


def monthly_table(eq: pd.Series, start_equity: float) -> dict:
    me = eq.resample("ME").last()
    prev = np.concatenate([[start_equity], me.to_numpy()[:-1]])
    ret = pd.Series(me.to_numpy() / prev - 1.0, index=me.index)
    tab: dict = {}
    for d, v in ret.items():
        tab.setdefault(str(d.year), {})[d.month] = _f(v)
    return tab


# --------------------------------------------------------------------------------------
# Walk-forward analysis
# --------------------------------------------------------------------------------------
DEFAULT_GRID = {
    "pullback_pct": [1.0, 1.5, 2.0, 3.0],
    "rsi_buy": [35.0, 40.0, 45.0],
    "rsi_sell": [55.0, 60.0, 65.0],
    "target_delta": [0.25, 0.35, 0.45],
    "take_profit_x": [1.5, 2.0, 3.0],
}


def grid_combos(grid: dict) -> list[dict]:
    keys = list(grid)
    return [dict(zip(keys, vals)) for vals in itertools.product(*(grid[k] for k in keys))]


@dataclass
class WFAResult:
    windows: pd.DataFrame
    oos_equity: pd.Series
    oos_trades: pd.DataFrame
    oos_metrics: dict
    frac_profitable: float
    n_combos: int


def wfa_windows(index: pd.DatetimeIndex, start, is_months=12, oos_months=3, step_months=3) -> list[tuple]:
    out = []
    s = pd.Timestamp(start)
    last = index[-1]
    while True:
        is_end = s + pd.DateOffset(months=is_months)
        oos_end = is_end + pd.DateOffset(months=oos_months)
        if is_end > last:
            break
        out.append((s, is_end, min(oos_end, last + pd.Timedelta(days=1))))
        s = s + pd.DateOffset(months=step_months)
    return out


def walk_forward(eng: Engine, symbols: list[str], base: BacktestParams, start="2020-01-01", grid: dict | None = None,
                 is_months=12, oos_months=3, step_months=3, min_trades=8, verbose=False) -> WFAResult:
    grid = grid or DEFAULT_GRID
    combos = grid_combos(grid)
    wins = wfa_windows(eng.ds.index, start, is_months, oos_months, step_months)
    rows, eq_parts, tr_parts = [], [], []
    equity = base.initial_equity
    for wi, (is_s, is_e, oos_e) in enumerate(wins):
        a, b = eng.window(is_s, is_e)
        best, best_sharpe, best_n, n_qual = None, -np.inf, 0, 0
        alt, alt_sharpe, alt_n = None, -np.inf, 0      # best among combos with too few trades
        for combo in combos:
            p = base.replace(**combo)
            r = eng.simulate(symbols, p, a, b)
            n = len(r.trades)
            ret = r.equity.pct_change().dropna()
            sh = float(ret.mean() / ret.std() * np.sqrt(252)) if len(ret) > 1 and ret.std() > 0 else -np.inf
            if n >= min_trades:
                n_qual += 1
                if sh > best_sharpe:
                    best, best_sharpe, best_n = combo, sh, n
            elif n > 0 and sh > alt_sharpe:
                alt, alt_sharpe, alt_n = combo, sh, n
        fallback = best is None
        if fallback and alt is not None:   # nothing reached min_trades: best of the thin ones
            best, best_sharpe, best_n = alt, alt_sharpe, alt_n
        elif fallback:                      # no trades at all in-sample: keep the base parameters
            best, best_n = {k: getattr(base, k) if hasattr(base, k) else getattr(base.signal, k) for k in grid}, 0
            best_sharpe = float("nan")
        p = base.replace(**best)
        oa, ob = eng.window(is_e, oos_e)
        ro = eng.simulate(symbols, p, oa, ob, start_equity=equity)
        oos_ret = ro.equity.iloc[-1] / equity - 1.0 if len(ro.equity) else 0.0
        oos_r = ro.equity.pct_change().dropna()
        oos_sh = float(oos_r.mean() / oos_r.std() * np.sqrt(252)) if len(oos_r) > 1 and oos_r.std() > 0 else 0.0
        rows.append({"window": wi, "is_start": is_s.date(), "is_end": is_e.date(), "oos_end": ro.equity.index[-1].date() if len(ro.equity) else oos_e.date(),
                     **{f"best_{k}": v for k, v in best.items()}, "is_sharpe": best_sharpe, "is_trades": best_n, "is_qualifying_combos": n_qual,
                     "fallback": fallback, "oos_trades": len(ro.trades), "oos_return": oos_ret, "oos_sharpe": oos_sh,
                     "oos_max_dd": max_drawdown(ro.equity)[0] if len(ro.equity) else 0.0, "equity_end": float(ro.equity.iloc[-1]) if len(ro.equity) else equity})
        if verbose:
            print(f"[wfa] {wi:2d} IS {is_s.date()}..{is_e.date()} best={best} sharpe={best_sharpe:.2f} n={best_n} | OOS ret={oos_ret:+.2%} trades={len(ro.trades)}")
        if len(ro.equity):
            eq_parts.append(ro.equity)
            tr_parts.append(ro.trades)
            equity = float(ro.equity.iloc[-1])
    windows = pd.DataFrame(rows)
    if eq_parts:
        oos_eq = pd.concat(eq_parts)
        oos_eq = oos_eq[~oos_eq.index.duplicated(keep="last")]
        oos_tr = pd.concat(tr_parts, ignore_index=True) if tr_parts else pd.DataFrame(columns=TRADE_COLUMNS)
        sim = SimResult(oos_eq, oos_tr, float(np.mean([w["oos_trades"] > 0 for w in rows])) if rows else 0.0, base.initial_equity)
        metrics = compute_metrics(sim)
        metrics["exposure"] = None  # not tracked across stitched windows
    else:
        oos_eq, oos_tr, metrics = pd.Series(dtype=float), pd.DataFrame(columns=TRADE_COLUMNS), {"n_trades": 0}
    frac = float((windows["oos_return"] > 0).mean()) if len(windows) else 0.0
    return WFAResult(windows, oos_eq, oos_tr, metrics, frac, len(combos))


# --------------------------------------------------------------------------------------
# Monte Carlo
# --------------------------------------------------------------------------------------
PCTS = [5, 25, 50, 75, 95]


def mc_trade_bootstrap(trades: pd.DataFrame, n_sims=5000, seed=0) -> dict:
    """Resample the per-trade return-on-equity sequence (same number of trades), compounding sequentially."""
    if trades is None or len(trades) == 0:
        return {"n_trades": 0, "n_sims": 0}
    rng = np.random.default_rng(seed)
    r = trades["pnl_pct_equity"].to_numpy(float)
    n = len(r)
    sample = r[rng.integers(0, n, size=(n_sims, n))]
    paths = np.cumprod(1.0 + sample, axis=1)
    final = paths[:, -1]
    peaks = np.maximum.accumulate(np.concatenate([np.ones((n_sims, 1)), paths], axis=1), axis=1)[:, 1:]
    mdd = (paths / peaks - 1.0).min(axis=1)
    return {"n_trades": int(n), "n_sims": int(n_sims),
            "final_equity_multiple_pct": {str(q): _f(np.percentile(final, q)) for q in PCTS},
            "max_drawdown_pct": {str(q): _f(np.percentile(mdd, q)) for q in PCTS},
            "p_drawdown_gt_30": _f((mdd < -0.30).mean()), "p_drawdown_gt_50": _f((mdd < -0.50).mean()),
            "p_loss": _f((final < 1.0).mean()), "observed_final_multiple": _f(np.prod(1.0 + r))}


def block_bootstrap_dataset(ds: Dataset, rng: np.random.Generator, block: int = 10) -> Dataset:
    """Resample days in blocks (keeping each day's cross-asset bars together), rebuilding price paths from returns."""
    n = len(ds.index)
    starts = rng.integers(1, max(2, n - block), size=n // block + 2)
    seq = np.concatenate([np.arange(s, min(s + block, n)) for s in starts])[: n - 1]
    seq = np.concatenate([[0], seq])

    def rebuild(df: pd.DataFrame) -> pd.DataFrame:
        df = df.reindex(ds.index).ffill()
        c = df["close"].to_numpy(float)
        ratios = {k: (df[k].to_numpy(float)[1:] / c[:-1]) for k in ("open", "high", "low", "close")}
        new = {k: np.empty(n) for k in ratios}
        for k in ratios:
            new[k][0] = df[k].iloc[0]
        prev = c[0]
        for t in range(1, n):
            s = seq[t]
            for k in ratios:
                new[k][t] = prev * ratios[k][s - 1]
            prev = new["close"][t]
        return pd.DataFrame(new, index=ds.index)

    parents = {p: rebuild(df) for p, df in ds.parents.items()}
    vols = {p: pd.DataFrame({"close": df["close"].reindex(ds.index).ffill().to_numpy(float)[seq]}, index=ds.index) for p, df in ds.vols.items()}
    symbols = {s: (parents[ds.parent_of[s]] if s == ds.parent_of[s] else rebuild(df)) for s, df in ds.symbols.items()}
    return Dataset(ds.index, parents, vols, symbols, dict(ds.parent_of))


def mc_path_bootstrap(ds: Dataset, symbols: list[str], p: BacktestParams, n_paths=1000, block=10, seed=0, verbose=False) -> dict:
    """Re-run the fixed-parameter strategy on block-bootstrapped price paths (slow: recomputes signals per path)."""
    rng = np.random.default_rng(seed)
    finals, mdds, sharpes, ntr = [], [], [], []
    for i in range(n_paths):
        sds = block_bootstrap_dataset(ds, rng, block)
        eng = Engine(sds, p)
        r = eng.simulate(symbols, p)
        m = compute_metrics(r)
        finals.append(m.get("final_equity", p.initial_equity) / p.initial_equity)
        mdds.append(m.get("max_drawdown", 0.0))
        sharpes.append(m.get("sharpe", 0.0))
        ntr.append(m.get("n_trades", 0))
        if verbose and (i + 1) % 50 == 0:
            print(f"[mc-paths] {i + 1}/{n_paths}")
    finals, mdds, sharpes = np.array(finals), np.array(mdds), np.array(sharpes)
    return {"n_paths": int(n_paths), "block": int(block),
            "final_equity_multiple_pct": {str(q): _f(np.percentile(finals, q)) for q in PCTS},
            "max_drawdown_pct": {str(q): _f(np.percentile(mdds, q)) for q in PCTS},
            "sharpe_pct": {str(q): _f(np.percentile(sharpes, q)) for q in PCTS},
            "p_drawdown_gt_30": _f((mdds < -0.30).mean()), "p_drawdown_gt_50": _f((mdds < -0.50).mean()),
            "p_loss": _f((finals < 1.0).mean()), "avg_trades": _f(np.mean(ntr))}


# --------------------------------------------------------------------------------------
# Convenience
# --------------------------------------------------------------------------------------
def run_backtest(ds: Dataset, symbols: list[str], p: BacktestParams | None = None, start=None, end=None) -> tuple[SimResult, dict]:
    p = p or BacktestParams()
    eng = Engine(ds, p)
    a, b = eng.window(start, end)
    res = eng.simulate(symbols, p, a, b)
    return res, compute_metrics(res)


def main(argv=None):
    from .backtest_report import run_cli
    run_cli(argv)


if __name__ == "__main__":
    main()
