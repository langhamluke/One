import numpy as np
import pandas as pd
import pytest

from flowcast.features import FEATURE_COLUMNS, baseline_4wk
from flowcast.forecast import Forecaster, backtest, intraday_reforecast, wape


def test_feature_matrix_complete_and_lags_do_not_leak(frame):
    assert set(FEATURE_COLUMNS) <= set(frame.columns)
    # Lag 1w equals the transactions exactly one week earlier at the same hour.
    key = frame.set_index("ts")["transactions"]
    row = frame.iloc[24 * 40]
    assert row["lag_1w"] == key.loc[row["ts"] - pd.Timedelta(weeks=1)]
    assert row["lag_1d"] == key.loc[row["ts"] - pd.Timedelta(days=1)]
    # First week has no lag available rather than a shifted value.
    assert np.isnan(frame.iloc[0]["lag_1w"])


def test_simulator_bakes_in_the_drivers(frame):
    f = frame[frame["is_closed"] == 0]
    rain = f[f["heavy_rain"] == 1]["transactions"].mean()
    dry = f[(f["precip_in"] == 0)]["transactions"].mean()
    assert rain < 0.9 * dry
    closed = frame[frame["is_closed"] == 1]
    assert len(closed) > 0 and closed["transactions"].sum() == 0


def test_model_beats_baseline_in_backtest(frame):
    bt = backtest(frame, n_folds=3, horizon_days=7, min_train_days=150)
    s = bt.summary
    assert s.loc["model", "hourly_wape"] < s.loc["baseline_4wk", "hourly_wape"]
    assert s.loc["model", "daily_wape"] < s.loc["baseline_4wk", "daily_wape"]
    assert "raining" in bt.by_condition.index or "nice day" in bt.by_condition.index


def test_forecaster_interval_and_closed_days(frame):
    fc = Forecaster.fit(frame[frame["date"] < "2026-09-01"])
    day = frame[frame["date"] == "2026-09-15"]
    out = fc.predict_interval(day)
    assert (out["low"] <= out["forecast"]).all() and (out["forecast"] <= out["high"]).all()
    xmas = frame[frame["date"] == "2025-12-25"]
    assert fc.predict(xmas).sum() == 0


def test_wape():
    assert wape([100, 100], [90, 110]) == pytest.approx(0.1)


def test_intraday_reforecast_shrinks_and_signals():
    ts = pd.date_range("2026-10-07 10:00", "2026-10-07 23:00", freq="h")
    fc = pd.DataFrame({"ts": ts, "forecast": [100.0] * len(ts)})
    # Running 40% hot through 1pm -> call_in, with the ratio shrunk below 1.4.
    hot = pd.Series([140.0] * 4, index=ts[:4])
    out = intraday_reforecast(fc, hot)
    assert 1.12 < out.attrs["ratio"] < 1.40
    assert (out.loc[out["ts"].dt.hour >= 14, "signal"] == "call_in").all()
    assert (out.loc[out["ts"].dt.hour < 14, "revised"] == 100.0).all()
    # One quiet opening hour does not trigger send_home.
    quiet = pd.Series([70.0], index=ts[:1])
    out = intraday_reforecast(fc, quiet)
    assert (out["signal"] == "hold").all()
    # A catastrophic hour is capped.
    dead = pd.Series([0.0] * 4, index=ts[:4])
    out = intraday_reforecast(fc, dead)
    assert out.attrs["ratio"] == pytest.approx(0.55)


def test_baseline_is_four_week_mean(frame):
    row = frame.dropna(subset=["lag_4w"]).iloc[100]
    expected = np.mean([row[f"lag_{k}w"] for k in (1, 2, 3, 4)])
    assert baseline_4wk(frame).loc[row.name] == pytest.approx(expected)
