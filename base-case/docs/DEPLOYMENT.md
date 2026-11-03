# Deploying Base Case

## Local (zero setup)
```bash
cd base-case
npm install
cp .env.example .env     # defaults are fine for local demos (embedded database, demo seed on)
npm run dev              # API on :8787, web on :5173 (proxying /api)
```
Open http://localhost:5173. Demo accounts are printed by the API on first start (see README).

## DigitalOcean droplet (recommended, tested)
See `docs/DEPLOY_DIGITALOCEAN.md`: one setup script, Docker Compose with PostgreSQL and Caddy (automatic HTTPS), nightly backups.

## Production (single container + managed PostgreSQL)
1. Create a PostgreSQL database (Neon, Supabase, Railway, RDS…). Note the connection string.
2. Generate secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # BASE_CASE_MASTER_KEY
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))" # SESSION_SECRET
   ```
3. Set environment variables on the host: `NODE_ENV=production`, `PORT`, `APP_ORIGIN=https://your.domain`,
   `DATABASE_URL`, `BASE_CASE_MASTER_KEY`, `SESSION_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`,
   `DEMO_SEED=0`, optional `ANTHROPIC_API_KEY`, `FIRM_NAME`.
4. Build and run with the provided Dockerfile (`docker build -t base-case . && docker run -p 8787:8787 --env-file .env base-case`)
   or on Railway/Render/Fly: build command `npm ci && npm run build`, start command `npm start`, root directory `base-case`.
5. Put TLS in front (platform-provided). Log in as the bootstrap admin, enable TOTP, invite advisors and clients.

## Backups and key custody
- Database backups contain only ciphertext for plan data; keep `BASE_CASE_MASTER_KEY` in the host's secret manager
  and in an offline escrow. Losing the key makes plan data unrecoverable.
- Key rotation: add the new key as `BASE_CASE_MASTER_KEY` and the old one as `BASE_CASE_MASTER_KEY_PREVIOUS`
  (key id 1 → 2), run `npm run rotate-keys` (to be added) to re-encrypt, then remove the previous key.

## Health
`GET /api/health` returns `{ ok: true, db: "pglite" | "postgres", version }`.
