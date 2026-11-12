# Deploy Base Case, Flight Plan or Sprout on your DigitalOcean droplet

Tested end to end on 2026-11-03 with the exact files in `deploy/` (Postgres 16, the app image, Caddy 2 with automatic HTTPS).

## Base Case or Flight Plan?
The same image serves either product. The setup script asks **Product to serve** (`base-case` or `flight-plan`) and
writes `PRODUCT=` and a matching `FIRM_NAME=` into `deploy/.env.production`; the automatic address becomes
`flightplan.<ip>.sslip.io` for Flight Plan. In non-interactive mode pass `PRODUCT=flight-plan` on the command line.
To run **several** products on one droplet, install Base Case first, then add Flight Plan with
`deploy/setup-flight-plan.sh` and Sprout with `deploy/setup-sprout.sh` (see below): each gets its own database and app
container, and the one Caddy proxy serves every address. Each product needs its own database, because plans, users and
invites are per instance.
To switch an existing instance, change `PRODUCT=` in `deploy/.env.production` and run `deploy/update.sh`; existing
plans keep working (each plan carries its own product tag).

## What runs on the droplet
| Container | Role | Exposed |
|---|---|---|
| `caddy` | HTTPS termination with free Let's Encrypt certificates, HTTP→HTTPS redirect | ports 80, 443 |
| `app` | Base Case API and web app | internal only |
| `db` | PostgreSQL 16 (plan data is AES-256-GCM ciphertext before it gets here) | internal only, no port |

## Sharing the droplet with trading systems
Base Case is built to sit next to your trading systems without disturbing them:
- **Hard caps:** the app, database and proxy are limited to 1.75 CPUs and ~1.25 GB RAM combined, at low CPU priority.
  Measured idle use is ~250 MB RAM and under 1% CPU.
- **No network surprises:** the setup script never turns on a firewall that is currently off (that could cut your bots
  off from exchanges or webhooks). If `ufw` is already on, it only adds 80/443. It refuses to run if 80/443 are taken.
- **No unattended restarts:** automatic OS upgrades stay as they are unless you opt in (`ENABLE_AUTO_UPDATES=1`),
  because they can restart services.
- **Separate everything:** its own containers, private Docker network, own database, own directory (`/opt/base-case`).
- **Build timing:** the image build uses one to two CPUs for 2–4 minutes. Run setup and updates outside market hours.

**My recommendation:** a separate $6–12/month droplet is cleaner. Base Case is a public website; your trading box holds
exchange keys. Isolation means a problem in one can never touch the other. The same scripts work unchanged on a new
droplet. If you stay on one droplet, the safeguards above apply.

## Before you start (10 minutes)
1. **Droplet:** Ubuntu 24.04 or 22.04, at least 1 GB RAM free for Base Case. The script adds 2 GB swap only if none exists.
2. **A web address.** Easiest: none. Leave `DOMAIN` unset and the installer uses a free automatic address,
   `basecase.<droplet-ip-with-dashes>.sslip.io`, which needs no DNS setup and still gets a real HTTPS certificate.
   Later, to use your own name (for example `basecase.slopecycleski.com`), add an **A record** for `basecase` pointing at
   the droplet's IP wherever the domain's DNS is managed, change `DOMAIN=` in `deploy/.env.production`, and run `deploy/update.sh`.
3. **SSH access** as root or a sudo user.

## Option A: let Claude Code on the droplet do it
SSH in, start Claude Code in your home directory, and paste this prompt as is:

```text
Deploy Base Case on this server. Rules: do not stop, restart, modify or read the configuration or secrets of any
existing service, process, container, cron job or firewall rule (my trading systems run here). Only touch
/opt/base-case, Docker, and the base-case cron entry. Ask me before any command that could affect other services.

Steps:
1. Show me what is listening on ports 80 and 443 and stop if anything is.
2. git clone --branch claude/festive-goldberg-9jofrz https://github.com/langhamluke/One.git /opt/base-case
3. Read /opt/base-case/base-case/docs/DEPLOY_DIGITALOCEAN.md and /opt/base-case/base-case/deploy/setup-droplet.sh.
4. Run: sudo NONINTERACTIVE=1 PRODUCT=flight-plan BRANCH=claude/festive-goldberg-9jofrz ADMIN_EMAIL=langhamluke14@gmail.com bash /opt/base-case/base-case/deploy/setup-droplet.sh
   (PRODUCT=base-case for the graduate product; no DOMAIN given on purpose: the script picks a free automatic address of the form flightplan.<ip>.sslip.io or basecase.<ip>.sslip.io)
5. Tell me the exact https:// address it chose, confirm that address + /api/health returns ok, and show `docker stats --no-stream`.
6. Do not print the contents of deploy/.env.production. Tell me the command to read the admin password myself.
```

## Option B: run it yourself
SSH in and run:
```bash
git clone --branch claude/festive-goldberg-9jofrz https://github.com/langhamluke/One.git /opt/base-case
```
```bash
sudo BRANCH=claude/festive-goldberg-9jofrz bash /opt/base-case/base-case/deploy/setup-droplet.sh
```
It asks for the product (base-case / flight-plan), your domain, admin email, admin password (or generates one), demo
accounts yes/no, and an optional Anthropic key; writes all secrets to `/opt/base-case/base-case/deploy/.env.production` (root-only); builds; starts; and
schedules a nightly database backup at 03:17 with 14-day retention. After the branch is merged into `main`, drop the
`--branch` and `BRANCH=` parts.

**Copy `BASE_CASE_MASTER_KEY` from that file into your password manager right away.** Losing it makes every stored plan
unreadable. The app refuses to start with the wrong key, so it can never silently show blank plans.

## Adding Flight Plan next to Base Case
On a droplet that already runs Base Case:
```bash
cd /opt/base-case && git pull --ff-only
sudo ADMIN_EMAIL=you@example.com SEED_CLIENT_EMAILS="student=client@example.com" bash base-case/deploy/setup-flight-plan.sh
```
It writes `deploy/.env.flight-plan` (own Postgres password, master key, session secret, generated admin password, and
the Base Case Anthropic key reused unless `ANTHROPIC_API_KEY` is given), adds `deploy/sites/flightplan.caddy` to the
shared proxy, builds the `flightplan` compose stack (`deploy/docker-compose.flight-plan.yml`) and reloads Caddy. The
address defaults to `flightplan.<ip-with-dashes>.sslip.io`; pass `DOMAIN=` for your own name (add its A record first).
`SEED_CLIENT_EMAILS` seeds the product's real clients (invited, no password, plan filled in) on the first start, with no
demo accounts; afterwards send each one a reset link from Users. `deploy/update.sh` and the nightly backup cover both
products once the Flight Plan env file exists. Total footprint for both: about 2.5 CPUs and 2 GB RAM at the caps, under
200 MB RAM idle.

## Adding Sprout next to Base Case and Flight Plan
Same pattern, third stack:
```bash
cd /opt/base-case/base-case && git pull --ff-only
sudo ADMIN_EMAIL=you@example.com DEMO_SEED=0 bash deploy/setup-sprout.sh
```
It writes `deploy/.env.sprout` (own Postgres password, master key, session secret, a generated admin password unless
`ADMIN_PASSWORD` is given, `FIRM_NAME=Sprout`, the Base Case Anthropic key reused), adds `deploy/sites/sprout.caddy`,
builds the `sprout` compose stack (`deploy/docker-compose.sprout.yml`: `sprout-db` 256 MB, `sprout-app` 512 MB, no
ports of its own, on the shared `basecase_web` network) and reloads Caddy. The address defaults to
`sprout.<ip-with-dashes>.sslip.io`; pass `DOMAIN=` for your own name. `deploy/update.sh` and the nightly backup
(`sprout-<stamp>.dump`, 14-day retention) cover Sprout once `deploy/.env.sprout` exists. Three stacks fit a 1 GB + 2 GB
swap droplet only if about 250 MB RAM is free before the build; check `free -m` and `docker stats --no-stream` first
and build outside market hours. Sprout seeds no real clients; invite friends from Users after the first login.

## First login
1. Open `https://your-domain`. The first visit can take ~30 seconds while the certificate is issued.
2. Sign in with the admin email and password you entered.
3. **Account → Two-factor authentication**: enable it.
4. **Admin → Settings**: turn on "Require MFA for staff".
5. Remove the bootstrap password from the env file (it is only used on the very first start):
   ```bash
   sudo sed -i 's/^BOOTSTRAP_ADMIN_PASSWORD=.*/BOOTSTRAP_ADMIN_PASSWORD=/' /opt/base-case/base-case/deploy/.env.production
   ```
6. **Admin → Users → Invite user** for each friend. Copy the invite link it shows and send it to them yourself
   (email delivery is not wired up yet). Invites expire after 72 hours.

## Day-to-day
Update to the latest code (takes a backup first):
```bash
sudo bash /opt/base-case/base-case/deploy/update.sh
```
Status and logs:
```bash
cd /opt/base-case/base-case && sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production ps
```
```bash
cd /opt/base-case/base-case && sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production logs -f app
```
Manual backup (files land in `/opt/base-case/backups`):
```bash
sudo /usr/local/bin/base-case-backup
```
Restore a backup (stops nothing else; replaces the database contents):
```bash
cd /opt/base-case/base-case && sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production exec -T db pg_restore -U basecase -d basecase --clean --if-exists < /opt/base-case/backups/basecase-YYYYMMDDTHHMMSSZ.dump
```
Turn on the Claude assistant later: put `ANTHROPIC_API_KEY=...` in the env file and run the update script.

## Off-droplet backups (recommended)
Backups on the same droplet do not survive losing the droplet. Either enable DigitalOcean's weekly droplet backups
(Droplet → Backups, +20% of the droplet price) or copy `/opt/base-case/backups` to DigitalOcean Spaces nightly.
The dumps contain only ciphertext for plan data, but keep them private anyway.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Browser shows a certificate error | DNS A record not pointing at the droplet yet, or port 80 blocked. Check `dig +short your-domain` and `sudo ufw status`. |
| `app` keeps restarting with "does not match the key" | The env file's `BASE_CASE_MASTER_KEY` differs from the one that created the database. Restore the original key. |
| Build killed / out of memory | Confirm swap is on (`swapon --show`); resize the droplet to 2 GB for the build, then back down. |
| Ports 80/443 already in use | Another web server is running on the droplet. Ask me for the shared-proxy variant. |
