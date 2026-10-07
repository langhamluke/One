# Security

This system handles a restaurant's sales history, employee performance, and
ordering. The operator (Raising Cane's, in the first case) forbids sending
that data to external AI services. The design takes that as a hard rule, not
a configuration option.

## Data never leaves the operator's network

- **Self-hosted.** One Python process, one SQLite file, on hardware the
  operator controls (a store back-office PC, a franchisee's server, or a
  private cloud instance). No SaaS component.
- **No external assets.** Pages load no third-party scripts, fonts, styles,
  images, or analytics. The Content-Security-Policy is `default-src 'none'`
  with `'self'` for scripts, styles, images, and connections, so a browser
  refuses anything else even if a template were ever changed by mistake.
- **No cloud AI.** The assistant's default backend is deterministic code
  over the store's numbers; no model is involved. The only optional model
  backend is a self-hosted open-weights model (Ollama) and its URL must
  resolve to localhost or a private-network address, or the app refuses to
  start. There is no OpenAI, Anthropic, Google, or other cloud provider code
  path. If the operator later clears a private enterprise endpoint, it can be
  added as a backend behind the same policy gate; none is wired today.
- **Outbound calls are limited to weather.** The only network client in the
  product fetches weather from Open-Meteo by latitude and longitude. It sends
  no store data. It can be disabled by supplying weather CSVs instead.

## Authentication and sessions

- Passwords are hashed with scrypt (N=2^14, r=8, p=1) and a per-user random
  salt, compared in constant time. Policy: 12+ characters, mixed case, a digit.
- Sessions are signed, time-limited cookies (8 hours, shift length) carrying
  only username and role. Cookies are `HttpOnly`, `SameSite=Strict`, and
  `Secure` unless the server is started in explicit insecure-dev mode.
- Login is throttled: 5 failures in 5 minutes locks the username.
- Roles: `viewer` (read), `shift_lead` (log decisions, enter counts, export
  orders), `gm` (events, overrides, templates, auto-order), `admin` (users).
  Every route declares its minimum role; the check runs server-side.
- Every state-changing form carries a per-session CSRF token checked on POST.

## Audit

The `audit_log` table records who did what and when: logins and failures,
decisions (send home / call in / hold, with the ratio that drove them),
inventory counts, order overrides, order exports (template, delivery date,
line and case counts), template edits, auto-order toggles, event edits,
user creation. The assistant log records every question and answer per user
with the number of redactions applied. Admins see both in the Admin page.

## Input handling

- All templates autoescape. Event names, notes, and template text entered by
  users are rendered as text, never HTML (covered by a test that submits a
  script tag).
- Order export templates are validated against an allow-list of fields
  before they are saved; a template cannot execute anything, only choose
  columns and labels.
- Assistant questions are scrubbed of emails, phone numbers, and card/SSN
  shaped numbers before processing or logging.
- Employees are referred to by ID throughout. Names live in the labor
  system, not here.

## Response hardening

Every response carries: strict CSP, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Permissions-Policy` denying camera/microphone/geolocation,
`Cache-Control: no-store`, and HSTS when TLS is on. API docs endpoints are
disabled.

## Deployment checklist

1. Set `FLOWCAST_SECRET_KEY` (32+ random characters). Without it the key is
   ephemeral and sessions die on restart.
2. Set `FLOWCAST_ADMIN_PASSWORD` for first run, log in, create per-person
   accounts, then unset it. Never share accounts.
3. Terminate TLS in front of the app (Caddy, nginx, or the operator's
   standard reverse proxy) and do not pass `--insecure-dev`.
4. Bind to localhost or the store LAN only. The app has no business being
   reachable from the internet.
5. Back up `data/flowcast.db` with the same controls as POS exports; it
   contains sales history derivatives and employee scores.
6. Keep `FLOWCAST_ASSISTANT=local` unless a self-hosted model has been
   approved. The admin page shows which backend is live.

## What this does not yet do

- No multi-factor authentication. Add when the deployment is beyond a single
  store's back office.
- No encryption at rest beyond what the host provides. Use full-disk
  encryption on the host.
- No rate limiting on non-login routes. Fine behind a store LAN; add at the
  proxy for anything wider.
- Session revocation is by expiry or secret rotation, not per-session.
