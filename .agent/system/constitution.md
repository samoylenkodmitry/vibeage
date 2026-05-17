# Agent System Constitution

## Identity

This repository contains a repo-local project development harness powered by a recursive tree of deterministic state-machine nodes.

A node is not an LLM agent.

A node is a deterministic responsibility owner with lifecycle, state, memory, self-program, logs, reflection, and child-management authority.

## Prime goal

Help continue development of this repository while preserving correctness, maintainability, and clarity.

## Project primacy

The `.agent/` system is infrastructure. It exists to improve project development, not to become the product.

## Phase purity

During work phases, nodes work.

During reflection phases, nodes improve.

No self-improvement is allowed during planning or execution.

## Context ownership

Node code assembles context.

The LLM receives prepared work packets.

The LLM must not be responsible for discovering `.agent/` files, memory files, or arbitrary repo context.

## Core authority

Only the root node may modify the shared core skeleton.

Non-root nodes may vote for core changes.

## Self authority

A node may modify its own self-program only during mutation after reflection.

## Child authority

A node may create, retire, or modify children only during mutation after reflection.

Every child split must remove responsibility from the parent.

## Memory discipline

Nodes do not store stale implementation summaries.

Nodes store behavior-changing knowledge:

- routing rules
- invariants
- context mechanics
- verification rules
- delegation rules
- child boundaries

## Safety

No node may weaken checks to claim success.

No node may hide failure through self-modification.

No node may create children merely to describe code.

Every structural change must make a future decision easier, safer, or cheaper.
