"""Local events: anything that moves people near the store.

Schema (one row per event):
    start (datetime), end (datetime), name, attendance (int),
    distance_mi (float), category (sports|concert|festival|school|community|other)

Sources: PredictHQ (paid, enriched with predicted attendance), Ticketmaster
Discovery API, university athletic calendars, city event pages, or a manager
typing in "homecoming game Friday". The model consumes an hourly *pressure*
number, so the source does not matter as long as attendance and distance are
roughly right.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

EVENT_COLUMNS = ["start", "end", "name", "attendance", "distance_mi", "category"]


def load_events_csv(path: str | Path) -> pd.DataFrame:
    frame = pd.read_csv(path, parse_dates=["start", "end"])
    missing = set(EVENT_COLUMNS) - set(frame.columns)
    if missing:
        raise ValueError(f"Events file missing columns {sorted(missing)}")
    return frame[EVENT_COLUMNS]


def hourly_event_pressure(
    events: pd.DataFrame, hours: pd.DatetimeIndex, pre_hours: int = 2, post_hours: int = 2
) -> pd.Series:
    """Attendance-weighted, distance-decayed pressure for each hour.

    An event contributes during its run time plus a pre/post window (people eat
    before and after). Pressure decays with distance: a 20k-person game 1 mile
    away matters far more than the same game 15 miles away.
    """
    pressure = pd.Series(0.0, index=hours)
    if events is None or events.empty:
        return pressure
    for ev in events.itertuples(index=False):
        decay = 1.0 / (1.0 + (float(ev.distance_mi) / 3.0) ** 2)
        window_start = ev.start - pd.Timedelta(hours=pre_hours)
        window_end = ev.end + pd.Timedelta(hours=post_hours)
        mask = (hours >= window_start.floor("h")) & (hours <= window_end.floor("h"))
        if not mask.any():
            continue
        # Spread attendance across the window so a 6-hour festival does not
        # look like a 1-hour stadium exit.
        n = int(mask.sum())
        pressure[mask] += float(ev.attendance) * decay / max(np.sqrt(n), 1.0)
    return pressure
