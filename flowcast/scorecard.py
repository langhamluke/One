"""Employee scorecards and station assignment.

The premise from the floor: five people who are great at their stations beat
ten who are average. To act on that you need (1) an honest, per-station read
on each person and (2) a way to put the right people in the right place when
the forecast says it will matter.

Scores are relative to peers *at the same station*, so a fry cook is never
compared to a drive-thru order taker. Each metric is a z-score against the
station's crew, clipped and mapped to 0-100 with 50 = station average.
A person needs a minimum number of shifts at a station before a score shows;
below that the scorecard says "insufficient data" rather than guessing.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

MIN_SHIFTS = 4
WEIGHTS = {"throughput": 0.45, "speed": 0.30, "accuracy": 0.25}
SPECIALIST_THRESHOLD = 68.0
RELIABILITY_WEIGHT = 0.15


def _to_score(z: pd.Series) -> pd.Series:
    return (50 + 15 * z.clip(-3, 3)).round(1)


def station_scorecards(shifts: pd.DataFrame, lookback_days: int = 90) -> pd.DataFrame:
    """One row per (employee, station) with component and composite scores."""
    s = shifts.copy()
    s["date"] = pd.to_datetime(s["date"])
    s = s[s["date"] >= s["date"].max() - pd.Timedelta(days=lookback_days)]
    s["tx_per_hour"] = s["transactions_handled"] / s["hours"]

    # Normalize throughput for how busy the block was, otherwise whoever draws
    # Friday nights looks like a star.
    block_volume = s.groupby(["date", "block"])["transactions_handled"].transform("sum")
    s["tx_share"] = s["transactions_handled"] / block_volume.replace(0, np.nan)

    agg = (
        s.groupby(["employee_id", "station"])
        .agg(
            shifts=("date", "count"),
            tx_share=("tx_share", "mean"),
            tx_per_hour=("tx_per_hour", "mean"),
            avg_seconds=("avg_seconds", "mean"),
            error_rate=("error_rate", "mean"),
            late_rate=("late_or_noshow", "mean"),
        )
        .reset_index()
    )
    # Station-relative z-scores (higher is better for every component).
    g = agg.groupby("station")
    z_through = (agg["tx_share"] - g["tx_share"].transform("mean")) / g["tx_share"].transform("std").replace(0, np.nan)
    z_speed = -(agg["avg_seconds"] - g["avg_seconds"].transform("mean")) / g["avg_seconds"].transform("std").replace(0, np.nan)
    z_acc = -(agg["error_rate"] - g["error_rate"].transform("mean")) / g["error_rate"].transform("std").replace(0, np.nan)
    agg["throughput_score"] = _to_score(z_through.fillna(0))
    agg["speed_score"] = _to_score(z_speed.fillna(0))
    agg["accuracy_score"] = _to_score(z_acc.fillna(0))
    agg["composite"] = (
        WEIGHTS["throughput"] * agg["throughput_score"]
        + WEIGHTS["speed"] * agg["speed_score"]
        + WEIGHTS["accuracy"] * agg["accuracy_score"]
    ).round(1)
    agg["sufficient_data"] = agg["shifts"] >= MIN_SHIFTS
    agg.loc[~agg["sufficient_data"], ["throughput_score", "speed_score", "accuracy_score", "composite"]] = np.nan
    agg["specialist"] = agg["sufficient_data"] & (agg["composite"] >= SPECIALIST_THRESHOLD)
    return agg.sort_values(["station", "composite"], ascending=[True, False]).reset_index(drop=True)


def employee_summary(cards: pd.DataFrame) -> pd.DataFrame:
    """One row per employee: best station, specialist tags, overall and reliability."""
    valid = cards[cards["sufficient_data"]]
    rows = []
    for emp, grp in valid.groupby("employee_id"):
        best = grp.loc[grp["composite"].idxmax()]
        reliability = float(100 * (1 - grp["late_rate"].mean()))
        rows.append(
            {
                "employee_id": emp,
                "best_station": best["station"],
                "best_score": best["composite"],
                "specialist_in": ",".join(grp.loc[grp["specialist"], "station"]) or "-",
                "stations_rated": len(grp),
                "avg_composite": round(float(grp["composite"].mean()), 1),
                "reliability": round(reliability, 1),
                # Overall value: how good they are where they are good, with a
                # reliability haircut. Used for the "who do we actually need" list.
                "overall": round(
                    float(best["composite"]) * (1 - RELIABILITY_WEIGHT)
                    + reliability * RELIABILITY_WEIGHT,
                    1,
                ),
            }
        )
    return pd.DataFrame(rows).sort_values("overall", ascending=False).reset_index(drop=True)


def assign_stations(
    cards: pd.DataFrame,
    needs: dict[str, int],
    available: list[str],
    default_score: float = 45.0,
) -> pd.DataFrame:
    """Greedy best-fit assignment of available people to station needs.

    Fills the station slots in order of how much skill matters (highest spread
    of scores first), always taking the best remaining person. Greedy is fine
    at crew size; the point is to make the recommendation explainable:
    "E014 on bird because they are 23 points above the next option".
    """
    score = {
        (r.employee_id, r.station): (r.composite if r.sufficient_data else default_score)
        for r in cards.itertuples(index=False)
    }
    stations = [s for s, n in needs.items() if n > 0]
    spread = {
        s: np.nanstd([score.get((e, s), default_score) for e in available]) for s in stations
    }
    order = sorted(stations, key=lambda s: -spread[s])
    pool = list(available)
    rows = []
    for station in order:
        for slot in range(needs[station]):
            if not pool:
                rows.append({"station": station, "slot": slot + 1, "employee_id": None, "score": None, "gap_to_next": None})
                continue
            ranked = sorted(pool, key=lambda e: -score.get((e, station), default_score))
            pick = ranked[0]
            pick_score = score.get((pick, station), default_score)
            next_score = score.get((ranked[1], station), default_score) if len(ranked) > 1 else None
            pool.remove(pick)
            rows.append(
                {
                    "station": station,
                    "slot": slot + 1,
                    "employee_id": pick,
                    "score": round(float(pick_score), 1),
                    "gap_to_next": None if next_score is None else round(float(pick_score - next_score), 1),
                }
            )
    return pd.DataFrame(rows)
