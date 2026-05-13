#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME=${APP_NAME:-vibeage}
CONFIG_FILE=${VIBEAGE_BACKUP_CONFIG:-$HOME/.config/vibeage-postgres-backup.env}
STATE_ROOT=${XDG_STATE_HOME:-$HOME/.local/state}/vibeage-postgres-backup

if [ -r "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

BACKUP_ROOT=${VIBEAGE_BACKUP_ROOT:-/media/huge/vibeage-backups/postgres}
COMPOSE_PROJECT_NAME=${VIBEAGE_COMPOSE_PROJECT_NAME:-vibeage}
CONNECT_TIMEOUT=${VIBEAGE_CONNECT_TIMEOUT:-15}
DB_NAME=${VIBEAGE_DB_NAME:-postgres}
DB_SERVICE=${VIBEAGE_DB_SERVICE:-db}
DB_USER=${VIBEAGE_DB_USER:-postgres}
REMOTE=${VIBEAGE_REMOTE:-s@159.69.33.249}
REMOTE_REPO=${VIBEAGE_REMOTE_REPO:-/home/s/vibeage-deploy/repo}
RETENTION_COPIES=${VIBEAGE_RETENTION_COPIES:-2}
RETRY_NOTE=${VIBEAGE_RETRY_NOTE:-Will retry automatically later.}
SSH_KEY=${VIBEAGE_SSH_KEY:-$HOME/.ssh/hetz}

FORCE=0
SHOW_STATUS=0

case "${1:-}" in
  --force)
    FORCE=1
    ;;
  --status)
    SHOW_STATUS=1
    ;;
  "")
    ;;
  *)
    printf 'Usage: %s [--force|--status]\n' "$0" >&2
    exit 2
    ;;
esac

mkdir -p "$STATE_ROOT"
LOG_FILE="$STATE_ROOT/pull.log"
LAST_SUCCESS_FILE="$STATE_ROOT/last-success-date"
LAST_SUCCESS_DETAIL_FILE="$STATE_ROOT/last-success.txt"
LOCK_FILE="$STATE_ROOT/lock"

if [ "$SHOW_STATUS" != "1" ]; then
  exec >>"$LOG_FILE" 2>&1
fi

log() {
  printf '[%s] %s\n' "$(date -Is)" "$1"
}

notify() {
  local urgency=$1
  local title=$2
  local body=$3

  command -v notify-send >/dev/null 2>&1 || return 0
  notify-send -a "VibeAge Backups" -u "$urgency" "$title" "$body" >/dev/null 2>&1 || true
}

folder_size() {
  du -sh "$BACKUP_ROOT" 2>/dev/null | awk '{print $1}' || printf 'unavailable'
}

dump_count() {
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" 2>/dev/null | wc -l
}

show_status() {
  local latest
  latest=$(find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -n 1 | cut -d' ' -f2-)

  printf 'backup_root=%s\n' "$BACKUP_ROOT"
  printf 'folder_size=%s\n' "$(folder_size)"
  printf 'dump_count=%s\n' "$(dump_count)"
  printf 'latest_backup=%s\n' "${latest:-none}"
  printf 'last_success_date=%s\n' "$(cat "$LAST_SUCCESS_FILE" 2>/dev/null || printf 'never')"
  printf 'log_file=%s\n' "$LOG_FILE"
}

fail() {
  local message=$1
  local size
  size=$(folder_size)
  log "FAILED: $message"
  notify critical "VibeAge backup failed" "$message

Folder: $BACKUP_ROOT
Size: $size
$RETRY_NOTE"
  exit 1
}

already_done_today() {
  local today
  today=$(date -u +%F)

  [ "$FORCE" = "0" ] || return 1
  [ -r "$LAST_SUCCESS_FILE" ] || return 1
  [ "$(cat "$LAST_SUCCESS_FILE")" = "$today" ]
}

ssh_cmd() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout="$CONNECT_TIMEOUT" "$@"
}

stream_remote_backup() {
  ssh_cmd "$REMOTE" \
    "cd '$REMOTE_REPO' && COMPOSE_PROJECT_NAME='$COMPOSE_PROJECT_NAME' docker compose exec -T '$DB_SERVICE' pg_dump -Fc --no-owner --no-acl -U '$DB_USER' -d '$DB_NAME'"
}

prune_local_backups() {
  local keep=$RETENTION_COPIES
  local stale
  local checksum

  if [ "$keep" -lt 1 ]; then
    keep=1
  fi

  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" -printf '%T@ %p\n' |
    sort -rn |
    tail -n +"$((keep + 1))" |
    cut -d' ' -f2- |
    while IFS= read -r stale; do
      [ -n "$stale" ] || continue
      rm -f "$stale" "$stale.sha256"
      log "Pruned old backup: $stale"
    done

  for checksum in "$BACKUP_ROOT"/${APP_NAME}_*.dump.sha256; do
    [ -e "$checksum" ] || continue
    [ -f "${checksum%.sha256}" ] || rm -f "$checksum"
  done
}

main() {
  if [ "$SHOW_STATUS" = "1" ]; then
    show_status
    return 0
  fi

  mkdir -p "$BACKUP_ROOT"
  chmod 700 "$BACKUP_ROOT"

  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "Another local backup pull is already running"

  if already_done_today; then
    log "Already backed up today; skipping"
    return 0
  fi

  [ -r "$SSH_KEY" ] || fail "SSH key is not readable: $SSH_KEY"

  local backup_name
  local backup_date
  local checksum_file
  local count
  local local_backup
  local size
  local timestamp
  local tmp_dir
  local tmp_file
  local today_utc

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup_date=$(date -u +%F)
  today_utc=$(date -u +%F)

  backup_name="${APP_NAME}_${timestamp}.dump"
  local_backup="$BACKUP_ROOT/$backup_name"
  tmp_dir=$(mktemp -d "$BACKUP_ROOT/.incoming.XXXXXX")
  trap 'if [ -n "${tmp_dir:-}" ]; then rm -rf "$tmp_dir"; fi' EXIT
  tmp_file="$tmp_dir/$backup_name.tmp"
  checksum_file="$local_backup.sha256"

  if [ "$backup_date" != "$today_utc" ]; then
    fail "Local UTC date shifted unexpectedly while starting backup"
  fi

  log "Streaming fresh backup from $REMOTE without storing a copy on the VPS"
  stream_remote_backup > "$tmp_file" || fail "Failed to stream Postgres backup from VPS"
  [ -s "$tmp_file" ] || fail "Streamed backup is empty"

  mv -f "$tmp_file" "$local_backup"
  chmod 600 "$local_backup"

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$BACKUP_ROOT" && sha256sum "$backup_name" > "$backup_name.sha256")
    chmod 600 "$checksum_file"
  fi

  prune_local_backups

  size=$(folder_size)
  count=$(dump_count)

  printf '%s\n' "$backup_date" > "$LAST_SUCCESS_FILE"
  {
    printf 'date=%s\n' "$backup_date"
    printf 'backup=%s\n' "$local_backup"
    printf 'folder=%s\n' "$BACKUP_ROOT"
    printf 'folder_size=%s\n' "$size"
    printf 'dump_count=%s\n' "$count"
  } > "$LAST_SUCCESS_DETAIL_FILE"

  log "SUCCESS: $backup_name; folder size $size; copies $count"
  notify normal "VibeAge backup successful" "Created: $backup_name

Folder: $BACKUP_ROOT
Size: $size
Copies kept: $count/$RETENTION_COPIES"
}

main "$@"
