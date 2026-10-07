# Architecture

## Principle

One hourly transaction forecast per store is the spine. Every other feature
(staffing, assignments, ordering, alerts) is a deterministic transformation
of that forecast plus store-specific standards. That keeps the system
explainable: when the plan changes, it is because the forecast changed, and
the forecast says why.

```
                 +-----------+   +-----------+   +---------+   +--------+
  external       |  weather  |   |  school   |   | events  |   |holidays|
  signals        | Open-Meteo|   | CSV/feed  |   | CSV/PHQ |   |  lib   |
                 +-----+-----+   +-----+-----+   +----+----+   +---+----+
                       |               |              |            |
  POS history ----> build_features (hourly rows: calendar + weather + events + lags)
                       |
                       v
                 Forecaster (gradient-boosted trees, Poisson loss)
                       |
        +--------------+---------------+------------------+
        v              v               v                  v
  hourly forecast  intraday        staffing plan      item demand -> BOM
  + 80% band       re-forecast     (labor standards)  -> order suggestion
                   (ratio w/ prior)      |
                                         v
                              station assignment
                              (scorecards: throughput, speed, accuracy)
```

## Modules (prototype, `flowcast/`)

| Module | Responsibility | Key functions |
|---|---|---|
| `calendar_features.py` | Holidays (federal + state), school calendar, cyclical encodings | `daily_calendar_frame`, `SchoolCalendar` |
| `connectors/weather.py` | Open-Meteo archive + forecast client, derived flags | `fetch_history`, `fetch_forecast`, `weather_features` |
| `connectors/school.py` | District calendar CSV ingestion | `load_school_csv` |
| `connectors/events.py` | Events CSV, attendance- and distance-weighted hourly pressure | `hourly_event_pressure` |
| `synth.py` | Store simulator with the drivers baked in; emits POS, weather, events, item sales, shifts | `generate_store` |
| `features.py` | Hourly feature matrix with leak-free same-weekday lags; the 4-week baseline | `build_features`, `baseline_4wk` |
| `forecast.py` | Model fit/predict/interval, rolling backtest vs baseline, conditional breakdown, intraday re-forecast | `Forecaster`, `backtest`, `intraday_reforecast` |
| `labor.py` | Labor standards to hour x station headcount; plan scoring against actuals | `staffing_plan`, `realized_labor_cost` |
| `scorecard.py` | Station-relative employee scores, specialist tags, greedy best-fit assignment | `station_scorecards`, `employee_summary`, `assign_stations` |
| `ordering.py` | Menu mix, bill of materials, error-aware safety stock, case-rounded orders with shelf-life cap | `menu_mix`, `ingredient_usage`, `suggest_orders` |
| `cli.py` | `flowcast demo` end-to-end; `flowcast weather` live fetch | |

## Model choices and why

- **Gradient-boosted trees (sklearn HistGradientBoosting, Poisson loss).**
  Learns interactions (rain at Friday dinner, school break at lunch) without
  hand-built cross terms, fits in seconds per store, handles categorical
  holiday and school status natively, and exposes permutation importance.
  Poisson loss matches count data and never predicts negative traffic.
- **Lag features are same-weekday-hour, 1 to 4 weeks back, plus yesterday.**
  The 4-week mean of those lags *is* the industry baseline, so the model's
  job is to learn adjustments to it. In backtests deeper than one day ahead,
  yesterday's lag is unknown and is replaced by last week's, mirroring
  production.
- **Baseline comparison is mandatory.** Every evaluation reports WAPE for
  the model and for the 4-week average, overall and by condition (rain,
  storms, nice days, events, school breaks, after-school, holiday-adjacent).
  WAPE rather than MAPE so 10am hours do not dominate.
- **Intraday re-forecast is a shrunken ratio, not a second model.** The
  ratio of observed to expected so far is pulled toward 1 with a prior worth
  15% of the day's forecast and capped at +/-45%. Explainable, robust to a
  single broken hour, and it produces an explicit `send_home` / `call_in` /
  `hold` signal.
- **Scorecards are station-relative z-scores.** Throughput is normalized by
  the block's total volume so Friday-night regulars do not look like stars.
  A minimum shift count gates every score; thin data yields "insufficient
  data", never a guess.
- **Safety stock is sized from the forecast's demonstrated error** (daily
  WAPE from the latest backtest) scaled by sqrt(window), with a service
  level target and a shelf-life cap on perishables.

## The interface (`flowcast/app/`)

| Module | Responsibility |
|---|---|
| `main.py` | FastAPI routes for login, the five pages, forms, export, admin |
| `state.py` | Loads data (CSV directory or simulator), trains, backtests, precomputes the week; every page helper lives here so templates do no math |
| `security.py` | scrypt passwords, signed session cookies, CSRF, login throttle, role checks, response headers |
| `db.py` | SQLite: users, audit log, decisions, inventory counts, order overrides, templates, manual events, assistant log, auto-order unlocks |
| `charts.py` | Server-rendered SVG charts styled by CSS variables; no JavaScript charting library |
| `exports.py` | Order export templates: validated JSON specs mapped onto the suggested order |
| `assistant.py` | Local deterministic assistant; optional self-hosted Ollama backend behind a private-address gate; redaction |
| `templates/`, `static/` | Jinja2 pages, one stylesheet, one small script. No external assets |

## What the production system adds

- **Ingest**: POS webhooks/exports (Toast, Square, Aloha, Brink), labor
  system exports (HotSchedules, 7shifts), inventory counts. Land raw in
  object storage, normalize into `transactions(store, ts, tx, net_sales,
  channel)`, `item_sales`, `shifts`, `inventory_counts`.
- **Store**: Postgres (TimescaleDB) for hourly series and features; one
  model artifact per store, retrained nightly; a feature snapshot per
  forecast so every prediction can be audited later.
- **Serve**: FastAPI. Endpoints for `forecast/{store}/{date}`,
  `reforecast/{store}` (called every 15 minutes from the POS feed),
  `staffing/{store}/{week}`, `orders/{store}/next-delivery`,
  `scorecards/{store}`.
- **Surface**: a manager web app for the weekly plan and scorecards, and a
  shift-lead mobile view whose only job is the live day: forecast vs actual
  by hour, the current ratio, and the send-home / call-in call.
- **Learning loop**: every forecast is scored when actuals land; backtest
  summaries and condition breakdowns are recomputed weekly and shown to the
  GM. Automated ordering unlocks per item once that item's error has stayed
  under a threshold for N weeks.
- **Multi-store pooling**: holidays and rare events are sparse at one store.
  A pooled model across stores in a brand (with store embeddings) supplies
  priors that a single store cannot learn in a year.
