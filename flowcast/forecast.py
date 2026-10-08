"""Hourly transaction forecasting, backtesting, and intraday re-forecasting.

Model: gradient-boosted trees over the feature matrix. Trees handle the
interactions that matter here (rain *at dinner on a Friday*, school break *at
lunch*) without hand-built cross terms, train in seconds per store, and expose
feature importance so a manager can see *why* tomorrow looks heavy.

Baseline: the 4-week same-weekday-hour average. Every number this module
reports is relative to that baseline because that is what the store is using
today, implicitly or through its scheduling tool.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

from flowcast.features import CATEGORICAL, FEATURE_COLUMNS, baseline_4wk

DEFAULT_PARAMS = {
    "learning_rate": 0.05,
    "max_iter": 600,
    "max_leaf_nodes": 31,
    "min_samples_leaf": 20,
    "l2_regularization": 0.5,
}

# Feature subsets a thin dataset may prefer. Walk-forward selection picks one.
EXTERNAL_FEATURES = [
    "temp_f", "feels_like_f", "precip_in", "rain_in", "snow_in", "weather_code", "wind_mph",
    "cloud_pct", "is_raining", "heavy_rain", "is_snowing", "is_storm", "extreme_heat",
    "extreme_cold", "nice_day", "event_pressure_k", "school_status", "school_in_session",
]
FEATURE_SETS = {
    "full": FEATURE_COLUMNS,
    "no_external": [c for c in FEATURE_COLUMNS if c not in EXTERNAL_FEATURES],
    "lags_and_clock": ["hour", "hour_sin", "hour_cos", "dow", "dow_hour", "is_weekend",
                       "lag_1w", "lag_2w", "lag_3w", "lag_4w", "lag_mean_4w", "lag_std_4w", "lag_1d", "lag_1d_total"],
}


def _model(seed: int = 0, params: dict | None = None, features: list[str] | None = None) -> HistGradientBoostingRegressor:
    features = features or FEATURE_COLUMNS
    cat_mask = [c in CATEGORICAL for c in features]
    p = DEFAULT_PARAMS | (params or {})
    return HistGradientBoostingRegressor(
        loss="poisson",
        categorical_features=cat_mask,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=40,
        random_state=seed,
        **p,
    )


@dataclass
class Forecaster:
    model: HistGradientBoostingRegressor | None
    trained_through: pd.Timestamp
    residual_std_by_hour: pd.Series
    features: list[str]
    # Blend with an anchor forecast: forecast = w * model + (1 - w) * anchor.
    # The anchor is the store's own forecast when the data has one (it is the
    # number to beat), otherwise the 4-week average. Walk-forward selection
    # sets w; w = 0 means "the anchor is still the best forecast".
    blend_w: float = 1.0
    anchor: str = "baseline"

    @classmethod
    def fit(cls, frame: pd.DataFrame, seed: int = 0, params: dict | None = None,
            feature_set: str = "full", blend_w: float = 1.0, anchor: str = "baseline") -> Forecaster:
        features = FEATURE_SETS[feature_set]
        train = frame[frame["is_closed"] == 0].dropna(subset=["lag_1w"])
        if blend_w <= 0.0 or len(train) < 60:
            # Anchor only: no model beat it, or not enough history to fit anything trustworthy.
            return cls(None, frame["date"].max(), pd.Series(dtype=float), features, 0.0, anchor)
        # Thin history leaves some features constant or entirely missing (lag_4w in
        # week 3). Drop them for this fit; the model remembers what it used.
        features = [c for c in features if train[c].nunique(dropna=True) >= 2]
        X, y = train[features], train["transactions"].to_numpy(dtype=float)
        model = _model(seed, params, features).fit(X, y)
        resid = y - model.predict(X)
        resid_std = pd.Series(resid).groupby(train["hour"].to_numpy()).std().fillna(0.0)
        return cls(model, frame["date"].max(), resid_std, features, blend_w, anchor)

    def predict(self, frame: pd.DataFrame) -> pd.Series:
        base = anchor_forecast(frame, self.anchor).to_numpy(dtype=float)
        if self.model is None:
            pred = base
        else:
            raw = np.clip(self.model.predict(frame[self.features]), 0, None)
            pred = self.blend_w * raw + (1 - self.blend_w) * base
        pred = np.where(frame["is_closed"].to_numpy() == 1, 0.0, pred)
        return pd.Series(pred, index=frame.index, name="forecast")

    def predict_interval(self, frame: pd.DataFrame, z: float = 1.28) -> pd.DataFrame:
        """Point forecast with an ~80% band from hour-specific residual spread."""
        point = self.predict(frame)
        if self.residual_std_by_hour.empty:
            spread = 0.25 * point.to_numpy()  # baseline-only: wide, honest band
        else:
            spread = frame["hour"].map(self.residual_std_by_hour).fillna(0.0).to_numpy() * z
        return pd.DataFrame(
            {
                "ts": frame["ts"],
                "forecast": point.round(1),
                "low": np.clip(point - spread, 0, None).round(1),
                "high": (point + spread).round(1),
            }
        )

    def feature_importance(self, frame: pd.DataFrame, n_repeats: int = 3, seed: int = 0) -> pd.Series:
        if self.model is None:
            return pd.Series({"lag_mean_4w": 1.0})
        sample = frame[frame["is_closed"] == 0].dropna(subset=["lag_1w"]).tail(24 * 90)
        X, y = sample[self.features], sample["transactions"].to_numpy(dtype=float)
        imp = permutation_importance(self.model, X, y, n_repeats=n_repeats, random_state=seed)
        return pd.Series(imp.importances_mean, index=self.features).sort_values(ascending=False)


def anchor_forecast(frame: pd.DataFrame, anchor: str = "baseline") -> pd.Series:
    """The forecast a model is blended with: the store's own where it exists, else the 4-week average."""
    base = baseline_4wk(frame)
    if anchor == "store_forecast" and "store_forecast" in frame:
        return frame["store_forecast"].fillna(base)
    return base


# --------------------------------------------------------------------------- metrics

def wape(actual: np.ndarray, pred: np.ndarray) -> float:
    """Weighted absolute percentage error: sum|err| / sum|actual|.

    Preferred over MAPE for hourly restaurant data because 10am hours with 20
    transactions would otherwise dominate the metric.
    """
    actual = np.asarray(actual, float)
    pred = np.asarray(pred, float)
    denom = np.abs(actual).sum()
    return float(np.abs(actual - pred).sum() / denom) if denom else float("nan")


def daily_wape(frame: pd.DataFrame, actual_col: str, pred_col: str) -> float:
    d = frame.groupby("date")[[actual_col, pred_col]].sum()
    return wape(d[actual_col].to_numpy(), d[pred_col].to_numpy())


@dataclass
class BacktestResult:
    predictions: pd.DataFrame
    summary: pd.DataFrame
    by_condition: pd.DataFrame

    def __str__(self) -> str:
        return self.summary.to_string()


CONDITIONS = {
    "all hours": lambda f: pd.Series(True, index=f.index),
    "raining": lambda f: f["is_raining"] == 1,
    "storm": lambda f: f["is_storm"] == 1,
    "nice day": lambda f: f["nice_day"] == 1,
    "event pressure": lambda f: f["event_pressure_k"] > 2,
    "school break": lambda f: f["school_status"].isin(["summer", "winter_break", "spring_break", "holiday", "teacher_day"]),
    "after-school 3-4pm in session": lambda f: (f["school_in_session"] == 1) & f["hour"].isin([15, 16]),
    "holiday +/- 1 day": lambda f: (f["is_holiday"] == 1) | (f["days_to_next_holiday"] == 1) | (f["days_since_holiday"] == 1),
}


def _condition_table(preds: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for name, fn in CONDITIONS.items():
        mask = fn(preds)
        sub = preds[mask]
        if len(sub) < 12:
            continue
        b = wape(sub["transactions"], sub["baseline"])
        m = wape(sub["transactions"], sub["model"])
        rows.append({"condition": name, "hours": len(sub), "baseline_wape": b, "model_wape": m,
                     "improvement": 1 - m / b if b else float("nan")})
    return pd.DataFrame(rows).set_index("condition")


def backtest(
    frame: pd.DataFrame,
    n_folds: int = 8,
    horizon_days: int = 7,
    min_train_days: int = 180,
    seed: int = 0,
    model_kwargs: dict | None = None,
) -> BacktestResult:
    """Rolling-origin evaluation that mimics production.

    For each fold: train on everything up to a cutoff, forecast the next
    `horizon_days` with the lag features that would have been available at the
    cutoff, score hourly and daily WAPE against the 4-week baseline.
    """
    dates = np.sort(frame["date"].unique())
    if len(dates) < min_train_days + horizon_days * n_folds:
        raise ValueError("Not enough history for the requested backtest")
    cutoffs = dates[-horizon_days * n_folds :: horizon_days][:n_folds]
    preds = []
    for i, cutoff in enumerate(cutoffs):
        train = frame[frame["date"] < cutoff]
        test = frame[(frame["date"] >= cutoff) & (frame["date"] < cutoff + np.timedelta64(horizon_days, "D"))]
        # Production only knows lags observed before the cutoff. For days deeper
        # into the horizon the 1-day lag is unknown: fill it with the 1-week lag.
        test = test.copy()
        unknown = test["date"] - pd.Timedelta(days=1) >= cutoff
        test.loc[unknown, "lag_1d"] = test.loc[unknown, "lag_1w"]
        test.loc[unknown, "lag_1d_total"] = np.nan
        model = Forecaster.fit(train, seed=seed + i, **(model_kwargs or {}))
        keep = ["ts", "date", "hour", "transactions", "is_closed", "is_raining", "is_storm", "nice_day",
                "event_pressure_k", "school_status", "school_in_session", "is_holiday",
                "days_to_next_holiday", "days_since_holiday", "store_forecast"]
        out = test[[c for c in keep if c in test]].copy()
        out["model"] = model.predict(test).to_numpy()
        out["baseline"] = baseline_4wk(test).to_numpy()
        out["fold"] = i
        out["horizon_day"] = (out["date"] - cutoff).dt.days + 1
        preds.append(out)
    allp = pd.concat(preds, ignore_index=True)
    allp = allp[allp["is_closed"] == 0]

    rows = []
    methods = [("baseline_4wk", "baseline"), ("model", "model")]
    if "store_forecast" in allp and allp["store_forecast"].notna().mean() > 0.9:
        allp["store_forecast"] = allp["store_forecast"].fillna(allp["baseline"])
        methods.append(("store_forecast", "store_forecast"))
    for name, col in methods:
        rows.append(
            {
                "method": name,
                "hourly_wape": wape(allp["transactions"], allp[col]),
                "daily_wape": daily_wape(allp, "transactions", col),
                "hourly_wape_d1": wape(
                    allp.loc[allp.horizon_day == 1, "transactions"], allp.loc[allp.horizon_day == 1, col]
                ),
                "peak_hour_wape": wape(
                    allp.loc[allp.hour.isin([12, 18]), "transactions"],
                    allp.loc[allp.hour.isin([12, 18]), col],
                ),
            }
        )
    summary = pd.DataFrame(rows).set_index("method")
    return BacktestResult(predictions=allp, summary=summary, by_condition=_condition_table(allp))


# --------------------------------------------------------------------------- intraday

def intraday_reforecast(
    day_forecast: pd.DataFrame,
    actuals_so_far: pd.Series,
    prior_frac: float = 0.15,
    min_prior_tx: float = 60.0,
    max_adjust: float = 0.45,
) -> pd.DataFrame:
    """Re-forecast the remaining hours of today from what has happened so far.

    Uses a shrunken ratio: observed/expected for hours already complete,
    pulled toward 1.0 with a prior worth `prior_frac` of the day's forecast
    (at least `min_prior_tx` transactions) so a quiet first hour does not
    slash the dinner forecast, while three hot hours in a row do move it.
    Deviation is capped so a single blocked hour (power flicker, fryer down)
    cannot push the plan off a cliff. Returns the original and revised
    forecasts plus a signal column managers act on.
    """
    f = day_forecast.copy()
    f["ts"] = pd.to_datetime(f["ts"])
    f = f.set_index("ts")
    done = actuals_so_far.index.intersection(f.index)
    expected = float(f.loc[done, "forecast"].sum())
    observed = float(actuals_so_far.loc[done].sum())
    prior = max(prior_frac * float(f["forecast"].sum()), min_prior_tx)
    ratio_raw = (observed + prior) / (expected + prior) if expected > 0 else 1.0
    ratio = float(np.clip(ratio_raw, 1 - max_adjust, 1 + max_adjust))
    f["actual"] = actuals_so_far.reindex(f.index)
    f["revised"] = f["forecast"]
    remaining = f.index.difference(done)
    f.loc[remaining, "revised"] = (f.loc[remaining, "forecast"] * ratio).round(1)
    f["signal"] = "hold"
    if ratio >= 1.12:
        f.loc[remaining, "signal"] = "call_in"
    elif ratio <= 0.88:
        f.loc[remaining, "signal"] = "send_home"
    f.attrs["ratio"] = ratio
    f.attrs["observed"] = observed
    f.attrs["expected"] = expected
    return f.reset_index()
