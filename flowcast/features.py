"""Assemble the hourly feature matrix the forecaster trains on.

Inputs are tidy frames from the connectors (or the simulator). Output is one
row per store-hour with calendar, weather, school, event, and lag features.
Lag features only look at *strictly earlier* days so a 1-day-ahead forecast
never leaks the target.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from flowcast.calendar_features import SCHOOL_STATUSES, cyclical
from flowcast.connectors.events import hourly_event_pressure
from flowcast.connectors.weather import weather_features

CATEGORICAL = ["holiday_name", "school_status"]
LAG_WEEKS = (1, 2, 3, 4)


def build_features(
    transactions: pd.DataFrame,
    weather: pd.DataFrame,
    calendar: pd.DataFrame,
    events: pd.DataFrame | None = None,
) -> pd.DataFrame:
    tx = transactions.copy()
    tx["ts"] = pd.to_datetime(tx["ts"])
    tx["date"] = tx["ts"].dt.normalize()
    tx["hour"] = tx["ts"].dt.hour

    w = weather_features(weather)
    w["ts"] = pd.to_datetime(w["ts"])
    frame = tx.merge(w, on="ts", how="left").merge(calendar, on="date", how="left")

    frame["event_pressure"] = hourly_event_pressure(
        events, pd.DatetimeIndex(frame["ts"])
    ).to_numpy()
    frame["event_pressure_k"] = frame["event_pressure"] / 1000.0

    frame["hour_sin"], frame["hour_cos"] = cyclical(frame["hour"], 24)
    frame["doy_sin"], frame["doy_cos"] = cyclical(frame["day_of_year"], 365.25)
    frame["dow_hour"] = frame["dow"] * 24 + frame["hour"]
    frame["trend_days"] = (frame["date"] - frame["date"].min()).dt.days

    # Same weekday-hour lags. Reindex on a complete grid so missing hours are NaN
    # rather than silently shifted.
    key = frame.set_index("ts")["transactions"]
    for k in LAG_WEEKS:
        frame[f"lag_{k}w"] = key.reindex(frame["ts"] - pd.Timedelta(weeks=k)).to_numpy()
    lag_cols = [f"lag_{k}w" for k in LAG_WEEKS]
    frame["lag_mean_4w"] = frame[lag_cols].mean(axis=1)
    frame["lag_std_4w"] = frame[lag_cols].std(axis=1)
    # Yesterday's same hour and yesterday's day total capture momentum.
    frame["lag_1d"] = key.reindex(frame["ts"] - pd.Timedelta(days=1)).to_numpy()
    daily = frame.groupby("date")["transactions"].sum()
    frame["lag_1d_total"] = daily.reindex(frame["date"] - pd.Timedelta(days=1)).to_numpy()

    for col in CATEGORICAL:
        frame[col] = frame[col].astype("category")
    frame["school_status"] = frame["school_status"].cat.set_categories(SCHOOL_STATUSES)
    return frame


FEATURE_COLUMNS = [
    "hour", "hour_sin", "hour_cos", "dow", "dow_hour", "is_weekend", "month",
    "doy_sin", "doy_cos", "week_of_year", "trend_days",
    "is_holiday", "holiday_name", "holiday_prior", "days_to_next_holiday", "days_since_holiday",
    "school_status", "school_in_session",
    "temp_f", "feels_like_f", "precip_in", "rain_in", "snow_in", "weather_code", "wind_mph",
    "cloud_pct", "is_raining", "heavy_rain", "is_snowing", "is_storm", "extreme_heat",
    "extreme_cold", "nice_day",
    "event_pressure_k",
    "lag_1w", "lag_2w", "lag_3w", "lag_4w", "lag_mean_4w", "lag_std_4w", "lag_1d", "lag_1d_total",
]


def baseline_4wk(frame: pd.DataFrame) -> pd.Series:
    """The industry default: average of the same weekday-hour over the last 4 weeks.

    This is roughly what a manager (or a scheduling tool without external
    data) uses. Beating it is the bar.
    """
    return frame["lag_mean_4w"].fillna(frame["lag_1w"]).fillna(0.0)


def split_xy(frame: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
    return frame[FEATURE_COLUMNS], frame["transactions"].to_numpy(dtype=float)
