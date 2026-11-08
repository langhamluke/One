#!/usr/bin/env bash
# One-time setup for Base Case on an Ubuntu 22.04/24.04 droplet. Safe to run on a server that already hosts other
# workloads (e.g. trading systems): it never enables a firewall that is currently off, never turns on automatic
# upgrades unless asked, refuses to start if ports 80/443 are taken, and caps Base Case's CPU and memory.
#
# Interactive:      sudo bash deploy/setup-droplet.sh
# Non-interactive:  sudo DOMAIN=plan.example.com ADMIN_EMAIL=you@example.com NONINTERACTIVE=1 bash deploy/setup-droplet.sh
#   (omit DOMAIN to get a free automatic address: basecase.<public-ip>.sslip.io)
#   optional env:   ADMIN_PASSWORD (generated if unset), DEMO_SEED=0|1, ANTHROPIC_API_KEY, BRANCH, ENABLE_AUTO_UPDATES=1
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/langhamluke/One.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/base-case"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
ask() { # ask VAR "prompt" [secret]
  local __var=$1 __prompt=$2 __secret=${3:-}
  if [[ -n "${!__var:-}" || "$NONINTERACTIVE" == "1" ]]; then return; fi
  if [[ -n "$__secret" ]]; then read -rsp "$__prompt" "$__var" </dev/tty; echo; else read -rp "$__prompt" "$__var" </dev/tty; fi
}

echo "==> Pre-flight checks"
for port in 80 443; do
  if ss -ltnH "( sport = :$port )" | grep -q .; then
    echo "Port $port is already in use by:"; ss -ltnpH "( sport = :$port )" || true
    echo "Base Case needs ports 80 and 443. Stop that service or ask for the shared reverse-proxy setup. Nothing was changed." >&2
    exit 1
  fi
done
echo "Currently listening services (left untouched):"; ss -ltnpH | awk '{print "  " $4 "  " $6}' | sort -u | head -40

echo "==> Packages (Docker only if missing)"
apt-get update -y
apt-get install -y ca-certificates curl git openssl
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; else echo "Docker already installed: $(docker --version)"; fi
systemctl enable --now docker

echo "==> Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
  echo "ufw is active: added 80/tcp, 443/tcp, 443/udp. Existing rules kept."
else
  echo "ufw is NOT active. Leaving it off so existing services (e.g. trading systems) keep their current network access."
  echo "Recommended later, after listing the ports those services need: ufw allow OpenSSH; ufw allow 80,443/tcp; ufw allow <their ports>; ufw enable"
fi

if [[ "${ENABLE_AUTO_UPDATES:-0}" == "1" ]]; then
  apt-get install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
  echo "Automatic security updates enabled."
else
  echo "Automatic OS updates not changed (they can restart services; enable deliberately with ENABLE_AUTO_UPDATES=1)."
fi

echo "==> Swap (only if the droplet has none)"
if [[ -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Added 2 GB swap."
else
  echo "Swap already present."
fi

echo "==> Code"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin "$BRANCH" && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/base-case"

ENV_FILE="deploy/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Configuration"
  ask DOMAIN "Domain for Base Case (Enter for an automatic free address via sslip.io): "
  if [[ -z "${DOMAIN:-}" ]]; then
    PUB_IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)
    [[ "$PUB_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Could not detect the public IPv4 address; pass DOMAIN=... explicitly." >&2; exit 1; }
    DOMAIN="basecase.${PUB_IP//./-}.sslip.io"
    echo "No domain given: using the automatic address https://${DOMAIN} (sslip.io resolves it to ${PUB_IP}; HTTPS certificate is still issued normally)."
  fi
  ask ADMIN_EMAIL "Admin email: "
  ask ADMIN_PASSWORD "Admin password (12+ characters, Enter to generate one): " secret
  ask DEMO_SEED "Load demo personas and demo accounts? [0/1]: "
  ask ANTHROPIC_API_KEY "Anthropic API key for the assistant (Enter to skip): "
  [[ -n "${ADMIN_EMAIL:-}" ]] || { echo "ADMIN_EMAIL is required." >&2; exit 1; }
  GENERATED=0
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then ADMIN_PASSWORD="BC-$(openssl rand -base64 18 | tr -d '/+=\n')"; GENERATED=1; fi
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo "Admin password must be at least 12 characters." >&2; exit 1; }
  umask 077
  cat > "$ENV_FILE" <<CFG
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BASE_CASE_MASTER_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
FIRM_NAME=Base Case
BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}
BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEMO_SEED=$([[ "${DEMO_SEED:-0}" =~ ^(1|y|Y|yes)$ ]] && echo 1 || echo 0)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
CFG
  chmod 600 "$ENV_FILE"
  echo "Secrets written to $APP_DIR/base-case/$ENV_FILE (root-only)."
  [[ $GENERATED == 1 ]] && echo "A random admin password was generated; read it with: sudo grep BOOTSTRAP_ADMIN_PASSWORD $APP_DIR/base-case/$ENV_FILE"
  echo "IMPORTANT: copy BASE_CASE_MASTER_KEY from that file into your password manager. Without it stored plans cannot be decrypted."
fi

echo "==> Building and starting (Base Case is capped at 1 CPU and ~1.2 GB RAM total; low CPU priority)"
docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE" up -d --build

echo "==> Nightly database backup at 03:17"
install -m 755 deploy/backup.sh /usr/local/bin/base-case-backup
( { crontab -l 2>/dev/null || true; } | { grep -v base-case-backup || true; }; echo "17 3 * * * /usr/local/bin/base-case-backup >> /var/log/base-case-backup.log 2>&1" ) | crontab -

DOMAIN_SET=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
echo
echo "Done. Open https://${DOMAIN_SET} (first visit issues the certificate; allow ~30 s)."
echo "Then: log in, enable two-factor on Account, and blank BOOTSTRAP_ADMIN_PASSWORD in $ENV_FILE."
