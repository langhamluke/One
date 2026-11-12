#!/usr/bin/env bash
# Add Sprout next to an existing Base Case (and Flight Plan) install on the same droplet (run as root on the droplet).
# Base Case keeps its containers, database and address; Sprout gets its own database and app container, and the
# existing Caddy proxy serves every domain. Ports 80/443 stay with that one Caddy.
#
#   sudo ADMIN_EMAIL=you@example.com bash /opt/base-case/base-case/deploy/setup-sprout.sh
#   optional env: DOMAIN (default sprout.<ip>.sslip.io), ADMIN_PASSWORD (generated if unset), DEMO_SEED=0|1,
#                 SEED_CLIENT_EMAILS (Sprout seeds no real clients by default), ANTHROPIC_API_KEY (default: reuse Base Case's key)
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/base-case/base-case}"
BASE_ENV="deploy/.env.production"
ENV_FILE="deploy/.env.sprout"
BASE_COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$BASE_ENV")
SP_COMPOSE=(docker compose -f deploy/docker-compose.sprout.yml --env-file "$ENV_FILE")

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
cd "$APP_DIR"
[[ -f "$BASE_ENV" ]] || { echo "Base Case is not installed here ($APP_DIR/$BASE_ENV missing). Run deploy/setup-droplet.sh first." >&2; exit 1; }
docker network inspect basecase_web >/dev/null 2>&1 || { echo "The Base Case stack is not running (network basecase_web missing)." >&2; exit 1; }

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Configuration"
  if [[ -z "${DOMAIN:-}" ]]; then
    PUB_IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)
    [[ "$PUB_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Could not detect the public IPv4 address; pass DOMAIN=... explicitly." >&2; exit 1; }
    DOMAIN="sprout.${PUB_IP//./-}.sslip.io"
    echo "No domain given: using the automatic address https://${DOMAIN}"
  fi
  [[ -n "${ADMIN_EMAIL:-}" ]] || { echo "ADMIN_EMAIL is required." >&2; exit 1; }
  GENERATED=0
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then ADMIN_PASSWORD="SP-$(openssl rand -base64 18 | tr -d '/+=\n')"; GENERATED=1; fi
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo "Admin password must be at least 12 characters." >&2; exit 1; }
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' "$BASE_ENV" | cut -d= -f2- || true)
    [[ -n "$ANTHROPIC_API_KEY" ]] && echo "Assistant: reusing the Anthropic key from the Base Case install."
  fi
  umask 077
  cat > "$ENV_FILE" <<CFG
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BASE_CASE_MASTER_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
FIRM_NAME=Sprout
BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}
BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEMO_SEED=$([[ "${DEMO_SEED:-0}" =~ ^(1|y|Y|yes)$ ]] && echo 1 || echo 0)
SEED_CLIENT_EMAILS=${SEED_CLIENT_EMAILS:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
CFG
  chmod 600 "$ENV_FILE"
  echo "Secrets written to $APP_DIR/$ENV_FILE (root-only)."
  [[ $GENERATED == 1 ]] && echo "A random admin password was generated; read it with: sudo grep BOOTSTRAP_ADMIN_PASSWORD $APP_DIR/$ENV_FILE"
  echo "IMPORTANT: copy BASE_CASE_MASTER_KEY from that file into your password manager. Without it stored plans cannot be decrypted."
fi

DOMAIN_SET=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
echo "==> Proxy route for https://${DOMAIN_SET}"
mkdir -p deploy/sites
cat > deploy/sites/sprout.caddy <<SITE
${DOMAIN_SET} {
	encode zstd gzip
	reverse_proxy sprout-app:8787
	log {
		output stdout
		format json
	}
}
SITE
# Recreates the Caddy container only when its mounts changed (first run); a few seconds of Base Case downtime at most.
"${BASE_COMPOSE[@]}" up -d --no-build caddy

echo "==> Building and starting Sprout (capped at 1 CPU / ~0.75 GB RAM; low CPU priority)"
"${SP_COMPOSE[@]}" up -d --build
"${BASE_COMPOSE[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile

echo "==> Nightly backup covers every product database"
install -m 755 deploy/backup.sh /usr/local/bin/base-case-backup

echo
echo "Done. Open https://${DOMAIN_SET} (first visit issues the certificate; allow ~30 s)."
echo "Then: log in, enable two-factor on Account, and blank BOOTSTRAP_ADMIN_PASSWORD in $ENV_FILE."
