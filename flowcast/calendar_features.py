"""Calendar signals: holidays, school sessions, and time-of-week encodings.

Every feature here is deterministic from a date, a region, and (optionally) a
school calendar. Nothing requires network access, so the same code runs in
training, backtests, and live forecasting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import holidays
import numpy as np
import pandas as pd

# Days most US restaurants close or run reduced hours. Store-specific overrides
# belong in StoreConfig.closed_dates, not here.
DEFAULT_CLOSED_HOLIDAYS = ("Thanksgiving Day", "Christmas Day")

# Holidays whose *eve* and *day* behave very differently for QSR traffic.
# Ranked by typical traffic effect (positive = busier than a normal day).
HOLIDAY_EFFECT_PRIOR = {
    "New Year's Day": -0.15,
    "Martin Luther King Jr. Day": 0.05,
    "Washington's Birthday": 0.05,
    "Memorial Day": 0.10,
    "Juneteenth National Independence Day": 0.03,
    "Independence Day": -0.20,
    "Labor Day": 0.08,
    "Columbus Day": 0.02,
    "Veterans Day": 0.03,
    "Thanksgiving Day": -1.0,
    "Mardi Gras": 0.15,
    "Good Friday": 0.05,
    "Election Day": 0.0,
    "Christmas Day": -1.0,
}


@dataclass
class SchoolCalendar:
    """Day-level classification for the school district(s) near a store.

    `days` maps date -> one of: in_session, weekend, holiday, winter_break,
    spring_break, summer, teacher_day. Unknown dates fall back to a weekday
    heuristic (in_session on Mon-Fri, weekend otherwise).
    """

    days: dict[date, str] = field(default_factory=dict)

    @classmethod
    def from_frame(cls, frame: pd.DataFrame) -> SchoolCalendar:
        """Build from a DataFrame with columns `date` and `status`."""
        days = {
            pd.Timestamp(row.date).date(): str(row.status) for row in frame.itertuples(index=False)
        }
        return cls(days=days)

    @classmethod
    def synthetic(cls, start: date, end: date) -> SchoolCalendar:
        """A plausible US K-12 calendar: mid-Aug to late May, with breaks."""
        days: dict[date, str] = {}
        d = start
        while d <= end:
            y = d.year
            status = "in_session"
            if d.weekday() >= 5:
                status = "weekend"
            elif date(y, 5, 24) <= d <= date(y, 8, 9):
                status = "summer"
            elif date(y, 12, 20) <= d or d <= date(y, 1, 4):
                status = "winter_break"
            elif date(y, 3, 10) <= d <= date(y, 3, 16):
                status = "spring_break"
            elif date(y, 11, 24) <= d <= date(y, 11, 28):
                status = "holiday"
            elif d in (date(y, 10, 10), date(y, 2, 16), date(y, 1, 19)):
                status = "teacher_day"
            days[d] = status
            d += timedelta(days=1)
        return cls(days=days)

    def status(self, d: date) -> str:
        if d in self.days:
            return self.days[d]
        return "weekend" if d.weekday() >= 5 else "in_session"


SCHOOL_STATUSES = (
    "in_session",
    "weekend",
    "holiday",
    "winter_break",
    "spring_break",
    "summer",
    "teacher_day",
)


def us_holidays(years: list[int], state: str | None = None) -> holidays.HolidayBase:
    """Federal plus state holidays (e.g. Mardi Gras in LA), observed dates included."""
    return holidays.US(years=years, subdiv=state, observed=True)


def daily_calendar_frame(
    start: date,
    end: date,
    school: SchoolCalendar | None = None,
    state: str | None = None,
    closed_dates: set[date] | None = None,
) -> pd.DataFrame:
    """One row per date with holiday and school features.

    Columns: date, dow, is_weekend, holiday_name, is_holiday, holiday_prior,
    days_to_next_holiday, days_since_holiday, school_status, school_in_session,
    is_closed, day_of_year, month, week_of_year.
    """
    dates = pd.date_range(start, end, freq="D")
    years = sorted({d.year for d in dates} | {end.year + 1})
    hol = us_holidays(years, state=state)
    school = school or SchoolCalendar()
    closed_dates = closed_dates or set()

    holiday_dates = sorted(pd.Timestamp(d) for d in hol)
    hol_index = pd.DatetimeIndex(holiday_dates)

    rows = []
    for ts in dates:
        d = ts.date()
        name = hol.get(d)
        name = name.split(" (")[0] if name else None
        # Distance to nearest upcoming/preceding holiday (capped at 30 days).
        pos = hol_index.searchsorted(ts)
        nxt = (hol_index[pos] - ts).days if pos < len(hol_index) else 30
        prv = (ts - hol_index[pos - 1]).days if pos > 0 else 30
        status = school.status(d)
        closed = d in closed_dates or (name in DEFAULT_CLOSED_HOLIDAYS)
        rows.append(
            {
                "date": ts.normalize(),
                "dow": ts.dayofweek,
                "is_weekend": int(ts.dayofweek >= 5),
                "holiday_name": name or "none",
                "is_holiday": int(name is not None),
                "holiday_prior": HOLIDAY_EFFECT_PRIOR.get(name or "", 0.0),
                "days_to_next_holiday": min(int(nxt), 30),
                "days_since_holiday": min(int(prv), 30),
                "school_status": status,
                "school_in_session": int(status == "in_session"),
                "is_closed": int(closed),
                "day_of_year": ts.dayofyear,
                "month": ts.month,
                "week_of_year": int(ts.isocalendar().week),
            }
        )
    return pd.DataFrame(rows)


def cyclical(values: pd.Series | np.ndarray, period: float) -> tuple[np.ndarray, np.ndarray]:
    """Sine/cosine encoding so that hour 23 is close to hour 0, Dec close to Jan."""
    v = np.asarray(values, dtype=float)
    ang = 2 * np.pi * v / period
    return np.sin(ang), np.cos(ang)
