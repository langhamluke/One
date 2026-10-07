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
- `docs/03-architecture.md`: how the engine is built and why
- `docs/04-roadmap.md`: phases from "prove it on one real store" to multi-store
- `flowcast/`: a working prototype of the whole loop on a simulated QSR store
- `tests/`: 21 tests covering every module

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
.venv/bin/flowcast demo            # simulate, backtest, forecast, staff, score, order
.venv/bin/flowcast weather 30.45 -91.19   # live Open-Meteo forecast (network)
.venv/bin/python -m pytest -q
```

`flowcast demo` prints: the backtest vs baseline with a breakdown by
condition, what the model attends to, tomorrow's hourly forecast with an
80% band, a 2pm intraday re-forecast with a send-home / call-in signal, the
hour-by-station staffing plan and its realized cost vs the baseline plan,
employee scorecards and a best-fit dinner lineup, and a case-rounded order
suggestion with error-sized safety stock.
