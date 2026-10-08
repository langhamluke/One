"""Translate an hourly forecast into station-level staffing needs.

Labor standards are expressed as *transactions per labor hour* for each
station, with a floor (you cannot run the window with zero people) and a
ceiling (a fourth person on fry adds nothing). Standards are the tunable part
of this file; a store or brand should fit them from its own throughput data,
and the scorecard module gives the per-person actuals to do that.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class LaborStandard:
    station: str
    tx_per_labor_hour: float  # throughput one competent person sustains
    min_staff: int
    max_staff: int
    # Share of hourly transactions that touch this station (drive-thru vs lobby).
    channel_share: float = 1.0

    def need(self, tx_hour: float) -> int:
        load = tx_hour * self.channel_share / self.tx_per_labor_hour
        # Core stations round up: once one person is committed, any
        # overflow needs a second. Optional stations (min 0) open only
        # when at least half a person's worth of work exists.
        n = int(np.ceil(load)) if self.min_staff >= 1 else int(np.ceil(load - 0.5))
        return int(np.clip(n, self.min_staff, self.max_staff))


@dataclass(frozen=True)
class LookupStandard:
    """A station staffed from the operator's own deployment chart.

    `bands` maps half-hour guest counts to crew: a sorted tuple of
    (guests_from, crew). Learned from the store's planned deployment in
    its weekly workbooks (see connectors.canes_workbook), so the plan uses
    the same positions and thresholds the store already schedules by.
    """

    station: str
    bands: tuple[tuple[float, float], ...]

    def need(self, tx_hour: float) -> int:
        half_hour = tx_hour / 2.0
        crew = 0.0
        for start, c in self.bands:
            if half_hour >= start:
                crew = c
            else:
                break
        return int(np.ceil(crew - 1e-9))


def standards_from_frame(df: pd.DataFrame) -> list[LookupStandard]:
    """Build lookup standards from labor_standards.csv (station, guests_from, crew)."""
    out = []
    for st, g in df.sort_values(["station", "guests_from"]).groupby("station", sort=False):
        out.append(LookupStandard(str(st), tuple((float(a), float(b)) for a, b in zip(g["guests_from"], g["crew"], strict=True))))
    return out


DEFAULT_STANDARDS: list[LaborStandard] = [
    LaborStandard("drive_thru_order", 45, 1, 3, channel_share=0.70),
    LaborStandard("drive_thru_window", 50, 1, 2, channel_share=0.70),
    LaborStandard("front_counter", 35, 1, 3, channel_share=0.30),
    LaborStandard("fry", 60, 1, 3),
    LaborStandard("bird", 55, 1, 3),
    LaborStandard("boxing", 45, 1, 4),
    LaborStandard("dining_room", 90, 0, 2, channel_share=0.30),
]

MANAGER_PER_HOUR = 1


def staffing_plan(
    hourly_forecast: pd.DataFrame,
    standards: list[LaborStandard] = DEFAULT_STANDARDS,
    forecast_col: str = "forecast",
    buffer: float = 0.05,
) -> pd.DataFrame:
    """Hour x station headcount. `buffer` pads the forecast so the plan
    protects speed of service on an average miss, without scheduling for p90."""
    f = hourly_forecast.copy()
    f["ts"] = pd.to_datetime(f["ts"])
    rows = []
    for row in f.itertuples(index=False):
        tx = float(getattr(row, forecast_col)) * (1 + buffer)
        plan = {"ts": row.ts}
        if tx <= 0:
            for s in standards:
                plan[s.station] = 0
            plan["manager"] = 0
            plan["total"] = 0
            rows.append(plan)
            continue
        total = MANAGER_PER_HOUR
        for s in standards:
            need = s.need(tx)
            plan[s.station] = need
            total += need
        plan["manager"] = MANAGER_PER_HOUR
        plan["total"] = total
        rows.append(plan)
    return pd.DataFrame(rows)


def compare_plans(plan_a: pd.DataFrame, plan_b: pd.DataFrame, wage: float = 14.50) -> dict:
    """Labor-hour and dollar delta between two plans (e.g. baseline vs model)."""
    hours_a = float(plan_a["total"].sum())
    hours_b = float(plan_b["total"].sum())
    return {
        "labor_hours_a": hours_a,
        "labor_hours_b": hours_b,
        "delta_hours": hours_b - hours_a,
        "delta_dollars": (hours_b - hours_a) * wage,
    }


def realized_labor_cost(
    actual_tx: pd.DataFrame, plan: pd.DataFrame, standards=DEFAULT_STANDARDS, wage: float = 14.50
) -> dict:
    """Score a plan against what actually happened.

    over_hours: scheduled people the volume did not need (sent home or idle).
    under_hours: people the volume needed that were not scheduled (slow service,
    lost sales). Both are costs; a forecast is good when it keeps both small.
    """
    ideal = staffing_plan(actual_tx.rename(columns={"transactions": "forecast"}), standards, buffer=0.0)
    merged = plan.merge(ideal, on="ts", suffixes=("_plan", "_ideal"))
    diff = merged["total_plan"] - merged["total_ideal"]
    over = float(diff.clip(lower=0).sum())
    under = float((-diff).clip(lower=0).sum())
    return {
        "over_hours": over,
        "under_hours": under,
        "over_cost": over * wage,
        "under_hours_pct": under / max(float(merged["total_ideal"].sum()), 1.0),
    }


def labor_vs_target(daily: pd.DataFrame, wage: float = 16.50) -> dict | None:
    """What forecast misses cost, from the store's own labor records.

    `daily` needs: projected, actual (customers), scheduled_hours, actual_hours,
    target_hours_actual (crew hours the store's labor matrix allows for the
    customers who actually came). Each day splits into:

      planning gap      = scheduled - allowed   (the schedule was built for the wrong day)
      manager adjustment = actual - scheduled    (sent home / called in during the day)
      remaining gap     = actual - allowed      (what was still off at close)

    Days are bucketed by how far the store's projection missed, so the hours
    tied to forecast misses can be read directly.
    """
    need = ["projected", "actual", "scheduled_hours", "actual_hours", "target_hours_actual"]
    if daily is None or any(c not in daily for c in need):
        return None
    d = daily.dropna(subset=need).copy()
    if len(d) < 14:
        return None
    d["planning_gap"] = d["scheduled_hours"] - d["target_hours_actual"]
    d["adjustment"] = d["actual_hours"] - d["scheduled_hours"]
    d["remaining_gap"] = d["actual_hours"] - d["target_hours_actual"]
    d["miss"] = (d["projected"] - d["actual"]) / d["actual"]
    d["bucket"] = np.select([d["miss"] > 0.10, d["miss"] < -0.10], ["over-forecast >10%", "under-forecast >10%"], "within 10%")
    rows = []
    for b in ("over-forecast >10%", "within 10%", "under-forecast >10%"):
        g = d[d["bucket"] == b]
        if g.empty:
            continue
        rows.append({"days": len(g), "bucket": b, "planning_gap": g["planning_gap"].mean(),
                     "adjustment": g["adjustment"].mean(), "remaining_gap": g["remaining_gap"].mean()})
    by_bucket = pd.DataFrame(rows)
    base = d.loc[d["bucket"] == "within 10%", "remaining_gap"].mean() if (d["bucket"] == "within 10%").any() else 0.0
    over = d[d["bucket"] == "over-forecast >10%"]
    under = d[d["bucket"] == "under-forecast >10%"]
    excess_over = float((over["remaining_gap"] - base).clip(lower=0).sum())
    short_under = float((base - under["remaining_gap"]).clip(lower=0).sum())
    span_days = (d.index.max() - d.index.min()).days + 1 if isinstance(d.index, pd.DatetimeIndex) else len(d)
    per_year = 365.0 / max(span_days, 1)
    return {
        "days": len(d),
        "first": str(d.index.min())[:10] if isinstance(d.index, pd.DatetimeIndex) else "",
        "last": str(d.index.max())[:10] if isinstance(d.index, pd.DatetimeIndex) else "",
        "by_bucket": by_bucket,
        "share_days_missed_10": float((d["bucket"] != "within 10%").mean()),
        "mean_remaining_gap": float(d["remaining_gap"].mean()),
        "excess_hours_on_over_forecast_days": excess_over,
        "short_hours_on_under_forecast_days": short_under,
        "excess_dollars_per_year": excess_over * wage * per_year,
        "wage": wage,
    }
