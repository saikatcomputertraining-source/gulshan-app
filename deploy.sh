#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/gulshan}"
cd "$ROOT"
[ -f .env ] || { echo "ERROR: create $ROOT/.env from .env.example first"; exit 1; }
command -v docker >/dev/null || { echo "ERROR: Docker is required"; exit 1; }
docker compose config >/dev/null
docker compose build --pull
docker compose up -d
# Seed is idempotent and runs once per deployment, not on every API restart.
docker compose run --rm api npm run prisma db seed
echo "Waiting for API..."
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then break; fi
  sleep 3
done
curl -fsS http://127.0.0.1:4000/api/health
echo
docker compose ps
