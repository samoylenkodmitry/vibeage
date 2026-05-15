# VibeAge Roadmap

Last rewritten: 2026-05-15

## Direction

VibeAge should become a browser-first multiplayer RPG with a very large fantasy world, server-owned simulation, mobile-friendly controls, and a world view that feels alive instead of a flat prototype grid.

Production target remains the VPS. `main` is production-affecting and deployment pulls from `origin/main` through local scripts.

## Non-Negotiables

- The server owns movement validation, region activation, enemy spawning, combat, loot, inventory, and persistence.
- The client renders presentation, local smoothing, input, HUD, and visual atmosphere only.
- Huge world content must not imply huge per-tick server work. Runtime activation, spawning, visibility, and broadcasts stay budgeted.
- Mobile must be playable in-browser without app install, keyboard, or desktop-only panels.
- Do not grow `server/world.ts`, `app/game/systems/SocketManager.tsx`, or current client state roots with new gameplay systems.
- Before merge, prefer `pnpm run check`.
- Before production deploy, use the local deploy script and `pnpm run health:production`.

## Current Baseline

- Stack: Vite, React Three Fiber, Colyseus, Postgres/Kysely, shared protocol/content/simulation packages, Vitest, Playwright.
- Region streaming already scopes direct server events per client-visible region.
- Server activation is global, not tied to any one player. Per-player logic only scopes visibility.
- Current world content is zone-based and content-validated, but the world is still visually flat and too small.
- Current mobile HUD has viewport checks, but mobile inventory and touch-first movement need more work.

## World Scale Roadmap

### P0: Scalable World Contract

1. [x] Split configured-world budgets from runtime-active budgets.
   - Content can define many huge zones.
   - Server startup activates only a bounded number of zones and spawns only within that runtime budget.
   - CI content checks should validate both configured content and runtime spawn budgets.

2. [x] Raise movement/world bounds from prototype scale to continent scale.
   - Movement validation must read shared world settings instead of a hardcoded small coordinate limit.
   - Tests must cover large valid coordinates and rejected out-of-world coordinates.

3. [x] Add shared procedural terrain contracts.
   - Shared content code defines terrain height, slope, biome, and visual palette from world coordinates.
   - Server spawning uses terrain height so newly spawned enemies are not locked to a flat y-plane.
   - Client rendering uses the same deterministic terrain contract.

4. [x] Add region indexing for high zone counts.
   - Replace linear region position lookup with a static spatial index or grid keyed by region bounds.
   - Keep lookup behavior identical for overlapping/nearest regions.
   - Add a regression with hundreds of synthetic regions.

5. [x] Add dynamic server-owned activation.
   - Activation remains server policy, not player-owned.
   - Activate zones by server budget, world events, population pressure, and neighboring frontier rules.
   - Keep inactive zones persistent but cheap: no per-tick enemy AI, no broadcasts, no respawn churn.

### P1: Enormous Fantasy World Content

1. [x] Add continent-scale zones.
   - Introduce zones large enough that walking across them is a long journey.
   - Keep starter content near origin and safe.
   - Keep high-level regions far away without causing startup spawn explosions.

2. [x] Add zone travel lanes and landmarks.
   - Define roads, passes, rivers, ruins, and horizon landmarks as content.
   - The server should understand safe lanes for future encounters and pathing.
   - The client should render readable silhouettes so walking has orientation.

3. [x] Add biome-driven encounter tables.
   - Split spawn tables by biome and danger tier.
   - Stop duplicating mob mixes directly inside every large zone where a shared biome table works.

4. [x] Add world traversal tooling.
   - [x] HUD should show coordinates, current zone, streamed zones, and estimated travel time.
   - [x] Add admin/debug teleport only for local/dev mode, never for regular production play.

### P1: Living Fantasy Client View

1. [x] Replace the flat grid-only ground with local procedural terrain chunks.
   - Terrain follows the player in chunks to avoid giant mesh precision and memory problems.
   - Movement clicks land on rendered terrain while server still receives x/z intents.

2. [x] Add fantasy atmosphere.
   - Sky, fog, sun, horizon tone, hemisphere light, and subtle cloud motion should make the scene feel less empty.

3. [x] Add lightweight biome foliage.
   - Trees/grass/rocks render around the player from deterministic world coordinates.
   - Use instancing and bounded counts; never render the whole continent.

4. [x] Add richer zone-specific visuals.
   - Distinct flora, rock, ruin, water, snow, crystal, and volcanic accents per biome.
   - Keep assets procedural or small until an art pipeline exists.

5. [x] Add weather and time-of-day.
   - Server may expose broad world time later.
   - Client can start with deterministic cosmetic cycles that do not affect combat.

### P1: Mobile UX

1. [x] Make inventory visible and usable on mobile.
   - Do not hide core gameplay panels on mobile.
   - Keep panels inside viewport with Playwright coverage.

2. [x] Add touch movement affordance.
   - Tap-to-move stays primary.
   - Add press/drag movement or a virtual stick only if it does not fight camera gestures.

3. [x] Add mobile camera mode.
   - One-finger movement selection and two-finger/or explicit camera controls should not conflict.
   - Add Playwright or unit coverage for touch intent routing.

4. [x] Add mobile combat ergonomics.
   - Skill buttons must be thumb-sized, cooldown readable, and target state obvious.
   - Inventory consumables need predictable touch feedback.

### P2: Server Scale Hardening

1. [ ] Add load and soak tests.
   - Simulate many Colyseus clients, reconnect churn, movement, combat, and region transitions.
   - Track CPU, memory, outbound messages, region visibility counts, and snapshot size.

2. [ ] Add room/shard strategy.
   - Decide whether one world room can handle current goals or whether zones should be split across rooms.
   - Keep protocol contracts stable before sharding.

3. [ ] Add persistence strategy for huge worlds.
   - Persist inactive zone state cheaply.
   - Avoid writing noisy per-tick world state.
   - Keep player state durable and reconnect-safe.

4. [ ] Add production observability.
   - External uptime checks, structured runtime metrics, and alert thresholds.
   - Keep mail/Stalwart and custom Nginx assumptions protected.

## Active Implementation Slice

This branch starts with the highest-leverage foundation:

- [x] world-scale settings and movement bounds
- [x] runtime active-zone budget
- [x] shared terrain contract
- [x] continent-scale content zones
- [x] local procedural terrain rendering
- [x] fantasy sky/sun/fog/foliage pass
- [x] mobile inventory visibility
- [x] dynamic server-owned region activation
- [x] shared roads, rivers, passes, and landmark content
- [x] biome encounter tables for huge zones
- [x] traversal HUD
- [x] two-finger mobile camera mode

## Quality Gate

Before merge:

```bash
pnpm run check
```

For production deployment:

```bash
pnpm run deploy:production
pnpm run health:production
```
