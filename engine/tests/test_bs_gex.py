import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta, date

from letf import bs, gex, levels, catalysts, ranker


def test_put_call_parity_and_iv_roundtrip():
    S, K, T, r, s = 100, 95, 0.3, 0.04, 0.3
    c, p = float(bs.price(S, K, T, r, s, 1)), float(bs.price(S, K, T, r, s, -1))
    assert abs(c - p - (S - K * np.exp(-r * T))) < 1e-9
    assert abs(bs.implied_vol(c, S, K, T, r, 1) - s) < 1e-6


def test_greeks_match_finite_differences():
    S, K, T, r, s, h = 100, 100, 0.25, 0.04, 0.25, 1e-4
    fd_vanna = (float(bs.delta(S, K, T, r, s + h)) - float(bs.delta(S, K, T, r, s - h))) / (2 * h)
    assert abs(float(bs.vanna(S, K, T, r, s)) - fd_vanna) < 1e-4
    fd_charm = -(float(bs.delta(S, K, T + h, r, s)) - float(bs.delta(S, K, T - h, r, s))) / (2 * h)
    assert abs(float(bs.charm(S, K, T, r, s)) - fd_charm) < 1e-4
    fd_gamma = (float(bs.delta(S + h, K, T, r, s)) - float(bs.delta(S - h, K, T, r, s))) / (2 * h)
    assert abs(float(bs.gamma(S, K, T, r, s)) - fd_gamma) < 1e-4


def synthetic_chain(S=600.0, today=None):
    today = today or datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
    rng = np.random.default_rng(1)
    rows = []
    for exp_days in (2, 9, 16, 37):
        exp = (today + timedelta(days=exp_days)).date()
        for K in np.arange(540, 661, 5.0):
            for cp in ("call", "put"):
                m = np.log(K / S)
                iv = 0.22 + 0.6 * max(-m, 0) + 0.15 * abs(m)
                oi = int(rng.integers(100, 3000) * (3 if (cp == "call" and K >= S) or (cp == "put" and K <= S) else 1))
                if K == 620 and cp == "call":
                    oi *= 6
                if K == 570 and cp == "put":
                    oi *= 6
                px = float(bs.price(S, K, exp_days / 365, 0.04, iv, 1 if cp == "call" else -1))
                rows.append(dict(expiration=exp, strike=K, type=cp, iv=iv, open_interest=oi, bid=px * 0.97, ask=px * 1.03, mark=px, delta=float(bs.delta(S, K, exp_days / 365, 0.04, iv, 1 if cp == "call" else -1)), volume=500))
    return pd.DataFrame(rows), today


def test_gex_levels_find_planted_walls():
    chain, today = synthetic_chain()
    res = gex.analyze(chain, "QQQ", 600.0, today, dte_filter="monthly")
    assert res.call_wall == 620.0
    assert res.put_wall == 570.0
    assert res.max_pain == 600.0
    assert res.flip is not None and 540 < res.flip < 660
    assert res.regime in ("positive", "negative")
    assert res.total_gex != 0
    # sign convention: calls positive, puts negative
    assert (res.contracts.loc[res.contracts.type == "call", "gex"] >= 0).all()
    assert (res.contracts.loc[res.contracts.type == "put", "gex"] <= 0).all()


def test_dte_filters_restrict_contracts():
    chain, today = synthetic_chain()
    r0 = gex.analyze(chain, "QQQ", 600.0, today, dte_filter="weekly", profile_flip=False)
    ra = gex.analyze(chain, "QQQ", 600.0, today, dte_filter="all", profile_flip=False)
    assert len(r0.contracts) < len(ra.contracts)


def test_level_mapping_leveraged():
    # QQQ level 1% above spot -> TQQQ level 3% above spot
    assert abs(gex.map_level_leveraged(606.0, 600.0, 100.0, 3.0) - 103.0) < 1e-9
    lv = [levels.Level("callwall", 606.0, 90, "cw"), levels.Level("putwall", 594.0, 80, "pw")]
    inv = levels.map_levels(lv, 600.0, 20.0, -3.0)
    assert inv[0].type == "putwall" and abs(inv[0].price - 19.4) < 1e-9


def test_pine_block_format():
    chain, today = synthetic_chain()
    res = gex.analyze(chain, "QQQ", 600.0, today, dte_filter="monthly", profile_flip=False)
    txt = levels.pine_block(levels.levels_from_gex(res), "QQQ", date(2026, 10, 7), "QQQ", 1.0, [(date(2026, 10, 8), "CPI")])
    lines = txt.strip().split("\n")
    assert lines[0].startswith("#v1;sym=QQQ;date=2026-10-07")
    assert any(l.startswith("callwall,620.00,") for l in lines)
    assert lines[-1] == "catalyst,2026-10-08,CPI"


def test_catalyst_calendar_computed():
    cal = catalysts.computed(date(2026, 10, 1), date(2026, 12, 31))
    kinds = {(c.day, c.kind) for c in cal}
    assert (date(2026, 10, 16), "OPEX") in kinds
    assert (date(2026, 12, 18), "QUAD_WITCH") in kinds
    assert (date(2026, 11, 3), "ELECTION") in kinds
    assert (date(2026, 10, 28), "FOMC") in kinds
    vix = [c for c in cal if c.kind == "VIXEXP" and c.day.month == 10]
    assert vix and vix[0].day.weekday() == 2
    p, soon = catalysts.catalyst_pressure(cal, date(2026, 10, 14), window=5)
    assert 0 < p <= 1 and any(c.kind == "OPEX" for c in soon)


def test_ranker_prefers_positive_ev_and_respects_filters():
    chain, today = synthetic_chain()
    p = ranker.RankParams(n_sims=4000, min_oi=1, min_volume=1, max_spread_pct=0.2, min_dte=1, max_dte=20)
    out = ranker.rank_singles(chain, 600.0, 0.6, "LONG_CALL", today, p, symbol="QQQ")
    assert not out.empty
    assert (out["type"] == "call").all()
    assert out["dte"].between(1, 20).all()
    assert out["abs_delta"].between(p.min_delta, p.max_delta).all() if "abs_delta" in out else True
    b = ranker.best(out)
    assert b is not None and b["ev_on_premium"] > 0
    assert b["premium_$"] <= 100_000 * 0.01 + 1e-6
    # neutral score -> EV should be ~0 or negative (spread cost), fewer/no positives
    neutral = ranker.rank_singles(chain, 600.0, 0.0, "LONG_CALL", today, p, symbol="QQQ")
    assert neutral["ev_on_premium"].max() < out["ev_on_premium"].max()
    puts = ranker.rank_singles(chain, 600.0, -0.6, "LONG_PUT", today, p, symbol="QQQ")
    assert not puts.empty and (puts["type"] == "put").all() and puts["ev_on_premium"].max() > 0
