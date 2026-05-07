#!/usr/bin/env bash
set -Eeuo pipefail

VPS_HOST=${VPS_HOST:-159.69.33.249}
VPS_USER=${VPS_USER:-s}
VPS_SSH_KEY=${VPS_SSH_KEY:-$HOME/.ssh/hetz}
ROLLBACK_SHA=${ROLLBACK_SHA:-${1:-}}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

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

validate_sha() {
  local sha=$1

  if [[ ! "$sha" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    fail "Rollback target is not a Git SHA: $sha"
  fi
}

read_previous_deploy_sha() {
  ssh -i "$VPS_SSH_KEY" -o BatchMode=yes "$VPS_USER@$VPS_HOST" 'node - <<'"'"'NODE'"'"'
const fs = require("node:fs");
const path = require("node:path");

const stateDir = process.env.DEPLOY_STATE_DIR || path.join(process.env.HOME, ".vibeage-deploy");
const markerPath = path.join(stateDir, "previous-deploy.json");

if (!fs.existsSync(markerPath)) {
  console.error(`No previous deploy marker found at ${markerPath}`);
  process.exit(1);
}

const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
const sha = marker.fullSha || marker.sha;

if (!sha) {
  console.error(`Previous deploy marker has no sha: ${markerPath}`);
  process.exit(1);
}

console.log(sha);
NODE'
}

main() {
  require_cmd git
  require_cmd ssh
  test -r "$VPS_SSH_KEY" || fail "SSH key not readable: $VPS_SSH_KEY"

  local target_sha
  target_sha="$ROLLBACK_SHA"

  if [ -z "$target_sha" ]; then
    log "Reading previous deploy marker from $VPS_USER@$VPS_HOST"
    target_sha=$(read_previous_deploy_sha)
  fi

  validate_sha "$target_sha"
  log "Rolling production back to $target_sha"
  DEPLOY_SHA="$target_sha" RUN_LOCAL_CHECKS=0 "$SCRIPT_DIR/deploy-from-local.sh"
}

main "$@"
