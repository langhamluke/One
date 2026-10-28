# Flight Plan ✈︎

An offline, advisor-facing lifecycle planning tool for airline pilots, built for a first meeting with a new flight-school grad or early-career regional pilot. The advisor completes a short intake and the FNCE 2830 risk questionnaire with the pilot. The app then produces:

- a risk-tolerance and time-horizon profile
- a career simulation comparing airlines (CFI → regional → major → age 65)
- a glide-path allocation with contribution routing
- a Monte Carlo retirement projection
- a one-page printable briefing

Glass-cockpit visual language: B612 / B612 Mono (Airbus cockpit fonts, bundled locally). The color scheme: **green** = normal, **cyan** = editable, **magenta** = flight plan / targets, **amber** = caution or unverified data, **red** = warning.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: scoring, tax, limits, career sim, Monte Carlo, store
npm run build      # typecheck + dist/ + dist-single/flight-plan.html
npm run preview    # serve dist/
```

`dist-single/flight-plan.html` is one self-contained ~1 MB file (JS, CSS, and fonts inlined). Email it or copy it to a USB drive and double-click. It needs no install and no network. It is committed to the repo so it can be shared without building.

To regenerate review screenshots of every screen × demo persona (uses the single-file build over `file://` and fails loudly on any network request):

```bash
node scripts/screenshots.mjs screenshots 1440 900      # MODES=client,advisor PRINT=1 also supported
```

## Screens (phases of flight)

| Phase | What it does |
|---|---|
| PREFLIGHT | Intake: profile, career position, milestones per path, balance sheet, insurance, savings. Three demo pilots load from the header. |
| CHECKLIST | The 10-question FNCE 2830 questionnaire, one card at a time. Includes an attitude-indicator gauge, a score card, and a separately-scored Pilot Supplement. |
| FLIGHT PLAN | Year-by-year career sim with an ND-style route map, pay-by-age lines, earnings/retirement bars, and a benefits & contracts table with sources. |
| CRUISE | 4×3 model allocation, draggable glide-path landing, order-of-operations "fuel planning", §415(c) spillover chart, and Roth/backdoor timeline. |
| LANDING | 1,000-run seeded Monte Carlo "altitude tape", P(success), what-if sliders, and the FedEx legacy-pension vs. MBCB comparison. |
| BRIEFING | One-page Letter printout (light, ink-friendly) with a "Firm logo" placeholder. |

**Client / Advisor Mode:** Client Mode hides assumption panels, CMA editing, and VERIFY tags. Advisor Mode exposes every assumption. **Today's $ / Nominal** switches every dollar display. The session persists to `localStorage`, and **Export / Import** save a client as JSON.

## Architecture

```
src/data/    airlines.ts (sourced pay & benefits), irs2026.ts, tax2026.ts, models.ts, cma.ts,
             questionnaire.ts, personas.ts, sources.md
src/lib/     scoring.ts, tax.ts, limits.ts, payroll.ts (career sim), glidepath.ts, montecarlo.ts,
             plan.ts (orchestrator), alerts.ts (EICAS + action items), format.ts
src/state/   store.ts (Zustand + safe localStorage), derived.tsx (memoized plan/MC context)
src/components/  PFD strip, phase stepper, attitude indicator, altitude chart, ND route map, EICAS, glide chart, inputs
src/screens/ Preflight, Checklist, FlightPlan, Cruise, Landing, Briefing
tests/       Vitest suites for all math
```

### Key modelling assumptions (all editable in Advisor Mode)

- **Plan year 1 is 2027.** 2026 contract rates are indexed by dated contract raises. After a contract's last listed raise, pay grows at 3%/yr. Inflation is 2.5%, which converts to today's dollars and indexes IRS limits and brackets.
- **Pay** = hourly (or TFP) rate × monthly credit hours × 12. Longevity runs from date of hire, and steps between published anchors are interpolated and flagged VERIFY. Profit sharing is off by default.
- **Taxes:** 2026 federal brackets (single/MFJ), FICA with the $184,500 SS wage base and Additional Medicare, and a selectable flat state rate (Texas = 0).
- **§415(c):** company % × min(pay, $360k) + elective deferral ≤ $72,000; catch-ups sit outside the cap. Excess follows each airline's `excessHandling`: cash (taxable; the after-tax amount goes to the brokerage account), MBCB, or forfeit. American defaults to its MBCB for excess 401(k) money; the rest default to cash. All are VERIFY.
- **Cash-flow order:** emergency fund (6–12 months from the Pilot Supplement) → planned IRA → planned taxable investing. Debt amortizes over 10 years, and freed payments roll into taxable investing. Unallocated surplus is assumed spent and shows up as an advisory alert.
- **Glide path:** holds today's model equity until 25 years before retirement, then declines linearly to the landing equity (default 45%). Within-sleeve mix is preserved.
- **Monte Carlo:** 1,000 seeded paths with lognormal, correlated asset-class returns (Cholesky). Contributions are added at year end; withdrawals are taken at year start. Success means 70% of final-year take-home (less Social Security and any pension, grossed up 15% for tax) is funded to age 95.

## Updating pay tables each year

1. Open `src/data/airlines.ts`.
2. For each airline, replace the anchor values in `scale({ … })` and update `source`, `url`, `asOf`, and `verified`. Anchors are longevity years 1–12. Steps between anchors are interpolated and automatically flagged `verified: false`.
3. Update `raises` (dated contract increases), `retirement` (company %, MBCB %, `excessHandling`), and `amendable`.
4. Update `src/data/irs2026.ts` and `src/data/tax2026.ts` when the IRS/SSA publish new limits (Oct–Nov). Rename the files if you like; only the imports change.
5. Record every change in `src/data/sources.md`.
6. Run `npm test && npm run build` and commit the regenerated `dist-single/flight-plan.html`.

## Data sources

See [`src/data/sources.md`](src/data/sources.md) for the full table. URLs:

- https://www.aviationa2z.com/ (American 2026 pay & 18% 401(k); Southwest 2026 rates & retirement)
- https://boltflight.com/ (American & FedEx widebody rates; United/Delta 18% DC)
- https://thrustflight.com/american-airlines-pilot-salary/ (American 1st-year FO, 2024 scale)
- https://www.flightglobal.com/strategy/american-airlines-pilots-accept-new-deal-that-will-boost-pay-up-to-46/154644.article (APA amendable 8/1/2027)
- https://airwaysmag.com/summary-apa-american-agreement/ (APA Market Based Cash Balance Plan)
- https://aerocorner.com/blog/southwest-airlines-pilot-salary/ (Southwest rates; major DC %)
- https://www.ajot.com/ (SWAPA 2024 ratification raises)
- https://airlinegeeks.com/ (Southwest Trip for Pay)
- https://www.alpa.org/press-room/2026/06/fedex-pilots-ratify-new-collective-bargaining-agreement (FedEx CBA)
- https://www.supplychaindive.com/ and https://www.freightwaves.com/ (FedEx contract coverage)
- https://fdx.alpa.org/Portals/7/Documents/communications/public/2026/03/2026-mbcbp-education-comparison-of-cash-balance-plans.pdf (FedEx MBCB education)
- https://leadingedgeplanning.com/fedex-pilots-open-enrollment/ (FedEx election window & pay credits — secondary)
- https://www.envoyair.com/pilots/ (Envoy pay, premium, 750-hr captain rate, flow)
- https://www.envoyair.com/wp-content/uploads/2026/06/Envoy-Pilot-Portfolio-6.10.2026.pdf (Envoy captain steps)
- https://www.faa.gov/ (Part 121 age 65)
- https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500 (IRS Notice 2025-67)
- https://www.irs.gov/pub/irs-drop/rp-25-19.pdf (2026 HSA limits)
- https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill (Rev. Proc. 2025-32)
- https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf (SS wage base)

---

*Educational questionnaire adapted from FNCE 2830 (CU Boulder), which cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire. Professional risk assessments are longer and more involved.*

*Prepared by Luke Langham for discussion purposes. Hypothetical projections based on stated assumptions and publicly reported contract terms as of October 2026; not investment, tax, or legal advice. Actual results will vary.*
