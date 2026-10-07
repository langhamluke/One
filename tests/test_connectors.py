import json
from pathlib import Path

import pandas as pd
import pytest

from flowcast.connectors.events import hourly_event_pressure, load_events_csv
from flowcast.connectors.school import load_school_csv
from flowcast.connectors.weather import WEATHER_COLUMNS, parse_hourly, weather_features

FIX = Path(__file__).parent / "fixtures"


def test_parse_open_meteo_payload():
    w = parse_hourly(json.loads((FIX / "open_meteo_hourly.json").read_text()))
    assert list(w.columns) == WEATHER_COLUMNS
    assert len(w) == 4
    f = weather_features(w)
    assert f["is_raining"].tolist() == [0, 1, 1, 0]
    assert f["heavy_rain"].tolist() == [0, 0, 1, 0]
    assert f["is_storm"].tolist() == [0, 0, 1, 0]
    assert f["nice_day"].tolist() == [1, 0, 0, 1]


def test_event_pressure_decays_with_distance_and_spreads_over_window():
    hours = pd.date_range("2026-10-10 10:00", "2026-10-10 23:00", freq="h")
    near = pd.DataFrame([{
        "start": pd.Timestamp("2026-10-10 18:00"), "end": pd.Timestamp("2026-10-10 21:30"),
        "name": "game", "attendance": 100000, "distance_mi": 1.0, "category": "sports"}])
    far = near.assign(distance_mi=15.0)
    p_near = hourly_event_pressure(near, hours)
    p_far = hourly_event_pressure(far, hours)
    assert p_near.loc["2026-10-10 16:00"] > 0  # pre-game window
    assert p_near.loc["2026-10-10 12:00"] == 0
    assert p_near.sum() > 10 * p_far.sum()
    assert hourly_event_pressure(pd.DataFrame(), hours).sum() == 0


def test_csv_loaders(tmp_path):
    ev = tmp_path / "events.csv"
    ev.write_text("start,end,name,attendance,distance_mi,category\n2026-10-10 18:00,2026-10-10 21:00,game,50000,2,sports\n")
    assert len(load_events_csv(ev)) == 1
    sc = tmp_path / "school.csv"
    sc.write_text("date,status\n2026-10-12,holiday\n")
    assert load_school_csv(sc).status(pd.Timestamp("2026-10-12").date()) == "holiday"
    sc.write_text("date,status\n2026-10-12,bogus\n")
    with pytest.raises(ValueError):
        load_school_csv(sc)
