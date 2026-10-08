# Loading real store data

## Raising Cane's weekly labor workbooks (fastest path)

If you have the store's weekly labor workbooks (one `.xlsx` per week, tabs
`LABOR TRACKER`, `Weds` ... `Tues`), import them directly. Run this on your
own computer; nothing is uploaded anywhere.

```bash
git clone https://github.com/langhamluke/One.git && cd One
python3 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/flowcast import-canes "~/Desktop/Canes Project copy/data" --out data/longmont
.venv/bin/flowcast evaluate --data-dir data/longmont
FLOWCAST_DATA_DIR=data/longmont FLOWCAST_ADMIN_PASSWORD='pick-Something-Long-1' .venv/bin/flowcast serve --insecure-dev
```

What the import reads, and what it does with it:

| From the workbook | Becomes |
|---|---|
| LABOR TRACKER, "Actual Customers" per day | The truth the model is trained and scored on. Zero or blank means the week was not closed out; those days are left out, never filled with the projection. |
| LABOR TRACKER, "Projected Customers" | The store's own forecast, used as a model input and as the number to beat. |
| Day tabs, half-hour Time / Sales / Guests | The store forecast by hour, and the within-day shape used to spread each day's actual total across hours. |
| Day tabs, crew per station (Bird, Board, DT order, ...) | `labor_standards.csv`: the store's deployment chart, learned from every week, replacing the generic staffing standards. |
| File name and folder (`data/2025/Q1/P2/P2W1 2.5 - 2.11.xlsx`) | The week's dates. Every store week starts on a Wednesday; anything else is flagged. Undated files like `P7W4.xlsx` are dated from sibling weeks. |

Things to know:

- **Accuracy is scored on daily totals only.** The workbooks have actual
  customers per day, not per hour. Hourly "actuals" are the day's real
  total spread by the store's own half-hour forecast, so hourly error would
  only measure the store's shape. `evaluate` and the Overview page show the
  daily comparison: model vs the store's forecast vs the 4-week average.
- **Wednesdays are included.** The tab is named `Weds`; earlier notebooks
  looked for `Wed` and silently dropped every Wednesday.
- **After-midnight slots** (Fri/Sat late night, stored by Excel as
  1900-01-01 times) are kept with the right business day. The model covers
  10:00 to midnight; the import reports what share of guests falls outside
  that window (about half a percent at Longmont).
- **Closed days** (no projection and no forecast, e.g. Thanksgiving) are
  read from the data and marked closed for the model.
- **School calendar:** a St. Vrain calendar is bundled in
  `flowcast/reference/st_vrain_school_calendar.csv`. It was compiled from
  third-party listings because the district site could not be reached;
  several dates are marked low confidence and 2024-25 spring break is
  missing. Check it against svvsd.org and edit the file.
- **Weather** for the imported dates is fetched from Open-Meteo during the
  import (`--no-weather` to skip). Only the store's coordinates and a date
  range are sent.
- `import_report.json` in the output folder lists every week imported, days
  missing actuals, weeks with no workbook, skipped files and why, and any
  workbook whose half-hour guests disagree with its daily projection.
- The `data/` folder is ignored by git, so imported store data cannot be
  committed by accident.

## Any other POS export

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

## Check the data before serving it

```bash
flowcast evaluate --data-dir data/longmont --state CO
```

Prints which model the walk-forward selection chose and why, its
out-of-sample error against the 4-week average, the confidence label, and
Monte Carlo P10/P50/P90 totals for the week ahead. If every candidate ties
the baseline, the data is not yet long enough for external signals to show;
keep loading weeks and re-run.

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
