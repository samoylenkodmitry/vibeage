# VibeAge Roadmap

Last cleaned: 2026-05-14

## Direction

VibeAge is a browser-first multiplayer RPG prototype. Keep it easy to run, easy for agents to modify, and built on proven libraries instead of custom engine code where practical.

Current stack: Vite, React Three Fiber, Colyseus, Postgres/Kysely, shared protocol/content/simulation packages, Vitest, Playwright smoke checks, and local VPS deployment.

Production target: VPS only. Production pulls from `origin/main` through local deploy scripts.

## Current Baseline

- `main` is production-affecting and deployed to `vibeage.eu`.
- The old `server` branch is retired.
- Server owns world activation, enemy spawning, combat, loot, inventory, and persistence.
- The client renders presentation, input, local smoothing, and UI state.
- Region activation is global; per-player logic may only scope streamed visibility.
- The CI gate covers secret scan, lint, typecheck, script syntax, maintainability, content validation, unit tests, server build, Docker build, frontend build, performance smoke, and Playwright browser smoke.

## PR Review Audit

Audit window: closed PRs from 2026-05-12 through 2026-05-14.

Valid unresolved review findings to preserve:

| Priority | Source | Area | Roadmap item |
| --- | --- | --- | --- |
| P0 | PR #51 | `server/server.ts` | Add an allow-list for Colyseus matchmaker methods before calling `matchMaker.controller.invokeMethod`; do not expose arbitrary controller method names from URL params. |
| P0 | PR #60 | `server/world/tickPipeline.ts` | Make maintenance scheduling independent of `snapAccumulator`; add a regression where `snapshotEveryTicks === 1` still runs mana regen and enemy respawn. |
| P0 | PR #55 | `apps/client/src/clientVisualState.ts` / inventory runtime | Define inventory slot semantics and make client/server agree when a consumable reaches zero; avoid client-only `splice` if slots are stable. |
| P1 | PR #62 | region streaming | Avoid `Object.entries(state.players).find(...)` in per-client visibility filtering; maintain or pass an O(1) socket-to-player lookup. |
| P1 | PR #62 | region streaming | Compute visible regions once per client per broadcast/tick and reuse that context for batched message filtering. |
| P1 | PR #61 | `server/movement/snapshotDeltas.ts` / `server/world/regions.ts` | Precompute active zone sets in snapshot loops; stop allocating a `Set` inside `isEnemyInActiveRegion` for every enemy. |
| P1 | PR #61 | `server/world/regions.ts` | Replace allocation-heavy `refreshWorldRegionRuntime` array pipelines with simple loops. |
| P1 | PR #61 | `server/world/regions.ts` | Make `getWorldRegionStats` O(R + E + P) by aggregating enemy/player counts in single passes. |
| P1 | PR #60 | observability | Throttle O(N) world gauge recording to a lower-frequency cadence instead of every 30Hz tick. |
| P1 | PR #58 | camera | Remove per-frame object allocation from camera orbit calculations; update a reusable `THREE.Vector3` target in place. |
| P1 | PR #57 | `server/transport/clientState.ts` | Derive `ClientGameStateSnapshot` from `CLIENT_GAME_STATE_FIELDS`; keep region-scoped snapshot construction explicit and tested. |
| P1 | PR #55 / PR #52 | client visuals | Replace visual-event IDs based on object length with a monotonic counter or other stable ID source. |
| P1 | PR #55 | `apps/client/src/clientVisualState.ts` | Read splash impact radius from skill content instead of hardcoding `3`. |
| P1 | PR #52 | starter progress | Cap or prune `defeatedEnemyIds` after the starter objective is met so persisted starter progress cannot grow forever. |
| P1 | PR #40 | `server/combat/castRules.ts` | Remove unused compatibility `applyCastCost`/`server/combat/utils/cast.ts`, or make it deterministic by accepting `now`. |
| P2 | PR #31 | progression | Decide whether XP awards should support multiple level-ups in one award; if yes, implement in a dedicated gameplay PR with tests. |
| P2 | PR #49 | Dependabot config | Add the same "updates intentionally disabled" comment to GitHub Actions and Docker ecosystems for consistency. |
| P2 | PR #61 | scripts | Either document production scripts as Linux-only or replace GNU `find -printf` usage with a portable equivalent. |

Review findings intentionally not carried forward:

- PR #31 `apps/client/src/App.tsx` Socket.IO cleanup comments are stale; the active client uses Colyseus `useRoomConnection` and already leaves rooms on unmount.
- PR #52 client-inferred starter defeat tracking is stale; starter progress is now server-authored, though server-side `defeatedEnemyIds` still needs a cap.
- Resolved or outdated review threads from PRs #23, #24, #26, #27, #29, #30, #56, and #59 were ignored unless the current code still shows the same issue.

## Project Observation

What is missing or weak:

- No load/soak test for many simultaneous Colyseus clients, region streaming, and reconnect churn.
- No production alerting or external uptime check in Git; health checks are manual/local-script driven.
- No authenticated player account model; current identity is still prototype-grade.
- No admin/debug console for inspecting rooms, players, regions, loot, or stuck sessions.
- No formal protocol compatibility matrix beyond schema tests and minimum client protocol checks.
- No automated dead-code/dependency checker, so unused exports and packages can survive if TypeScript still compiles.
- TypeScript strictness is mostly disabled; correctness depends on local tests and discipline instead of compiler help.
- Content is TS-authored and validated, but there is no content authoring workflow or editor.
- Mobile/responsive coverage is thin; Playwright mostly checks the desktop happy path.
- Docs and examples still drift: some files mention Next, old build targets, or old Socket.IO paths.

Dead code or drift observed:

- `server/combat/utils/cast.ts` is a compatibility re-export used by tests, not active runtime code.
- `applyCastCost` is exported but has no active runtime caller.
- `SkillType` is a compatibility alias; `SkillId` should become canonical everywhere.
- `uuid` appears unused by source imports.
- `scripts/setup-server.sh` and `scripts/setup-client.sh` remain tracked even though they are bootstrap-era and unsafe as live update paths.
- `.env.example`, `DB_DEV_README.md`, `DEPLOYMENT.md`, and `docs/SERVER_DEPLOYMENT.md` contain stale Next/Vite/Colyseus details.
- Local generated directories (`dist/`, `.next/`, `out/`) exist but are ignored and untracked.

## AI-Fy Plan

Goal: make the repository comfortable for coding agents and LLMs by reducing orientation cost, shortening feedback loops, and making dead-code edits harder to mistake for real work.

In progress:

- Items 1-3 are implemented on the `chore/ai-fy-foundation` branch with architecture docs, agent playbooks, and scoped check scripts.
- Item 4 is partially implemented with Knip, a blocking dead-code/dependency subset, and a non-blocking full dead-code report. The remaining unused-export baseline is tracked below.
- Item 5 is implemented with deterministic scenario fixtures under `tests/helpers/scenarioFixtures.ts`.
- Item 6 is implemented in `docs/PROTOCOL.md` with transport lanes, state ownership, snapshot ordering, visibility, and change checks.
- Item 7 is started with strict TypeScript enabled for leaf packages through `tsconfig.packages.strict.json`.
- Item 8 is started with Playwright HUD viewport assertions and per-run screenshot artifacts for desktop and mobile.
- Item 9 is implemented with module-level README files for core server, client, protocol, content, and sim boundaries.
- Item 10 is started by removing stale Next/Vercel/Socket.IO references from env examples, docs, and the guarded bootstrap client script.

1. Add `docs/ARCHITECTURE.md`.
   - Document the live architecture and core flows: join, movement, combat/cast, loot/inventory, region streaming, persistence, deploy, and rollback.
   - List the key files for each flow.
   - Mark files that should stay orchestration-only or should not grow.

2. Add `docs/AGENT_PLAYBOOKS.md`.
   - Add short checklists for common changes: protocol messages, skills/items/enemies/content, movement/combat, client UI, persistence, deploy scripts, production deploy, and rollback.
   - Include required tests for each change type.
   - Include "do not touch live VPS setup scripts unless explicitly asked" guidance.

3. Add targeted fast-check scripts.
   - `check:server`: lint/typecheck relevant server/packages files, focused server tests, and `build:server`.
   - `check:client`: lint/typecheck client files, Vite build, and client reducer/camera/HUD tests.
   - `check:protocol`: protocol schema tests plus server/client handling tests.
   - `check:content`: content validation plus content/unit tests.
   - Keep `pnpm run check` as the full merge gate.

4. Add automated dead-code/dependency scanning.
   - Evaluate Knip or an equivalent tool.
   - Catch unused exports, stale compatibility files, unused dependencies, and accidental orphan files.
   - Gate new dead code in CI once the first cleanup pass is complete.
   - Current Knip cleanup baseline: unused exported constants/types in client helpers and server modules, `server/combat/utils/cast.ts`, `applyCastCost`, and a duplicate logger export.

5. Add deterministic scenario fixtures.
   - Provide reusable test fixtures for: two players in separate regions, one combat encounter, loot pickup, full inventory, reconnect/persisted player, and scoped region streaming.
   - Keep fixtures in a small test helper module so agents stop hand-building inconsistent game states.

6. Add protocol and state contract docs.
   - Document client messages, server messages, Colyseus public state, direct/private messages, initial snapshots, update events, and private player fields.
   - Link docs to the Zod/schema source files and required regression tests.

7. Tighten TypeScript in layers.
   - Start with `packages/content`, `packages/sim`, and `packages/protocol`.
   - Then move to server leaf modules.
   - Leave app/server integration strictness for later after drift is reduced.

8. Add visual regression hooks.
   - Add Playwright screenshot or viewport assertions for desktop and mobile HUD.
   - Cover starter panel, movement panel, target panel, inventory, skill bar, death overlay, and reconnect overlay.
   - Keep screenshots deterministic enough to avoid noisy CI.

9. Add module-level README files.
   - Add short README files for `server/world`, `server/transport`, `server/combat`, `server/players`, `apps/client/src`, `packages/protocol`, `packages/content`, and `packages/sim`.
   - Each README should explain ownership, entry points, common edits, and tests.

10. Remove drift that confuses agents.
    - Delete or quarantine stale Next/Socket.IO/bootstrap docs and examples.
    - Remove compatibility re-exports after callers are migrated.
    - Keep `.env.example` aligned with the active Vite/Colyseus flow.
    - Keep `AGENTS.md` tiny; move details into docs/playbooks.

## Cleanup Plan

### P0: Safety And Correctness

1. [x] Harden Colyseus matchmaker routing.
   - Allow only expected methods such as `joinOrCreate`, `join`, `create`, and `joinById`.
   - Add a server test for rejected matchmaker methods.
   - Remove manual `content-length` from JSON `Response` construction or calculate byte length correctly.

2. [x] Fix tick maintenance scheduling.
   - Replace `snapAccumulator === 1/2` maintenance triggers with a dedicated tick counter or elapsed-time scheduler.
   - Cover `snapshotEveryTicks === 1`, default 30Hz/10Hz, and long-running ticks.

3. [x] Make inventory slot behavior explicit.
   - Inventory uses compact arrays: consuming the final item removes the slot and shifts later slots left.
   - Update server item use, client item-use visuals, inventory updates, and tests together.
   - Add a regression for consuming slot 0 while slot 1 remains interactable as the same item.

### P1: Hot-Path Performance

1. Optimize region streaming visibility.
   - Keep socket-to-player lookup O(1).
   - Build per-client visibility context once per outbound event or tick.
   - Reuse visible-region sets while filtering `BatchUpdate` children.

2. Optimize region runtime loops.
   - Avoid per-entity set allocations in active-region checks.
   - Use simple loops in `refreshWorldRegionRuntime`.
   - Aggregate region stats in one enemy pass and one player pass.

3. Reduce server tick allocation and O(N) work.
   - Throttle world gauges.
   - Replace `Object.values(...).filter(...)` in high-frequency paths with counted loops.
   - Type `dirtySnap` on runtime entities instead of using `as any`.

4. Reduce client frame-loop allocation.
   - Update camera orbit math to write into reusable vectors.
   - Audit `WorldScene`, entity markers, and VFX for allocations inside `useFrame`.

### P1: Client Polish

1. Improve inventory and consumable feedback after slot semantics are fixed.
2. Use skill content for all skill VFX radii, damage labels, and cast readability.
3. Add a small debug overlay or test hook for streamed region IDs, visible entity counts, and reconnect state.
4. Add mobile HUD screenshots or Playwright viewport assertions for the starter panel, movement panel, inventory, and skill bar.

### P1: Dead Code And Drift

1. Remove remaining compatibility exports.
   - `server/combat/utils/cast.ts`
   - `applyCastCost` if no active runtime path uses it
   - `SkillType` alias after `packages/sim/entities.ts` uses `SkillId`

2. Remove unused dependencies after verification.
   - `uuid` appears unused by source imports.
   - Add a dependency/dead-code checker such as Knip before doing broad removals.

3. Clean bootstrap-era scripts and docs.
   - Audit `scripts/setup-server.sh` and `scripts/setup-client.sh`; either move them to documented legacy/bootstrap storage or make their danger impossible to miss.
   - Update `DB_DEV_README.md`, `DEPLOYMENT.md`, `docs/SERVER_DEPLOYMENT.md`, and `.env.example` for Vite/Colyseus-only development.
   - Remove stale `NEXT_PUBLIC_GAME_SERVER_URL`, `FRONTEND_BUILD_TARGET=next`, `build:next`, and old Socket.IO references where they no longer apply.
   - Update CORS examples to include the Vite dev port.

4. Keep local ignored output out of Git.
   - `dist/`, `.next/`, `out/`, and local IDE shelves are ignored and currently untracked.
   - Do not add generated build output or local private scripts.

### P2: Architecture

1. Move more public entity state into Colyseus schemas once event filtering is stable.
2. Split large but under-budget files by domain:
   - `apps/client/src/SceneVfx.tsx`
   - `apps/client/src/Hud.tsx`
   - `apps/client/src/gameReducer.ts`
   - `apps/client/src/clientVisualState.ts`
   - `server/transport/colyseusRoomAdapter.ts`
   - `server/world/regions.ts`

3. Tighten TypeScript gradually.
   - Current `tsconfig.json` still has strictness disabled.
   - Start with leaf packages (`packages/content`, `packages/sim`, `packages/protocol`) before app/server edges.

4. Keep gameplay expansion behind cleanup.
   - Grow world size, encounters, and content only after streaming, tick scheduling, inventory semantics, and dead-code removal are stable.
   - Avoid major quest depth until client/server boundaries stay crisp under tests.

## Quality Gate

Before merge, prefer:

```bash
pnpm run check
```

For production changes, deploy locally and verify:

```bash
pnpm run deploy:production
pnpm run health:production
```
