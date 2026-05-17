#!/bin/bash
# 每日备份 choir_db，保留 7 天
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/choir-mysql}"
RETENTION_DAYS=7
DB_NAME="choir_db"
DB_USER="choir"
# 在 /root/.my.cnf 或环境变量 MYSQL_PWD 中配置密码

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"

mysqldump -u "$DB_USER" "$DB_NAME" | gzip > "$FILE"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
