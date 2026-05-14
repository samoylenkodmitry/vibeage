#!/usr/bin/env bash
set -Eeuo pipefail

VPS_HOST=${VPS_HOST:-159.69.33.249}
VPS_USER=${VPS_USER:-s}
VPS_SSH_KEY=${VPS_SSH_KEY:-$HOME/.ssh/hetz}
DOMAIN=${DOMAIN:-vibeage.eu}
LOCAL_BACKUP_DIR=${LOCAL_BACKUP_DIR:-/media/huge/vibeage-backups/postgres}

log() {
  printf '\n==> %s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: missing required command: %s\n' "$1" >&2
    exit 1
  }
}

print_local_git() {
  log "Local Git"
  printf 'branch=%s\n' "$(git branch --show-current)"
  printf 'head=%s\n' "$(git rev-parse --short=12 HEAD)"
  printf 'origin_main=%s\n' "$(git rev-parse --short=12 origin/main 2>/dev/null || printf unknown)"
}

print_public_entrypoint() {
  log "Public Entrypoint"
  curl -fsSI "https://$DOMAIN/" | awk 'NR == 1 || /^server:|^date:|^content-type:/ { print }'
}

print_local_backups() {
  log "Local Backups"
  local latest_backups

  if [ ! -d "$LOCAL_BACKUP_DIR" ]; then
    printf 'backup_dir_missing=%s\n' "$LOCAL_BACKUP_DIR"
    return
  fi

  du -sh "$LOCAL_BACKUP_DIR" | awk '{ printf "backup_dir_size=%s\n", $1 }'
  latest_backups=$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%TY-%Tm-%Td %TH:%TM %p\n' \
    | sort -r \
    | sed -n '1,2p')

  if [ -n "$latest_backups" ]; then
    awk '{ print "backup=" $0 }' <<<"$latest_backups"
  fi
}

print_remote_runtime() {
  log "VPS Runtime"
  test -r "$VPS_SSH_KEY" || {
    printf 'ERROR: SSH key not readable: %s\n' "$VPS_SSH_KEY" >&2
    exit 1
  }

  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" 'bash -s' <<'REMOTE'
set -Eeuo pipefail

printf 'host=%s\n' "$(hostname)"
printf 'uptime=%s\n' "$(uptime -p)"
printf 'game_health='
curl -fsS http://127.0.0.1:3001/healthz
printf '\n'
printf 'runtime='
curl -fsS http://127.0.0.1:3001/runtimez
printf '\n'
printf 'game_bindings=\n'
ss -ltn | awk '$4 ~ /:3001$/ { print "  " $4 }'
printf 'public_game_bindings=\n'
ss -ltn | awk '$4 ~ /^(0\.0\.0\.0:3001|\[::\]:3001|\*:3001|:::3001)$/ { print "  " $4 }'
printf 'docker_compose=\n'
docker compose -p vibeage ps 2>/dev/null || true
printf 'stalwart=\n'
docker ps --filter name=stalwart --format '  {{.Names}} {{.Status}}' || true
printf 'deploy_marker='
if [ -r "$HOME/.vibeage-deploy/last-deploy.json" ]; then
  cat "$HOME/.vibeage-deploy/last-deploy.json"
else
  printf '{}'
fi
printf '\n'
REMOTE
}

main() {
  require_cmd awk
  require_cmd curl
  require_cmd git
  require_cmd ssh

  print_local_git
  print_public_entrypoint
  print_local_backups
  print_remote_runtime
}

main "$@"
