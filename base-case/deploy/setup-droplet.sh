#!/usr/bin/env bash
# One-time setup for an Ubuntu 22.04/24.04 DigitalOcean droplet. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/langhamluke/One/main/base-case/deploy/setup-droplet.sh | bash
# or, after cloning: sudo bash base-case/deploy/setup-droplet.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/langhamluke/One.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/base-case"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> Installing Docker, git, ufw, unattended upgrades"
apt-get update -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "==> Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Swap (builds need ~1.5 GB RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Code"
if [[ -d "$APP_DIR/.git" ]]; then git -C "$APP_DIR" fetch origin "$BRANCH" && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull --ff-only;
else git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"; fi
cd "$APP_DIR/base-case"

ENV_FILE="deploy/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Configuration"
  read -rp "Domain for Base Case (e.g. app.example.com, DNS A record must point here): " DOMAIN </dev/tty
  read -rp "Admin email: " ADMIN_EMAIL </dev/tty
  while true; do
    read -rsp "Admin password (12+ characters): " ADMIN_PW </dev/tty; echo
    [[ ${#ADMIN_PW} -ge 12 ]] && break || echo "Too short."
  done
  read -rp "Load demo personas and demo accounts? [y/N]: " DEMO </dev/tty
  read -rp "Anthropic API key for the assistant (Enter to skip): " AKEY </dev/tty
  umask 077
  cat > "$ENV_FILE" <<CFG
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BASE_CASE_MASTER_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
FIRM_NAME=Base Case
BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}
BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PW}
DEMO_SEED=$([[ "${DEMO,,}" == "y" ]] && echo 1 || echo 0)
ANTHROPIC_API_KEY=${AKEY}
CFG
  echo
  echo "!! Saved secrets to $APP_DIR/base-case/$ENV_FILE (mode 600)."
  echo "!! Copy BASE_CASE_MASTER_KEY to your password manager NOW. Without it, plan data cannot be decrypted."
fi

echo "==> Building and starting (first build takes a few minutes)"
docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE" up -d --build

echo "==> Nightly encrypted-at-rest database backups at 03:17"
install -m 755 deploy/backup.sh /usr/local/bin/base-case-backup
( crontab -l 2>/dev/null | grep -v base-case-backup; echo "17 3 * * * /usr/local/bin/base-case-backup >> /var/log/base-case-backup.log 2>&1" ) | crontab -

DOMAIN_SET=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
echo
echo "Done. Open https://${DOMAIN_SET} (the certificate is issued on the first request; allow ~30 s)."
echo "Then: log in as the admin, enable two-factor on Account, and remove BOOTSTRAP_ADMIN_PASSWORD from $ENV_FILE."
