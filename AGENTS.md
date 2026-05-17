# Agent Guide

- Work from `main`; use a feature branch for larger changes.
- `main` deploys to the VPS. The old `server` branch is retired.
- Deploy only from this machine with `pnpm run deploy:production`.
- Never commit `.env`, keys, tokens, DB URLs, or generated output.
- Spawning and activation are server-owned and global; players only affect visibility.
- Keep new gameplay out of `server/world.ts`, `gameReducer.ts`, and transport glue unless it is a tiny fix.
- Prefer `packages/content`, `packages/sim`, and `packages/protocol` over legacy shared paths.
- Run `pnpm run check` before push when code changes.

## Repo-local Agent System

This repository contains a deterministic repo-local project development harness under `.agent/`.

For nontrivial feature, bug fix, architecture, or verification work, acknowledge the harness automatically before deep planning or file edits:

```bash
.agent/bin/agent ack-start "<developer task>"
```

Keep the returned `run_id`. Before the final response, acknowledge the outcome:

```bash
.agent/bin/agent ack-finish --run <run-id> --status done --summary "<what changed>" --checks "<what was verified>"
```

Use `--status blocked` or `--status failed` when appropriate. Tiny questions and one-command requests can skip acknowledgement.

Manual commands remain available when explicitly useful:

```bash
.agent/bin/agent help
.agent/bin/agent context "<task>" --phase plan
.agent/bin/agent packet "<task>" --phase execute
.agent/bin/agent next
```

The LLM should not manually discover `.agent/` internals. The node code assembles context and produces bounded work packets. The acknowledgement commands are deterministic and non-blocking; they do not invoke a nested LLM by default.

During bootstrap, do not modify product code. After bootstrap, product-code changes are allowed when the developer task and generated work packet permit them.

Do not edit `.agent/core/**` unless explicitly performing root-node mutation.
Do not edit node `self.py` files outside their mutation phase.
Do not weaken checks to claim success.
