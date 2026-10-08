"""Walk-forward model selection for a store's first weeks of data.

When a store loads its history for the first time there is no way to know
in advance whether 6 weeks of POS data is enough for the full model to beat
the 4-week average, or whether weather features help yet. So the question
is put to the data the only honest way: for each candidate (feature set,
model size, and a blend weight toward the baseline), walk forward through
history, forecasting each window from only what came before it, and keep
the candidate that would have been most accurate.

The schedule adapts to the amount of history: with little data the horizon
is one day and windows are many; with a year it is one week at a time.
Everything the selection reports is out-of-sample.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from flowcast.forecast import backtest, daily_wape, wape

BLEND_GRID = (0.0, 0.25, 0.5, 0.75, 1.0)

CANDIDATES: dict[str, dict] = {
    "full": {"feature_set": "full"},
    "full_small": {"feature_set": "full", "params": {"max_leaf_nodes": 15, "min_samples_leaf": 40, "learning_rate": 0.08, "max_iter": 300}},
    "no_external": {"feature_set": "no_external", "params": {"max_leaf_nodes": 15, "min_samples_leaf": 40, "learning_rate": 0.08, "max_iter": 300}},
    "lags_and_clock": {"feature_set": "lags_and_clock", "params": {"max_leaf_nodes": 15, "min_samples_leaf": 40, "learning_rate": 0.08, "max_iter": 300}},
}


@dataclass
class Schedule:
    n_days: int
    min_train_days: int
    horizon_days: int
    n_folds: int

    @classmethod
    def for_history(cls, n_days: int, max_folds: int = 8) -> Schedule:
        if n_days >= 150:
            min_train, horizon = 90, 7
        elif n_days >= 70:
            min_train, horizon = 35, 3
        else:
            min_train, horizon = 14, 1
        n_folds = int(max(0, min(max_folds if horizon > 1 else 2 * max_folds, (n_days - min_train) // horizon)))
        return cls(n_days, min_train, horizon, n_folds)


@dataclass
class Selection:
    chosen: str
    blend_w: float
    model_kwargs: dict
    report: pd.DataFrame
    schedule: Schedule
    predictions: pd.DataFrame | None
    confidence: str
    weeks_of_data: float
    notes: list[str] = field(default_factory=list)
    anchor: str = "baseline"

    @property
    def baseline_only(self) -> bool:
        return self.blend_w == 0.0


def _confidence(weeks: float, improvement: float) -> str:
    if weeks < 4:
        return "very low"
    if weeks < 8:
        return "low"
    if weeks < 16 or improvement < 0.03:
        return "medium"
    return "established"


def walk_forward_select(frame: pd.DataFrame, max_folds: int = 8, seed: int = 0,
                        candidates: dict[str, dict] | None = None) -> Selection:
    """Pick the candidate and blend weight with the lowest out-of-sample daily error."""
    known = frame[frame.get("actual_known", True) & (frame["is_closed"] == 0)] if "actual_known" in frame else frame[frame["is_closed"] == 0]
    dates = np.sort(known["date"].unique())
    n_days = len(dates)
    weeks = n_days / 7.0
    sched = Schedule.for_history(n_days, max_folds)
    candidates = candidates or CANDIDATES
    notes: list[str] = []

    if sched.n_folds < 1 or n_days < 21:
        notes.append(f"Only {n_days} days of history: using the weekday-hour average until 3 weeks accumulate.")
        report = pd.DataFrame([{"candidate": "baseline", "blend_w": 0.0, "daily_wape": np.nan, "hourly_wape": np.nan, "folds": 0}]).set_index("candidate")
        return Selection("baseline", 0.0, {"blend_w": 0.0}, report, sched, None, "very low", weeks, notes)

    has_store = "store_forecast" in frame and frame["store_forecast"].notna().mean() > 0.9
    anchor = "store_forecast" if has_store else "baseline"
    rows = []
    preds: dict[str, pd.DataFrame] = {}
    for name, spec in candidates.items():
        kwargs = {"feature_set": spec.get("feature_set", "full"), "params": spec.get("params")}
        try:
            bt = backtest(frame, n_folds=sched.n_folds, horizon_days=sched.horizon_days,
                          min_train_days=sched.min_train_days, seed=seed, model_kwargs=kwargs)
        except ValueError as exc:
            notes.append(f"{name}: skipped ({exc})")
            continue
        p = bt.predictions
        p["anchor"] = p["store_forecast"].fillna(p["baseline"]) if has_store else p["baseline"]
        preds[name] = p
        for w in BLEND_GRID:
            blended = w * p["model"] + (1 - w) * p["anchor"]
            tmp = p.assign(blend=blended)
            rows.append({
                "candidate": name, "blend_w": w,
                "daily_wape": daily_wape(tmp, "transactions", "blend"),
                "hourly_wape": wape(tmp["transactions"], tmp["blend"]),
                "folds": int(p["fold"].nunique()),
            })
    if not rows:
        report = pd.DataFrame([{"candidate": "baseline", "blend_w": 0.0, "daily_wape": np.nan, "hourly_wape": np.nan, "folds": 0}]).set_index("candidate")
        return Selection("baseline", 0.0, {"blend_w": 0.0}, report, sched, None, "very low", weeks, notes)

    full = pd.DataFrame(rows)
    # Rank by daily error (what scheduling and ordering live on), hourly as tie-break.
    full = full.sort_values(["daily_wape", "hourly_wape"]).reset_index(drop=True)
    best = full.iloc[0]
    base_err = float(full[full["blend_w"] == 0.0]["daily_wape"].iloc[0])
    improvement = (base_err - float(best["daily_wape"])) / base_err if base_err else 0.0
    # Report: best blend per candidate plus the baseline row.
    report = full.loc[full.groupby("candidate")["daily_wape"].idxmin()].set_index("candidate").sort_values("daily_wape")
    ref = next(iter(preds.values()))
    anchor_row = {"blend_w": np.nan, "daily_wape": base_err,
                  "hourly_wape": float(full[full["blend_w"] == 0.0]["hourly_wape"].iloc[0]), "folds": int(best["folds"])}
    report.loc["store_forecast" if has_store else "baseline"] = anchor_row
    if has_store:
        report.loc["baseline"] = {"blend_w": np.nan, "daily_wape": daily_wape(ref, "transactions", "baseline"),
                                  "hourly_wape": wape(ref["transactions"], ref["baseline"]), "folds": int(best["folds"])}
    else:
        report.loc["baseline", "blend_w"] = 0.0
    report = report.sort_values("daily_wape")
    chosen = str(best["candidate"])
    w = float(best["blend_w"])
    if w == 0.0:
        notes.append("No candidate beat the store's own forecast out of sample; using the store's forecast as is."
                     if has_store else
                     "No candidate beat the weekday-hour average out of sample; forecasting from the baseline until more history accumulates.")
    kwargs = {"feature_set": candidates[chosen].get("feature_set", "full"), "params": candidates[chosen].get("params"),
              "blend_w": w, "anchor": anchor}
    p = preds[chosen].copy()
    p["blend"] = w * p["model"] + (1 - w) * p["anchor"]
    return Selection(chosen, w, kwargs, report, sched, p, _confidence(weeks, improvement), weeks, notes, anchor)
