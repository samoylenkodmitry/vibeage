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
