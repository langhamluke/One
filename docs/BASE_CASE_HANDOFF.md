# Handoff: from Flight Plan to "Base Case"

This document summarizes how **Flight Plan** was built and specifies **Base Case**, its general-audience sibling. Paste it into a new chat as the starting brief.

**Flight Plan** is an offline, advisor-facing financial-planning app for airline pilots.

**Base Case** is the same engine re-aimed at **new college grads in any industry**. A planner, or the grad themselves, enters a short intake and a risk questionnaire. They get:
- a risk/horizon profile
- a career and salary simulation
- an allocation and savings-order plan
- a Monte Carlo retirement projection
- a one-page printable summary

---

## 1. What Flight Plan is

An advisor uses it in a first meeting with a pilot. It runs fully offline in the browser and ships as one HTML file that can be emailed or put on a USB drive.

Six screens, named after phases of flight:

| Screen | Purpose |
|---|---|
| PREFLIGHT | Intake: profile, career position, milestones, balance sheet, insurance, savings habits |
| CHECKLIST | 10-question risk questionnaire (one question per card) + a separate 4-question "Pilot Supplement" |
| FLIGHT PLAN | Year-by-year career/pay simulation; compare 2–4 airline paths side by side |
| CRUISE | Recommended allocation, glide path, "order of operations" savings plan, contribution-limit (§415(c)) chart |
| LANDING | Monte Carlo retirement projection, probability of success, what-if sliders |
| BRIEFING | One-page, print-ready summary (light theme, Letter size) |

Global controls in the top bar:
- Load demo client
- Today's $ / Nominal toggle
- Client / Advisor mode (Advisor shows every assumption and data-quality flag)
- Export / Import client as JSON
- New client

---

## 2. Tech stack and delivery (keep all of this for Base Case)

- **Vite 6 + React 18 + TypeScript (strict) + Tailwind CSS 3**
- **Recharts** for charts; hand-written SVG for custom instruments (gauge, route map)
- **Framer Motion**, subtle only (gauge needles easing, charts drawing in); fully disabled under `prefers-reduced-motion`
- **Zustand** store, persisted to `localStorage` through a wrapper that try/catches every read and write (private mode, blocked storage, quota)
- **Vitest** for all math
- **Fonts bundled locally** via `@fontsource` (no Google Fonts call at runtime)
- **No backend, no runtime network calls.** All data lives in typed TS files under `src/data/`.
- **Two builds from one command** (`npm run build` = `tsc -b && vite build && vite build --mode single`):
  - `dist/`: normal static site
  - `dist-single/flight-plan.html`: one self-contained ~1 MB file using `vite-plugin-singlefile` with `assetsInlineLimit` set huge so fonts inline as data URIs. A tiny Vite plugin renames `index.html` → `flight-plan.html` in `generateBundle`.
- The single-file build is committed so it can be shared without building.

---

## 3. Folder structure

```
src/
  data/        airlines.ts   (sourced pay & benefits)      → Base Case: careers.ts
               irs2026.ts    (2026 IRS limits)
               tax2026.ts    (2026 federal brackets, FICA, state options)
               models.ts     (4×3 model portfolio matrix)
               cma.ts        (capital-market assumptions + correlation matrix)
               questionnaire.ts (questions, options, point values, supplement)
               personas.ts   (demo clients + default assumptions)
               sources.md    (every source URL)
  lib/         types.ts      (Sourced<T>, Allocation, etc.)
               inputs.ts     (Profile, Assumptions, WhatIf, PlanState types)
               scoring.ts    (questionnaire scoring + supplement)
               tax.ts        (federal + FICA + state)
               limits.ts     (401(k), §415(c), §401(a)(17), Roth IRA phase-out, HSA, catch-ups)
               payroll.ts    (career simulation → per-year pay)  → Base Case: career.ts
               glidepath.ts  (equity % by age)
               montecarlo.ts (seeded PRNG, Cholesky, lognormal correlated returns)
               plan.ts       (orchestrator: combines everything into per-year rows)
               alerts.ts     (warning/caution/advisory list + top action items)
               format.ts
  state/       store.ts      (Zustand + persistence + import/export)
               derived.tsx   (React context: computes plan + Monte Carlo ONCE, memoized)
  components/  ui.tsx (Panel, Field, NumberInput, Select, Toggle, Slider, HelpTip, VerifyTag, Stat)
               header readout strip, phase stepper, gauge, projection chart, route map,
               alerts panel, glide chart, donut
  screens/     one file per screen
tests/         Vitest suites
scripts/       screenshots.mjs (Playwright review loop, see §10)
```

**Key architectural rule:** all math lives in pure functions in `src/lib/` with no React imports. The UI only reads a single memoized `Derived` object `{ state, plan, mc, alerts, actions }` from context. That keeps the app fast (Monte Carlo runs once per input change) and makes the math testable.

---

## 4. Data model and the "no silent numbers" rule

Every real-world figure is a `Sourced<T>`:

```ts
interface Sourced<T = number> {
  value: T;
  source: string;   // human-readable citation
  url?: string;
  asOf: string;     // "2026-08"
  verified: boolean; // false = interpolated, estimated, or proxy
  note?: string;
}
```

How sourced values are used:
- **Pay scales are built from anchor points.** A helper `scale({1: …, 2: …, 12: …})` fills the in-between years by linear interpolation and **automatically marks the filled-in steps `verified: false`** with a source like "Interpolated (AA FO yr 2→12)".
- **In Advisor Mode, unverified values render amber with a VERIFY tag.** Hovering any value shows its source and as-of date.
- **An alert counts unverified data points in use.**
- **Proxies are explicit.** For example, United's pay uses American's scale and says "PROXY: …" in the source.

**For Base Case, keep this rule exactly.** Salary data by occupation must carry source and as-of, with interpolated or estimated values flagged.

---

## 5. The math (reuse almost all of it)

### 5.1 Risk questionnaire (keep exactly)
FNCE 2830 Investor Risk Questionnaire (CU Boulder), 10 questions.

**Risk tolerance = Q1–Q6** (range 6–28):

| Score | Category |
|---|---|
| 6–9 | Conservative |
| 10–16 | Moderate |
| 17–23 | Assertive |
| 24–28 | Aggressive |

**Time horizon = Q7–Q10** (range 4–20):

| Score | Category |
|---|---|
| 4–7 | Short-term |
| 8–13 | Intermediate |
| 14+ | Long-term |

Point values per question:

| Question | Points |
|---|---|
| Q1 | 1–5 |
| Q2 | 1–4 |
| Q3 | 1–4 |
| Q4 | 1–6 |
| Q5 | 1–5 (interactive range chart; ranges as multiples of the portfolio amount: #1 1.10/1.03/1.00/0.95, #2 1.15/1.08/1.00/0.92, #3 1.20/1.10/1.00/0.90, #4 1.30/1.15/1.00/0.85, #5 1.50/1.20/1.00/0.75) |
| Q6 | 1–4 |
| Q7 | 1, 2, 4, 6 |
| Q8 | 1, 2, 3, 5 |
| Q9 | 1, 2, 3, 5 |
| Q10 | 1–4 |

**Copy the exact question and option text from `src/data/questionnaire.ts`.**

The portfolio amount is editable (default $100,000) and substitutes into the question text. If the checklist is incomplete, the plan runs with a **PROVISIONAL** profile: Moderate risk, with horizon set by years to retirement.

Required footnote: "Educational questionnaire adapted from FNCE 2830 (CU Boulder), which cites the Securities Industry Association Risk Tolerance Quiz and the ProQuest Risk Tolerance Questionnaire. Professional risk assessments are longer and more involved."

A separate supplement (4 questions, **not** added to the class score) feeds alerts and the emergency-fund target:
- **Rule:** 6 months by default.
  - Single income or high income exposure → 9 months.
  - Single income + early career + high exposure → 12 months.
- **For Base Case,** reword the supplement for general careers:
  - How stable is your industry/employer (layoff risk)?
  - Do you rely on bonuses or commissions?
  - Do you have disability coverage through work?
  - Is there a second household income?

### 5.2 Taxes (`tax.ts`, `tax2026.ts`)

**Federal 2026 (Rev. Proc. 2025-32):**
- Standard deduction: $16,100 single / $32,200 MFJ.
- Single brackets: 10% to $12,400 · 12% to $50,400 · 22% to $105,700 · 24% to $201,775 · 32% to $256,225 · 35% to $640,600 · 37% above.
- MFJ brackets: 10% to $24,800 · 12% to $100,800 · 22% to $211,400 · 24% to $403,550 · 32% to $512,450 · 35% to $768,700 · 37% above.

**FICA:**
- 6.2% Social Security up to the **$184,500** wage base.
- 1.45% Medicare.
- +0.9% Additional Medicare over $200k single / $250k MFJ (not indexed).

**Treatment of pre-tax money:**
- Pre-tax 401(k) deferrals reduce income tax, not FICA.
- Payroll HSA reduces both.

**State tax** is a selectable flat effective rate:
- presets plus a custom rate
- Texas = 0; Colorado = custom 4.4% (consensus 2026 rate)

**Projections** index bracket thresholds and limits by inflation each year.

**Base Case:** add a few state presets with real rates (verify each), since grads move everywhere.

### 5.3 Contribution limits (`limits.ts`, `irs2026.ts`, IRS Notice 2025-67)

**Retirement plans and IRAs:**
- 401(k) elective deferral: **$24,500**. Age-50 catch-up $8,000; ages 60–63 "super" catch-up $11,250.
- **§415(c)** total annual additions: **$72,000** (catch-ups sit outside it).
- **§401(a)(17)** compensation cap: **$360,000**.
- IRA $7,500 (+$1,100 catch-up at 50).
- Roth IRA phase-out: $153k–$168k single / $242k–$252k MFJ. Partial amounts are rounded up to $10, with a $200 minimum.
- Catch-ups must be Roth if prior-year FICA wages exceed $150,000.

**HSA:** $4,400 self / $8,750 family (+$1,000 at 55).

**§415(c) logic in Flight Plan:**
- Formula: company % × min(pay, $360k) + employee deferral ≤ $72k.
- Excess is handled per employer as cash (taxable), a cash-balance plan, or forfeit.
- Airlines pay 15–18% *non-elective* company contributions, so the cap binds near $264k of pay.

**Base Case change:** most employers use a **match** (e.g., 100% of the first 4–6%), not a flat non-elective %. Model `match = matchRate × min(deferral%, matchCap%) × pay`, optionally plus a non-elective %. Keep the §415(c) check, but it will rarely bind for new grads, so de-emphasize that chart.

### 5.4 Career / pay simulation (`payroll.ts`), the part that changes most

**Flight Plan:**
- Builds year-by-year rows from current age to retirement: stage, employer, seat, longevity year, hourly rate × credit hours × 12, profit sharing, gross.
- Milestones (years to regional, captain upgrade, flow to major, etc.) are editable per career path.
- Dated contract raises apply first, then an assumed growth rate (3%/yr) after the last listed raise.
- What-ifs:
  - Upgrade delay pushes later events.
  - Furlough inserts N zero-pay years and freezes seniority.
  - Retire at 60.
  - Switch path.
  - Raise deferral %.
- Each path also produces **waypoints** (career events with year and pay) for the route-map visual.

**Base Case replacement, a generic career ladder:**
- `careers.ts`: occupations, each a ladder of levels with years-in-level defaults, e.g. Analyst → Associate → Manager → Senior Manager → Director.
- Each level has a `Sourced` salary band (p25/median/p75 by metro if possible). The user picks the percentile.
- Per-level bonus % and promotion raise %; annual merit raise (e.g., 3%) within a level.
- **Data source suggestion:** U.S. Bureau of Labor Statistics OEWS (occupational employment & wage statistics), with occupation + metro wage percentiles; company and industry data where available. Every value must be `Sourced`, and level steps you interpolate get flagged VERIFY.
- **What-ifs:**
  - Promotion later by N years.
  - Layoff gap of N months.
  - Grad school (N years of zero income + new debt + higher ladder after).
  - Switch industry or occupation.
  - Raise savings rate.
- Keep comparing **2–4 career paths side by side**; this was the most compelling screen in Flight Plan.

### 5.5 Cash flow, order of operations (`plan.ts`)

Per projected year:
- **Inflows:** wages + spouse wages.
- **Outflows:** taxes, payroll deferrals, HSA, living expenses (indexed to inflation), debt service.
- **Surplus is allocated in order:** top up the emergency fund → planned IRA → planned taxable investing.
- **Debt amortizes** on its own term (each debt has its own payoff years). Freed payments roll into investing once paid off ("snowball").
- **Unallocated surplus is assumed spent** (lifestyle), surfaced as an advisory alert ("unsaved cash flow ≈ $X/yr").
- **Negative cash flow** fires a red warning.
- **Balances:** pre-tax, Roth, HSA, taxable, cash-balance plan. Each grows at the glide-path expected return; contributions are added at year end.
- **Headline readouts:** savings rate (personal, and including employer money) and net worth.

**Base Case additions:**
- **Student loans as first-class:** multiple loans, federal vs private, rate, balance, term.
  - Federal repayment plans changed under 2025 legislation, so **verify current plan rules before modelling income-driven repayment**; at minimum support standard amortization and an editable payment.
  - Optional employer student-loan-match (SECURE 2.0 lets employers match loan payments into the 401(k)).
- **Rent vs. buy / first home goal**, and other sinking-fund goals (car, wedding, grad school).
- **Benefits:** employer match, HSA eligibility, ESPP/RSUs (tech grads), pension (public sector).

### 5.6 Allocation and glide path (`models.ts`, `glidepath.ts`)

**Asset classes** (generic names, never tickers or fund brands): US Large Cap, US Small/Mid, International Developed, Emerging Markets, US Aggregate Bonds, TIPS, Cash.

**4 (risk) × 3 (horizon) model matrix, equity %:**

| | Short-term | Intermediate | Long-term |
|---|---|---|---|
| Conservative | 22% | 30% | 40% |
| Moderate | 35% | 50% | 60% |
| Assertive | 50% | 65% | 80% |
| Aggressive | 60% | 80% | 95% |

**Glide path:**
- Hold today's model equity until `glideYears` (default 25) before retirement.
- Then decline linearly to a draggable "landing" equity (default 45%).
- Never raise risk above today's model.
- Keep the mix within the equity and bond sleeves when rescaling.

### 5.7 Monte Carlo (`montecarlo.ts`)
- Seeded **mulberry32** PRNG + Box–Muller normals, so results are reproducible (same seed → identical output; tested).
- **Lognormal correlated returns per asset class:**
  - σ² = ln(1 + vol²/(1+m)²)
  - μ = ln(1+m) − σ²/2
  - correlation via **Cholesky** of a fixed 7×7 matrix
- Annual rebalance. Each year: withdraw at start → grow → contribute at end. This one `step()` function is shared by the deterministic path, so at zero volatility MC = deterministic exactly (tested).
- **1,000 sims by default.** Output is P10/P50/P90 bands per age (nominal and today's $) and P(success).
- **Success** = the income target is funded every year to age 95.
  - Default target: 70% of final-year take-home, minus Social Security from 67, grossed up 15% for tax.
  - Near-retirement clients should use actual spending instead (the 70% default overstated one demo client badly).
- **Capital-market assumptions** (illustrative, editable in Advisor Mode): US LC 7.0%/16% · US SMID 7.5%/20% · Intl Dev 7.2%/17% · EM 8.0%/23% · Agg 4.5%/5.5% · TIPS 4.2%/6% · Cash 3.0%/1%. Inflation 2.5%.

### 5.8 Alerts and action items (`alerts.ts`)

A sorted list (warning → caution → advisory) computed from the plan, e.g.:
- projected shortfall
- cash-flow shortfall
- emergency fund below target
- no disability / life coverage
- high-interest debt above expected return
- contribution limit binding
- Roth IRA phase-out → backdoor Roth
- deferral below the IRS max
- unsaved cash flow
- N unverified data points (advisor only)

**Top 5 action items** follow an order of operations:
1. Emergency fund
2. High-interest debt
3. 401(k) (at least the full match)
4. HSA
5. Roth IRA / backdoor
6. Taxable

**Lesson learned:** base "start your 401(k)" logic on the **first year with real income**, not plan year 1. Students and trainees have $0 in year 1, and the action silently disappeared until this was fixed.

---

## 6. Design system

**Flight Plan look:** a "glass cockpit, not a video game" (Boeing 787 / A350 display philosophy).
- Near-black slate background `#0B0F14`, panels `#121821`, 1px borders `#243042`, subtle inner bezel shadow.
- **B612 / B612 Mono** (Airbus cockpit fonts), mono for every number.
- **Strict color language:**

| Color | Hex | Meaning |
|---|---|---|
| Green | `#3DDC84` | Normal / on track |
| Cyan | `#4FD1FF` | Anything editable |
| Magenta | `#FF4FD8` | Recommended path / targets |
| Amber | `#FFB020` | Caution / unverified data |
| Red | `#FF4D4D` | Genuine problems only |
| White | | Primary readouts |

- **Signature components:**
  - Header strip of instrument readouts.
  - Attitude-indicator gauge for the risk score.
  - "Altitude tape" projection chart: P10–P90 shaded cone, magenta median, boxed readout at retirement.
  - Navigation-display-style career route map with waypoints.
  - EICAS-style alert panel.
- **Asset classes** use muted blues/tans so they never collide with the semantic colors.
- **Restraint rules:** no skeuomorphic knobs, no sound, no shake. WCAG AA contrast, keyboard navigable, works at 1024px (iPad landscape) and usable at 768px.

**For Base Case:**
- Pick a new, equally disciplined visual metaphor suited to grads. Ideas:
  - a clean "dashboard / blueprint" look
  - a "game plan / playbook" look
  - a light, modern fintech look with one accent color
- **Keep the discipline:**
  - one meaning per color (editable vs. recommended vs. caution vs. warning)
  - a single signature chart (the projection cone)
  - a career-route visual comparing paths
  - a header strip of key numbers
- Rename the phase stepper accordingly, e.g. PROFILE → RISK → CAREER → PLAN → FUTURE → SUMMARY.

---

## 7. State, persistence, privacy
- **Zustand store** holds `PlanState`: profile, answers, portfolioAmount, supplement, assumptions, whatIf, selectedPaths, activePath. A separate `ui` slice holds phase, mode, dollar basis, and loaded persona.
- **Persisted** to `localStorage` (try/catch wrapper). The **merge/hydrate** step layers saved data over current defaults, so old saves keep working after new fields are added.
- **Export JSON** wraps state as `{ app, version, exported, state }`. **Import JSON** validates it, rejects non-app files, and hydrates. A round-trip is tested.
- **Retirement age is capped** in the store (65 for pilots). Base Case would have no cap, though Social Security and Medicare ages matter.
- **Privacy guidance used with real test clients:**
  - Nickname or first name only.
  - Ballpark numbers.
  - Never SSN, DOB, account numbers, lender names, or health information.
  - Don't share exports without consent.
  - Demo profiles of real people go under a pseudonym.

---

## 8. Demo personas

Ship several so the tool demos instantly. Flight Plan had:
- Fresh CFI (23)
- Regional FO (27)
- Cargo FO (34)
- Senior Captain retiring at 60 (59)
- "Steve Jobs", a real Denver flight student under a pseudonym

**Base Case suggestions** (each exercises a different alert or what-if):
- a nursing grad with federal loans
- a software engineer in a high-cost city with RSUs
- a teacher with a state pension
- a finance analyst targeting an MBA (grad-school what-if)
- a trades apprentice with no debt

---

## 9. Briefing (print page)
- **Light theme, Letter size,** `@page { size: letter; margin: 0.45in }`, and a `print-only` / `no-print` class pair. Tested to fit on exactly **one page** via Playwright `page.pdf`.
- **Contents:**
  - neutral "Firm logo" placeholder (never a real firm's trademark)
  - client name, date, risk profile + score boxes
  - allocation donut
  - P10/P50/P90 and P(success)
  - career route strip
  - glide-path thumbnail
  - top 5 actions
  - active alerts
  - assumptions line
  - questionnaire footnote
  - disclaimer
- **Disclaimer used:** "Prepared by Luke Langham for discussion purposes. Hypothetical projections based on stated assumptions and publicly reported contract terms as of October 2026; not investment, tax, or legal advice. Actual results will vary." Adapt "contract terms" to "salary data" for Base Case.

---

## 10. Testing and quality loop (do this again)

**Vitest** covers all math (86 tests at handoff):
- questionnaire min/max (6/4 and 28/20) and every category boundary (9/10, 16/17, 23/24 and 7/8, 13/14), including through real answer combinations
- §415(c) spillover at $200k / $264k / $300k / $400k pay
- a sweep proving total additions never exceed the limit
- the §401(a)(17) cap
- Roth phase-out full/partial/none for single and MFJ
- catch-up ages
- tax brackets
- FICA wage base
- the career sim (raises, delays, furlough)
- Monte Carlo: same seed → same result; zero vol = deterministic; success responds to withdrawals; Cholesky correctness
- data integrity (every value sourced; models sum to 100%)
- each persona produces a coherent plan
- store export/import round-trip

**Visual review loop** (`scripts/screenshots.mjs`):
- Playwright opens the **single-file build over `file://`**, which proves it works offline.
- It **fails loudly on any network request or console error**.
- It clicks through every screen × every persona, in Advisor and Client mode, at 1440, 1024, and 768px.
- It can also print the Briefing to PDF.
- Screenshots were reviewed critically after each round.

**Bugs this loop caught:**
- invisible tooltips widening the page at small widths
- input suffixes overlapping numbers (custom CSS outside Tailwind's `@layer components`)
- overlapping waypoint labels (fixed with greedy lane assignment)
- charts captured mid-animation
- a value readout clipped off the chart edge

A small script also checked for horizontal overflow on every screen (`scrollWidth > clientWidth`).

---

## 11. Data hygiene process
- **Research current figures before coding them.** IRS/SSA limits were checked against IRS Notice 2025-67, Rev. Proc. 2025-32, Rev. Proc. 2025-19, and the SSA 2026 fact sheet.
- **Where a primary source couldn't be read, mark it `verified: false`** and say so in `sources.md`. Never invent a number silently.
- **Keep a `sources.md`** listing every source URL, and a README section "how to update data each year":
  1. edit anchors and as-of dates
  2. add new limits each November
  3. run tests
  4. rebuild
  5. commit the single-file HTML

---

## 12. Suggested build brief for Base Case (paste-ready)

> Build **Base Case**, an offline, single-file-capable web app (Vite + React + TypeScript + Tailwind + Recharts + Zustand + Vitest; `vite-plugin-singlefile` output at `dist-single/base-case.html`) that helps **new college grads in any industry** build a first financial plan.
>
> **Reuse the Flight Plan architecture described above:**
> - pure-function math in `src/lib`
> - `Sourced<T>` data with VERIFY flags
> - FNCE 2830 questionnaire with exact scoring
> - 2026 federal tax/FICA/IRS limits
> - 4×3 model portfolios with a glide path
> - seeded correlated lognormal Monte Carlo
> - alerts + top-5 actions
> - Client/Advisor modes
> - Today's $/Nominal toggle
> - localStorage + JSON import/export
> - one-page printable summary
>
> **Replace the airline career model** with a generic occupation ladder (levels, salary bands by percentile and metro, promotion timing, bonuses, merit raises) sourced from BLS OEWS and other cited data. Allow comparing 2–4 career paths.
>
> **Add:**
> - student-loan handling (multiple loans, verify current federal repayment plan rules before modelling them)
> - employer match formulas
> - goals (emergency fund, first home, grad school)
> - what-ifs: delayed promotion, layoff gap, grad school, switch industry, raise savings rate
>
> **Design:** a new disciplined visual metaphor (not the cockpit), one meaning per color, WCAG AA, keyboard-navigable, works at 1024px and 768px. Include 4–5 demo grad personas.
>
> **Tests:** write Vitest tests for every formula and boundary.
>
> **Visual review:** after building, run a Playwright screenshot loop over every screen × persona from the single-file build over `file://` (fail on any network request), review critically, and fix layout issues.
