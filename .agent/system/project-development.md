# Project Development Rules

## Purpose

The repo-local harness exists to continue development of this repository.

## Bootstrap versus normal development

During seed instantiation, product-code changes are forbidden.

After bootstrap, product-code changes are allowed when the developer task requires or permits them and the work packet allows the relevant scope.

Product-code changes do not count as agent-system mutation.

## Broad continuation tasks

For broad tasks such as "continue development", the node must use the project goal and live repo context to identify small safe increments.

If no single next increment is clearly safest, return options instead of making arbitrary edits.

## Ambient acknowledgement

Coding agents should acknowledge the harness automatically around nontrivial feature, bug fix, architecture, and verification work.

Start with:

```bash
.agent/bin/agent ack-start "<developer task>"
```

Finish with:

```bash
.agent/bin/agent ack-finish --run <run-id> --status done --summary "<what changed>" --checks "<what was verified>"
```

These commands do not call a nested LLM by default. They create deterministic context and outcome records so the project harness stays involved without requiring a manual developer ritual.

## Checks

Prefer existing repo checks and project conventions.

Do not invent passing verification.

If checks are not run, say why and name the next recommended checks when obvious.
