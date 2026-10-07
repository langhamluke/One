# Roadmap

## Phase 0: prove the forecast on real data (now to +6 weeks)

Goal: one real store's POS history, one honest number.

- [x] Simulator, feature pipeline, model, backtest vs 4-week baseline
- [x] Intraday re-forecast with send-home / call-in signal
- [x] Staffing plan from labor standards; scorecards; assignment; ordering
- [x] Self-hosted interface: overview, forecast, people and live decisions, ordering with export templates, assistant; auth, roles, CSRF, CSP, audit log
- [ ] Get 12+ months of hourly POS exports from one or two stores (any
      brand; a friendly franchisee or independent is faster than corporate)
- [ ] Replace synthetic weather with Open-Meteo archive for that store's
      lat/lon; load the local district calendar; hand-enter the big events
- [ ] Run the backtest. Publish hourly and daily WAPE vs the 4-week average,
      overall and on rain / event / school-break hours. This number decides
      whether the company exists.
- [ ] Fit the labor standards from that store's actual throughput

## Phase 1: the live day (+6 to +16 weeks)

Goal: a shift lead opens their phone at 2pm and sees the call.

- [ ] POS connector for one platform (Toast or Square; both have public APIs)
- [ ] Nightly retrain, 15-minute re-forecast job, forecast audit log
- [ ] Mobile web view: today's forecast vs actual, ratio, signal, confidence
- [ ] Weekly email to the GM: last week's accuracy, labor hours over/under,
      what the model attributed misses to
- [ ] Pilot with 3 to 5 stores; measure sent-home hours and speed-of-service
      vs the prior 8 weeks

## Phase 2: people (+4 to +8 months)

- [ ] Shift records from the labor system (HotSchedules / 7shifts exports)
      plus per-station throughput from the POS (drive-thru timer, order
      taker ID, KDS bump times)
- [ ] Scorecards in the manager app with the "insufficient data" guardrail
      and a plain-language explanation per score
- [ ] Assignment suggestions on the schedule; track whether suggested
      lineups beat non-suggested ones on speed of service
- [ ] Training-need flags: who to cross-train on which station, based on
      gaps the forecast predicts (e.g. no second-tier fry cook available on
      game Saturdays)

## Phase 3: ordering (+8 to +14 months)

- [ ] Inventory counts and invoices in; BOM per brand
- [ ] Order suggestions with error-aware safety stock, reviewed by the GM
- [ ] Per-item auto-order unlock once error stays under threshold for 4
      weeks; GM can revoke per item
- [ ] Waste and stockout tracking to close the loop on the safety stock

## Phase 4: multi-store and the moat (+12 months on)

- [ ] Pooled brand-level model with store embeddings for rare events
- [ ] Benchmarks across stores: same weather, same calendar, different results
- [ ] Hiring signals: forecast says Saturdays will need a third bird cook
      by spring; nobody on the roster is rated; post the role now

## Open questions

- **Who pays first?** Franchisees of large QSR brands have the pain and the
  authority to buy point solutions at $100 to $300 per store; corporate
  deals take 12+ months. Start with franchisees and independents.
- **How close is the POS vendor?** Toast and Square both now ship
  forecasting. The defensible layers are the live day, the people data, and
  the audit trail. Be the thing the GM checks at 2pm, not the weekly report.
- **Data access.** Per-employee throughput needs the POS to tag orders
  with a cashier ID and the KDS to log bump times. Most do; it must be
  confirmed per platform before Phase 2 is promised to anyone.
- **Labor law.** Send-home signals touch predictive-scheduling laws in some
  cities and states (Oregon, NYC, Chicago, Seattle, LA). The product should
  recommend, log, and leave the call to the manager.
