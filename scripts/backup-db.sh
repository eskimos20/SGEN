#!/usr/bin/env bash
# Nightly MySQL dump of every eskimos% database.
# -> /mnt/sdb/BACKUPS/<dbName>_YYYY-MM-DD_HHMM.sql.gz, deletes dumps older than KEEP_DAYS.
set -euo pipefail

DB_USER="root"
DB_PASS="CHANGE_ME"
DB_PREFIX="eskimos"           # all databases whose name starts with this
BACKUP_DIR="/mnt/sdb/BACKUPS"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"

mysql -u "$DB_USER" -p"$DB_PASS" -N -B \
    -e "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE '${DB_PREFIX}%';" \
| while read -r DB_NAME; do
    OUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql"
    mysqldump -u "$DB_USER" -p"$DB_PASS" \
        --single-transaction --routines --triggers --events \
        "$DB_NAME" > "$OUT"
    gzip "$OUT"
    echo "$(date +%F\ %T) backup written: ${OUT}.gz ($(du -h "${OUT}.gz" | cut -f1))"
done

find "$BACKUP_DIR" -name "${DB_PREFIX}*.sql.gz" -mtime "+$KEEP_DAYS" -delete
echo "$(date +%F\ %T) prune done (>${KEEP_DAYS}d removed)"
