#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_CODEX_HOME="${CODEX_HOME:-${HOME:-}/.codex}"
VIBEAGE_SKILL_PATH="${CODEX_IMAGEGEN_VIBEAGE_SKILL_PATH:-$DEFAULT_CODEX_HOME/skills/generate-vibeage-icons}"
SANDBOX="${CODEX_IMAGEGEN_SANDBOX:-workspace-write}"
APPROVAL="${CODEX_IMAGEGEN_APPROVAL:-never}"
MODEL="${CODEX_IMAGEGEN_MODEL:-}"
ASSET_KIND="general"
OUTPUT_HINT=""
SIZE_HINT=""
RUN=0
PRINT_PROMPT=0
TASK_PARTS=()

usage() {
  cat <<'USAGE'
Usage:
  scripts/codex-imagegen-subagent.sh --yes --prompt "<image generation prompt>"
  scripts/codex-imagegen-subagent.sh --print-prompt --kind texture --prompt "<prompt>"

Purpose:
  Invoke Codex as a terminal subagent for prompt-driven image generation. This
  is intended for agents such as Claude Code that can run shell commands but do
  not have direct access to Codex's imagegen tool.

Options:
  --yes              Actually invoke `codex exec`. Required for execution.
  --print-prompt     Print the prompt that would be sent to Codex, then exit.
  --prompt TEXT      Image prompt or generation task. May be repeated.
  --kind KIND        Asset kind: icon, texture, ui, quest, concept, general.
  --output PATH      Desired output file or directory hint.
  --size TEXT        Desired size/aspect hint, e.g. 1024x1024 or 16:9.
  --vibeage-skill PATH
                     Override the VibeAge icon/content skill path.
  --sandbox MODE     Codex sandbox mode. Default: workspace-write.
  --approval POLICY  Codex approval policy. Default: never.
  --model MODEL      Optional Codex model override.
  -h, --help         Show this help.

Environment:
  CODEX_IMAGEGEN_VIBEAGE_SKILL_PATH  Defaults to $CODEX_HOME/skills/generate-vibeage-icons.
  CODEX_IMAGEGEN_SANDBOX             Defaults to workspace-write.
  CODEX_IMAGEGEN_APPROVAL            Defaults to never.
  CODEX_IMAGEGEN_MODEL               Optional model name for `codex exec -m`.

Examples:
  scripts/codex-imagegen-subagent.sh --yes --kind icon --prompt "Generate icons for newly added quest reward items."
  scripts/codex-imagegen-subagent.sh --yes --kind texture --output public/textures --prompt "Seamless painterly mossy stone ground texture."
  scripts/codex-imagegen-subagent.sh --yes --kind ui --prompt "Inventory HUD frame concept in VibeAge's cozy fantasy style."
  scripts/codex-imagegen-subagent.sh --yes --kind quest --prompt "Quest illustration for rescuing a lighthouse keeper at dusk."
USAGE
}

require_value() {
  local option="$1"
  if [[ $# -lt 2 || -z "${2:-}" ]]; then
    echo "Error: $option requires an argument" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      RUN=1
      shift
      ;;
    --print-prompt)
      PRINT_PROMPT=1
      shift
      ;;
    --prompt)
      require_value "$1" "${2:-}"
      TASK_PARTS+=("$2")
      shift 2
      ;;
    --kind)
      require_value "$1" "${2:-}"
      ASSET_KIND="$2"
      shift 2
      ;;
    --output)
      require_value "$1" "${2:-}"
      OUTPUT_HINT="$2"
      shift 2
      ;;
    --size)
      require_value "$1" "${2:-}"
      SIZE_HINT="$2"
      shift 2
      ;;
    --vibeage-skill|--skill)
      require_value "$1" "${2:-}"
      VIBEAGE_SKILL_PATH="$2"
      shift 2
      ;;
    --sandbox)
      require_value "$1" "${2:-}"
      SANDBOX="$2"
      shift 2
      ;;
    --approval)
      require_value "$1" "${2:-}"
      APPROVAL="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      MODEL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        TASK_PARTS+=("$1")
        shift
      done
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      TASK_PARTS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#TASK_PARTS[@]} -eq 0 ]]; then
  echo "Missing task." >&2
  usage >&2
  exit 2
fi

if [[ "$RUN" -ne 1 && "$PRINT_PROMPT" -ne 1 ]]; then
  echo "Refusing to invoke Codex without --yes. Use --print-prompt to inspect the prompt." >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI is not on PATH. Install/login to Codex before using this subagent." >&2
  exit 127
fi

TASK="${TASK_PARTS[*]}"
PROMPT_FILE="$(mktemp)"
trap 'rm -f "$PROMPT_FILE"' EXIT

cat >"$PROMPT_FILE" <<PROMPT
You are a Codex subagent invoked from the VibeAge repository by scripts/codex-imagegen-subagent.sh.

Caller image prompt/task:
$TASK

Asset kind:
$ASSET_KIND

Output hint:
${OUTPUT_HINT:-none provided}

Size/aspect hint:
${SIZE_HINT:-none provided}

Capability expectations:
- Use Codex's imagegen tool for AI-created bitmap images.
- If imagegen is unavailable in this Codex session, stop and report that clearly. Do not create placeholder art, SVG stand-ins, or CSS-only substitutes.
- For VibeAge content icon batches (skills, effects, items, actions, classes, specs, progression trees), use the Codex skill at: $VIBEAGE_SKILL_PATH
- Open that skill's SKILL.md before VibeAge icon/content work and follow it when present.
- For non-icon images such as textures, UI concepts, quest illustrations, scene art, portraits, or general one-off images, use imagegen directly and save clean PNG outputs in the requested path or a clearly named repo-appropriate path.
- When a generated atlas needs slicing, use the VibeAge skill's crop/post-processing script if it applies; otherwise keep outputs as normal image files.

Repository rules:
- Work in this repo root: $ROOT
- Inspect git status before edits.
- Do not deploy, merge, push, or commit unless the caller task explicitly asks.
- Do not commit raw generation scratch files, temporary atlases, secrets, .env files, tokens, DB URLs, or generated build output.
- Prefer a separate feature branch or worktree for broad generation tasks when the current checkout is not already dedicated to that task.

VibeAge content icon workflow reminders:
- Derive content from packages/content, especially actions.ts, classes.ts, specializations.ts, effects.ts, items.ts, skills.ts, and skillIcons.ts.
- Preserve existing icon naming conventions under public/game/actions, public/game/classes, public/game/specs, public/game/effects, public/game/items, and public/game/skills.
- Wire final asset paths through content catalogs and HUD/wiki surfaces only when needed.
- Add or update audit tests when coverage changes.
- For verification, run focused checks first, then pnpm run check before reporting completion when code/assets changed.

General image workflow reminders:
- Treat the caller's prompt as the source of truth for subject, style, size, and destination.
- Ask no follow-up unless the prompt is too ambiguous to choose a safe output path or format.
- Do not overwrite existing assets unless the caller explicitly requested replacement.
- Keep generated source/scratch files out of git unless they are intentionally part of the product asset set.

Final response:
- Summarize generated or changed image counts by category/kind.
- List files or directories changed.
- List checks run and their result.
- Call out any content intentionally skipped.
PROMPT

if [[ "$PRINT_PROMPT" -eq 1 ]]; then
  cat "$PROMPT_FILE"
  exit 0
fi

CODEX_ARGS=(exec -C "$ROOT" --sandbox "$SANDBOX")
# Approval policy moved between codex-cli versions: older CLIs took
# `--ask-for-approval <policy>` on `exec`; codex-cli >=0.13x dropped that flag
# (exec is non-interactive) and the policy is now a config override. Pick the
# form the installed CLI actually supports so the wrapper isn't version-locked.
if codex exec --help 2>/dev/null | grep -q -- '--ask-for-approval'; then
  CODEX_ARGS+=(--ask-for-approval "$APPROVAL")
else
  CODEX_ARGS+=(-c "approval_policy=$APPROVAL")
fi
if [[ -n "$MODEL" ]]; then
  CODEX_ARGS+=(-m "$MODEL")
fi

codex "${CODEX_ARGS[@]}" - <"$PROMPT_FILE"
