# Deploy Base Case on your DigitalOcean droplet

Tested end to end on 2026-11-03 with the exact files in `deploy/` (Postgres 16, the app image, Caddy 2 with automatic HTTPS).

## What runs on the droplet
| Container | Role | Exposed |
|---|---|---|
| `caddy` | HTTPS termination with free Let's Encrypt certificates, HTTP→HTTPS redirect | ports 80, 443 |
| `app` | Base Case API and web app | internal only |
| `db` | PostgreSQL 16 (plan data is AES-256-GCM ciphertext before it gets here) | internal only, no port |

## Before you start (10 minutes)
1. **Droplet:** Ubuntu 24.04 (or 22.04), at least 1 GB RAM; 2 GB is more comfortable. The setup script adds 2 GB of swap for builds.
   If the droplet already runs something on ports 80/443 (for example Flowcast), tell me and I will switch Caddy to a
   shared reverse-proxy setup instead.
2. **A domain name.** HTTPS needs one. Use a subdomain of a domain you already own (for example `plan.yourdomain.com`)
   or buy one (~$10–15/yr). In your DNS provider, create an **A record** pointing that name at the droplet's IP address.
   DigitalOcean DNS works too: Networking → Domains.
3. **SSH access** to the droplet as root (or a sudo user).

## Install (one command, then answer five prompts)
SSH in and run:
```bash
git clone --branch claude/festive-goldberg-9jofrz https://github.com/langhamluke/One.git /opt/base-case
```
```bash
sudo BRANCH=claude/festive-goldberg-9jofrz bash /opt/base-case/base-case/deploy/setup-droplet.sh
```
After the branch is merged into `main`, drop `--branch …` and `BRANCH=…`.

The script installs Docker, enables the firewall (SSH, 80, 443 only), turns on automatic security updates, adds swap,
asks for your domain, admin email and password, whether to load demo accounts, and an optional Anthropic key, then
generates all secrets into `/opt/base-case/base-case/deploy/.env.production` (readable only by root), builds, starts the
stack, and schedules a nightly database backup at 03:17 with 14-day retention.

**Immediately copy `BASE_CASE_MASTER_KEY` from that file into your password manager.** Losing it makes every stored
plan unreadable. The app refuses to start with the wrong key, so it cannot silently show blank plans.

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
