#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/gulshan}"
FILE="${2:-}"
cd "$ROOT"
[ -n "$FILE" ] || { echo "Usage: $0 /var/www/gulshan /path/to/backup.sql.gz"; exit 1; }
[ -f .env ] || { echo "Missing .env"; exit 1; }
[ -f "$FILE" ] || { echo "Backup not found: $FILE"; exit 1; }
set -a; . ./.env; set +a
echo "WARNING: this replaces database contents. Press Ctrl+C to cancel."
sleep 5
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restore completed."
