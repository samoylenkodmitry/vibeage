#!/usr/bin/env bash
set -Eeuo pipefail

VPS_HOST=${VPS_HOST:-159.69.33.249}
VPS_USER=${VPS_USER:-s}
VPS_SSH_KEY=${VPS_SSH_KEY:-$HOME/.ssh/hetz}
VPS_DEPLOY_ROOT=${VPS_DEPLOY_ROOT:-/home/s/vibeage-deploy}
DOMAIN=${DOMAIN:-vibeage.eu}
FRONTEND_PUBLIC_DIR=${FRONTEND_PUBLIC_DIR:-/opt/vibeage-frontend/out}
REPO_URL=${REPO_URL:-https://github.com/samoylenkodmitry/vibeage.git}
RUN_LOCAL_CHECKS=${RUN_LOCAL_CHECKS:-1}
BRANCH=${BRANCH:-main}

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

ensure_clean_worktree() {
  git diff --quiet || fail "Working tree has unstaged changes; commit or stash before deploying"
  git diff --cached --quiet || fail "Index has staged changes; commit or unstage before deploying"
}

ensure_main_is_deployable() {
  local current_branch
  current_branch=$(git branch --show-current)

  if [ "$current_branch" != "$BRANCH" ]; then
    fail "Refusing to deploy from '$current_branch'. Checkout '$BRANCH' first."
  fi

  git fetch origin "$BRANCH"

  if ! git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
    fail "Local '$BRANCH' is behind or diverged from origin/$BRANCH"
  fi
}

push_if_needed() {
  local local_sha
  local remote_sha

  local_sha=$(git rev-parse HEAD)
  remote_sha=$(git rev-parse "origin/$BRANCH")

  if [ "$local_sha" = "$remote_sha" ]; then
    return
  fi

  log "Pushing $BRANCH to origin"
  git push origin "$BRANCH"
}

run_remote_deploy() {
  local deploy_sha=$1

  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" \
    "DEPLOY_ROOT='$VPS_DEPLOY_ROOT' DEPLOY_SHA='$deploy_sha' DOMAIN='$DOMAIN' FRONTEND_PUBLIC_DIR='$FRONTEND_PUBLIC_DIR' REPO_URL='$REPO_URL' bash -s" <<'REMOTE'
set -Eeuo pipefail

deploy_root=${DEPLOY_ROOT:-$HOME/vibeage-deploy}
repo_dir="$deploy_root/repo"

mkdir -p "$deploy_root"

if [ ! -d "$repo_dir/.git" ]; then
  git clone "$REPO_URL" "$repo_dir"
fi

cd "$repo_dir"
git fetch --prune origin main
git checkout main
git reset --hard "$DEPLOY_SHA"

DOMAIN="$DOMAIN" FRONTEND_PUBLIC_DIR="$FRONTEND_PUBLIC_DIR" bash scripts/deploy-production.sh
REMOTE
}

run_smoke_checks() {
  log "Checking VPS health and port binding"
  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" \
    "curl -fsS http://127.0.0.1:3001/healthz; printf '\n'; ss -ltn | grep 3001; cat ~/.vibeage-deploy/last-deploy.json"

  log "Checking public HTTPS entrypoint"
  curl -fsSI "https://$DOMAIN/" >/dev/null
}

main() {
  cd "$REPO_ROOT"

  require_cmd curl
  require_cmd git
  require_cmd ssh

  test -r "$VPS_SSH_KEY" || fail "SSH key not readable: $VPS_SSH_KEY"

  ensure_clean_worktree
  ensure_main_is_deployable

  if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
    require_cmd pnpm
    log "Running local quality gate"
    pnpm run check
  fi

  push_if_needed

  local deploy_sha
  deploy_sha=$(git rev-parse HEAD)
  log "Deploying $deploy_sha to $VPS_USER@$VPS_HOST"
  run_remote_deploy "$deploy_sha"
  run_smoke_checks
  log "Local deployment complete"
}

main "$@"
