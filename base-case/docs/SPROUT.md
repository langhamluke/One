# Sprout — the student product (state as of 2026-11-12)

Sprout is a free money-skills app for high school and college students, built as the third **product of the Base
Case platform**: the same server, database, sign-in, roles, proposal workflow, assistant, playbook, data ledger,
audit log and one-page print, with a student intake, a student stage in front of the career ladder, a practice
paycheck, the $500-starter emergency rule and student alerts, actions and playbook topics. One codebase, one Docker
image; `PRODUCT=sprout` turns an instance into Sprout. It started as a standalone Next.js prototype (branch
`claude/focused-sagan-nxuext`); this version runs on Base Case's six-phase planning flow only.

## Why
Gen Z scored 38% on the 2026 TIAA-GFLEC personal finance index. Colorado (HB25-1192) and Texas are adding required
personal-finance courses. A Texas teacher told us students without jobs cannot make a real budget, card spending
makes money invisible, and teachers want tools that complement free curricula such as Next Gen Personal Finance, not
replace them. Sprout teaches by doing: a real budget, a pay-yourself-first transfer, savings goals, credit basics,
and a view of what today's habits grow to.

## Product rules (non-negotiable, from the prototype's AGENTS.md)
- Never hold or move money, and never charge students.
- Collect the minimum data. Block anyone under 13 (the intake refuses, the engine clamps to 13).
- No ads, no dark patterns, no nudges toward risky investing. Asset classes are described; funds, stocks, apps and
  products are never named.
- Every projection keeps the educational disclaimer (`STUDENT_DISCLAIMER`, on Meet you at 30 and the printed plan).
- Any automatic transfer we suggest comes with a low-balance warning (action items, Save & spend, playbook, assistant).
- Plain copy for a 16-year-old reader, no emojis (tests check the playbook, questionnaire and actions).

## What a student (or their teacher / advisor) gets
| Screen | Sprout name | What it does |
|---|---|---|
| Profile | **You** | Nickname, age (13+), school stage, expected graduation year, state and metro; **School and work**: job (cashier, food prep, retail, lifeguard, tutor, something else, or none), hourly wage, hours a week in the school year and in summer, weeks worked, allowance, the **practice paycheck** toggle, college plan with expected loans, cards, the career you are aiming for; spending as needs and wants per month; balance sheet; cards and loans (with the credit limit); savings habits (automatic transfer, Roth IRA, 401(k) after graduation); goals |
| Risk | **Comfort with risk** | The ten FNCE 2830 questions reworded for a 16-year-old (same points), a $1,000 default portfolio, and the four-question **About your money** supplement that sets the emergency fund |
| Career | **First jobs** | **Pay now** (per year, hourly, hours, career start) in front of the occupation ladder; the usual path editor and what-ifs; the ladder chart shows the student years |
| Plan | **Save & spend** | **Your budget** (money in, needs, wants, saving, unassigned) with the 50/30/20-style insight, the pay-yourself-first slider with the low-balance warning, the emergency fund ($500 starter, then months), savings goals with the per-month amount, debt, next steps, alerts, allocation |
| Future | **Meet you at 30** | Savings at 30 on the expected path, what you put in vs what growth does, the cost of waiting five years, the same habit at a savings-account yield; then the usual cone to 65 |
| Summary | **Your plan** | One page: profile, allocation, career route, **your next three steps, easiest first**, alerts, the student disclaimer |

## How the student math works (shared/lib/sprout.ts, shared/data/studentJobs.ts)
- **Student stage**: from now until the expected graduation year the plan earns student income instead of the
  ladder's pre-start income: `wage × (school-year hours × weeks + summer hours × weeks)`, plus allowance or gifts as
  untaxed other income (`YearRow.otherIncome`: in gross income and take-home, not earned income, no FICA, cannot fund
  a Roth IRA). Rows carry stage `student`. The ladder starts in the graduation year; a recent grad has no student years.
- **Default wages**: BLS OEWS May 2025 national median hourly wage for the job, floored at the state minimum wage
  (U.S. Department of Labor state table, January 2026). A wage the student types in wins and is listed as
  self-reported. Secondary-source and carried-forward figures are `verified:false` (VERIFY on Data & sources).
- **Practice paycheck**: no job and the toggle on → a cashier's wage at 10 hours a week in school and 20 in summer.
  It is flagged (`practice-paycheck` advisory, an `assumption` row in the ledger, "Practice paycheck" chips) and never
  counts as real income anywhere else.
- **Expected student loans** become one federal loan (tiered standard, 6-month grace, 2026-27 undergraduate rate)
  that starts at graduation, through the same loan simulator as every other debt.
- **Emergency fund**: `max($500 starter, months × monthly expenses) + $500 if a bill is in your name`, where months =
  (s1: family covers it 0 / I pay some +1 / I pay all +3) + (s2: steady 0 / varies +1 / seasonal +1) + (s4: someone
  could help 0 / not really +1). An advisor override of months still wins. Base Case and Flight Plan are unchanged
  (`emergencyTarget` returns months × essentials for them).
- **Alerts**: starter fund below $500 (warning, replaces the generic emergency alert), nothing going to savings yet,
  practice paycheck on, card over 30% (caution) / 50% (warning) of its limit, enter the card limit; the insurance
  alerts (disability, life, renters) are off for students.
- **Next steps, easiest first**: automatic transfer (about 10% of money in, with the low-balance warning) → $500
  starter / full target → card to $0 → other high-interest debt → first goal per month → Roth IRA with earned income
  (custodial under 18) → start a credit history (18+, no card).
- **Assistant**: a student system prompt (plain words, no product recommendations, low-balance warning, disclaimer,
  "talk it over with a parent, teacher or advisor") and a student-only glossary (pay yourself first, 50/30/20,
  starter cushion, practice paycheck, utilization, grace period, minimum payment, authorized user, FDIC, HYSA,
  custodial Roth, earned income, Rule of 72, APR vs APY, minimum wage).

## Run it locally
```bash
cd base-case && npm install && cp .env.example .env
PRODUCT=sprout BASE_CASE_DATA_DIR=data/pg-sprout npm run dev
```
Each product needs its own database, so set `BASE_CASE_DATA_DIR=data/pg-sprout` (in `.env` or on the command line;
`.env` is read on start, so restart after editing it). Demo accounts print on first start: `advisor@demo.sprout.local`
and five students (`maya@`, `jordan@`, `alex@`, `sam@`, `priya@demo.sprout.local`) with the passwords in the console.
There is no demo admin: set `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before the first start.
To run Sprout next to another local product use `WEB_PORT` / `API_PORT` (for example `PORT=8790 APP_ORIGIN=http://localhost:5190`
for the API and `WEB_PORT=5190 API_PORT=8790` for Vite). Visual review: `PRODUCT=sprout BASE_URL=... npm run screenshots`
(`WIDTHS=390` for phone width).

| Persona | Who | Exercises |
|---|---|---|
| Maya, 16 | Junior in Colorado, $12/hr coffee shop 12 hrs/wk, saving for a car | self-reported wage below the state minimum, nothing automated yet |
| Jordan, 17 | Senior in Texas, no job, $40/wk allowance, four-year college with $27k loans | practice paycheck, allowance as other income, expected loans |
| Alex, 18 | Career Prep senior, grocery cashier 18 hrs/wk, own phone bill, electrician next | bill in your name (+$500), default BLS wage |
| Sam, 19 | Community college in Arizona, retail 25 hrs/wk, first credit card at 42% of its limit | starter fund, no savings, card utilization, every alert at once |
| Priya, 21 | University senior in Illinois, $22/hr internship, $28k loans in grace, job next year | pays all her own costs (3 months), loans in grace, Roth IRA |

## Send it to friends
1. **Deploy an instance**: `docs/DEPLOY_DIGITALOCEAN.md`. On the droplet that already runs Base Case and Flight Plan,
   run `deploy/setup-sprout.sh` (own database, shared proxy). Leave `DEMO_SEED=0` for a shared instance.
2. **Sign in as the admin** you set up, open **Users → Invite as client**, copy the link and send it yourself (no
   e-mail delivery yet; links expire after 72 hours). Teachers or advisors are invited as advisors and assigned clients.
3. Everything a student changes is a **draft** until an advisor approves it. Advisors see every assumption and VERIFY
   tag with the Advisor view toggle, and can load the demo students from the readout strip.
4. **Privacy rules**: nickname only, ballpark numbers, never SSNs, birth dates, account numbers or full names. Friends
   testing this version should be adults; real students under 18 come later, with parent or guardian consent.

## Not yet ported from the prototype
- **Learn**: the lesson cards and quizzes (`src/data/lessons.ts`); the copy lives on in the playbook topics and the
  assistant glossary, without the quizzes or XP.
- **Rewards**: milestones, bonuses and streaks (`src/lib/milestones.ts`). The platform has no bonus ledger; a bonus
  must reward real actions and never be taken back, which needs a design pass first.
- **Portfolio optimizer** and diversification score (`src/lib/portfolio.ts`): the platform models asset classes, not
  holdings; the securities catalog is out of scope for this version.
- **Weekly check-ins** and fresh-start prompts (`src/lib/habits.ts`): the platform has no check-in or notification
  surface yet.
- **Credit check-up** by FICO factor (`src/lib/credit.ts creditCheckup`): only utilization is modelled; payment history,
  age of accounts, inquiries and mix are not collected.
- Multi-card avalanche / snowball payoff plans: the loan simulator pays cards on their own terms; the playbook explains
  the two strategies.
- Supabase auth, PostHog, Sentry, Stripe (B2B) from the prototype's stack: the platform's own auth, audit log and
  deploy replace them.

## Data to verify before client use (VERIFY tags)
- Food prep ($16.98/hr) and tutor ($20.84/hr) medians come from secondary sources that cite OEWS May 2025; cashier,
  retail and lifeguard were read from BLS OOH / O*NET.
- State minimum wages: only CA, CO, CT, AZ, IL, MA, MD, MO, NE, NJ, NY and WA were corroborated in this build; every
  other state above the federal floor (and DC) is the build's best knowledge of the January 2026 rate. Local (city)
  minimums are not modelled.
- The 36-week school year, 12-week summer and the practice-paycheck hours are planning assumptions.
- The November 2026 high-yield savings APY range and the minimum-payment formula in the playbook are not re-verified.
Procedure: `docs/DATA_UPDATES.md`; sources: `shared/data/sources.md`.
