# Agent Guide

## Current State

This repository is a browser multiplayer game prototype. Treat it as a codebase being stabilized before a web-native rewrite, not as a clean production architecture.

The current app uses Next, React Three Fiber, Rapier, Socket.IO, Postgres, and Vitest. The intended direction is documented in `ROADMAP.md`: Vite client, Colyseus server, shared Zod protocol schemas, Kysely persistence, Vitest and Playwright checks.

## Branch Policy

- Work from `main` unless the user explicitly says otherwise.
- Treat `main` as production-affecting: the VPS deployment scripts pull from `origin/main`.
- `old_version` archives the old stale GitHub main branch.
- The former `server` branch is a temporary compatibility alias and should not receive new work.
- For larger changes, create a feature branch from `main` and merge back to `main` only after checks pass.
- Before changing deployment scripts, inspect `/opt/vibeage` assumptions in `scripts/setup-server.sh`, `scripts/setup-client.sh`, Docker Compose, Nginx, and the generated `manage.sh` behavior.
- Current production automation is local-initiated: `scripts/deploy-from-local.sh` SSHes from this workstation and runs `scripts/deploy-production.sh` on the VPS. GitHub-hosted SSH deployment must stay disabled unless the owner explicitly approves it.

## Commands

- Install: `pnpm install`
- Frontend dev: `pnpm run dev`
- Server dev: `pnpm run dev:server`
- Frontend and server dev: `pnpm run dev:all`
- Docker-backed local DB plus dev servers: `pnpm run dev:db`
- Frontend build: `pnpm run build`
- Server build: `pnpm run build:server`
- Tests: `pnpm test`
- Browser smoke: `pnpm run test:e2e`
- Lint: `pnpm run lint`
- Full local quality gate: `pnpm run check`
- Local production deploy: `pnpm run deploy:production`
- Local production rollback: `pnpm run deploy:rollback`
- Production deploy script syntax: `pnpm run check:scripts`

Local configuration lives in `.env`. Start from `.env.example`. Do not commit real env files.

## High-Value Files

- `shared/skillsDefinition.ts`: current skill content.
- `shared/items.ts`: current item content.
- `shared/combatMath.ts`: reusable combat math.
- `shared/messages.ts`: current protocol types; this needs schema cleanup.
- `server/world.ts`: current authoritative loop; do not grow this file except for targeted fixes.
- `server/combat/skillSystem.ts`: current cast/combat flow.
- `app/game/systems/SocketManager.tsx`: current network bridge; avoid adding more responsibilities here.
- `app/game/systems/gameStore.ts`: current client state store; avoid widening its scope.

## Working Rules

- Keep generated output out of Git: `dist/`, `.next/`, `out/`, coverage, and local env files.
- Do not add new gameplay systems directly into `world.ts`, `SocketManager.tsx`, or `gameStore.ts` unless the change is explicitly a small bug fix.
- Prefer shared pure functions for simulation logic. They should be testable with Vitest and no browser.
- Keep new files and functions inside `quality/maintainability.json` budgets. Only add a legacy exception when documenting an existing cleanup target.
- Prefer runtime-validated protocol schemas over ad hoc TypeScript interfaces.
- When changing protocol messages, update server handling, client handling, and tests in the same change.
- When touching movement, combat, loot, or inventory, run `pnpm test` and `pnpm run build:server`.
- When touching rendering/UI, run `pnpm run build`; add or update a Playwright smoke test once Playwright exists.
- Before pushing, prefer `pnpm run check` unless the change is clearly docs-only.
- Never commit `.env`, private keys, tokens, real database URLs, or generated build folders.
- Never use the old setup scripts as an update path on the live VPS; they are bootstrap-era scripts and can overwrite Nginx.
