#!/bin/sh
# Database backups for production (runs in the `backup` compose service, which has
# pg_dump/pg_restore 18). Connection comes from PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
#
#   sh backup.sh now                 one backup into /backups
#   sh backup.sh loop                daily at BACKUP_HOUR, keeping BACKUP_KEEP_DAYS days
#   sh backup.sh restore FILE [DB]   restore FILE into DB (default: $PGDATABASE)
set -eu

DIR=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

backup() {
  file="$DIR/attendance-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump --format=custom --no-owner --file="$file.partial"
  mv "$file.partial" "$file"
  echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"
  find "$DIR" -name 'attendance-*.dump' -mtime +"$KEEP_DAYS" -print -delete
}

case "${1:-now}" in
  now)
    backup
    ;;
  loop)
    hour="${BACKUP_HOUR:-2}"
    echo "[backup] daily at ${hour}:00 ($(date +%Z)), keeping ${KEEP_DAYS} days"
    while true; do
      now=$(date +%s)
      next=$(date -d "$(date +%Y-%m-%d) ${hour}:00:00" +%s)
      [ "$next" -le "$now" ] && next=$((next + 86400))
      sleep $((next - now))
      backup || echo "[backup] FAILED"
    done
    ;;
  restore)
    file="${2:?usage: backup.sh restore FILE [DATABASE]}"
    target="${3:-$PGDATABASE}"
    echo "[backup] restoring $file into $target"
    pg_restore --clean --if-exists --no-owner --dbname="$target" "$file"
    echo "[backup] restore finished"
    ;;
  *)
    echo "usage: backup.sh now | loop | restore FILE [DATABASE]" >&2
    exit 2
    ;;
esac
