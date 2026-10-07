from datetime import date

import pandas as pd

from flowcast.calendar_features import SchoolCalendar, daily_calendar_frame


def test_holidays_and_closures():
    cal = daily_calendar_frame(date(2026, 11, 20), date(2026, 12, 31), state="LA")
    tg = cal[cal["date"] == pd.Timestamp("2026-11-26")].iloc[0]
    assert tg["holiday_name"] == "Thanksgiving Day"
    assert tg["is_closed"] == 1
    xmas = cal[cal["date"] == pd.Timestamp("2026-12-25")].iloc[0]
    assert xmas["is_closed"] == 1
    eve = cal[cal["date"] == pd.Timestamp("2026-11-25")].iloc[0]
    assert eve["days_to_next_holiday"] == 1
    assert eve["is_closed"] == 0
    mardi = daily_calendar_frame(date(2026, 2, 17), date(2026, 2, 17), state="LA").iloc[0]
    assert mardi["holiday_name"] == "Mardi Gras" and mardi["is_closed"] == 0


def test_days_since_holiday_counts_forward():
    cal = daily_calendar_frame(date(2026, 7, 1), date(2026, 7, 10)).set_index("date")
    assert cal.loc["2026-07-03", "holiday_name"].startswith("Independence Day")  # observed Friday
    assert cal.loc["2026-07-06", "days_since_holiday"] == 2


def test_school_calendar_statuses_and_fallback():
    sc = SchoolCalendar.synthetic(date(2026, 1, 1), date(2026, 12, 31))
    assert sc.status(date(2026, 7, 15)) == "summer"
    assert sc.status(date(2026, 3, 12)) == "spring_break"
    assert sc.status(date(2026, 10, 6)) == "in_session"
    assert sc.status(date(2026, 10, 10)) == "weekend"
    # Dates outside the loaded range fall back to weekday heuristic.
    assert sc.status(date(2030, 4, 3)) == "in_session"
    assert sc.status(date(2030, 4, 6)) == "weekend"


def test_school_from_frame():
    sc = SchoolCalendar.from_frame(pd.DataFrame({"date": ["2026-05-01"], "status": ["teacher_day"]}))
    assert sc.status(date(2026, 5, 1)) == "teacher_day"
