# Base Case — Handoff (state as of 2026-11-03)

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

## Open items (ranked)
1. Replace the questionnaire stand-in text with the exact FNCE 2830 text from Flight Plan (`shared/data/questionnaire.ts`).
2. Verify the `verified:false` figures listed in `shared/data/sources.md` on primary sources (irs.gov, ssa.gov, bls.gov,
   studentaid.gov, state DORs) — the build environment could not open those hosts.
3. Email delivery (invites, self-service password reset) and a hosted deployment with TLS.
4. 2027 IRS retirement limits when Notice 2026-xx is published (mid-November 2026); 2027 tax brackets (Rev. Proc.).
5. Attorney review of `docs/PRIVACY_POLICY.md`, Terms, and the service-provider agreement for MCIA (72-hour breach notice).
6. Nice-to-haves: code-split the 1 MB bundle; passkeys; Redis-backed rate limits for multi-instance; key-rotation script;
   itemized deductions and state credits; Flight Plan airline module as an occupation pack.

## Where things are
- Design system: `docs/DESIGN.md`; architecture: `docs/ARCHITECTURE.md`; security: `docs/SECURITY.md`;
  compliance: `docs/COMPLIANCE_NOTES.md`; data refresh: `docs/DATA_UPDATES.md`; questions for the owner:
  `docs/QUESTIONS_AND_RESOURCES.md`.
- Visual review: `npm run screenshots` (needs the production server on :8787 or `BASE_URL`), output in `screenshots/`.
