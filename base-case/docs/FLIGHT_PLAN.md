# Flight Plan — the pilot product (state as of 2026-11-08)

Flight Plan started as a single offline HTML file an advisor opened in a first meeting with a pilot. It is now a
**product of the Base Case platform**: the same server, database, sign-in, roles, proposal workflow, assistant,
playbook, data ledger, audit log and one-page print, with the airline career model, the pilot intake, the Pilot
Supplement and the pilot personas from the original build. One codebase, one Docker image; `PRODUCT=flight-plan`
turns an instance into Flight Plan.

## What a pilot (or their advisor) gets
| Screen | Flight Plan name | What it does |
|---|---|---|
| Profile | **Preflight** | Nickname, age, filing status, state, household; **Position** (student, CFI, regional FO/CA, major FO/CA, cargo FO/CA), employer, years at employer, flight hours, credit hours/month, domicile; spending; balance sheet; debts (flight-school loans as private student loans); benefits; savings habits; goals; insurance incl. **loss-of-license** |
| Risk | **Checklist** | The FNCE 2830 questionnaire with the original pilot wording (Q8 flight-school loans, Q10 loss-of-license) and the four-question **Pilot Supplement** (airline exposure, employer stock / profit sharing, loss-of-license, second income). Supplement sets the emergency-fund target: 6 / 9 / 12 months |
| Career | **Flight plan** | 2–4 airline paths compared: Envoy → American (flow), Regional → Southwest, Regional → FedEx, Regional → United / Delta (reference proxies), or stay at the current carrier. Milestones per path (years to regional, CA upgrades, years to major, widebody), profit sharing, pay growth after the contract, Envoy CA-rate rule, FedEx pension vs MBCB, §415(c) excess handling. What-ifs: upgrade delay, furlough years, retire at 60 |
| Plan | **Cruise** | Model allocation, glide path, emergency fund, debt, order of operations, contribution limits (§415(c) "Capped" chip when the carrier contribution binds), alerts |
| Future | **Landing** | Monte Carlo cone, P(success), year-by-year table (stage shows `AA WB CA`, `Furlough`, `CFI` …), what-ifs |
| Summary | **Briefing** | One-page print: profile, allocation, glide path, career route with flow/upgrade waypoints, top actions, alerts, assumptions |

Pilot-specific alerts: no loss-of-license coverage, own-occupation LTD wording, life insurance thin with dependents,
employer stock / profit-sharing reliance, Envoy premium pay ends, FedEx pension election (Apr–May 2027), contract
amendable dates, §415(c) spillover (with the pay at which it binds and how the excess is handled), airline flying ends
at 65, early retirement. Pilot action items: add own-occupation disability + loss-of-license coverage, make the FedEx
election, plan for §415(c) spillover. Playbook adds seven pilot topics (how airline pay works, loss-of-license, §415(c)
spillover, FedEx election, flow and premium pay, furlough planning, contract cycles). The assistant knows the pilot
terms (loss of license, MBCB, §415(c), TFP, longevity, flow, furlough, amendable date, credit hours, age 65) and gets a
pilot-aware system prompt.

## How the airline math works (shared/lib/airline.ts, shared/data/airlines.ts)
- **Pay** = rate(seat, fleet, longevity) × contract multiplier(year) × credit hours × 12 (+ profit sharing). Rates are
  nominal contract rates; dated raises first, then the path's pay-growth assumption. CFI pay is an annual salary.
- **Scales** are built from anchor steps; interpolated steps are `verified:false` ("Interpolated (AA FO yr 2→12)") and
  proxies say PROXY. Every rate, company %, excess rule, raise and pension figure the plan uses appears on the Data &
  sources page with a VERIFY tag where unverified.
- **Timeline**: regional start, regional CA, major start, major CA, widebody from the milestones; `yearsAtEmployer`
  sets negative start indexes for pilots already employed. Furlough years freeze longevity. Airline pay stops at 65.
- **Company money**: the carrier's non-elective % replaces the generic match in the ledger; §415(c) trims the employer
  first and the excess follows the carrier's rule (cash in lieu is taxed and invested in taxable; cash balance credits
  grow with pre-tax). Southwest adds 2% MBCB. FedEx pilots hired before 6/29/2026 accrue the legacy pension
  (maxAnnualBenefit × years/25 × FAE/cap, nominal) unless they elect the MBCB from 2028; later hires get MBCB only.
- **Emergency fund**: 6 months; 9 with single income or high exposure (supplement s1 = high, or s2 = heavy employer-stock
  reliance); 12 when single income + early career (student, CFI, regional) + high exposure.

## Run it locally
```bash
cd base-case && npm install && cp .env.example .env
PRODUCT=flight-plan npm run dev
```
Demo accounts print on first start: `admin@demo.flightplan.local` / `advisor@demo.flightplan.local` and one demo pilot
(`jordan@demo.flightplan.local`, the fresh CFI) with the passwords in the console. Set `BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD` in `.env` to create your own admin login on the first start (the database must be empty:
delete `data/pg` to start over). A Base Case instance and a Flight Plan instance need separate databases
(`BASE_CASE_DATA_DIR` or `DATABASE_URL`). `.env` is read on start, so restart `npm run dev` after editing it; the
Tailwind theme is also only rebuilt on a restart.

**Steve's plan** (a real friend, under a pseudonym) is seeded as an *invited* client with no password. To hand it to
him: Users → Edit → set his real e-mail address → Save → Reset password → copy the link and send it; he picks a
password and lands on his Preflight with everything filled in. Nothing about him is printed in the console.

## Send it to friends and advisors
1. **Deploy an instance** (one droplet, one domain): `docs/DEPLOY_DIGITALOCEAN.md`, answering `flight-plan` to the
   product prompt (or `PRODUCT=flight-plan` in `deploy/.env.production`). Leave `DEMO_SEED=0` for a shared instance.
2. **Sign in as the admin** you set up, open **Users**, and **invite** each friend as a *client* and each advisor as an
   *advisor*; assign clients to their advisor. The invite is a link (there is no e-mail delivery yet, so copy the link
   from the Users screen or the server log and send it yourself). Links expire after 72 hours by default.
3. Clients fill in Preflight and Checklist themselves; everything they change is a **draft** until their advisor
   approves it. Advisors see every assumption and VERIFY tag with the Advisor view toggle.
4. **Privacy rules for real people**: nickname only, ballpark numbers, never SSNs, DOBs, certificate numbers, account
   numbers or health details. Demo profiles of real pilots stay under a pseudonym.

## What the original Flight Plan had that is intentionally different here
- **Offline single file** → hosted, multi-user, encrypted at rest. Export/Import JSON still works (`app: "flight-plan"`
  files; Base Case files import too).
- **Cockpit look** is kept: B612 and B612 Mono (served from `public/fonts`), the near-black panels, cyan for anything
  editable, magenta for the flight plan, amber for caution, red for warnings, the six-readout strip, numbered phase
  tabs, EICAS alert stack and the attitude indicator. It is a theme of the shared design system (`data-product` on
  `<html>` switches the CSS variables in `src/styles/index.css`), so every Base Case screen (proposals, assistant,
  users, audit) wears it too. Base Case itself is unchanged.
- **Retirement age capped at 65 in the store** → any age can be entered; the engine ends airline pay at 65 and warns.
- **Pre-tax IRA pro-rata alert** → not carried (the Base Case balance sheet lumps pre-tax 401(k) and IRA together).
- **Social Security as a flat $42k assumption** → estimated from the pay history (SSA formula) unless overridden.

## Data to verify before client use (all flagged in the ledger)
Airline figures come from secondary sources compiled in Oct 2026 (aviationa2z, boltflight, ALPA/SWAPA/APA releases,
Envoy recruiting, advisor commentary on the FedEx CBA). Confirm against the CBAs: year-1 and year-2 rates at American
(2024 figure), the Envoy year-1 rate and premium end date, Envoy and generic-regional 401(k) percentages, the American
MBCB mechanics, FedEx pension cap / FAE cap / MBCB percentages / election window, Southwest and FedEx raise schedules.
Procedure: `docs/DATA_UPDATES.md`; sources: `shared/data/sources.md`.
