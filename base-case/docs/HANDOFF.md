# Base Case — Handoff (state as of 2026-11-12)

## 2026-11-12: Sprout, the student product
**Sprout** (free money-skills app for high school and college students) is the third product: `PRODUCT=sprout`. New:
`shared/data/studentJobs.ts` (BLS OEWS May 2025 medians for cashier, food prep, retail, lifeguard, tutor; DOL state
minimum wages Jan 2026; practice-paycheck pattern), `shared/lib/sprout.ts` (student stage in front of the ladder,
practice paycheck, expected loans → federal loan at graduation, the $500-starter emergency rule, habits projection,
card utilization), `shared/data/personasSprout.ts` (Maya, Jordan, Alex, Sam, Priya), Sprout questionnaire wording and
supplement, six playbook topics, student alerts / actions, a student assistant prompt and glossary, `profile.student`,
`Debt.creditLimit`, `YearRow.otherIncome` (untaxed allowance), stage `student`, `ProductConfig.minAge` (13; engine
clamps, intake refuses), the Sprout theme (`:root[data-product='sprout']`, dark mode via `prefers-color-scheme`,
Instrument Serif + Geist served from `public/fonts`), `favicon-sprout.svg`, the student intake on You, Pay now on
First jobs, Your budget / goals on Save & spend, Meet you at 30 on Future, "Your next three steps" on the print page.
Deploy: `deploy/docker-compose.sprout.yml`, `deploy/setup-sprout.sh`, update/backup cover three stacks. Tests: 258
(+26). Docs: `docs/SPROUT.md` (product rules, not-yet-ported list, VERIFY list). Vite takes `WEB_PORT` / `API_PORT` so
a second product can run locally next to the default pair; `npm run screenshots` takes `WIDTHS=390`. Base Case and
Flight Plan behaviour is unchanged (every switch is `product === 'sprout'`; the Account page grid got `min-w-0`, a
no-op at desktop widths). Open for Sprout: confirm food-prep and tutor medians and the unverified state minimum wages;
decide whether to port Learn / Rewards / check-ins; parent or guardian consent flow before real students under 18.

## 2026-11-11: Flight Plan live on the droplet
Flight Plan runs next to Base Case on the same droplet (178.128.155.159) as compose project `flightplan`
(`deploy/docker-compose.flight-plan.yml`, env `deploy/.env.flight-plan`, site file `deploy/sites/flightplan.caddy`),
served by the Base Case Caddy at https://flightplan.178-128-155-159.sslip.io. Production seed: bootstrap admin
(langhamluke14@gmail.com) + real client Nick Horvath via `SEED_CLIENT_EMAILS`, no demo accounts. The droplet checkout
was fast-forwarded from a git bundle over SSH (branch `claude/festive-goldberg-9jofrz` at c7ec612); GitHub still needs
`git push` of the same branch before `deploy/update.sh` (which pulls from origin) will work again. Dockerfile build
uses `--max-old-space-size=2048` because the 1 GB droplet ran out of heap in the Vite build.

## 2026-11-08: Flight Plan rebuilt on the platform
Flight Plan (the pilot planner that existed only as a built `flight-plan.html`) is now a **product of this codebase**:
`PRODUCT=flight-plan` gives an instance the Flight Plan name, the PREFLIGHT → CHECKLIST → FLIGHT PLAN → CRUISE →
LANDING → BRIEFING phases, the pilot questionnaire wording and Pilot Supplement, one demo pilot (Jordan) plus three reference pilots for tests
and one seeded real client (Nick Horvath, invited, no password); the demo seed no longer creates an admin (bootstrap admin only), and airline career
paths, with every Base Case feature (roles, drafts and approval, assistant, playbook, data ledger, admin, print) and the
Base Case design. New: `shared/product.ts`, `shared/data/airlines.ts` (pay scales, retirement plans, paths; every rate
Sourced, interpolations flagged), `shared/lib/airline.ts` (seat/longevity/flow/furlough simulation, FedEx pension and
MBCB, FAA 65), `shared/data/personasPilot.ts`, pilot playbook topics, pilot alerts/actions, `GET /api/product`,
`firm.product` on `/api/me`, product-aware seed, assistant prompt and glossary, `PlanState.product`,
`CareerPath.kind = 'airline'`, `profile.pilot`, `insurance.lossOfLicense`, `whatIf.upgradeDelayYears/furloughYears`,
`YearRow.employerCashBalance/cashInLieu`. Ledger: airline non-elective % replaces the match; §415(c) excess → cash in
lieu (taxed, invested in taxable) / cash balance / forfeit. Tests: 230 (airline sim, ledger spillover, personas,
product config, server product route and seed). Docs: `docs/FLIGHT_PLAN.md`; deploy scripts take `PRODUCT`.
2026-11-09: Flight Plan now wears the **original cockpit theme** (B612, dark panels, cyan/magenta/amber/red) via CSS
variables switched by `<html data-product>`; the planning screens follow the original layouts (three-column
Preflight, one-item-at-a-time Checklist with attitude indicator, navigation display + pay/earnings charts on Flight
Plan, Cruise grid, altitude tape with what-ifs and retirement income on Landing). Admins can edit a user's e-mail.
Open for Flight Plan: verify the airline figures against the CBAs (listed in `docs/FLIGHT_PLAN.md`); the screenshot
review loop passes at 1280 for all roles (1440/1024/768 not yet run on the cockpit theme); e-mail delivery for
invites is still manual (copy the link).

## What exists
A working, tested, role-based planning platform in `base-case/`:
- **Engine** (`shared/lib`): 14 pure modules; 2026 tax/FICA/IRS limits; federal loans after P.L. 119-21 (RAP prorated per
  borrower, tiered standard, IBR, legacy standard); career ladders from BLS OEWS May 2025 with metro indexes; order-of-
  operations cash flow; glide path; seeded correlated Monte Carlo (1,000 sims, ~40-75 ms); Social Security PIA estimate;
  alerts; actions; data-quality ledger.
- **Data** (`shared/data`): 37 occupations, 21 metros, 31 states, 5 personas, 18 playbook topics, every value `Sourced`,
  `sources.md` with URLs and a "could not verify" list.
- **Server** (`server/`): Hono API; scrypt passwords; TOTP; sessions; CSRF; rate limits; RBAC chokepoint with 404
  anti-enumeration; proposals workflow (draft → submitted → approved/rejected); AES-256-GCM at rest with per-row AAD and
  a boot-time master-key canary; append-only audit log; assistant (Claude Opus 5.5 with server-side fallbacks, or an
  offline explainer); demo seed.
- **Frontend** (`src/`): PROFILE → RISK → CAREER → PLAN → FUTURE → SUMMARY, readout strip, draft banner, review queue with
  approved-vs-draft deltas and field diff, assistant, playbook, data ledger, admin (users/invites/audit/settings),
  account (password, MFA, sessions), privacy/terms/methodology pages, one-page print summary.
- **Quality**: 189 Vitest tests (engine, data integrity, server incl. authorization matrix); `tsc --noEmit` clean;
  Playwright review loop over every route × role × 1440/1024/768 with zero overflow/console/network problems and a
  one-page PDF.

## How to run
```bash
cd base-case && npm install && cp .env.example .env && npm run dev
```
Demo accounts print on first start (see README). Production: `docs/DEPLOYMENT.md`.

## Decisions taken (and why)
- **Server + database instead of Flight Plan's single offline file**, because the brief requires sign-in, three roles,
  provisional changes with approval, and a private assistant. PGlite keeps local setup at zero; PostgreSQL in production.
- **Light "model desk" design** (paper, ink, one violet accent, IBM Plex) instead of the cockpit; one meaning per color.
- **meritRaise is nominal within-level growth** (real pay plateaus at the level's p90); promotions provide real jumps.
  The first draft compounded real raises for 45 years and produced absurd replacement targets.
- **RAP is one payment per borrower**, prorated across loans on RAP by balance.
- **Undecryptable plan rows fail loudly** (HTTP 500 `plan_unreadable`) and a wrong master key refuses to boot.
- **Marketing-rule interactive-tool disclosures** (methodology, results vary, no products favored, hypothetical) are built
  into the FUTURE screen, the Methodology page and the summary.

## Owner answers (2026-11-03)
Operator: Luke Langham personally. Host: his DigitalOcean droplet, shared with his trading systems (setup script is non-destructive: no firewall enablement, no auto-upgrades, port check, resource caps; separate droplet recommended). SBLOC and HELOC are debt kinds (interest-only demand loan; 20-yr amortizing variable line) with alerts and Playbook topics.

## Open items (ranked)
1. ~~Questionnaire text~~ Done: exact FNCE 2830 text from the Flight Plan build (2026-11-03).
2. Verify the `verified:false` figures listed in `shared/data/sources.md` on primary sources (irs.gov, ssa.gov, bls.gov,
   studentaid.gov, state DORs) — the build environment could not open those hosts.
3. Email delivery (invites, self-service password reset). Hosting is solved: `deploy/` + `docs/DEPLOY_DIGITALOCEAN.md`, tested end to end.
4. 2027 IRS retirement limits when Notice 2026-xx is published (mid-November 2026); 2027 tax brackets (Rev. Proc.).
5. Attorney review of `docs/PRIVACY_POLICY.md`, Terms, and the service-provider agreement for MCIA (72-hour breach notice).
6. Nice-to-haves: code-split the 1 MB bundle; passkeys; Redis-backed rate limits for multi-instance; key-rotation script;
   itemized deductions and state credits. ~~Flight Plan airline module~~ Done 2026-11-08 (`docs/FLIGHT_PLAN.md`).

## Where things are
- Design system: `docs/DESIGN.md`; architecture: `docs/ARCHITECTURE.md`; security: `docs/SECURITY.md`;
  compliance: `docs/COMPLIANCE_NOTES.md`; data refresh: `docs/DATA_UPDATES.md`; questions for the owner:
  `docs/QUESTIONS_AND_RESOURCES.md`.
- Visual review: `npm run screenshots` (needs the production server on :8787 or `BASE_URL`), output in `screenshots/`.
