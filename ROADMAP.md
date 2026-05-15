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

## Player Polish v2

Live items requested after the latest deploy. Each is a single-PR slice.

1. [x] **Skyward camera** — orbit pitch should dip below the player so the sky / sun / moon are visible when rotating. Lower `CAMERA_MIN_PITCH` and update the spec. Delivered alongside v4 #4 (camera lookAt sky offset) and v6 #1 (sky-start single-finger drag).

2. [x] **Interactive map** — the world map has wheel zoom, drag-pan, left-click navigation marker that also renders as a 3D pin, right-click clear, and now mobile pinch-zoom (v5 #2). The 2D pin and the 3D follow-arrow are wired together.

3. [x] **Persistent HUD window positions** — `useDraggablePanel` takes a per-panel storage key and writes offset to `localStorage` on drag-end.

4. [x] **Quest checklist** — the Quest panel renders as a list of quest rows with checkboxes that expand to show the current progress. Starter Path is the first row; later quests slot in once their content lands.

5. [x] **Smoother walk** — drop the residual vertical bounce so the figure travels at a stable y. Keep leg swing and torso sway as the only motion cues. If snapshot-rate jitter persists, extrapolate position with velocity between server snaps.

6. [x] **Mobile camera rotation** — single-finger drag rotates the camera anywhere on the canvas (terrain or sky), and two-finger gestures stay available for pinch zoom. No on-screen handle needed since the gesture works from anywhere.

7. [x] **Starter skill kit** — new characters spawn with Fireball + Ice Bolt + Water Splash + Petrify wired into the four bar slots, so the first kill is achievable without grinding for skill points first.

## Player Polish v3

1. [x] **Always-visible navigation pin + 3D pointer** — the in-world pin is too small to spot from distance. Make it big and add an in-world arrow above the player that rotates to point at the pin so the player always knows where to go.

2. [x] **No text selection on UI controls** — globally apply `user-select: none` to HUD chrome (panels, buttons, toggles, vitals strip, map UI). Inputs and textareas still allow selection.

3. [x] **Mobile new-player skill bar visibility** — fresh mobile session reports an invisible skill bar. Audit safe-area, contrast, and layering; bring the bar above iOS home-indicator and make it unmissable.

4. [x] **Camera doesn't dip below ground** — when the player tilts the camera up the orbit can drop the camera below the terrain. Move the focus point down toward the player feet so looking up rises the camera less, and clamp the camera y to be above the local terrain height.

5. [x] **Lineage 2-style stat lineup** — extend Stats from STR/DEX/INT to STR + DEX + CON + INT + WIT + MEN. Derived from class+level for now.

6. [x] **Class skill tree learn panel** — new toggle that opens a class skill tree window listing every class skill with state (unlocked / available-to-learn-with-cost / locked-by-level), with a learn button when skill points are available.

## Player Polish v4

1. [x] **Restore single starter skill** — `DEFAULT_UNLOCKED_SKILLS` back to `['fireball']`. Players learn the rest from the skill tree as they level up.

2. [x] **Mobile skill bar above Android nav** — current `safe-area-inset-bottom` doesn't account for the Android navigation bar; bump fallback bottom padding so the bar isn't covered.

3. [x] **Map fullscreen toggle** — header button on the Map panel that maximizes it to fill the viewport for easier navigation.

4. [x] **Camera look up to sky** — instead of dipping below ground at very negative pitch, keep camera above terrain and shift the lookAt target upward so tilting up shows the sky vertically.

5. [x] **Smooth player movement** — derive entity ground Y from the current lerped xz each frame so terrain bumps no longer cause snap-rate microjumps.

6. [x] **Chat with near / all tabs** — new ChatRequest protocol; server broadcasts to all clients (all) or to clients within ~150 m (near). No persistence. Client renders a Chat panel with two tabs and a 50-message ring buffer per tab.

7. **Deeper class & skill content** — broken into smaller subitems:
   - [ ] **More skills per class** — at least 6-8 skills per class with prereqs, level gates, and explicit cooldowns/costs balanced server-side.
   - [ ] **More class identities** — add Knight, Paladin, Rogue alongside the existing four with distinct stat curves.
   - [ ] **Server stat scaling** — STR/DEX/CON/INT/WIT/MEN actually drive damage / hit / HP / MP regen in the simulation instead of being cosmetic.
   - [ ] **Skill effect variety** — DoT, slow, knock-back, shield, dispel; reuse the existing StatusEffect plumbing.

8. **Populate the world** — broken into smaller subitems:
   - [ ] **More enemy species** — add at least 6 distinct mob types (e.g., wolf, bandit, ghoul, treant, elemental, drake) with art and stats.
   - [ ] **Zone-specific spawn rules** — bind species to biome / level band so each zone reads differently.
   - [ ] **Mob patrol AI** — idle mobs wander a patrol radius around their spawn instead of standing still.
   - [ ] **Pack formations** — some species spawn in small groups that share aggro.
   - [ ] **Mini-bosses** — one designated tougher mob per zone with a name and richer loot.
   - [ ] **Loot variety** — each species owns its own loot table beyond the shared starter drops.
   - [ ] **Day / night spawn variation** — different mobs active in different timeOfDay phases.

## Player Polish v5

Live items requested after the latest deploy.

1. [x] **One-finger sky look on mobile** — single-finger drag past the mesh edge loses pointer events because Three.js mesh handlers don't fire off-mesh. Install a window-level pointermove listener once WorldGround enters touch rotation mode so the camera keeps tilting until the finger lifts.

2. [x] **Map pinch-zoom on mobile** — two-finger pinch on the map SVG scales the zoom by the touch-distance ratio and pans toward the centroid.

3. [x] **Mob patrol AI (first slice from v4 item 8)** — new `patrolling` aiState; idle mobs occasionally pick a random target inside their patrolRadius, walk there, idle for 2-6 s, repeat. Aggro / attack still take priority.

## Player Polish v6

Live items requested after the v5 deploy.

1. [x] **Sky-start single-finger camera rotation** — even when a touch starts on the sky (not terrain mesh), single-finger drag should still rotate the camera. CameraRig now listens on the canvas and owns any touch pointer WorldGround has not claimed.

2. [x] **Two-finger pinch camera zoom on the world** — pinch in/out on the world canvas scales `distanceRef` by the inverse touch-distance ratio, clamped to the playable distance range.

3. [x] **More enemy species** — add at least 6 distinct mob types (e.g., wolf, bandit, ghoul, treant, elemental, drake) with art and stats, bound to biome / level band so each zone reads differently.

4. [x] **Pack formations + mini-bosses + loot variety** — some species spawn in small groups that share aggro, each zone has one named mini-boss with richer loot, and every species owns its own loot table.

5. [x] **Day / night spawn variation** — different mobs active in different timeOfDay phases.

6. [x] **More classes + more skills per class** — add Knight, Paladin, Rogue alongside the existing four with distinct stat curves; at least 6-8 skills per class with prereqs, level gates, and explicit cooldowns/costs balanced server-side.

7. [x] **Server stat scaling** — STR/DEX/CON/INT/WIT/MEN actually drive damage / hit / HP / MP regen in the simulation instead of being cosmetic.

8. [x] **Skill effect variety** — DoT, slow, knock-back, shield, dispel; reuse the existing StatusEffect plumbing.

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
