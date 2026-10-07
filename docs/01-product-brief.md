# Product brief

## Problem

Business at a restaurant is close to unpredictable from inside the store.
Managers schedule, order, and hire against a forecast that is a four-week
same-day average, nudged by gut. The result, seen daily on the floor:

- People sent home early, or a line out the drive-thru with four on the
  clock, because the day did not match the number.
- Weather moving the night by 20 to 30% with no change to the plan.
- Inventory short when a game lets out, or chicken wasted after a washout.
- Ten people scheduled where five who are good at their stations would do.

The data to fix this already exists. Weather is forecast 16 days out for
free. School districts publish calendars. Stadiums publish schedules. The
POS records every transaction. Nobody has wired them to the schedule, the
order, and the lineup in a way a shift lead can act on at 2pm.

## Product

A per-store flow engine with three surfaces:

1. **Forecast and live day.** Hourly customer-flow forecast for the week
   from POS history, weather, holidays, school calendar, and local events,
   with a confidence band and plain-language drivers ("rain at dinner,
   school out: -14% from the 4-week average"). During the shift, the
   forecast re-estimates every 15 minutes from actuals and issues an
   explicit signal: hold, send home, or call in.
2. **People.** Station-level scorecards (throughput, speed, accuracy,
   reliability) that are relative to peers at the same station and withhold
   judgment on thin data. A best-fit lineup for each block: who goes on fry
   when the forecast says Saturday dinner will be heavy, and how big the
   gap is to the next option. Over time: who to cross-train, and who to
   hire before the roster is short on a station.
3. **Ordering.** Forecast to menu mix to ingredients to a case-rounded
   order, with safety stock sized from the forecast's own recent error, a
   shelf-life cap on perishables, and per-item automation that unlocks only
   after the forecast has earned it.

## Why now

- POS vendors (Toast, Square) and enterprise suites now ship a weekly
  forecast. The market accepts that forecasts should use external data.
  What is missing is the live day and the people layer.
- Weather, holiday, and event data are commodity APIs. School calendar
  feeds now cover most US districts.
- Labor is the largest controllable cost and wages keep rising; a 3% labor
  reduction on a $1.5M store is roughly $13,500 a year, and buyers of AI
  scheduling tools report 2 to 5% in the first six months.

## Differentiation

| Incumbents | This |
|---|---|
| Weekly forecast, reviewed on Sunday | Live re-forecast with a decision at 2pm |
| Schedule knows availability and wage | Schedule knows who is best where, and by how much |
| Static par levels | Safety stock from the forecast's measured error, per item |
| Accuracy as a claim | Accuracy as a running audit trail the GM can see |

## Switching costs

The forecast itself will be matched by POS vendors. What accumulates and
does not transfer: store-specific learned elasticities, per-employee station
histories, and the trust record that justified turning on automation. Each
week on the platform widens that gap for the next vendor.

## Who buys

Start with franchisees and multi-unit independents in quick-service and
fast-casual: they feel the pain, can buy a $100 to $300 per store tool
without a corporate cycle, and have the POS access to connect. Corporate
chains come after there is a pilot result.

## Business model

Per-location monthly subscription with three tiers matching the surfaces:
forecast and live day; plus people; plus ordering. Charge for the decision
layer, not the data.

## What has to be true

- On real POS data, the model must beat the 4-week average by a margin a
  GM notices, especially on rain, event, and school-break hours. The
  prototype shows the mechanism works on simulated data; Phase 0 is the
  real test.
- Per-station throughput must be obtainable from the POS and kitchen
  display for the people layer.
- Send-home signals must be recommendations with a log, not actions, to
  stay clear of predictive-scheduling rules.

## Status

A working prototype of the full loop exists in this repository. See the
README for results and `docs/04-roadmap.md` for what comes next.
