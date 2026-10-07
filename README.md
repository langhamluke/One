# One: restaurant flow forecasting

Restaurants schedule, order, and hire against forecasts that are usually
wrong, because the forecast is a four-week average that knows nothing about
Friday's rain, the home game two miles away, or the district's teacher
workday. This project aggregates those signals with POS history to forecast
customer flow by the hour, updates that forecast live during the shift, and
turns it into staffing plans, station assignments, and order suggestions.

It started on the floor at a Raising Cane's: people sent home early, flow
that never matched the forecast, weather swinging the night, inventory
either short or wasted, and crews where five specialists would outwork ten
generalists.

Working package name: `flowcast`.

## What is here

- `docs/01-product-brief.md`: problem, product, differentiation, business model
- `docs/02-market-landscape.md`: who already does this (Oct 2026), pricing, data sources
- `docs/03-architecture.md`: how the engine and the interface are built and why
- `docs/04-roadmap.md`: phases from "prove it on one real store" to multi-store
- `docs/05-loading-real-data.md`: CSV formats and commands to run on a real store's exports
- `SECURITY.md`: threat model, controls, deployment checklist
- `flowcast/`: the engine (forecast, intraday, labor, scorecards, ordering)
- `flowcast/app/`: the self-hosted web interface
- `tests/`: 40 tests covering the engine and the interface

## The interface

Five pages, one login, no external services:

| Page | What it answers |
|---|---|
| Overview | Are we on pace right now, what needs attention this week, how accurate have we been, and why does today look the way it does |
| Forecast | Seven days by hour with an 80% band, the weather, school, holiday, and event assumptions behind each day, a place to add events the model doesn't know about, and the backtest by condition |
| People | The live send-home / call-in / hold call with the ratio behind it, a button to log the decision, today's headcount by hour and station, overstaff and understaff warnings, hiring and cross-training gaps, per-station scorecards, and a suggested lineup |
| Ordering | Suggested cases per ingredient with error-sized safety stock, on-hand counts, GM overrides, per-item auto-order that unlocks only after four weeks under the accuracy bar, and export to the distributor's file layout through an editable template |
| Assistant | Questions answered from the store's own numbers. Default backend is deterministic code with no model; the only optional model backend is self-hosted and must be on a private address. Every exchange is redacted and logged |

Security is a design constraint, not a feature list; see `SECURITY.md`.

```bash
export FLOWCAST_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export FLOWCAST_ADMIN_PASSWORD='pick-Something-Long-1'
.venv/bin/flowcast serve --insecure-dev     # http://127.0.0.1:8000, demo store
```

Point `FLOWCAST_DATA_DIR` at real exports to replace the demo store; formats
are in `docs/05-loading-real-data.md`. On every load the model is chosen by
walk-forward analysis against the 4-week average (so a store with three
weeks of data gets a blended, honest forecast rather than an overfit one),
and Monte Carlo over the walk-forward errors supplies the bands, odds, and
safety stock. `flowcast evaluate --data-dir data/longmont` prints that
report before you start the server.

## Prototype results (simulated store, 18 months, 8-week rolling backtest)

| Hours | 4-week average error | Model error | Improvement |
|---|---|---|---|
| All | 12.3% | 10.8% | 12% |
| Raining | 28.1% | 11.4% | 60% |
| After-school 3-4pm, school in session | 13.8% | 10.8% | 22% |
| Daily totals | 7.6% | 6.2% | 18% |

Errors are weighted absolute percentage error (WAPE) on hourly transactions.
The store is synthetic, so these numbers prove the pipeline works and show
*where* external signals matter, not what a real store will see. Phase 0 of
the roadmap is replacing the simulator with real POS data.

## Run it

```bash
uv venv .venv && uv pip install -e ".[dev]"
.venv/bin/flowcast demo            # simulate, backtest, forecast, staff, score, order (terminal)
.venv/bin/flowcast serve --insecure-dev   # the web interface on the demo store
.venv/bin/flowcast weather 30.45 -91.19   # live Open-Meteo forecast (network)
.venv/bin/python -m pytest -q
```

`flowcast demo` prints: the backtest vs baseline with a breakdown by
condition, what the model attends to, tomorrow's hourly forecast with an
80% band, a 2pm intraday re-forecast with a send-home / call-in signal, the
hour-by-station staffing plan and its realized cost vs the baseline plan,
employee scorecards and a best-fit dinner lineup, and a case-rounded order
suggestion with error-sized safety stock.
