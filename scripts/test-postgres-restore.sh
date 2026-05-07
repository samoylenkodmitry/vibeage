#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME=${APP_NAME:-vibeage}
BACKUP_ROOT=${BACKUP_ROOT:-$HOME/.vibeage-backups/postgres}
BACKUP_FILE=${BACKUP_FILE:-${1:-}}
RESTORE_IMAGE=${RESTORE_IMAGE:-postgres:16}

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

latest_backup() {
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" | sort | tail -n 1
}

cleanup() {
  if [ -n "${container_name:-}" ]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}

wait_for_postgres() {
  local attempt

  for attempt in $(seq 1 30); do
    if docker exec "$container_name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return
    fi

    sleep 1
  done

  fail "Restore test database did not become ready"
}

main() {
  require_cmd docker
  require_cmd find

  if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(latest_backup)
  fi

  test -n "$BACKUP_FILE" || fail "No backup file found under $BACKUP_ROOT"
  test -r "$BACKUP_FILE" || fail "Backup file is not readable: $BACKUP_FILE"

  local table_count
  local table_names

  container_name="${APP_NAME}-restore-test-$(date +%s)-$RANDOM"
  trap cleanup EXIT

  log "Starting isolated restore test container $container_name"
  docker run -d --name "$container_name" -e POSTGRES_PASSWORD=restore-test "$RESTORE_IMAGE" >/dev/null
  wait_for_postgres

  log "Restoring $BACKUP_FILE"
  docker exec -i "$container_name" \
    pg_restore --clean --if-exists --no-owner --no-acl -U postgres -d postgres \
    < "$BACKUP_FILE"

  table_count=$(docker exec "$container_name" psql -U postgres -d postgres -Atc \
    "select count(*) from information_schema.tables where table_schema = 'public';")
  table_names=$(docker exec "$container_name" psql -U postgres -d postgres -Atc \
    "select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public';")

  log "Restore test passed"
  printf 'backup=%s\n' "$BACKUP_FILE"
  printf 'public_table_count=%s\n' "$table_count"
  printf 'public_tables=%s\n' "${table_names:-none}"
}

main "$@"
