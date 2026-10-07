# Loading real store data

The interface runs on a simulated store until you point it at exports. Put
CSV files in one directory and set `FLOWCAST_DATA_DIR` to it. Only
`transactions.csv` is required; the Admin page lists which optional files
the app is substituting.

## transactions.csv (required)

One row per store-hour. Hours the store is closed can be omitted or zero.

```
ts,transactions,net_sales
2025-09-01 10:00,41,588.20
2025-09-01 11:00,117,1702.11
```

- `ts`: local time, hour start, `YYYY-MM-DD HH:MM`.
- `transactions`: count of checks/orders in that hour.
- `net_sales`: optional.

If the POS export is per-transaction (one row per check with a timestamp),
aggregate it first with a few lines of pandas:

```python
import pandas as pd
t = pd.read_csv("checks.csv", parse_dates=["closed_at"])
h = t.set_index("closed_at").resample("h").agg(transactions=("check_id", "count"), net_sales=("total", "sum"))
h = h[h.index.hour.isin(range(10, 24))].reset_index().rename(columns={"closed_at": "ts"})
h.to_csv("data/longmont/transactions.csv", index=False)
```

12 months of history is the target; 6 months works for a first backtest.
The model needs at least 4 weeks before it can forecast at all.

## weather.csv (optional, recommended)

Fetch it from Open-Meteo for the store's coordinates. Longmont, CO is
40.1672, -105.1019:

```bash
flowcast weather-history 40.1672 -105.1019 2025-09-01 2026-10-06 --tz America/Denver --out data/longmont/weather.csv
```

Columns: `ts,temp_f,feels_like_f,precip_in,rain_in,snow_in,weather_code,wind_mph,cloud_pct`.
Without it the app uses synthetic weather and the weather features are noise.

## school.csv (optional, recommended)

St. Vrain Valley Schools publishes its calendar as a PDF; transcribe the
breaks into day statuses. One row per date; dates not listed default to
in-session on weekdays.

```
date,status
2025-11-24,holiday
2025-11-25,holiday
2025-12-22,winter_break
2026-03-16,spring_break
2026-05-28,summer
```

Statuses: `in_session, weekend, holiday, winter_break, spring_break, summer, teacher_day`.

## events.csv (optional)

Anything that moves people near the store: CU Boulder home games (about 14
miles), Boulder County Fair, Longmont Rhythm on the River, high school
football at Everly-Montgomery Field.

```
start,end,name,attendance,distance_mi,category
2025-10-04 13:30,2025-10-04 17:00,CU vs BYU (Folsom Field),50000,14.0,sports
2026-07-30 10:00,2026-08-02 22:00,Boulder County Fair,30000,2.5,festival
```

Managers can also add events from the Forecast page; those live in the
database and survive restarts.

## item_sales.csv (optional)

Daily quantity per menu item, used to measure the menu mix for ordering.

```
date,item,qty
2025-09-01,box_combo,612
2025-09-01,3_finger_combo,401
```

Item names must match the keys in the bill of materials in
`flowcast/ordering.py`, or extend it with the store's own items.

## shifts.csv (optional, needed for scorecards)

One row per employee per shift block per station. Without it the People
page shows staffing but no scorecards or lineup.

```
date,block,employee_id,station,hours,transactions_handled,avg_seconds,error_rate,late_or_noshow
2026-09-12,close,E014,drive_thru_window,8,412,47.5,0.012,0
```

- `station`: one of `drive_thru_order, drive_thru_window, front_counter, fry, bird, boxing, dining_room`.
- `transactions_handled`: orders that passed through this person (from the
  POS cashier ID, drive-thru timer, or KDS bump log).
- `avg_seconds`: average service time attributable to them.
- `error_rate`: voids/remakes over orders.
- Use IDs, not names.

## Run

```bash
export FLOWCAST_DATA_DIR=data/longmont
export FLOWCAST_STORE_NAME="Longmont, CO" FLOWCAST_STORE_LAT=40.1672 FLOWCAST_STORE_LON=-105.1019
export FLOWCAST_STORE_TZ=America/Denver FLOWCAST_STORE_STATE=CO
export FLOWCAST_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export FLOWCAST_ADMIN_PASSWORD='change-me-Right-Away-1'
flowcast serve --insecure-dev        # local http for a first look; see SECURITY.md before anything wider
```

The first screen to read is the Forecast page's "Hourly error by condition"
chart. If the model is not clearly beating the 4-week average on rain and
event hours with real data, nothing else matters yet.
