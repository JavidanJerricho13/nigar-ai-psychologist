#!/usr/bin/env bash
# ============================================
# Daily PostgreSQL backup to S3/R2 storage
# Run via cron: 0 3 * * * /path/to/pg-backup.sh
# ============================================

set -euo pipefail

# Required environment variables:
#   DATABASE_URL   — PostgreSQL connection string
#   S3_BUCKET      — S3/R2 bucket name
#   S3_ENDPOINT    — S3 endpoint (for Cloudflare R2: https://<account>.r2.cloudflarestorage.com)
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="nigar_backup_${TIMESTAMP}.sql.gz"
TEMP_DIR="/tmp/nigar-backups"

mkdir -p "$TEMP_DIR"

echo "[$(date)] Starting backup..."

# Dump and compress
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "${TEMP_DIR}/${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${TEMP_DIR}/${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to S3/R2
aws s3 cp "${TEMP_DIR}/${BACKUP_FILE}" \
  "s3://${S3_BUCKET}/backups/${BACKUP_FILE}" \
  --endpoint-url "${S3_ENDPOINT}" \
  2>/dev/null

echo "[$(date)] Uploaded to s3://${S3_BUCKET}/backups/${BACKUP_FILE}"

# Cleanup local file
rm -f "${TEMP_DIR}/${BACKUP_FILE}"

# Cleanup old backups (keep last 30 days)
aws s3 ls "s3://${S3_BUCKET}/backups/" \
  --endpoint-url "${S3_ENDPOINT}" \
  2>/dev/null \
  | awk '{print $4}' \
  | sort \
  | head -n -30 \
  | while read -r old_file; do
    aws s3 rm "s3://${S3_BUCKET}/backups/${old_file}" \
      --endpoint-url "${S3_ENDPOINT}" 2>/dev/null
    echo "[$(date)] Deleted old backup: ${old_file}"
  done

echo "[$(date)] Backup complete!"
