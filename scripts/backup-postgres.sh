#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME=${APP_NAME:-vibeage}
BACKUP_ROOT=${BACKUP_ROOT:-$HOME/.vibeage-backups/postgres}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-vibeage}
DB_NAME=${DB_NAME:-postgres}
DB_SERVICE=${DB_SERVICE:-db}
DB_USER=${DB_USER:-postgres}
RETENTION_DAYS=${RETENTION_DAYS:-14}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

log() {
  printf '==> %s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

main() {
  require_cmd date
  require_cmd docker
  require_cmd find

  cd "$REPO_ROOT"

  export COMPOSE_PROJECT_NAME

  mkdir -p "$BACKUP_ROOT/.tmp"
  chmod 700 "$BACKUP_ROOT" "$BACKUP_ROOT/.tmp"

  log "Checking Postgres readiness"
  docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null

  local backup_file
  local checksum_file
  local timestamp
  local tmp_file

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup_file="$BACKUP_ROOT/${APP_NAME}_${timestamp}.dump"
  tmp_file="$BACKUP_ROOT/.tmp/${APP_NAME}_${timestamp}.dump.tmp"
  checksum_file="$backup_file.sha256"

  log "Writing backup to $backup_file"
  docker compose exec -T "$DB_SERVICE" \
    pg_dump -Fc --no-owner --no-acl -U "$DB_USER" -d "$DB_NAME" \
    > "$tmp_file"

  test -s "$tmp_file" || fail "Backup file is empty: $tmp_file"
  mv "$tmp_file" "$backup_file"
  chmod 600 "$backup_file"

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$BACKUP_ROOT" && sha256sum "$(basename "$backup_file")" > "$checksum_file")
    chmod 600 "$checksum_file"
  fi

  log "Pruning backups older than $RETENTION_DAYS days"
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" -mtime +"$RETENTION_DAYS" -delete
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump.sha256" -mtime +"$RETENTION_DAYS" -delete

  log "Backup complete"
  printf '%s\n' "$backup_file"
}

main "$@"
