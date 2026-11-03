#!/usr/bin/env bash
# Nightly PostgreSQL dump with 14-day retention. Plan data inside the dump is already AES-256-GCM ciphertext.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/base-case/base-case}"
OUT="${BACKUP_DIR:-/opt/base-case/backups}"
mkdir -p "$OUT" && chmod 700 "$OUT"
cd "$APP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production exec -T db \
  pg_dump -U basecase -d basecase --format=custom > "$OUT/basecase-$STAMP.dump"
chmod 600 "$OUT/basecase-$STAMP.dump"
find "$OUT" -name 'basecase-*.dump' -mtime +14 -delete
echo "$(date -u) backup ok: $OUT/basecase-$STAMP.dump"
