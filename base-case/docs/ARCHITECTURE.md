# Base Case Architecture

```
base-case/
  index.html, vite.config.ts, tailwind.config.js      Vite + React 18 + TypeScript (strict) + Tailwind 3
  src/                      Client app (React Router, Zustand store, Recharts, hand-written SVG instruments)
    api/client.ts           Typed fetch wrapper (credentials, CSRF header, 401 handling; optional dev mock)
    state/                  Zustand store for the working plan + Derived context (engine runs once per change)
    components/             Design-system primitives and signature components (readout strip, cone, ladder, playbook)
    screens/                One file per route (planning phases, proposals, assistant, admin, account, legal)
  shared/                   Pure TypeScript shared by client and server (NO React, NO Node APIs)
    product.ts              The three products (base-case, flight-plan, sprout): names, phase labels, defaults; PRODUCT env picks one
    lib/                    The planning engine: types, inputs (PlanState), derived (outputs), scoring, tax, limits,
                            career (dispatch: ladder | airline | student+ladder), airline (seat/longevity/flow/furlough, FedEx pension),
                            sprout (student stage, practice paycheck, $500-starter emergency rule, habits projection),
                            loans, glidepath, plan (ledger), montecarlo, ss, alerts, actions, dataQuality, engine
    data/                   Sourced datasets: irs2026, tax2026, states, loans, ss, cma, models, questionnaire (+ pilot
                            wording and Pilot Supplement), careers (BLS OEWS), airlines (pay scales, retirement plans,
                            paths), studentJobs (OEWS student wages, DOL state minimum wages), personas + personasPilot
                            + personasSprout, playbook (+ pilot and student topics), sources.md
    api.ts                  API contract (routes and payload types)
  server/                   Hono API on Node 22
    index.ts                Boot: env, DB connect, migrate, bootstrap/seed, static serving in production
    app.ts                  createApp(deps) for tests and runtime
    db/                     Drizzle schema, SQL migrations, migration runner; PGlite (dev/test) or PostgreSQL (prod)
    auth/                   password (scrypt), session, totp, middleware, authorize (RBAC chokepoint), rateLimit
    routes/                 auth, admin, clients, plans, proposals, chat, data
    services/               users, plans, proposals, audit, assistant (Claude API + offline explainer)
    crypto.ts               AES-256-GCM envelope encryption for plan/chat/TOTP data
  tests/engine, tests/server   Vitest suites
  scripts/screenshots.mjs   Playwright visual review loop
  docs/                     Design, privacy, security, compliance, data updates, deployment, questions
```

## Key rules
1. **All math lives in `shared/lib` as pure functions.** The UI reads a single memoized `Derived` object from
   context; the server uses the same engine to build assistant context. One implementation, tested once.
2. **No silent numbers.** Every real-world figure is a `Sourced<T>` (value, source, url, asOf, verified). Derived
   or estimated values are flagged `verified:false`, rendered amber with a VERIFY tag in Advisor view, and counted
   on the Data & Sources page. Missing data is surfaced ("no wage data for this occupation") rather than guessed.
3. **Provisional until approved.** Clients edit *proposals*; the approved plan changes only through an advisor/admin
   approval (or a logged direct edit by staff). Every approved version is immutable.
4. **Same engine in the browser and on the server**, so what-if sliders are instant (no round trips) and the
   assistant sees exactly the numbers the client sees.

5. **One platform, three products.** `PRODUCT` (server env) selects Base Case, Flight Plan or Sprout for an instance;
   the client reads it from `GET /api/product` (public) and `firm.product` on `/api/me`. Each plan carries
   `PlanState.product` and each career path a `kind` ('ladder' | 'airline'), so a plan renders correctly on any
   instance and paths can mix; a Sprout plan runs its ladder paths through the student stage first.
   Product-specific behaviour lives behind small switches (`productConfig`, `questionsFor`, `supplementFor`,
   `personasFor`, `playbookFor`, `isPilotPlan`, `product === 'sprout'`), never in forks of screens or engine modules.

## Data flow
```
PlanState (client edits) --debounced--> computeDerived() --> Derived --> screens
         \--autosave--> PUT /api/proposals/:id (encrypted at rest)
Advisor approve --> plans.version+1, plan_versions row, audit row
Assistant: POST /api/chat/threads/:id/messages -> authorize -> load plan -> computeDerived -> compact context -> Claude -> encrypted store
```

## Engine pipeline (computeDerived)
risk profile → model equity + allocation + glide path → per path: career simulation (ladder: levels, promotions,
what-ifs; airline: seat, longevity, contract raises, flow, upgrades, widebody, furlough, FAA 65) → yearly ledger
(payroll incl. carrier non-elective % and §415(c) excess handling, limits, taxes, loans, order of operations, balances)
→ Social Security estimate → Monte Carlo (seeded, correlated lognormal, annual rebalance) → alerts → actions →
data-quality ledger → headline.

## Scaling path
- Stateless API process; sessions and rate limits can move to Redis; PostgreSQL scales independently.
- Engine is CPU-bound and runs client-side for interactivity; server-side runs are bounded (chat context only).
- Add row-level security in PostgreSQL as defense in depth when moving to a shared database.
- Multi-tenant (multiple firms) would add a `firms` table and a firm id on users/plans; the authorize chokepoint
  is the single place to extend.
