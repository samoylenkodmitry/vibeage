#!/usr/bin/env bash
set -Eeuo pipefail

VPS_HOST=${VPS_HOST:-159.69.33.249}
VPS_USER=${VPS_USER:-s}
VPS_SSH_KEY=${VPS_SSH_KEY:-$HOME/.ssh/hetz}
DOMAIN=${DOMAIN:-vibeage.eu}
MAIL_DOMAIN=${MAIL_DOMAIN:-mail.dmitrysamoylenko.in}
REPO_URL=${REPO_URL:-https://github.com/samoylenkodmitry/vibeage.git}
LOCAL_BACKUP_DIR=${LOCAL_BACKUP_DIR:-/media/huge/vibeage-backups/postgres}
MAX_BACKUP_AGE_HOURS=${MAX_BACKUP_AGE_HOURS:-36}

failures=0
warnings=0

log() {
  printf '\n==> %s\n' "$1"
}

pass() {
  printf 'OK: %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN: %s\n' "$1" >&2
}

fail_check() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail_check "Missing required command: $1"
}

check_https() {
  local url=$1

  if curl -fsSI "$url" >/dev/null; then
    pass "$url responds over HTTPS"
  else
    fail_check "$url did not respond over HTTPS"
  fi
}

check_expected_status() {
  local url=$1
  local expected=$2
  local code

  code=$(curl -o /dev/null -sS -w '%{http_code}' "$url" || true)
  if [ "$code" = "$expected" ]; then
    pass "$url returned HTTP $expected"
  else
    fail_check "$url returned HTTP ${code:-000}, expected $expected"
  fi
}

tcp_is_open() {
  local host=$1
  local port=$2

  timeout 5 bash -c "cat < /dev/null > /dev/tcp/$host/$port" >/dev/null 2>&1
}

check_tcp_open() {
  local host=$1
  local port=$2

  if tcp_is_open "$host" "$port"; then
    pass "$host:$port is reachable"
  else
    fail_check "$host:$port is not reachable"
  fi
}

check_tcp_closed() {
  local host=$1
  local port=$2

  if tcp_is_open "$host" "$port"; then
    fail_check "$host:$port is unexpectedly reachable"
  else
    pass "$host:$port is closed externally"
  fi
}

check_tls() {
  local label=$1
  shift
  local output

  if output=$(openssl s_client "$@" -servername "$MAIL_DOMAIN" -verify_return_error -brief </dev/null 2>&1); then
    if grep -q 'Verification: OK' <<<"$output"; then
      pass "$label has a trusted TLS certificate"
      return
    fi
  fi

  fail_check "$label TLS verification failed"
  printf '%s\n' "$output" >&2
}

check_local_backups() {
  log "Local backup freshness"

  if [ ! -d "$LOCAL_BACKUP_DIR" ]; then
    warn "Local backup directory does not exist: $LOCAL_BACKUP_DIR"
    return
  fi

  local size
  size=$(du -sh "$LOCAL_BACKUP_DIR" | awk '{print $1}')
  printf 'Backup directory size: %s (%s)\n' "$size" "$LOCAL_BACKUP_DIR"

  local latest
  latest=$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 || true)
  if [ -z "$latest" ]; then
    warn "No local Postgres dump found in $LOCAL_BACKUP_DIR"
    return
  fi

  local latest_path
  local latest_mtime
  latest_mtime=${latest%% *}
  latest_path=${latest#* }

  local now
  local age_seconds
  now=$(date +%s)
  age_seconds=$((now - ${latest_mtime%.*}))

  printf 'Latest local backup: %s\n' "$latest_path"
  if [ "$age_seconds" -le $((MAX_BACKUP_AGE_HOURS * 3600)) ]; then
    pass "latest local backup is fresh"
  else
    warn "latest local backup is older than ${MAX_BACKUP_AGE_HOURS}h"
  fi
}

check_vps() {
  log "VPS runtime"

  if [ ! -r "$VPS_SSH_KEY" ]; then
    fail_check "SSH key is not readable: $VPS_SSH_KEY"
    return
  fi

  local remote
  if ! remote=$(ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" 'bash -s' <<'REMOTE'
set -Eeuo pipefail

health=$(curl -fsS http://127.0.0.1:3001/healthz)
game_bind=$(ss -ltn | awk '{print $4}' | grep -E '127\.0\.0\.1:3001' || true)
public_game_bind=$(ss -ltn | awk '{print $4}' | grep -E '^(0\.0\.0\.0:3001|\[::\]:3001|\*:3001|:::3001)$' || true)
stalwart_status=$(docker ps --filter name=stalwart --format '{{.Status}}')
deploy_sha=$(node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const markerPath = path.join(process.env.HOME, ".vibeage-deploy", "last-deploy.json");
const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
console.log(marker.fullSha || marker.sha || "");
NODE
)

printf 'HEALTH=%s\n' "$health"
printf 'GAME_BIND=%s\n' "$game_bind"
printf 'PUBLIC_GAME_BIND=%s\n' "$public_game_bind"
printf 'STALWART_STATUS=%s\n' "$stalwart_status"
printf 'DEPLOY_SHA=%s\n' "$deploy_sha"
REMOTE
); then
    fail_check "VPS runtime checks failed over SSH"
    return
  fi

  printf '%s\n' "$remote"

  if grep -q '^GAME_BIND=127\.0\.0\.1:3001' <<<"$remote"; then
    pass "game server is bound to localhost on the VPS"
  else
    fail_check "game server localhost bind was not found"
  fi

  if grep -q '^PUBLIC_GAME_BIND=$' <<<"$remote"; then
    pass "game server is not publicly bound on the VPS"
  else
    fail_check "game server appears publicly bound on the VPS"
  fi

  if grep -q '^STALWART_STATUS=Up ' <<<"$remote"; then
    pass "Stalwart container is running"
  else
    fail_check "Stalwart container is not running"
  fi

  local deployed_sha
  local origin_sha
  deployed_sha=$(awk -F= '/^DEPLOY_SHA=/{print $2}' <<<"$remote")
  origin_sha=$(git ls-remote "$REPO_URL" refs/heads/main | awk '{print $1}')

  printf 'Origin main SHA: %s\n' "$origin_sha"
  if [ -n "$deployed_sha" ] && [ "$deployed_sha" = "$origin_sha" ]; then
    pass "production deploy matches origin/main"
  else
    warn "production deploy SHA differs from origin/main"
  fi
}

main() {
  require_cmd bash
  require_cmd curl
  require_cmd git
  require_cmd openssl
  require_cmd ssh
  require_cmd timeout

  if [ "$failures" -gt 0 ]; then
    exit 1
  fi

  log "Public HTTPS"
  check_https "https://$DOMAIN/"
  check_https "https://$MAIL_DOMAIN/"
  check_expected_status "https://$DOMAIN/l2.ini" "404"

  log "External port exposure"
  for port in 143 465 587 993; do
    check_tcp_open "$MAIL_DOMAIN" "$port"
  done

  for port in 3001 5432 8080 2106 7777; do
    check_tcp_closed "$DOMAIN" "$port"
  done

  log "Mail TLS"
  check_tls "IMAPS 993" -connect "$MAIL_DOMAIN:993"
  check_tls "SMTPS 465" -connect "$MAIL_DOMAIN:465"
  check_tls "SMTP STARTTLS 587" -starttls smtp -connect "$MAIL_DOMAIN:587"
  check_tls "IMAP STARTTLS 143" -starttls imap -connect "$MAIL_DOMAIN:143"

  check_vps
  check_local_backups

  printf '\nSummary: %s failure(s), %s warning(s)\n' "$failures" "$warnings"
  if [ "$failures" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
