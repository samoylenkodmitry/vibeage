# Claude Code Instructions

Follow `AGENTS.md`.

## Repo-local Agent System

For nontrivial feature, bug fix, architecture, or verification work, acknowledge the repo-local harness automatically:

```bash
.agent/bin/agent ack-start "<developer task>"
```

Keep the returned `run_id`. Before the final response, acknowledge the outcome:

```bash
.agent/bin/agent ack-finish --run <run-id> --status done --summary "<what changed>" --checks "<what was verified>"
```

Use `--status blocked` or `--status failed` if the task did not complete. Tiny questions and one-command requests can skip this.

The acknowledgement commands are deterministic and non-blocking; they do not invoke a nested LLM by default.

## Codex Imagegen Subagent

Claude Code does not directly own Codex's `imagegen` tool. For prompt-driven bitmap generation work, delegate to Codex from the terminal:

```bash
scripts/codex-imagegen-subagent.sh --yes --kind icon --prompt "<specific image generation prompt>"
```

Use this for generated images that need Codex's imagegen capability: content icons, textures, UI/HUD concepts, quest illustrations, scene art, portraits, or one-off product assets. The wrapper checks for the Codex CLI, passes the prompt to `codex exec`, and tells Codex to use the local `$CODEX_HOME/skills/generate-vibeage-icons` skill only for VibeAge content icon batches.

Useful examples:

```bash
scripts/codex-imagegen-subagent.sh --yes --kind texture --output public/textures --prompt "Seamless painterly mossy stone ground texture for a cozy fantasy RPG."
scripts/codex-imagegen-subagent.sh --yes --kind ui --prompt "Inventory HUD frame concept in VibeAge's cozy fantasy style."
scripts/codex-imagegen-subagent.sh --yes --kind quest --prompt "Quest illustration for rescuing a lighthouse keeper at dusk."
```

Useful dry run:

```bash
scripts/codex-imagegen-subagent.sh --print-prompt --kind quest --prompt "<task>"
```

After the command returns, inspect `git status`, review the changed assets/code, and run the relevant checks. Do not ask this subagent to deploy, merge, push, or commit unless the user explicitly requested that.
