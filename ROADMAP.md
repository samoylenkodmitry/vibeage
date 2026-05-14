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

Valid review findings from the audit were carried into the cleanup plan and resolved on `chore/ai-fy-foundation`:

| Priority | Source | Area | Resolution |
| --- | --- | --- | --- |
| P0 | PR #51 | `server/server.ts` | Colyseus matchmaker routing is allow-listed and covered by tests. |
| P0 | PR #60 | `server/world/tickPipeline.ts` | Maintenance scheduling now uses a dedicated tick counter with snapshot cadence regressions. |
| P0 | PR #55 | inventory runtime | Inventory uses compact slot semantics consistently on server and client. |
| P1 | PR #62 | region streaming | Socket-to-player lookup and per-client visible region context are O(1)/reused. |
| P1 | PR #61 | `server/world/regions.ts` | Region runtime loops avoid per-entity allocations and aggregate stats in single passes. |
| P1 | PR #60 | observability | World gauges are throttled off the 30Hz hot path. |
| P1 | PR #58 | camera | Camera orbit updates reuse vector state in the frame loop. |
| P1 | PR #57 | client snapshots | Client game state snapshot handling is split and tested. |
| P1 | PR #55 / PR #52 | client visuals | Visual event IDs are monotonic and skill VFX reads from content. |
| P1 | PR #52 | starter progress | Starter defeat IDs are capped/pruned after completion. |
| P1 | PR #40 | combat compatibility | Unused cast compatibility code was removed. |
| P2 | PR #31 | progression | XP multiple-level behavior is documented as future gameplay work. |
| P2 | PR #49 | Dependabot config | Disabled ecosystems now have consistent comments. |
| P2 | PR #61 | scripts | Linux/GNU script assumptions are documented. |

Review findings intentionally not carried forward:

- PR #31 `apps/client/src/App.tsx` Socket.IO cleanup comments are stale; the active client uses Colyseus `useRoomConnection` and already leaves rooms on unmount.
- PR #52 client-inferred starter defeat tracking is stale; starter progress is now server-authored, though server-side `defeatedEnemyIds` still needs a cap.
- Resolved or outdated review threads from PRs #23, #24, #26, #27, #29, #30, #56, and #59 were ignored unless the current code still shows the same issue.

## Future Backlog

Useful future hardening that is intentionally outside this cleanup batch:

- No load/soak test for many simultaneous Colyseus clients, region streaming, and reconnect churn.
- No production alerting or external uptime check in Git; health checks are manual/local-script driven.
- No authenticated player account model; current identity is still prototype-grade.
- No admin/debug console for inspecting rooms, players, regions, loot, or stuck sessions.
- No formal protocol compatibility matrix beyond schema tests and minimum client protocol checks.
- Dead-code/dependency checking exists through Knip; the remaining gap is shrinking the non-blocking unused-export report.
- TypeScript strictness is mostly disabled; correctness depends on local tests and discipline instead of compiler help.
- Content is TS-authored and validated, but there is no content authoring workflow or editor.
- Mobile/responsive coverage is thin; Playwright mostly checks the desktop happy path.
- Docs are mostly aligned with Vite/Colyseus/VPS deployment; keep future drift out with scoped playbooks and checks.

Known drift to keep contained:

- `scripts/setup-server.sh` and `scripts/setup-client.sh` remain tracked for fresh-host bootstrap only; they are guarded by `ALLOW_LEGACY_BOOTSTRAP=1` and must not be used for live updates.
- Local generated directories (`dist/`, `.next/`, `out/`) exist but are ignored and untracked.

## Completed AI-Fy Work

Goal: make the repository comfortable for coding agents and LLMs by reducing orientation cost, shortening feedback loops, and making dead-code edits harder to mistake for real work.

- [x] Architecture docs in `docs/ARCHITECTURE.md`.
- [x] Agent playbooks in `docs/AGENT_PLAYBOOKS.md`.
- [x] Targeted fast-check scripts: `check:server`, `check:client`, `check:protocol`, and `check:content`.
- [x] Knip-backed dead-code/dependency scanning with blocking and full-report modes.
- [x] Deterministic scenario fixtures in `tests/helpers/scenarioFixtures.ts`.
- [x] Protocol and state contract docs in `docs/PROTOCOL.md`.
- [x] Strict TypeScript started for leaf packages through `tsconfig.packages.strict.json`.
- [x] Playwright HUD viewport assertions and screenshot artifacts.
- [x] Module-level README files for core server, client, protocol, content, and sim boundaries.
- [x] Stale Next/Vercel/Socket.IO drift removed from active docs and env examples.

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

1. [x] Optimize region streaming visibility.
   - Keep socket-to-player lookup O(1).
   - Build per-client visibility context once per outbound event or tick.
   - Reuse visible-region sets while filtering `BatchUpdate` children.

2. [x] Optimize region runtime loops.
   - Avoid per-entity set allocations in active-region checks.
   - Use simple loops in `refreshWorldRegionRuntime`.
   - Aggregate region stats in one enemy pass and one player pass.

3. [x] Reduce server tick allocation and O(N) work.
   - Throttle world gauges.
   - Replace `Object.values(...).filter(...)` in high-frequency paths with counted loops.
   - Type `dirtySnap` on runtime entities instead of using `as any`.

4. [x] Reduce client frame-loop allocation.
   - Update camera orbit math to write into reusable vectors.
   - Audit `WorldScene`, entity markers, and VFX for allocations inside `useFrame`.

### P1: Client Polish

1. [x] Improve inventory and consumable feedback after slot semantics are fixed.
2. [x] Use skill content for all skill VFX radii, damage labels, and cast readability.
3. [x] Add a small debug overlay or test hook for streamed region IDs, visible entity counts, and reconnect state.
4. [x] Add mobile HUD screenshots or Playwright viewport assertions for the starter panel, movement panel, inventory, and skill bar.

### P1: Dead Code And Drift

1. [x] Remove remaining compatibility exports.
   - `server/combat/utils/cast.ts`
   - `applyCastCost` if no active runtime path uses it
   - `SkillType` alias after `packages/sim/entities.ts` uses `SkillId`

2. [x] Remove unused dependencies after verification.
   - `uuid` is no longer a package dependency; remaining UUID mentions are Postgres column types.
   - Knip is wired as `pnpm run check:deadcode` and currently passes its blocking subset.

3. [x] Clean bootstrap-era scripts and docs.
   - Audit `scripts/setup-server.sh` and `scripts/setup-client.sh`; either move them to documented legacy/bootstrap storage or make their danger impossible to miss.
   - Update `DB_DEV_README.md`, `DEPLOYMENT.md`, `docs/SERVER_DEPLOYMENT.md`, and `.env.example` for Vite/Colyseus-only development.
   - Remove stale `NEXT_PUBLIC_GAME_SERVER_URL`, `FRONTEND_BUILD_TARGET=next`, `build:next`, and old Socket.IO references where they no longer apply.
   - Update CORS examples to include the Vite dev port.

4. [x] Keep local ignored output out of Git.
   - `dist/`, `.next/`, `out/`, and local IDE shelves are ignored and currently untracked.
   - Do not add generated build output or local private scripts.

### P2: Architecture

1. [x] Move more public entity state into Colyseus schemas once event filtering is stable.
   - Colyseus public state now carries lightweight player presence; enemy detail stays in scoped snapshots and region counters to avoid oversize public patches.
2. [x] Split large but under-budget files by domain:
   - `apps/client/src/SceneVfx.tsx`
   - `apps/client/src/Hud.tsx`
   - `apps/client/src/gameReducer.ts`
   - `apps/client/src/clientVisualState.ts`
   - `server/transport/colyseusRoomAdapter.ts`
   - `server/world/regions.ts`

3. [x] Tighten TypeScript gradually.
   - Leaf packages (`packages/content`, `packages/sim`, `packages/protocol`) are covered by `tsconfig.packages.strict.json`.
   - Current `tsconfig.json` still has strictness disabled; app/server strictness is future hardening, not part of this cleanup batch.

4. [x] Keep gameplay expansion behind cleanup.
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
