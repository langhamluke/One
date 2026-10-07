#!/usr/bin/env bash
# One-shot install on a fresh Ubuntu droplet. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/langhamluke/One/claude/serene-clarke-ln6u4a/deploy/droplet.sh | bash
set -euo pipefail
BRANCH="${BRANCH:-claude/serene-clarke-ln6u4a}"
apt-get update -y && apt-get install -y git docker.io docker-compose-v2
systemctl enable --now docker
mkdir -p /opt && cd /opt
if [ ! -d One ]; then git clone -b "$BRANCH" https://github.com/langhamluke/One.git; fi
cd One && git checkout "$BRANCH" && git pull
[ -f .env ] || cp .env.example .env
[ -f config/settings.yaml ] || cp config/settings.example.yaml config/settings.yaml
echo
echo "Now edit /opt/One/.env (Alpaca keys, SMTP, SMS) then run:"
echo "  cd /opt/One && docker compose up -d --build && docker compose logs -f"
echo "One-off run:  docker compose run --rm letf python -m letf run"
