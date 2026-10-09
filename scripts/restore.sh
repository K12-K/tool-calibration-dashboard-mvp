#!/usr/bin/env bash
# Restores a backup created by backup.sh.  THIS REPLACES THE CURRENT DATA.
# Usage: ./scripts/restore.sh ./backups/20260101-020000
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?Usage: $0 <backup-directory>}"
SRC_ABS="$(cd "$SRC" && pwd)"
[ -f "$SRC_ABS/database.dump" ] && [ -f "$SRC_ABS/uploads.tgz" ] || { echo "database.dump / uploads.tgz not found in $SRC"; exit 1; }

env_val() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
PGUSER="$(env_val POSTGRES_USER)"; PGUSER="${PGUSER:-calibration}"
PGDB="$(env_val POSTGRES_DB)";     PGDB="${PGDB:-calibration}"

read -r -p "This overwrites the current database and files. Type YES to continue: " ans
[ "$ans" = "YES" ] || { echo "Aborted."; exit 1; }

docker compose stop web backend
docker compose up -d db
sleep 5
docker compose exec -T db pg_restore -U "$PGUSER" -d "$PGDB" --clean --if-exists --no-owner < "$SRC_ABS/database.dump"
docker compose run --rm --no-deps -T --user root --entrypoint sh -v "$SRC_ABS":/backup backend \
  -c "rm -rf /data/uploads/* && tar xzf /backup/uploads.tgz -C /data && chown -R 10001:10001 /data/uploads"
docker compose up -d
echo "Restore complete."
