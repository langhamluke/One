"""School calendar ingestion.

Sources, in order of preference:
1. A district's published calendar exported to CSV (date,status). Nearly every
   district publishes a PDF/ICS calendar; converting one is a 10-minute task.
2. A commercial feed (e.g. Hazey Data covers 13k+ US districts day-by-day).
3. SchoolCalendar.synthetic() as a fallback for stores with no local data yet.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from flowcast.calendar_features import SCHOOL_STATUSES, SchoolCalendar


def load_school_csv(path: str | Path) -> SchoolCalendar:
    frame = pd.read_csv(path, parse_dates=["date"])
    bad = set(frame["status"]) - set(SCHOOL_STATUSES)
    if bad:
        raise ValueError(f"Unknown school statuses {sorted(bad)}; expected {SCHOOL_STATUSES}")
    return SchoolCalendar.from_frame(frame)
