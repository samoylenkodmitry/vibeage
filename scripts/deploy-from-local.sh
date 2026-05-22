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
DEPLOY_SHA=${DEPLOY_SHA:-}
ALLOW_DEPLOY_PUSH=${ALLOW_DEPLOY_PUSH:-0}

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

  if [ "$ALLOW_DEPLOY_PUSH" != "1" ]; then
    fail "Local '$BRANCH' is ahead of origin/$BRANCH. Merge it through the protected GitHub path first, then deploy."
  fi

  log "Pushing $BRANCH to origin"
  git push origin "$BRANCH"
}

ensure_heavy_ci_passed() {
  # Archwork item #1 (post-#444) — refuse to deploy a SHA whose
  # latest main heavy CI hasn't reported success.
  #
  # Before this guard, rapid main merges cancelled the post-merge
  # heavy job (concurrency: cancel-in-progress was true for every
  # ref), and we deployed un-gated against the heavy gate dozens of
  # times in a row without noticing the gate was red.
  #
  # Honors SKIP_CI_GATE=1 for explicit emergency deploys (rollback,
  # production-down incident). gh CLI is the dependency; if it's not
  # available, this falls back to a soft warning rather than blocking
  # — but the soft path expects an operator to make the call.
  local deploy_sha=$1

  if [ "${SKIP_CI_GATE:-0}" = "1" ]; then
    log "SKIP_CI_GATE=1 set — bypassing main heavy-CI guard"
    return
  fi

  if ! command -v gh >/dev/null 2>&1; then
    log "WARN: gh CLI not installed; cannot verify heavy CI for $deploy_sha. Set SKIP_CI_GATE=1 to acknowledge."
    fail "Deploy guard requires the gh CLI. Install it or set SKIP_CI_GATE=1 if this is an emergency deploy."
  fi

  log "Checking latest main heavy CI for $deploy_sha"

  # Query the workflow run list filtered to this SHA. Take the most
  # recent completed run. status=completed restricts to runs that
  # finished (success / failure / cancelled).
  local ci_json
  if ! ci_json=$(gh run list --commit "$deploy_sha" --workflow CI --limit 5 --json status,conclusion,databaseId,event 2>/dev/null); then
    fail "Could not query CI status for $deploy_sha via gh. Check 'gh auth status' or set SKIP_CI_GATE=1."
  fi

  # Pick the post-merge (push event) run. If none exists yet, the
  # heavy gate hasn't even started for this SHA — refuse to deploy
  # against a SHA whose heavy CI never ran.
  local conclusion
  conclusion=$(printf '%s' "$ci_json" | python3 -c "
import json, sys
runs = json.loads(sys.stdin.read())
push_runs = [r for r in runs if r.get('event') == 'push']
if not push_runs:
    print('no-push-run')
    sys.exit(0)
r = push_runs[0]
if r.get('status') != 'completed':
    print('not-completed:' + r.get('status', '?'))
    sys.exit(0)
print(r.get('conclusion', '?'))
" 2>/dev/null) || fail "Failed to parse CI status JSON for $deploy_sha"

  case "$conclusion" in
    success)
      log "Heavy CI for $deploy_sha: success"
      ;;
    no-push-run)
      fail "No push-event CI run found for $deploy_sha. Wait for the post-merge heavy gate to start, then re-run. (Or SKIP_CI_GATE=1 if you've manually verified.)"
      ;;
    not-completed:*)
      fail "Heavy CI for $deploy_sha is still ${conclusion#not-completed:}. Wait for it to finish, then re-run. (Or SKIP_CI_GATE=1.)"
      ;;
    failure|cancelled|timed_out|action_required)
      fail "Heavy CI for $deploy_sha is '$conclusion'. Refusing to deploy. Investigate the failing run or SKIP_CI_GATE=1 for an emergency deploy."
      ;;
    *)
      fail "Heavy CI for $deploy_sha returned unexpected conclusion '$conclusion'. Investigate or SKIP_CI_GATE=1."
      ;;
  esac
}

resolve_requested_deploy_sha() {
  local requested_sha=$1
  local resolved_sha

  resolved_sha=$(git rev-parse --verify "$requested_sha^{commit}") || fail "DEPLOY_SHA is not a commit: $requested_sha"

  if ! git merge-base --is-ancestor "$resolved_sha" "origin/$BRANCH"; then
    fail "DEPLOY_SHA must be reachable from origin/$BRANCH: $requested_sha"
  fi

  printf '%s\n' "$resolved_sha"
}

run_remote_deploy() {
  local deploy_sha=$1

  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" \
    "DEPLOY_ROOT='$VPS_DEPLOY_ROOT' DEPLOY_SHA='$deploy_sha' DOMAIN='$DOMAIN' FRONTEND_PUBLIC_DIR='$FRONTEND_PUBLIC_DIR' REPO_URL='$REPO_URL' BRANCH='$BRANCH' bash -s" <<'REMOTE'
set -Eeuo pipefail

deploy_root=${DEPLOY_ROOT:-$HOME/vibeage-deploy}
repo_dir="$deploy_root/repo"
branch=${BRANCH:-main}

mkdir -p "$deploy_root"

if [ ! -d "$repo_dir/.git" ]; then
  git clone "$REPO_URL" "$repo_dir"
fi

cd "$repo_dir"
git fetch --prune origin "$branch"
git checkout "$branch"
git reset --hard "$DEPLOY_SHA"

DOMAIN="$DOMAIN" FRONTEND_PUBLIC_DIR="$FRONTEND_PUBLIC_DIR" bash scripts/deploy-production.sh
REMOTE
}

run_smoke_checks() {
  log "Checking VPS health and port binding"
  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" 'bash -s' <<'REMOTE'
set -Eeuo pipefail

for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3001/healthz; then
    printf '\n'
    break
  fi

  if [ "$attempt" -eq 15 ]; then
    exit 1
  fi

  sleep 2
done

if ss -ltn | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0:3001|\[::\]:3001|\*:3001|:::3001)$'; then
  printf 'ERROR: 3001 is publicly bound\n' >&2
  exit 1
fi

ss -ltn | grep '127.0.0.1:3001'
cat ~/.vibeage-deploy/last-deploy.json
REMOTE

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

  local deploy_sha

  if [ -n "$DEPLOY_SHA" ]; then
    deploy_sha=$(resolve_requested_deploy_sha "$DEPLOY_SHA")
    log "Deploying requested commit $deploy_sha"
  else
    if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
      require_cmd pnpm
      log "Running local quality gate"
      pnpm run check
    fi

    push_if_needed
    deploy_sha=$(git rev-parse HEAD)
  fi

  ensure_heavy_ci_passed "$deploy_sha"

  log "Deploying $deploy_sha to $VPS_USER@$VPS_HOST"
  run_remote_deploy "$deploy_sha"
  run_smoke_checks
  log "Local deployment complete"
}

main "$@"
