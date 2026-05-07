#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME=${APP_NAME:-vibeage}
DOMAIN=${DOMAIN:-vibeage.eu}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-vibeage}
FRONTEND_PUBLIC_DIR=${FRONTEND_PUBLIC_DIR:-/opt/vibeage-frontend/out}
MAX_HTTP_BUFFER_SIZE=${MAX_HTTP_BUFFER_SIZE:-1048576}
RELOAD_NGINX=${RELOAD_NGINX:-0}
WS_COMPRESSION=${WS_COMPRESSION:-1}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
LOCK_DIR=${DEPLOY_LOCK_DIR:-$REPO_ROOT/.deploy.lock}
DEPLOY_STATE_DIR=${DEPLOY_STATE_DIR:-$HOME/.vibeage-deploy}
FRONTEND_STAGING_DIR=${FRONTEND_STAGING_DIR:-$DEPLOY_STATE_DIR/frontend-staging}

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

cleanup() {
  rm -rf "$LOCK_DIR"
}

acquire_lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    fail "Another deployment appears to be running: $LOCK_DIR"
  fi

  trap cleanup EXIT
}

write_deploy_marker() {
  local full_sha
  local marker_path
  local short_sha
  local tmp_path

  full_sha=$(git rev-parse HEAD 2>/dev/null || printf 'unknown')
  short_sha=$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')
  marker_path="$DEPLOY_STATE_DIR/last-deploy.json"
  tmp_path="$DEPLOY_STATE_DIR/last-deploy.json.tmp"

  mkdir -p "$DEPLOY_STATE_DIR"

  if [ -s "$marker_path" ]; then
    cp "$marker_path" "$DEPLOY_STATE_DIR/previous-deploy.json"
  fi

  printf '{"app":"%s","sha":"%s","fullSha":"%s","deployedAt":"%s"}\n' \
    "$APP_NAME" \
    "$short_sha" \
    "$full_sha" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    > "$tmp_path"
  mv "$tmp_path" "$marker_path"
  cat "$marker_path" >> "$DEPLOY_STATE_DIR/deploy-history.jsonl"
}

check_public_game_port() {
  if ! command -v ss >/dev/null 2>&1; then
    return
  fi

  if ss -ltn | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0:3001|\[::\]:3001|\*:3001|:::3001)$'; then
    fail "Port 3001 is publicly bound; it must stay behind Nginx on 127.0.0.1"
  fi
}

wait_for_healthz() {
  local attempt

  for attempt in $(seq 1 30); do
    if node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      return
    fi

    printf 'Waiting for game server health check (%s/30)\n' "$attempt"
    sleep 2
  done

  fail "Game server did not pass /healthz after deployment"
}

reload_nginx_if_requested() {
  if [ "$RELOAD_NGINX" != "1" ]; then
    return
  fi

  require_cmd sudo
  sudo -n nginx -t
  sudo -n systemctl reload nginx
}

publish_frontend() {
  if [ ! -f "$REPO_ROOT/out/index.html" ]; then
    fail "Frontend build missing out/index.html"
  fi

  rm -rf "$FRONTEND_STAGING_DIR"
  mkdir -p "$FRONTEND_STAGING_DIR"
  rsync -a --delete "$REPO_ROOT/out/" "$FRONTEND_STAGING_DIR/"
  test -f "$FRONTEND_STAGING_DIR/index.html"
  rsync -a --delete "$FRONTEND_STAGING_DIR/" "$FRONTEND_PUBLIC_DIR/"
  rm -rf "$FRONTEND_STAGING_DIR"
}

verify_frontend_target() {
  mkdir -p "$FRONTEND_PUBLIC_DIR"

  if [ ! -w "$FRONTEND_PUBLIC_DIR" ]; then
    fail "$FRONTEND_PUBLIC_DIR is not writable by $(id -un)"
  fi
}

main() {
  acquire_lock
  require_cmd docker
  require_cmd git
  require_cmd node
  require_cmd pnpm
  require_cmd rsync
  docker compose version >/dev/null

  cd "$REPO_ROOT"
  verify_frontend_target

  export COMPOSE_PROJECT_NAME
  export CORS_ORIGINS=${CORS_ORIGINS:-https://$DOMAIN}
  export MAX_HTTP_BUFFER_SIZE
  export NEXT_PUBLIC_GAME_SERVER_URL=${NEXT_PUBLIC_GAME_SERVER_URL:-https://$DOMAIN}
  export NODE_ENV=production
  export PORT=${PORT:-3001}
  export SERVER_DATABASE_URL=${SERVER_DATABASE_URL:-${DATABASE_URL:-postgres://postgres:${POSTGRES_PASSWORD:-postgres}@db:5432/postgres}}
  export WS_COMPRESSION

  log "Installing dependencies"
  pnpm install --frozen-lockfile

  log "Building frontend"
  pnpm run build

  log "Building server"
  pnpm run build:server

  log "Starting Docker Compose project $COMPOSE_PROJECT_NAME"
  docker compose up -d --build

  log "Checking local game server health"
  wait_for_healthz
  check_public_game_port

  log "Publishing frontend to $FRONTEND_PUBLIC_DIR"
  publish_frontend

  log "Validating optional Nginx reload"
  reload_nginx_if_requested

  write_deploy_marker
  log "Deployment complete"
}

main "$@"
