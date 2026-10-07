"""Synthetic QSR store simulator.

Generates hourly transactions for a chicken-finger style quick-service store
with the drivers the product is built around baked in: time-of-day and
day-of-week curves, weather elasticity, school calendar, holidays, local
events, slow growth, and Poisson noise. Also emits weather, events, a menu
mix, and employee shift records so every downstream module can be exercised
end to end before a real POS feed exists.

Nothing here is tuned to look good for the model: the effects are set from
operator intuition (rain hurts, Friday after a home game is a wall of cars)
and the forecaster has to discover them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd

from flowcast.calendar_features import SchoolCalendar, daily_calendar_frame
from flowcast.connectors.events import hourly_event_pressure
from flowcast.connectors.weather import WEATHER_COLUMNS

OPEN_HOUR = 10
CLOSE_HOUR = 24  # exclusive; store serves 10:00-23:59


@dataclass
class StoreConfig:
    name: str = "Store 0001"
    lat: float = 30.4515
    lon: float = -91.1871
    tz: str = "America/Chicago"
    state: str = "LA"
    open_hour: int = OPEN_HOUR
    close_hour: int = CLOSE_HOUR
    base_daily_tx: float = 1400.0  # transactions on an average Tuesday
    closed_dates: set[date] = field(default_factory=set)

    @property
    def hours(self) -> list[int]:
        return list(range(self.open_hour, self.close_hour))


# Share of the day's transactions in each hour on a weekday (sums to 1).
WEEKDAY_CURVE = {
    10: 0.025, 11: 0.075, 12: 0.120, 13: 0.095, 14: 0.055, 15: 0.050, 16: 0.055,
    17: 0.095, 18: 0.120, 19: 0.105, 20: 0.080, 21: 0.060, 22: 0.040, 23: 0.025,
}
WEEKEND_CURVE = {
    10: 0.020, 11: 0.060, 12: 0.100, 13: 0.100, 14: 0.075, 15: 0.065, 16: 0.065,
    17: 0.085, 18: 0.105, 19: 0.100, 20: 0.085, 21: 0.065, 22: 0.045, 23: 0.030,
}
DOW_MULT = {0: 0.88, 1: 0.90, 2: 0.95, 3: 1.02, 4: 1.22, 5: 1.28, 6: 1.05}

MENU_MIX = {
    # item: (share of transactions that include it, avg qty per order containing it)
    "box_combo": (0.42, 1.1),
    "3_finger_combo": (0.28, 1.1),
    "caniac_combo": (0.08, 1.0),
    "kids_combo": (0.07, 1.2),
    "sandwich_combo": (0.09, 1.0),
    "tailgate_25": (0.015, 1.0),
    "extra_sauce": (0.30, 1.4),
    "lemonade": (0.38, 1.2),
    "sweet_tea": (0.25, 1.2),
    "fountain_drink": (0.30, 1.3),
}

STATIONS = [
    "drive_thru_order",
    "drive_thru_window",
    "front_counter",
    "fry",
    "bird",
    "boxing",
    "dining_room",
]


def synthetic_weather(dates: pd.DatetimeIndex, rng: np.random.Generator) -> pd.DataFrame:
    """Gulf-South-ish weather: hot humid summers, mild winters, frequent showers."""
    rows = []
    for d in dates:
        doy = d.dayofyear
        season = -np.cos(2 * np.pi * (doy - 15) / 365.25)  # -1 mid-Jan, +1 mid-Jul
        day_mean = 67 + 17 * season + rng.normal(0, 5)
        rain_day = rng.random() < (0.30 + 0.10 * max(season, 0))
        storm_day = rain_day and rng.random() < 0.25
        rain_start = int(rng.integers(0, 24))
        rain_len = int(rng.integers(1, 7))
        cloud_base = rng.uniform(10, 90) if not rain_day else rng.uniform(60, 100)
        for h in range(24):
            diurnal = -np.cos(2 * np.pi * (h - 4) / 24)  # low ~4am, high ~4pm
            temp = day_mean + 8 * diurnal + rng.normal(0, 1.2)
            raining = rain_day and rain_start <= h < rain_start + rain_len
            rain = float(rng.gamma(1.5, 0.08)) if raining else 0.0
            code = 0
            if raining:
                code = 95 if storm_day else (63 if rain > 0.1 else 61)
            elif cloud_base > 70:
                code = 3
            rows.append(
                {
                    "ts": d + pd.Timedelta(hours=h),
                    "temp_f": round(temp, 1),
                    "feels_like_f": round(temp + (6 if temp > 85 else -3 if temp < 45 else 0), 1),
                    "precip_in": round(rain, 3),
                    "rain_in": round(rain, 3),
                    "snow_in": 0.0,
                    "weather_code": code,
                    "wind_mph": round(abs(rng.normal(7, 4)) + (10 if storm_day and raining else 0), 1),
                    "cloud_pct": round(min(100, cloud_base + rng.normal(0, 8)), 1),
                }
            )
    return pd.DataFrame(rows)[WEATHER_COLUMNS]


def synthetic_events(dates: pd.DatetimeIndex, rng: np.random.Generator) -> pd.DataFrame:
    """A college football home schedule, some concerts, and a spring festival."""
    rows = []
    for d in dates:
        y = d.year
        # Home football: ~7 Saturdays Sept-Nov, 6:00pm or 2:30pm kickoff.
        if d.dayofweek == 5 and d.month in (9, 10, 11) and rng.random() < 0.55:
            kick = 18 if rng.random() < 0.6 else 14
            rows.append(
                {
                    "start": d + pd.Timedelta(hours=kick),
                    "end": d + pd.Timedelta(hours=kick + 3, minutes=30),
                    "name": f"Home football {d.date()}",
                    "attendance": int(rng.integers(55000, 102000)),
                    "distance_mi": 2.1,
                    "category": "sports",
                }
            )
        # Arena concerts: a couple a month, weeknights or weekends.
        if rng.random() < 0.07:
            rows.append(
                {
                    "start": d + pd.Timedelta(hours=19, minutes=30),
                    "end": d + pd.Timedelta(hours=22, minutes=30),
                    "name": f"Arena show {d.date()}",
                    "attendance": int(rng.integers(6000, 14000)),
                    "distance_mi": 4.5,
                    "category": "concert",
                }
            )
        # Spring festival weekend, late April.
        if d.month == 4 and 22 <= d.day <= 24 and d.dayofweek in (4, 5, 6):
            rows.append(
                {
                    "start": d + pd.Timedelta(hours=11),
                    "end": d + pd.Timedelta(hours=22),
                    "name": f"Spring festival {y}",
                    "attendance": 25000,
                    "distance_mi": 1.2,
                    "category": "festival",
                }
            )
    return pd.DataFrame(rows, columns=["start", "end", "name", "attendance", "distance_mi", "category"])


def _hourly_multiplier(w: pd.Series, school_status: str, hour: int) -> float:
    m = 1.0
    if w["rain_in"] > 0.1:
        m *= 0.78
    elif w["rain_in"] > 0.01:
        m *= 0.90
    if w["weather_code"] in (95, 96, 99):
        m *= 0.85
    if w["feels_like_f"] >= 98:
        m *= 0.93
    if w["feels_like_f"] <= 25:
        m *= 0.90
    if 62 <= w["temp_f"] <= 85 and w["precip_in"] < 0.01:
        m *= 1.06
    if school_status == "in_session" and hour in (15, 16):
        m *= 1.25  # after-school rush
    if school_status in ("summer", "winter_break", "spring_break", "holiday", "teacher_day"):
        if 11 <= hour <= 15:
            m *= 1.12
        if hour in (15, 16):
            m *= 0.95
    return m


def generate_store(
    config: StoreConfig,
    start: date,
    end: date,
    seed: int = 7,
    annual_growth: float = 0.06,
) -> dict[str, pd.DataFrame | SchoolCalendar]:
    """Return hourly transactions plus all supporting data for one store."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(start, end, freq="D")
    school = SchoolCalendar.synthetic(start - timedelta(days=400), end + timedelta(days=400))
    cal = daily_calendar_frame(start, end, school=school, state=config.state,
                               closed_dates=config.closed_dates)
    weather = synthetic_weather(dates, rng).set_index("ts")
    events = synthetic_events(dates, rng)
    hours_index = pd.DatetimeIndex(
        [d + pd.Timedelta(hours=h) for d in dates for h in config.hours]
    )
    pressure = hourly_event_pressure(events, hours_index)

    rows = []
    for cal_row in cal.itertuples(index=False):
        d: pd.Timestamp = cal_row.date
        day_idx = (d - pd.Timestamp(start)).days
        growth = (1 + annual_growth) ** (day_idx / 365.25)
        curve = WEEKEND_CURVE if cal_row.is_weekend else WEEKDAY_CURVE
        daily = config.base_daily_tx * DOW_MULT[cal_row.dow] * growth
        if cal_row.is_closed:
            daily = 0.0
        else:
            daily *= 1 + cal_row.holiday_prior
            if cal_row.days_to_next_holiday == 1 and cal_row.holiday_name == "none":
                daily *= 1.08  # holiday eve
        # Store-level noise day to day (a bus of a youth team, a water main break).
        daily *= float(np.exp(rng.normal(0, 0.06)))
        for h in config.hours:
            ts = d + pd.Timedelta(hours=h)
            w = weather.loc[ts]
            mult = _hourly_multiplier(w, cal_row.school_status, h)
            ev = pressure.get(ts, 0.0)
            mult *= 1 + min(ev / 60000.0, 0.9)  # 100k-person game 2 mi away ~ +50-60%
            lam = max(daily * curve[h] * mult, 0.0)
            tx = int(rng.poisson(lam)) if lam > 0 else 0
            rows.append({"ts": ts, "transactions": tx})
    tx_frame = pd.DataFrame(rows)
    tx_frame["net_sales"] = (tx_frame["transactions"] * rng.normal(14.2, 0.6, len(tx_frame))).round(2)

    return {
        "transactions": tx_frame,
        "weather": weather.reset_index(),
        "events": events,
        "calendar": cal,
        "school": school,
        "item_sales": synthetic_item_sales(tx_frame, rng),
        "shifts": synthetic_shifts(tx_frame, rng, config),
    }


def synthetic_item_sales(tx: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Daily item quantities consistent with the transaction counts."""
    daily = tx.groupby(tx["ts"].dt.normalize())["transactions"].sum()
    rows = []
    for d, n in daily.items():
        for item, (share, qty) in MENU_MIX.items():
            orders = rng.binomial(int(n), share)
            rows.append({"date": d, "item": item, "qty": round(orders * qty)})
    return pd.DataFrame(rows)


def synthetic_shifts(tx: pd.DataFrame, rng: np.random.Generator, config: StoreConfig,
                     n_employees: int = 28) -> pd.DataFrame:
    """Shift-level performance records for a crew with real skill differences.

    Each employee gets a latent skill per station. Observed metrics are noisy
    functions of that skill so the scorecard has something to recover.
    """
    emp_ids = [f"E{i:03d}" for i in range(1, n_employees + 1)]
    skill = {e: {s: float(np.clip(rng.normal(0.0, 0.8), -2, 2)) for s in STATIONS} for e in emp_ids}
    reliability = {e: float(np.clip(rng.beta(8, 1.5), 0.5, 1.0)) for e in emp_ids}
    daily = tx.groupby(tx["ts"].dt.normalize())["transactions"].sum()
    rows = []
    for d, n in daily.items():
        if n == 0:
            continue
        for block, (bh, eh) in {"open": (10, 16), "close": (16, 24)}.items():
            block_tx = int(tx[(tx["ts"].dt.normalize() == d) & tx["ts"].dt.hour.between(bh, eh - 1)]["transactions"].sum())
            crew = rng.choice(emp_ids, size=min(9, n_employees), replace=False)
            for i, e in enumerate(crew):
                station = STATIONS[i % len(STATIONS)]
                s = skill[e][station]
                # Throughput handled by this person vs the station's share of volume.
                base_share = 1.0 / 2.0 if station in ("fry", "bird", "boxing") else 1.0 / 3.0
                handled = block_tx * base_share * float(np.exp(0.10 * s + rng.normal(0, 0.06)))
                speed_s = float(np.clip(rng.normal(52 - 7 * s, 5), 20, 120))
                error_rate = float(np.clip(rng.normal(0.025 - 0.007 * s, 0.006), 0.0, 0.2))
                late = int(rng.random() > reliability[e])
                rows.append(
                    {
                        "date": d,
                        "block": block,
                        "employee_id": e,
                        "station": station,
                        "hours": eh - bh,
                        "transactions_handled": round(handled, 1),
                        "avg_seconds": round(speed_s, 1),
                        "error_rate": round(error_rate, 4),
                        "late_or_noshow": late,
                    }
                )
    return pd.DataFrame(rows)
