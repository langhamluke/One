from datetime import date, timedelta

import numpy as np
import pandas as pd

from flowcast import ordering
from flowcast.features import build_features
from flowcast.forecast import Forecaster
from flowcast.montecarlo import ErrorPool, order_safety_samples, simulate_day
from flowcast.synth import StoreConfig, generate_store
from flowcast.tuning import Schedule, walk_forward_select


def _frame(days: int, seed: int = 11):
    end = date(2026, 10, 6)
    d = generate_store(StoreConfig(), end - timedelta(days=days), end, seed=seed)
    return build_features(d["transactions"], d["weather"], d["calendar"], d["events"])


def test_schedule_adapts_to_history():
    s = Schedule.for_history(20)
    assert s.horizon_days == 1 and s.n_folds >= 1
    s = Schedule.for_history(400)
    assert s.horizon_days == 7 and s.n_folds == 8 and s.min_train_days == 90
    assert Schedule.for_history(10).n_folds == 0


def test_selection_falls_back_with_tiny_history():
    sel = walk_forward_select(_frame(16))
    assert sel.baseline_only and sel.confidence == "very low" and sel.notes
    fc = Forecaster.fit(_frame(16), **sel.model_kwargs)
    assert fc.model is None
    assert (fc.predict(_frame(16)) >= 0).all()


def test_selection_thin_history_shrinks_toward_baseline():
    f = _frame(32)
    sel = walk_forward_select(f, max_folds=4)
    assert sel.schedule.horizon_days == 1 and sel.schedule.n_folds >= 4
    assert "baseline" in sel.report.index
    assert sel.report["daily_wape"].notna().sum() >= 2
    # Whatever is chosen is at least as good out of sample as the baseline.
    assert sel.report.loc[sel.chosen, "daily_wape"] <= sel.report.loc["baseline", "daily_wape"] + 1e-9
    assert sel.predictions is not None and {"model", "baseline", "blend"} <= set(sel.predictions.columns)
    fc = Forecaster.fit(f, **sel.model_kwargs)
    assert fc.blend_w == sel.blend_w


def test_fit_drops_all_missing_features():
    f = _frame(24)
    fc = Forecaster.fit(f, feature_set="full")
    assert fc.model is not None and "lag_4w" not in fc.features


def test_error_pool_and_day_simulation(frame):
    from flowcast.forecast import backtest

    bt = backtest(frame, n_folds=3, horizon_days=7, min_train_days=150)
    pool = ErrorPool.from_predictions(bt.predictions, pred_col="model")
    assert pool.n_days >= 15 and abs(pool.daily.mean()) < 0.1
    day = frame[frame["date"] == "2026-09-15"][["ts", "hour", "transactions"]].rename(columns={"transactions": "forecast"})
    sim = simulate_day(day, pool, n=800)
    p = sim.total_p
    assert p["p10"] < p["p50"] < p["p90"]
    assert 0.7 * day["forecast"].sum() < p["p50"] < 1.3 * day["forecast"].sum()
    assert (sim.hourly_p10 <= sim.hourly_p90).all()
    assert 0 <= sim.prob_total_above(p["p50"]) <= 1
    assert sim.labor_hours.min() > 0


def test_uninformed_pool_is_wide():
    pool = ErrorPool.uninformed(list(range(10, 24)))
    day = pd.DataFrame({"hour": range(10, 24), "forecast": [100.0] * 14})
    sim = simulate_day(day, pool, n=800)
    assert sim.total_p["p90"] - sim.total_p["p10"] > 0.25 * 1400


def test_empirical_safety_stock_tracks_service_level(frame):
    from flowcast.forecast import backtest

    bt = backtest(frame, n_folds=3, horizon_days=7, min_train_days=150)
    pool = ErrorPool.from_predictions(bt.predictions, pred_col="model")
    samples = order_safety_samples(pool, n=1500)
    usage = pd.DataFrame({"date": pd.date_range("2026-10-07", periods=7), "ingredient": "chicken_lb", "qty": 900.0})
    lo = ordering.suggest_orders(usage, {}, service_level=0.80, error_samples=samples)
    hi = ordering.suggest_orders(usage, {}, service_level=0.99, error_samples=samples)
    normal = ordering.suggest_orders(usage, {}, service_level=0.95, forecast_wape=0.08)
    assert hi["safety_stock"].iloc[0] > lo["safety_stock"].iloc[0] >= 0
    assert np.isfinite(normal["safety_stock"].iloc[0])
