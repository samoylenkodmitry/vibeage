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
- The remote `server` compatibility alias has been deleted after the VPS was verified on `main`.
- Feature branches should branch from `main` and merge back into `main`.
- Current deployment is VPS-only. Vercel is not part of the intended production path.
- Treat `main` as production-affecting, because the VPS deploy script pulls from this branch.

## Immediate Roadmap

1. Keep GitHub `CI` as the quality gate, but keep GitHub-hosted SSH deployment disabled unless explicitly approved.
2. Use the local deploy path for no-hassle releases: `pnpm run deploy:production`, which runs checks, deploys a commit already on `origin/main`, SSHes from this workstation, and runs the VPS-side safe deploy script.
3. Use the local rollback path for bad releases: `pnpm run deploy:rollback` redeploys the previous successful commit from VPS deploy state.
4. Done on 2026-05-07: closed unnecessary public exposure by disabling the Lineage stream listeners on `2106`/`7777`, restricting raw Stalwart `8080` to localhost, keeping game/Postgres on localhost, removing the old WireGuard `wg0` tunnel, and persisting a default-drop host firewall allow-list.
5. Done on 2026-05-07: added automatic Postgres backups and a restore drill command.
6. Done on 2026-05-07: added an off-VPS local backup pull to `/media/huge/vibeage-backups/postgres`, with daily scheduling, delayed first run, retention of the newest two copies, size reporting, and dunst notifications.
7. Done on 2026-05-07: archived and removed old `/opt/vibeage`, reduced `/opt/vibeage-frontend` to the live `out` document root, verified Nginx, and redeployed from the active `/home/s/vibeage-deploy/repo` checkout.
8. Done on 2026-05-07: protected `main` with required `Build and test` CI, linear history, conversation resolution, no force pushes, and no branch deletion.
9. Done on 2026-05-07: deleted the remote `server` compatibility branch after confirming no live systemd, cron, or Nginx path references it.
10. Done on 2026-05-12: added a Playwright smoke that starts the local game server and verifies a browser can enter the connected game HUD.
11. Done on 2026-05-12: verified the local backup restore drill against `/media/huge/vibeage-backups/postgres`; latest dump restored into an isolated temporary Postgres container.
12. Done on 2026-05-12: added browser smoke coverage for movement intent and a fireball hotkey cast before new gameplay work.
13. Done on 2026-05-12: extracted player progression, mana regeneration, respawn handling, enemy spawn, and enemy respawn out of `server/world.ts` with focused Vitest coverage.
14. Done on 2026-05-12: started the Vite browser client shell in `apps/client` with React, React Three Fiber, a minimal HUD, and an initial network connection stub; CI now builds the shell.
15. Done on 2026-05-12: upgraded the Vite shell into a real playable migration slice that enters the current server, consumes authoritative game state, supports click movement, selects enemies, casts Fireball, and has its own Playwright smoke.
16. Done on 2026-05-12: smoothed Vite entity/camera presentation, added basic Vite HUD loops for cooldowns, XP, death/respawn, loot, inventory, item use, and combat/status feedback.
17. Done on 2026-05-12: prepared the production Vite publish path.
18. Done on 2026-05-13: made Vite the default development/build/production frontend target.
19. Done on 2026-05-13: reduced `server/world.ts` under the normal maintainability file budget by extracting movement and prediction simulation into `server/movement/worldMovement.ts`.
20. Done on 2026-05-13: extracted combat cast snapshots, impact resolution, projectile travel, and enemy behavior helpers out of large runtime modules, with focused server tests.
21. Done on 2026-05-13: extracted enemy AI state transitions, inventory stacking/item-use runtime, ground-loot creation, and cast validation/resource rules into focused tested modules.
22. Done on 2026-05-13: moved client-message routing, move-intent mutation, target-death side effects, and session glue into focused modules; added a room-boundary contract for the Colyseus migration and deterministic server runtime flow coverage.
23. Done on 2026-05-13: added outbound/direct event sinks, a socket-backed authoritative-room adapter for the Colyseus boundary, and a tested starter gameplay vertical-slice manifest.
24. Done on 2026-05-13: ported useful VFX patterns into the Vite client, moved more lifecycle/item server emissions behind outbound adapters, and added baseline measurement tooling for bundle, tick cost, latency, and browser FPS.
25. Done on 2026-05-13: finished isolating runtime transport emissions behind outbound/direct message sinks, including combat, loot, AI, inventory, skill, lifecycle, and effect paths.
26. Done on 2026-05-13: replaced the runtime Socket.IO server path with a real Colyseus `world` room and migrated the Vite client and production smoke checks to `/colyseus/`.
27. Done on 2026-05-13: removed the legacy Next fallback, leaving Vite as the only browser client path.
28. Done on 2026-05-13: moved scheduled production database backups to local-only SSH streaming; the VPS no longer keeps scheduled dump files.
29. Done on 2026-05-13: updated current safe dependency ranges and deferred the Colyseus 0.17 runtime jump because it changes the active matchmaker path; treat that as a dedicated migration, not routine Dependabot churn.
30. Done on 2026-05-13: moved Vitest to `test.projects`, made Vite/Playwright/pnpm warning output intentional, and removed the `server/lootTables.ts` legacy maintainability exception by extracting starter loot tables.
31. Done on 2026-05-13: documented and tested the Kysely persistence contract for stable player/session/event data and explicitly listed transient state that must not be persisted.
32. Done on 2026-05-13: expanded the starter vertical slice with one additional low-level enemy/content drop through content manifests and runtime validation tests.
33. Done on 2026-05-14: deployed the green `main` build to the VPS and verified public HTTPS, Colyseus room join, closed raw game/database ports, Stalwart health, and local backup freshness.
34. Done on 2026-05-14: added a second starter content slice with a new meadow enemy, validated loot table, and type-specific client enemy visuals.
35. Done on 2026-05-14: moved the active server runtime entrypoint under `apps/server`, kept legacy modules behind that boundary, and updated dev, build, Docker, Playwright, and measurement entrypoints.
36. Done on 2026-05-14: migrated the active Colyseus runtime window to the 0.17 package line and replaced the old browser `colyseus.js` package with `@colyseus/sdk`.
37. Done on 2026-05-14: added performance budgets and a recorded baseline for bundle size, server tick cost, Colyseus room latency, and local browser FPS; CI enforces the stable non-browser subset.
38. Done on 2026-05-14: added a reusable production smoke script that joins the public Colyseus room and asserts `joinGame` plus `gameState`.
39. Done on 2026-05-14: added an opt-in production browser smoke that enters the live site, moves, targets, casts, reloads, and re-enters.
40. Done on 2026-05-14: added client-side combat damage feedback and a starter progress HUD.
41. Done on 2026-05-14: hardened relog coverage for persisted skills, shortcuts, inventory, position, health, level, XP, and skill points.
42. Done on 2026-05-14: moved class progression data into `packages/content` and removed the unused legacy socket event converters.
43. Done on 2026-05-14: added a small starter progression loop around defeats, loot pickup, level progress, and direct skill learning from the HUD.
44. Done on 2026-05-14: made starter path progress server-authoritative through a shared `StarterProgressUpdate` protocol message instead of client-inferred combat and loot counters.
45. Done on 2026-05-14: added the first real starter reward loop by granting one skill point exactly once after the server-owned defeat, loot, and level goals are complete.
46. Done on 2026-05-14: moved stable player writes behind a Kysely-backed player repository boundary and added `starter_progress` persistence with migration, hydration, backup-restore schema checks, and tests.
47. Done on 2026-05-14: cleaned the Vite client boundary by extracting the starter path HUD and keeping starter progress normalization separate from the main reducer.
48. Done on 2026-05-14: expanded the visible client world surface to cover every configured zone and added content coverage so the world size stays intentional.
49. Done on 2026-05-14: strengthened local browser CI smoke coverage so the Vite Playwright path verifies the server-authored starter path panel during enter-world flow.

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
- Keep `main` protected by the GitHub `Build and test` gate.
- Keep the deleted `server` branch retired; do not recreate it for new work.

### Phase 0: Stabilize Current Prototype

- Keep one Vite client config and one active browser smoke config.
- Keep env files out of Git; track only examples.
- Maintain `pnpm run check` as the local and CI quality gate: lint, typecheck, deployment script syntax, maintainability budgets, tests, server build, frontend build, and browser smoke.
- Document agent workflow in `AGENTS.md`.
- Keep GitHub `main` protected by the passing CI gate.
- Keep secret scanning enabled in GitHub so accidental credentials are caught before deployment.
- Keep Dependabot configuration present, but version-update PRs are currently disabled to avoid automated dependency churn during the runtime migration; re-enable intentionally when dependency work is planned.
- Stop adding gameplay features to large monolithic files unless the change is a small fix.
- Protocol implementation now lives in `packages/protocol`; new protocol imports should use that package directly.

### Phase 1: Extract Contracts And Content

- Done on 2026-05-07: moved skill and item content into `packages/content`, with `shared/skillsDefinition.ts` and `shared/items.ts` kept as compatibility re-exports.
- Done on 2026-05-07: moved combat math into `packages/sim`, with `shared/combatMath.ts` kept as a compatibility re-export.
- Done on 2026-05-08: moved effect definitions into `packages/sim`, with `shared/effectsDefinition.ts` kept as a compatibility re-export.
- Done on 2026-05-08: moved zone content and lookup helpers into `packages/content`, with `shared/zoneSystem.ts` kept as a compatibility re-export.
- Done on 2026-05-08: routed server world handling through the validated `ClientMessage` union.
- Done on 2026-05-08: introduced a shared server `GameState` type for the world/effects/AI path.
- Done on 2026-05-08: removed loose `ClientMsg` and `ServerMsg` protocol base interfaces.
- Done on 2026-05-08: removed unused legacy `MoveStartMsg` and `MoveStopMsg` compatibility interfaces.
- Done on 2026-05-12: removed remaining protocol message interfaces and deleted exported `ProjSpawn2`/`ProjHit2` protocol types; server messages are validated through `packages/protocol/messages.ts`.
- Done on 2026-05-12: defined the shared server-authoritative state model in `packages/sim/authoritativeState.ts` and wired the server to create state through `server/gameState.ts`.
- Done on 2026-05-12: deleted the remaining legacy client projectile store; v2 `CastSnapshot` projectiles now own live, fade, and recycle state through `projectileStore.ts`.
- Done on 2026-05-12: moved active cast runtime storage into `GameState.activeCasts` instead of a module-global cast array.

### Phase 2: Build The New Browser Client

- Done on 2026-05-12: created the first Vite client shell in `apps/client` with one game canvas, a minimal HUD, and an initial network connection stub.
- Done on 2026-05-12: connected the Vite client to the real server, rendered real players/enemies/projectiles, added left-click movement, right-drag camera, minimal HP/MP/target HUD, and a Fireball hotkey/button path.
- Done on 2026-05-12: added Vite-side visual smoothing, cooldown/casting/XP/death/inventory/loot HUD loops, and browser/reducer coverage for the new path.
- Done on 2026-05-13: made Vite the default production frontend path and added clearer movement destination, selected-target, and enemy health presentation.
- Done on 2026-05-13: ported useful R3F/VFX patterns into the Vite client: recovery particles, water splash impact, petrify flash, and richer projectile trails without reusing the old pooled/global VFX manager.
- Keep visual state separate from authoritative network state.
- Vite Playwright smoke tests cover page load, canvas presence, server connection, movement intent, and one fireball cast.

### Phase 3: Build The Authoritative Server

- Done on 2026-05-13: replaced the raw Socket.IO server runtime with a Colyseus `world` room and migrated the Vite client to the Colyseus browser SDK.
- Done on 2026-05-12: moved player progression/respawn and enemy lifecycle out of `server/world.ts` into tested modules.
- Done on 2026-05-13: moved movement, position history, position validation, and prediction keyframe simulation out of `server/world.ts` into a tested movement module.
- Done on 2026-05-13: moved combat cast snapshots, impact resolution, projectile travel, and enemy behavior helpers into tested modules.
- Done on 2026-05-13: moved cooldown/resource validation, inventory/item-use mutation, ground-loot creation, and enemy AI state transitions into testable runtime modules.
- Done on 2026-05-13: moved client-message routing, move-intent mutation, target-death orchestration, and session wiring into smaller modules before the Colyseus migration.
- Done on 2026-05-13: added a deterministic server runtime flow test covering movement, aggro, combat death, loot spawn, and inventory pickup without a browser.
- Done on 2026-05-13: added outbound-event and socket-backed room adapters so remaining transport details could be isolated before introducing Colyseus.
- Done on 2026-05-13: routed player lifecycle, enemy respawn, item-use, and target-death update emissions through the outbound adapter.
- Done on 2026-05-13: routed combat casts, projectile impacts, enemy AI, status effects, skills, inventory, and loot through outbound/direct message sinks so raw transport emissions live only in transport adapters.
- Done on 2026-05-13: added a tested structural Colyseus room/outbound adapter that uses the current room-boundary contract.
- Use `server/transport/vibeAgeRoom.ts` as the current Colyseus room implementation and keep `roomBoundary.ts` as the contract around the authoritative world.
- Persist only stable player/account data, not transient render state.

### Phase 4: Iterate On Gameplay

- Done on 2026-05-13: added a small starter vertical-slice manifest for one zone, one class, three skills, five enemy types, loot, leveling, and respawn, with content/runtime validation tests.
- Done on 2026-05-13: added `pnpm run measure:baseline` to report Vite bundle size, deterministic server tick cost, Colyseus room join/game-state latency, and optional browser FPS.
- Expand content only after protocol and simulation tests are stable.

## Agent Rules

- Make small, verifiable changes.
- Prefer deleting dead migration leftovers over supporting parallel legacy paths.
- Do not introduce new global state or new protocol message shapes without updating schemas and tests.
- Keep browser startup simple: one client URL, one game server URL, no hidden services beyond Postgres when persistence is needed.
- When adding a library, document why it replaces custom code.
