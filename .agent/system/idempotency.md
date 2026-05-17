# Idempotency Rules

- Phases are input-hash idempotent.
- `input.hash` is required for phase reuse.
- Completed phases are reused only when `input.hash` matches.
- Explicit invalidation recomputes phases.
- LLM calls are cached by backend configuration hash plus prompt hash.
- Logs are append-only.
- Replay should not require another LLM call when cached output exists.
