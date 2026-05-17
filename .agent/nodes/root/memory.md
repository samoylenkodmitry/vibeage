# Root Memory

Root memory stores only behavior-changing knowledge about how to operate this repo-local project development harness.

Do not store stale implementation summaries here.

## Active rules

- Prefer executable context assembly over prose summaries.
- Store routing, invariant, context, verification, delegation, and mutation knowledge only if it changes future behavior.
- If a fact can be cheaply rediscovered by a context builder, do not store it.
- Favor small safe project-development increments when the developer asks to continue development.
- Treat `.agent/` as an ambient protocol for nontrivial feature work: acknowledge start with `ack-start`, acknowledge outcome with `ack-finish`, and avoid nested LLM execution unless explicitly configured.
