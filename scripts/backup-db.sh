#!/usr/bin/env bash
# Nightly MySQL dump -> /mnt/sdb/BACKUPS/dbName_YYYY-MM-DD_HHMM.sql.gz
set -euo pipefail

DB_NAME="eskimos_sgen_db"
DB_USER="root"
DB_PASS="CHANGE_ME"          # or: export DB_PASS via systemd EnvironmentFile
BACKUP_DIR="/mnt/sdb/BACKUPS"
KEEP_DAYS=14                  # delete dumps older than this

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql"

mysqldump -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction --routines --triggers --events \
    "$DB_NAME" > "$OUT"

gzip "$OUT"
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+$KEEP_DAYS" -delete

echo "$(date +%F\ %T) backup written: ${OUT}.gz ($(du -h "${OUT}.gz" | cut -f1))"
