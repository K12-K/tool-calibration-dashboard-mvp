#!/usr/bin/env bash
# Backs up the database and uploaded files into ./backups/<timestamp>/
# Usage: ./scripts/backup.sh [target-directory]
set -euo pipefail
cd "$(dirname "$0")/.."

env_val() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
PGUSER="$(env_val POSTGRES_USER)"; PGUSER="${PGUSER:-calibration}"
PGDB="$(env_val POSTGRES_DB)";     PGDB="${PGDB:-calibration}"

OUT="${1:-./backups}/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"

echo "Dumping database…"
docker compose exec -T db pg_dump -U "$PGUSER" -Fc "$PGDB" > "$OUT_ABS/database.dump"

echo "Archiving uploaded files…"
docker compose run --rm --no-deps -T --user root --entrypoint tar \
  -v "$OUT_ABS":/backup backend czf /backup/uploads.tgz -C /data uploads

echo "Backup written to $OUT_ABS"
ls -lh "$OUT_ABS"
