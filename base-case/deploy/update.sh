#!/usr/bin/env bash
# Pull the latest code and rebuild with zero config changes. Run on the droplet as root.
set -euo pipefail
cd /opt/base-case
git pull --ff-only
cd base-case
/usr/local/bin/base-case-backup || echo "warning: pre-update backup failed"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d --build
docker image prune -f >/dev/null
echo "Updated. Health:"; sleep 8; docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production ps
