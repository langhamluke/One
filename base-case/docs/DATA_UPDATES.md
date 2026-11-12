# How to update data each year

All datasets live in `shared/data/` and every value is `Sourced`. The app shows the as-of dates on the Data & Sources page.

## Calendar
| When | What | File |
|---|---|---|
| Mid-October | IRS inflation adjustments for next tax year (Rev. Proc.): brackets, standard deduction, LTCG thresholds, student-loan interest phase-out, gift exclusion, estate exclusion | `tax2026.ts` → add `tax2027.ts`, `irs2026.ts` |
| Mid-October | SSA: COLA, wage base, bend points, earnings test | `tax2026.ts` (FICA.wageBase), `ss.ts` |
| Mid-November | IRS retirement-plan limits (Notice 20xx-xx): 402(g), catch-ups, 415(c), 401(a)(17), IRA, Roth phase-outs, Saver's Match thresholds | `irs2026.ts` |
| January | HHS poverty guidelines (IBR) | `loans.ts` |
| Late March / April | BLS OEWS (May of prior year) national and metro wages; BLS Employment Projections | `careers.ts` |
| Late March / April | BLS OEWS hourly medians for the student jobs (Sprout) | `studentJobs.ts` |
| Each January (and July for mid-year states) | State minimum wages (Sprout): DOL state table | `studentJobs.ts` |
| Late May | IRS HSA limits for next year (Rev. Proc.) | `irs2026.ts` |
| June | Federal student-loan interest rates for the next award year | `loans.ts` |
| As enacted | Federal/state tax law changes; state rate cuts (Jan 1) | `states.ts`, `loans.ts` |
| As ratified / each January | Airline contracts (Flight Plan): new pay scales, dated raises, company 401(k) %, MBCB terms, amendable dates; Envoy premium / CA-rate rule; FedEx pension election terms | `airlines.ts` (anchor steps only; `scale()` fills and flags the rest) |

## Procedure
1. Edit the values and the `asOf` strings; set `verified: true` only when read from the primary source.
2. Append the source URL to `shared/data/sources.md`.
3. Run `npm test` (data-integrity tests check bands are ordered, models sum to 100%, every value is sourced).
4. Run `npm run build` and the screenshot loop (`npm run screenshots`) to make sure nothing overflows.
5. Commit with a message like `data: 2027 IRS limits (Notice 2026-xx)`.

## Known gaps in this build (2026-11-03)
- 2027 retirement-plan limits not yet published by the IRS (expected mid-November 2026) — the app uses 2026
  limits and indexes them for projections; a projection ($25,500 deferral) is shown to advisors as unverified.
- Several figures are flagged `verified:false` because primary sources could not be fetched from this build
  environment (see `sources.md`, "could not verify"). Confirm them on irs.gov / ssa.gov / studentaid.gov.
- ~~Questionnaire text is a structural stand-in~~ Done 2026-11-03 (exact FNCE 2830 text).
- Airline figures (`airlines.ts`, added 2026-11-08) are secondary-sourced as of Oct 2026: year-1/year-2 rates at American
  (2024 figure), Envoy year-1 rate and premium end, regional 401(k) placeholders (6–7%), American MBCB mechanics, FedEx
  pension cap / FAE cap / MBCB % / election window, United and Delta proxies. All are `verified:false`; confirm against
  the CBAs and replace proxies with real scales.
