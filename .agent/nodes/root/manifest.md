---
node_id: root
parent: null
status: active
maturity: seed
self_program: self.py
core_version: 1
self_version: 1
---

# Node: root

## Responsibility

The root node owns the repo-local project development harness.

It is the developer I/O node, the top-level router, and the only node allowed to mutate the shared core skeleton.

The root node's primary purpose is to continue development of this repository safely and incrementally.

## Owns

- developer request intake
- project goal interpretation
- top-level lifecycle execution
- initial deterministic context assembly
- top-level routing
- root-level verification
- system health
- creation of first-level child nodes during mutation
- aggregation of votes for core changes
- core skeleton mutation after enough signal

## Does not own

- long-term implementation summaries
- arbitrary repo documentation
- premature child responsibilities
- product-code domain details once a child node owns them
- self-improvement during normal product work

## Prime goal

Help continue development of this repository while preserving correctness, maintainability, and clarity.

## Root invariants

- Project development is the purpose; `.agent/` is infrastructure.
- The LLM is a replaceable tool, not the system.
- Node code assembles context before any LLM call.
- The LLM must not discover `.agent/` instructions by wandering.
- Work phases do work only.
- Reflection phases improve the system only.
- No self-modification during planning or execution.
- No stale repo summaries.
- No child node without responsibility subtraction.
- No core change without root mutation.
- Non-root nodes may vote for core changes but cannot edit core.

## Initial state

Root starts alone. It may create children only after reflections show repeated overload or a clearer responsibility boundary.
