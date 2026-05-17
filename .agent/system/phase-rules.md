# Phase Rules

Work phases are: receive, classify, route, context, plan, execute, verify, report.

Growth phases are: reflect, mutate, compact.

If a phase returns `needs_llm`, the lifecycle pauses immediately and reports the packet path and resume command.

During work phases, `.agent/` writes are limited to run artifacts and append-only node logs.

During normal development runs, work phases may modify product code only when the developer task and generated packet allow it.

Reflection may produce proposals, votes, and reflection files, but it must not apply mutation.

Mutation may apply approved node-local changes.

Only root mutation may change core files under `.agent/core/**`, `.agent/system/**`, or `.agent/bin/agent`.
