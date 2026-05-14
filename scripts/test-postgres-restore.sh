#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME=${APP_NAME:-vibeage}
if [ -z "${BACKUP_ROOT:-}" ]; then
  if [ -d /media/huge/vibeage-backups/postgres ]; then
    BACKUP_ROOT=/media/huge/vibeage-backups/postgres
  else
    BACKUP_ROOT=$HOME/.vibeage-backups/postgres
  fi
fi
BACKUP_FILE=${BACKUP_FILE:-${1:-}}
RESTORE_IMAGE=${RESTORE_IMAGE:-docker.io/library/postgres:16}
CONTAINER_RUNTIME=${CONTAINER_RUNTIME:-}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
COMPATIBILITY_SQL=${COMPATIBILITY_SQL:-"$SCRIPT_DIR/check-restored-postgres-compatibility.sql"}

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

select_container_runtime() {
  if [ -n "$CONTAINER_RUNTIME" ]; then
    require_cmd "$CONTAINER_RUNTIME"
    return
  fi

  for runtime in docker podman; do
    if command -v "$runtime" >/dev/null 2>&1 && "$runtime" info >/dev/null 2>&1; then
      CONTAINER_RUNTIME=$runtime
      return
    fi
  done

  fail "Missing usable container runtime: docker daemon or podman"
}

latest_backup() {
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.dump" | sort | tail -n 1
}

cleanup() {
  if [ -n "${container_name:-}" ]; then
    "$CONTAINER_RUNTIME" rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}

wait_for_postgres() {
  local attempt

  for attempt in $(seq 1 30); do
    if "$CONTAINER_RUNTIME" exec "$container_name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return
    fi

    sleep 1
  done

  fail "Restore test database did not become ready"
}

main() {
  require_cmd find
  select_container_runtime

  if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(latest_backup)
  fi

  test -n "$BACKUP_FILE" || fail "No backup file found under $BACKUP_ROOT"
  test -r "$BACKUP_FILE" || fail "Backup file is not readable: $BACKUP_FILE"
  test -r "$COMPATIBILITY_SQL" || fail "Compatibility SQL is not readable: $COMPATIBILITY_SQL"

  local table_count
  local table_names

  container_name="${APP_NAME}-restore-test-$(date +%s)-$RANDOM"
  trap cleanup EXIT

  log "Starting isolated restore test container $container_name with $CONTAINER_RUNTIME"
  "$CONTAINER_RUNTIME" run -d --name "$container_name" -e POSTGRES_PASSWORD=restore-test "$RESTORE_IMAGE" >/dev/null
  wait_for_postgres

  log "Restoring $BACKUP_FILE"
  "$CONTAINER_RUNTIME" exec -i "$container_name" \
    pg_restore --clean --if-exists --no-owner --no-acl -U postgres -d postgres \
    < "$BACKUP_FILE"

  table_count=$("$CONTAINER_RUNTIME" exec "$container_name" psql -U postgres -d postgres -Atc \
    "select count(*) from information_schema.tables where table_schema = 'public';")
  table_names=$("$CONTAINER_RUNTIME" exec "$container_name" psql -U postgres -d postgres -Atc \
    "select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public';")

  log "Checking restored schema compatibility"
  "$CONTAINER_RUNTIME" exec -i "$container_name" psql -U postgres -d postgres \
    < "$COMPATIBILITY_SQL"

  log "Restore test passed"
  printf 'backup=%s\n' "$BACKUP_FILE"
  printf 'container_runtime=%s\n' "$CONTAINER_RUNTIME"
  printf 'public_table_count=%s\n' "$table_count"
  printf 'public_tables=%s\n' "${table_names:-none}"
}

main "$@"
