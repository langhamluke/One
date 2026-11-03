# Base Case

Base Case is a secure, role-based financial-planning platform for new college grads — the general-audience sibling
of **Flight Plan**. A client enters a short intake and a risk questionnaire and gets a risk/horizon profile, a
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
Open http://localhost:5173. On first start the API seeds demo accounts (local only) and prints them:

| Account | Email | Password |
|---|---|---|
| Admin | admin@demo.basecase.local | BaseCase-Admin-2026! |
| Advisor | advisor@demo.basecase.local | BaseCase-Advisor-2026! |
| Clients (personas) | maya@demo.basecase.local … | BaseCase-Client-2026! |

Other commands: `npm test` (engine + server suites), `npm run build`, `npm run screenshots` (Playwright visual
review), `npm run seed`, `npm run create-admin -- --email you@x --password '...'`.

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
- `docs/DEPLOYMENT.md` — hosting
- `docs/QUESTIONS_AND_RESOURCES.md` — what I need from you
- `docs/HANDOFF.md` — current state, decisions taken, open items

## Disclaimer
Prepared for discussion purposes. Hypothetical projections based on stated assumptions and publicly available
salary and tax data as of the dates shown; not investment, tax, or legal advice. Actual results will vary.
