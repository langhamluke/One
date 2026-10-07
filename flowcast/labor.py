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
            load = tx * s.channel_share / s.tx_per_labor_hour
            # Core stations round up: once one person is committed, any
            # overflow needs a second. Optional stations (min 0) open only
            # when at least half a person's worth of work exists.
            need = int(np.ceil(load)) if s.min_staff >= 1 else int(np.ceil(load - 0.5))
            need = int(np.clip(need, s.min_staff, s.max_staff))
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
