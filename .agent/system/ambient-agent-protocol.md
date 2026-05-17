# Ambient Agent Protocol

The repo-local harness is meant to be acknowledged automatically by coding agents during normal feature work.

## Start Acknowledgement

For nontrivial feature, bug fix, architecture, or verification work, the agent should run this before planning deeply or editing files:

```bash
.agent/bin/agent ack-start "<developer task>"
```

This command is non-blocking. It runs deterministic receive/classify/route/context phases, writes a bounded context packet under `.agent/runs/`, and returns a run id. It does not invoke a nested LLM.

Tiny questions or one-command user requests may skip this acknowledgement.

## Finish Acknowledgement

Before the agent's final response for that work, it should run:

```bash
.agent/bin/agent ack-finish --run <run-id> --status done --summary "<what changed>" --checks "<what was verified>"
```

Use `--status blocked` or `--status failed` when appropriate.

If the start run id was lost, run `ack-finish` without `--run`; it will create a finish-only acknowledgement.

## Why This Exists

The harness should be ambient project context, not a separate manual ritual. The acknowledgement commands make the system present in feature work without forcing recursive agent execution or requiring the developer to ask for packets every time.

## Boundary

Acknowledgement is not permission to edit `.agent/core/**`, node `self.py` files, product code, secrets, or generated output. Normal repository instructions and the generated packet still govern scope.
