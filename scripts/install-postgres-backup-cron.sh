#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-$HOME/.vibeage-backups/postgres}
BACKUP_SCHEDULE=${BACKUP_SCHEDULE:-17 3 * * *}
RETENTION_DAYS=${RETENTION_DAYS:-14}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

BEGIN_MARKER="# vibeage postgres backup BEGIN"
END_MARKER="# vibeage postgres backup END"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

main() {
  require_cmd awk
  require_cmd crontab
  require_cmd mktemp

  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"

  local cron_command
  local tmp_file

  cron_command="cd $REPO_ROOT && BACKUP_ROOT=$BACKUP_ROOT RETENTION_DAYS=$RETENTION_DAYS scripts/backup-postgres.sh >> $BACKUP_ROOT/backup.log 2>&1"
  tmp_file=$(mktemp)

  (crontab -l 2>/dev/null || true) | awk \
    -v begin="$BEGIN_MARKER" \
    -v end="$END_MARKER" \
    '$0 == begin { skip = 1; next } $0 == end { skip = 0; next } !skip { print }' \
    > "$tmp_file"

  {
    if [ -s "$tmp_file" ]; then
      printf '\n'
    fi
    printf '%s\n' "$BEGIN_MARKER"
    printf '%s %s\n' "$BACKUP_SCHEDULE" "$cron_command"
    printf '%s\n' "$END_MARKER"
  } >> "$tmp_file"

  crontab "$tmp_file"
  rm -f "$tmp_file"

  printf 'Installed Postgres backup cron:\n'
  printf '%s %s\n' "$BACKUP_SCHEDULE" "$cron_command"
}

main "$@"
