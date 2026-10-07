"""Open-Meteo weather connector (historical archive + 16-day forecast).

Open-Meteo is keyless and free for non-commercial use, with paid tiers for
commercial deployments. The archive endpoint provides hourly history back to
1940 at ~10 km resolution, which is what a model needs to learn weather
elasticity from a store's POS history; the forecast endpoint feeds live
predictions. Both return the same hourly schema so one parser serves both.

The parser is pure so it can be tested on recorded fixtures without network.
"""

from __future__ import annotations

from datetime import date

import httpx
import pandas as pd

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

HOURLY_VARS = [
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "snowfall",
    "weather_code",
    "wind_speed_10m",
    "cloud_cover",
]

WEATHER_COLUMNS = [
    "ts",
    "temp_f",
    "feels_like_f",
    "precip_in",
    "rain_in",
    "snow_in",
    "weather_code",
    "wind_mph",
    "cloud_pct",
]


def parse_hourly(payload: dict) -> pd.DataFrame:
    """Normalize an Open-Meteo hourly payload into the flowcast weather schema."""
    h = payload["hourly"]
    frame = pd.DataFrame(
        {
            "ts": pd.to_datetime(h["time"]),
            "temp_f": h["temperature_2m"],
            "feels_like_f": h.get("apparent_temperature", h["temperature_2m"]),
            "precip_in": h.get("precipitation", [0.0] * len(h["time"])),
            "rain_in": h.get("rain", h.get("precipitation", [0.0] * len(h["time"]))),
            "snow_in": h.get("snowfall", [0.0] * len(h["time"])),
            "weather_code": h.get("weather_code", [0] * len(h["time"])),
            "wind_mph": h.get("wind_speed_10m", [0.0] * len(h["time"])),
            "cloud_pct": h.get("cloud_cover", [0.0] * len(h["time"])),
        }
    )
    frame = frame.astype(
        {
            "temp_f": float,
            "feels_like_f": float,
            "precip_in": float,
            "rain_in": float,
            "snow_in": float,
            "weather_code": int,
            "wind_mph": float,
            "cloud_pct": float,
        }
    )
    return frame[WEATHER_COLUMNS]


def _params(lat: float, lon: float, tz: str) -> dict:
    return {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(HOURLY_VARS),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": tz,
    }


def fetch_history(
    lat: float, lon: float, start: date, end: date, tz: str = "America/Chicago",
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """Hourly observed weather (reanalysis) for a date range."""
    params = _params(lat, lon, tz) | {"start_date": start.isoformat(), "end_date": end.isoformat()}
    c = client or httpx.Client(timeout=30)
    r = c.get(ARCHIVE_URL, params=params)
    r.raise_for_status()
    return parse_hourly(r.json())


def fetch_forecast(
    lat: float, lon: float, days: int = 7, tz: str = "America/Chicago",
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """Hourly forecast for the next `days` days (max 16)."""
    params = _params(lat, lon, tz) | {"forecast_days": min(days, 16)}
    c = client or httpx.Client(timeout=30)
    r = c.get(FORECAST_URL, params=params)
    r.raise_for_status()
    return parse_hourly(r.json())


def weather_features(weather: pd.DataFrame) -> pd.DataFrame:
    """Derived flags the model and the humans both understand."""
    w = weather.copy()
    w["is_raining"] = (w["rain_in"] > 0.01).astype(int)
    w["heavy_rain"] = (w["rain_in"] > 0.10).astype(int)
    w["is_snowing"] = (w["snow_in"] > 0.0).astype(int)
    w["is_storm"] = w["weather_code"].isin([95, 96, 99]).astype(int)
    w["extreme_heat"] = (w["feels_like_f"] >= 98).astype(int)
    w["extreme_cold"] = (w["feels_like_f"] <= 25).astype(int)
    # "Nice day": mild, dry, not too windy. Drives patio/dine-in and foot traffic.
    w["nice_day"] = (
        w["temp_f"].between(62, 85) & (w["precip_in"] < 0.01) & (w["wind_mph"] < 18)
    ).astype(int)
    return w
