# Base Case Security Overview

This document describes the security design of Base Case as built on 2026-11-03. It is written so that a
compliance officer at a registered investment adviser can evaluate the application as a service provider.

## Threat model
Base Case stores financial-planning inputs for individual clients and exposes them to three roles. The data is
sensitive (income, debts, balances) but is deliberately **not** account-level data: the product asks users not to
enter SSNs, dates of birth, account numbers, lender names or health details. Primary risks are (1) one client
seeing another's plan, (2) credential compromise, (3) exposure of the database or backups, (4) leakage through the
AI assistant, and (5) an untrustworthy change being treated as approved.

## Controls

| Area | Control |
|---|---|
| Authentication | Email + password; scrypt (N=2^15, r=8, p=1, 16-byte salt); 12-character minimum; common-password denylist; generic failure messages; 5 attempts / 15 min per IP+email rate limit; lockout after 10 failures. |
| Two-factor | TOTP (RFC 6238) for any account; can be required for all staff (admin/advisor) via settings. |
| Sessions | 256-bit random token stored only as a SHA-256 hash; cookie `HttpOnly; SameSite=Lax; Secure` (https); 12-hour sliding expiry, 7-day absolute; per-session revocation. |
| CSRF | SameSite cookie + Origin/Referer check against the configured app origin + required custom header on state-changing requests. |
| Authorization | Single chokepoint (`server/auth/authorize.ts`): clients → own data only; advisors → assigned clients only; admins → all, logged. Cross-client access returns 404 to prevent enumeration. Covered by an authorization-matrix test suite. |
| Approval workflow | Client changes live in a *proposal* and never alter the approved plan until an advisor or admin approves; approvals create an immutable plan version with the approver's identity. |
| Encryption at rest | Plan states, proposal drafts, assistant messages and TOTP secrets are encrypted with AES-256-GCM under a 256-bit master key held only in the server environment; each ciphertext is bound (AAD) to its table/column/row id so records cannot be swapped. Key id byte allows rotation. |
| Encryption in transit | TLS terminated at the host/proxy; HSTS when served over https. |
| Audit log | Append-only table: logins (success/failure), plan reads by staff, plan writes, proposal lifecycle, role/assignment/settings changes, MFA events, session revocation. No plan contents or raw PII in metadata. |
| AI assistant | Server-side only; the model receives a summary of **the requesting user's accessible plan only**, with no tools and no web access; outputs are stored encrypted; per-user rate limit; the assistant's system prompt forbids individualized advice and disclosure of other users or system details; degrades to a deterministic offline explainer when no API key is configured. |
| Browser | No plan data in localStorage/sessionStorage; CSP (`default-src 'self'`), `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on API responses; fonts bundled locally; zero third-party scripts. |
| Input validation | Every API body validated with zod schemas; numeric bounds; array and string length limits. |
| Logging | Structured JSON; never logs bodies, cookies, tokens or plan data. |
| Dependencies | Exact-pinned versions in package.json; `npm audit` as part of release checklist. |

## Operational guidance
- Generate `BASE_CASE_MASTER_KEY` and `SESSION_SECRET` with a cryptographic RNG; store them in the host's secret
  manager, never in git. Rotate the master key by adding a new key id and re-encrypting (procedure in
  `docs/DEPLOYMENT.md`).
- Run behind TLS (the host's load balancer or a reverse proxy). Set `APP_ORIGIN` to the https origin.
- Use a managed PostgreSQL with encrypted storage and automated backups; restrict network access to the app host.
- Require TOTP for staff (`requireMfaForStaff` in admin settings) before onboarding real clients.
- Review the audit log weekly; export it for the firm's books and records.
- Incident response: see `docs/COMPLIANCE_NOTES.md` (72-hour notification to the adviser; 30-day customer notice).

## Known limitations (as of this build)
- No email delivery is configured; invitation links are shown to the administrator to deliver out of band.
- Password reset is administrator-initiated (no self-service email reset) until an email provider is connected.
- No WebAuthn/passkeys yet (TOTP only).
- Single-region, single-process deployment; no horizontal scaling story yet (stateless app, so it is straightforward).
- Third-party penetration test not yet performed.
