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

from flowcast.features import CATEGORICAL, FEATURE_COLUMNS, baseline_4wk, split_xy


def _model(seed: int = 0) -> HistGradientBoostingRegressor:
    cat_mask = [c in CATEGORICAL for c in FEATURE_COLUMNS]
    return HistGradientBoostingRegressor(
        loss="poisson",
        learning_rate=0.05,
        max_iter=600,
        max_leaf_nodes=31,
        min_samples_leaf=20,
        l2_regularization=0.5,
        categorical_features=cat_mask,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=40,
        random_state=seed,
    )


@dataclass
class Forecaster:
    model: HistGradientBoostingRegressor
    trained_through: pd.Timestamp
    residual_std_by_hour: pd.Series

    @classmethod
    def fit(cls, frame: pd.DataFrame, seed: int = 0) -> Forecaster:
        train = frame[frame["is_closed"] == 0].dropna(subset=["lag_1w"])
        X, y = split_xy(train)
        model = _model(seed).fit(X, y)
        resid = y - model.predict(X)
        resid_std = pd.Series(resid).groupby(train["hour"].to_numpy()).std().fillna(0.0)
        return cls(model=model, trained_through=frame["date"].max(), residual_std_by_hour=resid_std)

    def predict(self, frame: pd.DataFrame) -> pd.Series:
        X = frame[FEATURE_COLUMNS]
        pred = np.clip(self.model.predict(X), 0, None)
        pred = np.where(frame["is_closed"].to_numpy() == 1, 0.0, pred)
        return pd.Series(pred, index=frame.index, name="forecast")

    def predict_interval(self, frame: pd.DataFrame, z: float = 1.28) -> pd.DataFrame:
        """Point forecast with an ~80% band from hour-specific residual spread."""
        point = self.predict(frame)
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
        sample = frame[frame["is_closed"] == 0].dropna(subset=["lag_1w"]).tail(24 * 90)
        X, y = split_xy(sample)
        imp = permutation_importance(self.model, X, y, n_repeats=n_repeats, random_state=seed)
        return pd.Series(imp.importances_mean, index=FEATURE_COLUMNS).sort_values(ascending=False)


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
        model = Forecaster.fit(train, seed=seed + i)
        keep = ["ts", "date", "hour", "transactions", "is_closed", "is_raining", "is_storm", "nice_day",
                "event_pressure_k", "school_status", "school_in_session", "is_holiday",
                "days_to_next_holiday", "days_since_holiday"]
        out = test[keep].copy()
        out["model"] = model.predict(test).to_numpy()
        out["baseline"] = baseline_4wk(test).to_numpy()
        out["fold"] = i
        out["horizon_day"] = (out["date"] - cutoff).dt.days + 1
        preds.append(out)
    allp = pd.concat(preds, ignore_index=True)
    allp = allp[allp["is_closed"] == 0]

    rows = []
    for name, col in (("baseline_4wk", "baseline"), ("model", "model")):
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
