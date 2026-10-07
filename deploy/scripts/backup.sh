#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/gulshan}"
cd "$ROOT"
[ -f .env ] || { echo "Missing .env"; exit 1; }
set -a; . ./.env; set +a
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/postgres-$STAMP.sql.gz"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$FILE"
find "$BACKUP_DIR" -type f -name 'postgres-*.sql.gz' -mtime +14 -delete
chmod 600 "$FILE"
echo "Backup created: $FILE"
