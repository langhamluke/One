# Base Case · Flight Plan

Base Case is a secure, role-based financial-planning platform for new college grads. The same codebase also ships
**Flight Plan**, the airline-pilot planner (see "Flight Plan" below); one build, one server, `PRODUCT=` picks the product. A client enters a short intake and a risk questionnaire and gets a risk/horizon profile, a
career and salary simulation with 2–4 paths compared side by side, an allocation and savings order-of-operations
plan, a Monte Carlo retirement projection, alerts, action items, and a one-page printable summary. Clients can try
changes in a draft that stays **provisional until an advisor approves it**, and ask an in-app assistant about
their own plan only.

| Role | Can |
|---|---|
| **Client** | Edit their own draft, see the projected build-out, submit for review, chat about their plan |
| **Advisor** | Review assigned clients, approve/reject proposals, edit plans (logged), see every assumption and data flag |
| **Admin** | Manage users, assignments, settings, audit log, data status |

## Quick start
```bash
cd base-case
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173. On first start the API seeds demo accounts (local only) and prints them. There is no
demo admin: set `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in `.env` before the first start (or run
`npm run create-admin`) to get your own admin login.

| Account | Email | Password |
|---|---|---|
| Advisor | advisor@demo.basecase.local | BaseCase-Advisor-2026! |
| Clients (personas) | maya@demo.basecase.local … | BaseCase-Client-2026! |

Other commands: `npm test` (engine + server suites), `npm run build`, `npm run screenshots` (Playwright visual
review), `npm run seed`, `npm run create-admin -- --email you@x --password '...'`.

## Flight Plan (airline pilots) on the same platform
The same codebase serves two products. Set `PRODUCT=flight-plan` and the instance becomes **Flight Plan**: the pilot
planner with the full Base Case feature set (sign-in, client/advisor/admin roles, provisional drafts with approval,
assistant, playbook, data ledger, audit log, one-page print) and the same design. What changes:

| | Base Case | Flight Plan |
|---|---|---|
| Phases | Profile → Risk → Career → Plan → Future → Summary | Preflight → Checklist → Flight plan → Cruise → Landing → Briefing |
| Career model | BLS occupation ladders (37 occupations, 21 metros) | Airline pay scales by seat, fleet and longevity; CFI → regional → major with flow, upgrades, widebody, furlough |
| Intake | Degree, graduation, metro | Position (student … captain), employer, years at employer, hours, credit hours, domicile |
| Supplement | Industry stability, variable pay, LTD, second income | Airline exposure, employer stock, loss-of-license, second income (original Pilot Supplement) |
| Retirement money | Employer match | Carrier non-elective % (15–18% at majors), §415(c) spillover as cash / cash balance / forfeit, Southwest MBCB, FedEx pension vs MBCB election |
| Age limit | none | FAA 65 |
| Personas | Nurse, engineer, teacher, analyst, electrician | Fresh CFI, regional FO, FedEx FO, senior AA captain, Denver flight student |

```bash
PRODUCT=flight-plan npm run dev        # local Flight Plan with pilot demo accounts (advisor@demo.flightplan.local …)
```
Paths can also be mixed inside one plan (an airline path next to an occupation ladder, for a pilot weighing a career
change). Airline data: `shared/data/airlines.ts`; engine: `shared/lib/airline.ts`; sharing with friends and advisors:
`docs/FLIGHT_PLAN.md`.

## Stack
Vite 6 · React 18 · TypeScript strict · Tailwind 3 · Recharts · Zustand · Hono · Drizzle ORM · PGlite (embedded
Postgres for local) / PostgreSQL (production) · Vitest · Playwright · Anthropic Claude API (assistant).

## Documents
- `docs/ARCHITECTURE.md` — layout, rules, data flow
- `docs/DESIGN.md` — design system
- `docs/SECURITY.md` — security controls
- `docs/COMPLIANCE_NOTES.md` — Reg S-P, marketing rule, records, privacy law notes
- `docs/PRIVACY_POLICY.md` — draft policy (attorney review required)
- `docs/DATA_UPDATES.md` — yearly data refresh procedure; `shared/data/sources.md` — every source
- `docs/FLIGHT_PLAN.md` — the pilot product: what it models, how to run and share a Flight Plan instance
- `docs/DEPLOY_DIGITALOCEAN.md` — deploy on a DigitalOcean droplet (tested)
- `docs/DEPLOYMENT.md` — other hosting options
- `docs/QUESTIONS_AND_RESOURCES.md` — what I need from you
- `docs/HANDOFF.md` — current state, decisions taken, open items

## Disclaimer
Prepared for discussion purposes. Hypothetical projections based on stated assumptions and publicly available
salary and tax data as of the dates shown; not investment, tax, or legal advice. Actual results will vary.
