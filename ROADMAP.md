# VibeAge Roadmap

This project should become a browser-first multiplayer game that is easy for humans and agents to extend. The current codebase is a prototype with useful gameplay experiments, but the long-term direction is a clean web-native architecture rather than continuing to grow the current monolith.

## Product Constraints

- Runs in a browser with the least possible user friction.
- Development stays code-first and friendly to LLM/agent workflows.
- Prefer proven libraries for rendering, physics, networking, persistence, validation, and tests.
- Server remains authoritative for combat, inventory, loot, cooldowns, enemy AI, and final positions.
- Client owns presentation, interpolation, prediction, input, UI, and VFX.

## Branch And Deployment Policy

- As of 2026-05-07, GitHub `main` is the canonical working and deployment branch and contains the former `server` branch history.
- `old_version` archives the previous stale GitHub `main`.
- The remote `server` branch is only a temporary compatibility alias for old VPS checkouts and must not receive new work.
- Feature branches should branch from `main` and merge back into `main`.
- Current deployment is VPS-only. Vercel is not part of the intended production path.
- Treat pushes to `main` as production-affecting, because the VPS update scripts pull from this branch.

## Immediate Roadmap

1. Keep GitHub `CI` as the quality gate, but keep GitHub-hosted SSH deployment disabled unless explicitly approved.
2. Use the local deploy path for no-hassle releases: `pnpm run deploy:production`, which runs checks, pushes `main`, SSHes from this workstation, and runs the VPS-side safe deploy script.
3. Use the local rollback path for bad releases: `pnpm run deploy:rollback` redeploys the previous successful commit from VPS deploy state.
4. Done on 2026-05-07: closed unnecessary public exposure by disabling the Lineage stream listeners on `2106`/`7777`, restricting raw Stalwart `8080` to localhost, keeping game/Postgres on localhost, and removing the old WireGuard `wg0` tunnel.
5. Finish legacy cleanup on the VPS: leave `/home/s/vibeage-deploy/repo` as the active `main` checkout and archive or remove old `/opt/vibeage` and `/opt/vibeage-frontend` leftovers after preserving any useful local notes.
6. Protect `main` on GitHub once the final deployment model is confirmed.
7. Delete the remote `server` compatibility branch only after no VPS script, cron job, or checkout references it.
8. Continue cleanup on `main`: reduce monolith growth, extract shared contracts/content, and add browser smoke tests before new gameplay work.

## Target Stack

- Client: Vite, React, React Three Fiber, Drei, Three.js.
- Physics: Rapier, used only where simulation/collision needs it.
- Multiplayer: Colyseus rooms and state sync instead of ad hoc Socket.IO protocol code.
- Shared contracts: TypeScript strict mode plus Zod schemas for runtime validation.
- Persistence: Postgres with Kysely for type-safe SQL.
- Tests: Vitest for shared/server simulation and Playwright for browser smoke tests.
- Deployment: static client assets plus one Node game server process; Docker only where it reduces setup friction.

## Target Repository Shape

```text
apps/
  client/        Vite + React + R3F browser game
  server/        Colyseus authoritative game server
packages/
  content/       skills, items, enemies, zones
  protocol/      Zod schemas and generated TypeScript types
  sim/           deterministic movement/combat/math
  ui/            reusable HUD/client UI pieces, if needed
tests/
  e2e/           Playwright browser smoke tests
```

## Migration Phases

### Phase -1: Confirm Production Baseline

- Keep the active deploy checkout at `/home/s/vibeage-deploy/repo` on `main`.
- Record deployed commit, remotes, Docker Compose status, Nginx site config, crontab entries, and frontend checkout state.
- Confirm DNS points to the VPS and that Nginx serves both frontend and backend.
- Keep public listeners limited to SSH, Nginx, and intended Stalwart mail ports.
- Protect `main` on GitHub or otherwise document that it is production.
- Delete the remote `server` compatibility branch only after the VPS has been verified on `main`.

### Phase 0: Stabilize Current Prototype

- Keep one Next config and one test config.
- Keep env files out of Git; track only examples.
- Maintain `pnpm run check` as the local and CI quality gate: lint, typecheck, deployment script syntax, maintainability budgets, tests, server build, frontend build, and browser smoke.
- Document agent workflow in `AGENTS.md`.
- Keep GitHub `main` protected by the passing CI gate once VPS migration is confirmed.
- Keep secret scanning and Dependabot enabled in GitHub so accidental credentials and stale dependencies are caught before deployment.
- Stop adding gameplay features to large monolithic files unless the change is a small fix.

### Phase 1: Extract Contracts And Content

- Move skills, items, effects, zones, and combat math into small shared packages.
- Replace loose message interfaces and `[key: string]: any` protocol types with Zod schemas.
- Define the server-authoritative state model explicitly.
- Delete legacy projectile/protocol types after the v2 path has tests.

### Phase 2: Build The New Browser Client

- Create a Vite client app with one loading screen, one game canvas, and a minimal HUD.
- Port only the best R3F/VFX pieces from the current app.
- Keep visual state separate from authoritative network state.
- Add Playwright smoke tests for page load, canvas presence, server connection, movement, and one skill cast.

### Phase 3: Build The Authoritative Server

- Replace the raw Socket.IO world protocol with Colyseus rooms.
- Move combat, cooldowns, inventory, loot, and enemy AI into testable simulation modules.
- Add deterministic server tests that do not require a browser.
- Persist only stable player/account data, not transient render state.

### Phase 4: Iterate On Gameplay

- Add a small vertical slice: one zone, one class, three skills, three enemy types, loot, leveling, and respawn.
- Measure latency, tick cost, bundle size, and browser FPS before scaling content.
- Expand content only after protocol and simulation tests are stable.

## Agent Rules

- Make small, verifiable changes.
- Prefer deleting dead migration leftovers over supporting parallel legacy paths.
- Do not introduce new global state or new protocol message shapes without updating schemas and tests.
- Keep browser startup simple: one client URL, one game server URL, no hidden services beyond Postgres when persistence is needed.
- When adding a library, document why it replaces custom code.
