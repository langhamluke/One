"""Backtester tests on a seeded synthetic GBM series (QQQ-like) with a constant 25 vol index."""
import numpy as np
import pandas as pd
import pytest

from letf import backtest as bt, bs, signals


def gbm_bars(n=1500, seed=3, s0=200.0, mu=0.12, sigma=0.22, start="2019-01-02"):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start, periods=n)
    dt = 1 / 252
    z = rng.standard_normal(n)
    close = s0 * np.exp(np.cumsum((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z))
    prev = np.concatenate([[s0], close[:-1]])
    opn = prev * np.exp(0.3 * sigma * np.sqrt(dt) * rng.standard_normal(n))
    hi = np.maximum(opn, close) * (1 + np.abs(rng.standard_normal(n)) * 0.004)
    lo = np.minimum(opn, close) * (1 - np.abs(rng.standard_normal(n)) * 0.004)
    return pd.DataFrame({"open": opn, "high": hi, "low": lo, "close": close}, index=idx)


def make_dataset(vol_level=25.0, n=2500, seed=3, lev_symbol=None, vol_wobble=0.0):
    """GBM parent bars with a constant vol index (vol_wobble > 0 adds a slow deterministic cycle so that
    the IV-regime filters do not block one side permanently)."""
    px = gbm_bars(n, seed)
    v = vol_level * (1 + vol_wobble * np.sin(np.arange(len(px)) / 40.0))
    vol = pd.DataFrame({"close": v}, index=px.index)
    symbols, parent_of = {"QQQ": px}, {"QQQ": "QQQ"}
    if lev_symbol:
        # a 3x path of the same bars (close-to-close), used only to exercise the leverage branch
        r = px["close"].pct_change().fillna(0)
        c = 20 * np.cumprod(1 + 3 * r)
        lev = pd.DataFrame({"open": c * (px["open"] / px["close"]), "high": c * 1.01, "low": c * 0.99, "close": c}, index=px.index)
        symbols[lev_symbol], parent_of[lev_symbol] = lev, "QQQ"
    return bt.Dataset.build({"QQQ": px}, {"QQQ": vol}, symbols, parent_of)


@pytest.fixture(scope="module")
def ds():
    return make_dataset()


@pytest.fixture(scope="module")
def fixed_run(ds):
    p = bt.BacktestParams()
    eng = bt.Engine(ds, p)
    res = eng.simulate(["QQQ"], p)
    return eng, p, res, bt.compute_metrics(res)


def test_engine_runs_and_generates_trades(fixed_run):
    eng, p, res, m = fixed_run
    assert len(res.equity) == len(eng.ds.index)
    assert len(res.trades) > 10
    assert set(res.trades["type"]).issubset({"call", "put"})
    assert (res.trades["qty"] >= 1).all()
    assert (res.trades["dte_entry"] >= p.min_dte).all() and (res.trades["dte_entry"] <= p.max_dte).all()
    assert (pd.to_datetime(res.trades["expiry"]).dt.weekday == 4).all()
    assert (res.trades["hold_days"] >= 0).all()
    # equity identity: final equity = start + sum of trade pnl (nothing left open)
    assert abs(res.equity.iloc[-1] - (p.initial_equity + res.trades["pnl"].sum())) < 1e-6


def test_no_lookahead_entry_uses_next_day_open(fixed_run):
    eng, p, res, _ = fixed_run
    ds = eng.ds
    idx = ds.index
    for _, t in res.trades.head(15).iterrows():
        s = idx.get_loc(t["signal_date"])
        e = idx.get_loc(t["entry_date"])
        assert e == s + 1
        S0 = ds.symbols["QQQ"]["open"].iloc[e]           # next day's open, not the signal day's close
        iv_atm = ds.vols["QQQ"]["close"].iloc[s] / 100   # vol known at the signal close
        T = t["dte_entry"] / 365
        cp = 1 if t["type"] == "call" else -1
        iv = float(bt.skewed_iv(iv_atm, t["strike"], S0, T, p.skew_call if cp > 0 else p.skew_put, p.skew_floor, p.skew_cap))
        expect = float(bs.price(S0, t["strike"], T, p.r, iv, cp)) * (1 + p.half_spread)
        assert abs(t["entry_price"] - expect) < 1e-9
        # the signal really was emitted by the production rules on the signal day
        f = signals.features(ds.parents["QQQ"], ds.vols["QQQ"], p.signal)
        sig = signals.score_row(f.loc[t["signal_date"]], signals.SignalContext(), p.signal)
        assert sig.direction == ("LONG_CALL" if cp > 0 else "LONG_PUT")
        assert abs(sig.score - t["signal_score"]) < 1e-12


def _constructed_dataset(jump: float, n=320):
    """Flat path, then a one-off jump of ``jump`` on the day after the forced entry day."""
    idx = pd.bdate_range("2021-01-04", periods=n)
    close = np.full(n, 100.0)
    e = 250                      # entry day (a Monday)
    close[e + 1:] = 100.0 * (1 + jump)
    opn = close.copy()
    px = pd.DataFrame({"open": opn, "high": close * 1.001, "low": close * 0.999, "close": close}, index=idx)
    vol = pd.DataFrame({"close": np.full(n, 25.0)}, index=idx)
    return bt.Dataset.build({"QQQ": px}, {"QQQ": vol}, {"QQQ": px}, {"QQQ": "QQQ"}), e


def _forced_exit(ds, e, cp, p):
    tpl = bt.build_templates(ds, "QQQ", cp, p)
    dirs = np.zeros(len(ds.index), dtype=np.int8)   # no signal flips
    ex = bt.resolve_exits(tpl, dirs, p.take_profit_x, p.stop_loss_pct, p.time_stop_dte)
    return tpl, ex


def test_take_profit_triggers_on_favourable_jump():
    p = bt.BacktestParams()
    ds, e = _constructed_dataset(+0.10)
    tpl, ex = _forced_exit(ds, e, 1, p)
    assert tpl.valid[e]
    assert bt.EXIT_REASONS[ex.reason[e]] == "take_profit"
    assert ex.k_exit[e] == 1
    assert ex.exit_px[e] >= p.take_profit_x * tpl.entry_px[e]
    # puts gain on a drop
    ds, e = _constructed_dataset(-0.10)
    tpl, ex = _forced_exit(ds, e, -1, p)
    assert bt.EXIT_REASONS[ex.reason[e]] == "take_profit" and ex.k_exit[e] == 1


def test_stop_loss_triggers_on_adverse_jump():
    p = bt.BacktestParams()
    ds, e = _constructed_dataset(-0.10)
    tpl, ex = _forced_exit(ds, e, 1, p)
    assert bt.EXIT_REASONS[ex.reason[e]] == "stop_loss"
    assert ex.k_exit[e] == 1
    assert ex.exit_px[e] <= (1 - p.stop_loss_pct) * tpl.entry_px[e]


def test_flat_path_decays_into_stop_loss():
    p = bt.BacktestParams()
    ds, e = _constructed_dataset(0.0)          # flat: a 35-delta option loses >50% to theta before the time stop
    tpl, ex = _forced_exit(ds, e, 1, p)
    assert bt.EXIT_REASONS[ex.reason[e]] == "stop_loss"
    assert tpl.V[e, : ex.k_exit[e]].min() > (1 - p.stop_loss_pct) * tpl.entry_px[e]   # exit at the FIRST breach


def test_time_stop_and_signal_flip():
    p = bt.BacktestParams(stop_loss_pct=0.999, take_profit_x=50.0)   # disable TP/SL
    ds, e = _constructed_dataset(0.0)
    tpl, ex = _forced_exit(ds, e, 1, p)
    assert bt.EXIT_REASONS[ex.reason[e]] == "time_stop"
    assert tpl.dte[e, ex.k_exit[e]] <= p.time_stop_dte
    # an opposite signal at the close of e+2 exits there
    dirs = np.zeros(len(ds.index), dtype=np.int8)
    dirs[e + 2] = -1
    ex2 = bt.resolve_exits(tpl, dirs, p.take_profit_x, p.stop_loss_pct, p.time_stop_dte)
    assert ex2.k_exit[e] == 2 and bt.EXIT_REASONS[ex2.reason[e]] == "signal_flip"
    # expiry settlement at intrinsic when the time stop is disabled
    ex3 = bt.resolve_exits(tpl, np.zeros(len(ds.index), dtype=np.int8), p.take_profit_x, p.stop_loss_pct, time_stop_dte=0)
    assert bt.EXIT_REASONS[ex3.reason[e]] == "expiry"
    k = ex3.k_exit[e]
    assert tpl.dte[e, k] == 0 and abs(ex3.exit_px[e] - max(100.0 - tpl.strike[e], 0.0)) < 1e-12


def test_expiry_and_strike_rules():
    idx = pd.bdate_range("2021-03-01", periods=10)   # Monday .. Friday of the second week
    exp = bt.choose_expiries(idx, 3, 10)
    dte = (exp - idx.values.astype("datetime64[D]")) / bt.DAY
    assert ((dte >= 3) & (dte <= 10)).all()
    assert (pd.DatetimeIndex(exp).weekday == 4).all()
    assert dte[0] == 4 and dte[2] == 9 and dte[4] == 7     # Mon -> this Fri, Wed -> next Fri, Fri -> next Fri
    assert bt.strike_increment("QQQ", 30) == 1.0 and bt.strike_increment("TQQQ", 30) == 0.5 and bt.strike_increment("TQQQ", 80) == 1.0
    # delta solve: call strike above spot, put strike below spot, implied delta near target
    S, iv, T = 400.0, 0.25, 7 / 365
    Kc = bt.strike_for_delta(S, iv, T, 0.04, 0.35, 1)
    Kp = bt.strike_for_delta(S, iv, T, 0.04, 0.35, -1)
    assert Kc > S > Kp
    assert abs(float(bs.delta(S, Kc, T, 0.04, iv, 1)) - 0.35) < 1e-9
    assert abs(float(bs.delta(S, Kp, T, 0.04, iv, -1)) + 0.35) < 1e-9
    # skew: OTM put richer, OTM call cheaper, floor respected
    assert bt.skewed_iv(0.2, 95, 100, 0.02, -0.6, 0.5, 2.0) > 0.2
    assert bt.skewed_iv(0.2, 105, 100, 0.02, -0.2, 0.5, 2.0) < 0.2
    assert abs(bt.skewed_iv(0.2, 150, 100, 0.001, -0.6, 0.5, 2.0) - 0.1) < 1e-12


def test_metrics_finite(fixed_run):
    _, _, res, m = fixed_run
    for k in ("cagr", "total_return", "ann_vol", "sharpe", "sortino", "max_drawdown", "calmar", "win_rate", "profit_factor",
              "avg_win", "avg_loss", "expectancy", "avg_hold_days", "exposure"):
        assert np.isfinite(m[k]), k
    assert -1 <= m["max_drawdown"] <= 0 and 0 <= m["win_rate"] <= 1 and 0 < m["exposure"] <= 1
    assert m["n_trades"] == len(res.trades)
    assert set(m["yearly_returns"]) and all(np.isfinite(v) for v in m["yearly_returns"].values())
    assert all(np.isfinite(v) for y in m["monthly_returns"].values() for v in y.values())


def test_leveraged_symbol_iv_and_increment():
    ds = make_dataset(lev_symbol="TQQQ")
    p = bt.BacktestParams()
    iv = ds.iv_series("TQQQ", p.iv_cap)
    assert np.allclose(iv, 0.75)
    assert np.allclose(ds.iv_series("QQQ", p.iv_cap), 0.25)
    assert np.allclose(ds.iv_series("TQQQ", 0.5), 0.5)      # cap applies
    ds = make_dataset(lev_symbol="TQQQ", vol_wobble=0.3)    # varying vol so both calls and puts can fire
    eng = bt.Engine(ds, p)
    res = eng.simulate(["TQQQ", "QQQ"], p)
    assert len(res.trades) > 0 and {"TQQQ", "QQQ"} <= set(res.trades["symbol"])
    assert {"call", "put"} <= set(res.trades["type"])
    assert (res.trades["iv_entry"] > 0.5).sum() > 0        # leveraged IV in use
    # max one open position per symbol: entries never overlap a still-open trade on the same symbol
    for s, g in res.trades.groupby("symbol"):
        g = g.sort_values("entry_date")
        assert (g["entry_date"].iloc[1:].to_numpy() > g["exit_date"].iloc[:-1].to_numpy()).all()


def test_walk_forward_produces_windows(ds):
    p = bt.BacktestParams()
    eng = bt.Engine(ds, p)
    grid = {"pullback_pct": [1.0, 2.0], "rsi_buy": [40.0], "rsi_sell": [60.0], "target_delta": [0.35], "take_profit_x": [1.5, 3.0]}
    w = bt.walk_forward(eng, ["QQQ"], p, start="2020-01-01", grid=grid, min_trades=3)
    assert len(w.windows) >= 4
    assert w.n_combos == 4
    chosen = w.windows.loc[~w.windows["fallback"], "best_take_profit_x"]
    assert len(chosen) > 0 and set(chosen).issubset({1.5, 3.0})
    assert (w.windows.loc[~w.windows["fallback"], "is_trades"] >= 3).all()
    assert len(w.oos_equity) > 0 and np.isfinite(w.oos_equity).all()
    assert w.oos_equity.index.is_monotonic_increasing and not w.oos_equity.index.duplicated().any()
    assert 0 <= w.frac_profitable <= 1
    assert w.oos_metrics["n_trades"] == len(w.oos_trades)
    # windows tile: each OOS starts where the IS ends, steps of 3 months
    assert (pd.to_datetime(w.windows["is_end"]).diff().dropna().dt.days.between(89, 92)).all()
    # stitched equity compounds: last equity equals the last window's equity_end
    assert abs(w.oos_equity.iloc[-1] - w.windows["equity_end"].iloc[-1]) < 1e-6


def test_monte_carlo_trade_bootstrap(fixed_run):
    _, _, res, _ = fixed_run
    mc = bt.mc_trade_bootstrap(res.trades, n_sims=500, seed=1)
    assert mc["n_sims"] == 500 and mc["n_trades"] == len(res.trades)
    q = mc["max_drawdown_pct"]
    assert q["5"] <= q["50"] <= q["95"] <= 0
    assert 0 <= mc["p_drawdown_gt_30"] <= 1 and mc["p_drawdown_gt_50"] <= mc["p_drawdown_gt_30"]
    f = mc["final_equity_multiple_pct"]
    assert f["5"] <= f["50"] <= f["95"] and all(v > 0 for v in f.values())


def test_block_bootstrap_dataset_and_path_mc(ds):
    rng = np.random.default_rng(0)
    sds = bt.block_bootstrap_dataset(ds, rng, block=10)
    assert sds.index.equals(ds.index)
    px = sds.parents["QQQ"]
    assert np.isfinite(px.to_numpy()).all() and (px["close"] > 0).all()
    assert (px["high"] >= px[["open", "close"]].max(axis=1) * 0.999).all()
    assert not np.allclose(px["close"].to_numpy(), ds.parents["QQQ"]["close"].to_numpy())
    mc = bt.mc_path_bootstrap(ds, ["QQQ"], bt.BacktestParams(), n_paths=3, seed=0)
    assert mc["n_paths"] == 3 and all(np.isfinite(v) for v in mc["max_drawdown_pct"].values())
