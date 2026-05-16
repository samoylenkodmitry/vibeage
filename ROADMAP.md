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

2. [x] **Interactive map** — the world map has wheel zoom, drag-pan, left-click navigation marker that also renders as a 3D pin, right-click clear, and now mobile pinch-zoom (v5 #2). The 2D pin and the 3D follow-arrow are wired together (v3 #1).

3. [x] **Persistent HUD window positions** — `useDraggablePanel` takes a per-panel storage key and writes offset to `localStorage` on drag-end.

4. [x] **Quest checklist** — the Quest panel renders as a list of quest rows with checkboxes that expand to show the current progress. Starter Path is the first row; later quests slot in once their content lands.

5. [x] **Smoother walk** — drop the residual vertical bounce so the figure travels at a stable y. Keep leg swing and torso sway as the only motion cues. If snapshot-rate jitter persists, extrapolate position with velocity between server snaps.

6. [x] **Mobile camera rotation** — single-finger drag rotates the camera anywhere on the canvas (terrain or sky), and two-finger gestures stay available for pinch zoom. No on-screen handle needed since the gesture works from anywhere. Delivered alongside v6 #1 (sky-start single-finger drag).

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

## Inventory & Equipment v1

Full spec lives in [docs/INVENTORY_EQUIPMENT.md](docs/INVENTORY_EQUIPMENT.md). Goal: server-authoritative L2-style inventory with paperdoll slots, multi-slot occupancy, set bonuses, atomic equip/unequip, derived stats. Each item below is one PR.

1. [x] **Templates + slot enum** — extend `Item` with `equip`, `kind`, `grade`, `weight`; introduce `EquipSlot`, `BodyPart`, `HandUsage`, `EquipSpec`, `EquipRequirements`. Annotate the existing items. Unit tests for template metadata.

2. [x] **Item instances + locations** — define `ItemInstance` and `ItemLocation`; add a `CharacterInventory` aggregate with `items` + `equipment`; write the invariant validator; ship a flatten/inflate adapter to keep the existing `InventorySlot[]` wire format working.

3. [x] **Inventory transactions** — atomic `addItem`, `removeItem`, `moveSlot`, `splitStack`, `mergeStacks` with weight + slot-count enforcement.

4. [x] **Equip / unequip pipeline (model)** — `equipItem(instanceId, slot?)` / `unequipSlot(slot)` with full validation, multi-slot occupancy, ring/earring auto-pick, atomic refund of replaced items. Protocol messages + server handlers land alongside the paperdoll HUD in slice 5.

5. [x] **Derived equipment stats + set bonuses (model)** — `deriveEquipmentStats(inventory)` sums every equipped item's `ItemStatBlock` and layers active set bonuses (threshold-based, e.g. 3-piece / 5-piece leather). The HUD wiring + protocol messages + paperdoll panel are tracked separately under Inventory v2 so the math can ship first and be exercised by tests.

## Inventory & Equipment v2 (live wiring)

1. [x] **End-to-end equip from inventory** — `PlayerState` now carries the `CharacterInventory` aggregate alongside the legacy `InventorySlot[]`. Loot pickup and consumable use go through the new transactions; new `EquipItem` / `UnequipItem` client messages route through `equipItem` / `unequipSlot`; the server emits an `EquipmentUpdate` (and refreshes `player.stats` via `derivePlayerStats(level, class, equipmentStats)` so equipping a sword actually bumps damage in combat); the client renders a draggable Paperdoll panel listing every slot and a Bag panel that turns each equippable item into an Equip button.

## Lineage II Character System

Live items requested after Inventory v2 went out. Each ships as its own slice.

1. [x] **Race system + per-race stat weights** — add `CharacterRace` (`human`, `elf`, `dark_elf`, `orc`, `dwarf`) with its own STR/DEX/CON/INT/WIT/MEN weights. `derivePlayerStats` multiplies race × class so two characters of the same class on different races feel different (orc warrior tankier than elf warrior, etc.). Default `human` for legacy / unselected players. Persisted alongside `className` (DB column `race`, migration `005_add_player_race.sql`).

2. [x] **Race + class picker at character creation** — `StartPanel` is a chooser (name + race + class). The chosen race/class are pushed via the existing `SelectClass` (now wired) and a new `SelectRace` message right after the join handshake. A new draggable `CharacterPanel` (toggle "Char") lets the player switch race or class in-world; stats refresh immediately.

3. [x] **Full L2 derived stats panel** — `derivePlayerStats` now produces `pAtk`, `mAtk`, `pDef`, `mDef`, `hpRegen`, `mpRegen`, `accuracy`, `evasion`, `attackSpeed`, `castSpeed`, `runSpeed`, `critChance`, `critMult` from base + race + class + level + equipment. Server projects the full block into `player.stats` on every recalc (factory / level-up / equip / class change / race change). The HUD Stats panel renders the full block under the base STR/DEX/CON/INT/WIT/MEN strip.

4. [x] **Skill learning bug + per-class starter** — new `STARTER_SKILL_BY_CLASS` (warrior → slash, ranger → arrowShot, healer → holyLight, rogue → evade, knight/paladin → slash, mage → fireball). Server emits a typed `LearnSkillFailed { skillId, reason }` with `noSkillPoints | levelTooLow | missingPrereq | unknownSkill | wrongClass`. Switching class via `CharacterPanel` now also auto-grants a starter skill from the new tree if the player has nothing from it. The Skill Tree panel surfaces the rejection inline as a pill so it's obvious why a Learn button is greyed out.

5. [x] **Wearable visuals modify the avatar** — `PlayerMarker` now reads the local player's `state.equipment` map and renders an `EquipmentOverlay` per equipped slot: helmet hemisphere on the head, chest plate over the torso, weapon mesh (sword / dagger / staff / mace) in the main hand with grade-tinted material, shield disc in the off-hand. Colours derive from the item grade today (default → D → C → B → A → S). Other players' overlays land alongside snapshot-broadcast equipment in a follow-up.

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

# VibeAge Full Remediation Roadmap

Status: every checkbox is intentionally open. Use this as a hardening, rewrite, and feature-completion backlog for the current VibeAge repo.

## 0. Operating Principles

- [ ] Keep the server authoritative for movement, combat, loot, inventory, equipment, region activation, spawning, persistence, and any economy-relevant state.
- [ ] Keep the browser client responsible only for input, prediction, smoothing, camera, rendering, HUD, audio, and cosmetic-only atmosphere.
- [ ] Treat every network message as hostile input, even when it comes from the official browser client.
- [ ] Treat `PlayerState` and other runtime objects as private server memory, not as direct wire payloads.
- [ ] Prefer explicit DTOs over object spreading across the network boundary.
- [ ] Prefer small vertical slices that ship with protocol schema, server behavior, client behavior, tests, docs, and production checks together.
- [ ] Avoid adding new gameplay to `server/world.ts`, client root reducers, or transport glue unless it is tiny and temporary.
- [ ] Move reusable gameplay rules into `packages/content`, `packages/sim`, and `packages/protocol` before client or server feature code depends on them.
- [ ] Make every content definition executable: no skill, item, race, class, loot, enemy, quest, or zone rule should exist without a runtime behavior test.
- [ ] Maintain a single source of truth for each gameplay number: damage, range, cooldown, movement speed, stat scaling, loot chance, XP, weight, slots, and region budgets.
- [ ] Add a test before fixing each bug when the bug can be reproduced deterministically.
- [ ] Convert every safety assumption into an invariant test or CI gate.
- [ ] Make production deployment boring: clean branch, passing CI, explicit deploy, health check, smoke check, rollback path.

## 1. Immediate P0 Production Blockers

- [x] Fix public snapshot privacy so `characterInventory` can never be sent to other players.
- [x] Add `characterInventory` to the private-player-field audit until explicit public equipment DTOs are in place.
- [x] Replace the current deny-list privacy test with an exact-key allow-list test for owner player snapshots.
- [x] Replace the current deny-list privacy test with an exact-key allow-list test for public player snapshots.
- [x] Add a regression test proving public `playerJoined`, `playerUpdated`, and resync snapshots never include `socketId`, `inventory`, `characterInventory`, `starterProgress`, or other owner-only state.
- [x] Add a regression test proving direct owner messages are only sent to the matching socket.
- [ ] Stop using `playerName` as the durable account key.
- [ ] Add signed identity or authenticated account ownership before treating the public game as production-safe.
- [ ] Persist equipped items and equipment slot state; do not rely on the legacy flat bag inventory for durable equipment.
- [ ] Add a migration and restore-compatibility check for the new durable inventory/equipment shape.
- [x] Fix self-target and no-target beneficial skills so shields, buffs, heals, evasions, and invisibility cannot be rejected by a generic "missing target" branch.
- [x] Make `LearnSkillFailed` protocol schema match the exact TypeScript reason union.
- [x] Update `WORLD_CLIENT_COMMAND_TYPES` so it includes every current command type or remove it if it is no longer the authoritative command surface.
- [x] Add an exhaustive protocol-boundary test that fails when a client message type exists in schema but not in the documented transport command list.
- [x] Add per-socket rate limiting for chat messages.
- [x] Add per-socket rate limiting for movement intents.
- [x] Add per-socket rate limiting for cast requests.
- [x] Add per-socket rate limiting for inventory/equipment actions.
- [x] Add a production check that dev commands are disabled unless an explicit local/dev environment flag is present.
- [x] Add a production check that `ALLOW_MISSING_ORIGIN` is not enabled in production.
- [x] Add a production check that `/runtimez` does not expose sensitive data and is either protected, minimized, or intentionally public.
- [x] Add CI steps for `pnpm run typecheck:packages` and `pnpm run content:check` if they are not already covered by an equivalent step.
- [x] Add a full `pnpm run check` CI job or prove that the CI workflow exactly matches the local check script.

## 2. Things That Should Be Redone First

- [ ] Redo player identity around accounts and characters instead of name-based session ownership.
- [ ] Redo the network DTO boundary so internal runtime types are never broadcast directly.
- [ ] Redo inventory persistence around item instances, equipment locations, and versioned aggregate state.
- [ ] Redo status effects as a server-owned effect engine rather than mostly passive arrays.
- [ ] Redo combat damage resolution so player attacks, enemy attacks, shields, defense, crits, evasion, buffs, debuffs, and death all pass through one combat pipeline.
- [ ] Redo protocol schemas to be strict at the network boundary unless a field is explicitly versioned and documented.
- [ ] Redo protocol typing so Zod schemas and TypeScript message types cannot drift.
- [ ] Redo public player updates as minimal patch DTOs instead of sanitized runtime partials.
- [ ] Redo the legacy inventory bridge as a temporary migration adapter with a planned removal date.
- [ ] Redo client game state so inventory, equipment, character panel, paperdoll, and avatar visuals consume one normalized owner state model.
- [ ] Redo skill casting to support self, target, ground-target, direction-target, area-self, area-ground, passive, toggle, and aura categories explicitly.
- [ ] Redo enemy AI damage and aggro to understand status effects such as taunt, invisibility, stun, slow, root, knockback, and packs.
- [ ] Redo level-up stat recalculation so it includes current equipment and race/class modifiers, not only empty equipment stats.
- [ ] Redo mana and health regeneration so they use derived stats and active effects, not hardcoded constants only.
- [ ] Redo Colyseus room scaling assumptions after load tests, not before.
- [ ] Redo documentation after each rewrite so docs describe live behavior, not intended behavior.

## 3. Identity, Accounts, Characters, and Sessions

- [ ] Create an `accounts` table with stable account IDs.
- [ ] Create a `characters` table with stable character IDs owned by accounts.
- [ ] Split account identity from character name.
- [ ] Make character names unique only where product rules require it, not as authentication keys.
- [ ] Add signed guest sessions for unauthenticated play.
- [ ] Add passwordless login, OAuth, or another chosen authentication path.
- [ ] Add secure session cookies or signed bearer tokens.
- [ ] Add server-side token verification on Colyseus join.
- [ ] Add token expiration and refresh policy.
- [ ] Add logout and token revocation policy.
- [ ] Add device/session listing if persistent accounts are supported.
- [ ] Add account deletion flow.
- [ ] Add character creation flow that writes race, class, name, initial position, starter state, and inventory atomically.
- [ ] Add character selection flow for accounts with multiple characters.
- [ ] Add character rename policy.
- [ ] Add account ban and character ban support.
- [ ] Add server checks that a socket can only control the character bound to its authenticated session.
- [ ] Add tests for attempting to join as another player name or character ID.
- [ ] Add tests for reconnecting with a valid token and restoring the correct character.
- [ ] Add tests for expired, malformed, and revoked tokens.
- [ ] Add audit events for login, logout, character creation, character selection, reconnect, and suspicious ownership attempts.

## 4. Protocol and Network Contract

- [x] Convert every client message schema from `.passthrough()` to `.strict()` unless a specific compatibility reason exists.
- [ ] Convert every server message schema from `.passthrough()` to `.strict()` unless a specific compatibility reason exists.
- [ ] Add protocol version constants in one shared file consumed by client and server.
- [ ] Add a migration path for protocol versions rather than a single hardcoded minimum only.
- [ ] Add a `serverProtocolVersion` message or join response so clients can display useful upgrade errors.
- [ ] Generate TypeScript message types from Zod schemas or generate Zod schemas from TypeScript types.
- [x] Add a test that schema-inferred types match exported message types for every protocol message.
- [x] Add an exhaustive discriminated-union test for client messages.
- [x] Add an exhaustive discriminated-union test for server messages.
- [ ] Add explicit `clientSeq` fields to commands that need acknowledgement or rejection.
- [ ] Stop overloading `clientTs` as an acknowledgement key.
- [ ] Add request IDs for inventory, equipment, class, race, skill, chat, and admin commands where user feedback matters.
- [ ] Add structured rejection messages for all client commands, not only cast, learn-skill, and equip.
- [ ] Add a standard error envelope with `requestId`, `commandType`, `reason`, and optional safe detail.
- [x] Add protocol tests for unknown fields, wrong types, invalid enums, oversized text, invalid coordinates, and stale versions.
- [ ] Add message-size budget tests for initial snapshot, batch updates, inventory update, equipment update, and chat messages.
- [ ] Add snapshot compression and payload-size tracking as explicit metrics.
- [ ] Add a changelog for protocol changes.
- [ ] Add protocol fixtures for old-client compatibility tests.
- [ ] Add schema docs generated from protocol definitions.

## 5. Player State Privacy and DTO Boundary

- [ ] Define `OwnerPlayerSnapshot` with only fields the owning client needs.
- [ ] Define `PublicPlayerSnapshot` with only fields other players may see.
- [ ] Define `PlayerPresenceSnapshot` for world/public room state.
- [ ] Define `OwnerInventorySnapshot` separately from player state.
- [ ] Define `OwnerEquipmentSnapshot` separately from player state.
- [ ] Define `PublicEquipmentVisualSnapshot` for visible gear cosmetics only.
- [ ] Define `PlayerCombatPatch` for health, mana, cast state, death, and status effects.
- [ ] Define `PlayerMovementPatch` for position, rotation, velocity, and prediction data.
- [ ] Define `PlayerProgressionPatch` for owner-only level, XP, skills, and starter path changes.
- [ ] Replace `sanitizePlayerForPublic` with constructors that build public DTOs from scratch.
- [ ] Replace `sanitizePlayerUpdateForPublic` with explicit patch mappers.
- [ ] Add exact-key tests for every DTO constructor.
- [ ] Add tests that new fields added to `PlayerState` fail privacy audits until classified.
- [ ] Add tests that owner-only fields never appear in public room state.
- [x] Add tests that owner-only fields never appear in public server messages.
- [ ] Add tests that region-scoped messages do not leak hidden entity IDs through nested arrays.
- [x] Add tests that batch updates preserve privacy after filtering.
- [x] Add tests that empty filtered batches are not sent.
- [ ] Add a privacy classification table in docs for every player field.
- [ ] Add a privacy classification table in docs for every server message type.

## 6. Inventory, Equipment, Items, and Persistence

- [ ] Decide whether durable inventory is normalized relational tables, JSONB aggregate, or a staged JSONB-to-relational migration.
- [ ] Persist every item instance with stable `instanceId`.
- [ ] Persist item template ID.
- [ ] Persist item owner ID.
- [ ] Persist item count.
- [ ] Persist item location kind.
- [ ] Persist bag slot index.
- [ ] Persist equipped slot.
- [ ] Persist secondary occupancy for multi-slot items or derive it safely on hydration.
- [ ] Persist enchant level.
- [ ] Persist bound/tradeable state.
- [ ] Persist creation timestamp.
- [ ] Persist durability if durability will exist.
- [ ] Persist sockets/gems/augments if those will exist.
- [ ] Persist item custom names only if product rules allow them.
- [ ] Add schema versioning for inventory aggregates.
- [ ] Add migration from legacy `InventorySlot[]` to item instances.
- [ ] Add restore compatibility checks for item instances and equipment.
- [ ] Add hydration tests for equipped weapon, shield, armor, jewelry, consumables, stackables, and multi-slot items.
- [ ] Add persistence tests proving equipped items survive disconnect/reconnect.
- [ ] Add persistence tests proving equipped items are not duplicated on reconnect.
- [ ] Add persistence tests proving bag order survives reconnect.
- [ ] Add persistence tests proving stack counts survive reconnect.
- [ ] Add persistence tests proving invalid persisted inventories are repaired or rejected safely.
- [ ] Add atomic transaction tests for multi-item loot pickup.
- [ ] Add atomic transaction tests for equip with replacement.
- [ ] Add atomic transaction tests for unequip when bag is full.
- [ ] Add atomic transaction tests for split stack.
- [ ] Add atomic transaction tests for merge stack.
- [ ] Add atomic transaction tests for item use during concurrent equip or pickup attempts.
- [ ] Add inventory capacity rules for slots and weight together.
- [ ] Add equipment requirement checks for race, class, level, grade, hand usage, and body part.
- [ ] Add item stat sanity validation in `content:check`.
- [ ] Add item visual metadata validation in `content:check`.
- [ ] Add set bonus validation in `content:check`.
- [ ] Add loot table validation that every referenced item template exists.
- [ ] Add economy flags for no-drop, no-trade, quest item, bound-on-pickup, bound-on-equip, and unique-equipped.
- [ ] Add item deletion audit logs.
- [ ] Add item creation audit logs.
- [ ] Add equip/unequip audit logs for debugging dupes.
- [ ] Add admin inventory inspection tool.
- [ ] Add admin item grant tool restricted to authorized local/admin sessions.
- [ ] Remove the legacy flat inventory wire shape once the client fully consumes instance-aware inventory.

## 7. Equipment Visuals and Avatar Presentation

- [ ] Implement `ItemTemplate.visual` for helmet, chest, legs, gloves, boots, weapon, shield, cloak, jewelry, and accessory classes.
- [ ] Add content validation for visual IDs, colors, shapes, scale, and slot compatibility.
- [ ] Add `PublicEquipmentVisualSnapshot` so other clients can see cosmetics without seeing private item instances.
- [ ] Add owner equipment DTO with enough data for paperdoll and bag UI.
- [ ] Render helmet overlays on player heads.
- [ ] Render chest armor tint or mesh on torso.
- [ ] Render leg armor tint or mesh on legs.
- [ ] Render gloves on hands if visible at current camera scale.
- [ ] Render boots on feet if visible at current camera scale.
- [ ] Render main-hand weapon in the correct hand.
- [ ] Render off-hand shield or off-hand weapon in the correct hand.
- [ ] Render cloak/back item without clipping the body.
- [ ] Render robe/tunic variants differently from leather/plate variants.
- [ ] Add LOD rules for wearable visuals.
- [ ] Add mobile performance budgets for wearable overlays.
- [ ] Add snapshot tests or visual smoke tests for equipped gear appearing after `EquipmentUpdate`.
- [ ] Add regression tests that equipping an item updates local paperdoll and public avatar visuals.
- [ ] Add regression tests that unequipping an item removes local paperdoll and public avatar visuals.
- [ ] Add fallback visuals for unknown item templates.
- [ ] Add art pipeline guidelines for future gear assets.

## 8. Combat System and Status Effects

- [ ] Build a central combat resolution pipeline used by player attacks and enemy attacks.
- [ ] Make physical attack damage use `pAtk`, target `pDef`, level, skill power, variance, crit, and mitigation.
- [ ] Make magical attack damage use `mAtk`, target `mDef`, level, skill power, variance, crit, and mitigation.
- [ ] Make healing use healer stats and target modifiers.
- [ ] Make shield effects absorb damage from all damage sources.
- [ ] Make evasion affect enemy attacks and relevant player attacks.
- [ ] Make accuracy affect hit chance.
- [ ] Make crit chance and crit multiplier affect eligible skills only.
- [ ] Make attack speed and cast speed affect relevant cooldown/cast-time rules only if intended.
- [ ] Make run speed feed movement consistently through shared stats.
- [ ] Add an effect tick system for players and enemies.
- [x] Add expiration pruning for player status effects.
- [ ] Add expiration pruning for enemy status effects.
- [ ] Add periodic damage for burn.
- [ ] Add periodic damage for poison.
- [ ] Add periodic damage for generic DoT.
- [ ] Add periodic healing if future HoTs are added.
- [ ] Add slow effect behavior that reliably changes movement speed while active.
- [ ] Add stun behavior that blocks movement, casting, and attacking while active.
- [ ] Add freeze/root behavior if distinct from stun.
- [ ] Add taunt behavior that changes enemy target priority for the duration.
- [ ] Add knockback behavior with server-owned position changes and collision/bounds validation.
- [ ] Add invisibility behavior that breaks or suppresses aggro according to product rules.
- [ ] Add dispel behavior with configurable categories: negative, positive, magic, poison, bleed, stun, shield.
- [ ] Add buff stacking policy: replace, stack, refresh, or reject.
- [ ] Add debuff stacking policy: replace, stack, refresh, or reject.
- [ ] Add maximum stack validation per effect type.
- [ ] Add effect source tracking for ownership, threat, and combat logs.
- [ ] Add status-effect snapshots that avoid leaking hidden entity IDs.
- [ ] Add combat logs that distinguish raw damage, absorbed damage, resisted damage, crits, misses, heals, and kills.
- [ ] Add tests for each skill effect type currently present in content.
- [ ] Add tests for simultaneous effects on one target.
- [ ] Add tests for shield absorption order.
- [ ] Add tests for effect expiration during combat.
- [ ] Add tests for death while affected by DoT.
- [ ] Add tests for self-cast skills.
- [ ] Add tests for ground-target skills.
- [ ] Add tests for target-required skills.
- [ ] Add tests for projectile impact at max range.
- [ ] Add tests for projectile piercing and max-pierce hits.
- [ ] Add tests for AoE target deduplication.
- [ ] Add tests for player-vs-player behavior if PvP will exist, or explicitly disable PvP in protocol and server rules.

## 9. Skills, Classes, Races, and Progression

- [ ] Define a complete skill taxonomy: instant, projectile, ground AoE, self buff, target buff, target debuff, aura, passive, toggle, channeled, summon.
- [ ] Add schema validation that skill definitions match their taxonomy.
- [ ] Add class skill trees with consistent level gates and prerequisites.
- [ ] Add race/class compatibility rules if not every race can play every class.
- [ ] Add class-change product policy: free switching, restricted switching, respec cost, or creation-only.
- [ ] Add race-change product policy: free switching, restricted switching, paid/admin only, or creation-only.
- [ ] Add server validation for race/class changes according to policy.
- [ ] Add server validation that learned skills still belong to current class if switching is allowed.
- [ ] Add migration logic for legacy players with invalid skill/class combinations.
- [ ] Add skill respec support if switching classes can invalidate skills.
- [ ] Add skill point refund rules.
- [ ] Add starter skill rules per class and race.
- [ ] Add tests for each starter class loadout.
- [ ] Add tests for learning available skills.
- [ ] Add tests for rejecting wrong-class skills.
- [ ] Add tests for rejecting insufficient-level skills.
- [ ] Add tests for rejecting missing-prerequisite skills.
- [ ] Add tests for rejecting duplicate skill learn attempts.
- [ ] Add tests for skill shortcut persistence.
- [ ] Add tests for skill shortcut validation after class changes.
- [ ] Add balance sheet for all class stats from level 1 to target cap.
- [ ] Add balance sheet for all race modifiers.
- [ ] Add balance sheet for all skills by DPS, burst, cost, cooldown, range, and utility.
- [ ] Add target level cap and XP curve.
- [ ] Add XP overflow handling for multiple level-ups from one reward.
- [ ] Add level-down policy if none is intended, explicitly prevent it.
- [ ] Add progression telemetry for level time, deaths, skill usage, and class choice.

## 10. Movement, Prediction, Anti-Cheat, and World Bounds

- [ ] Add server-side sequence numbers to movement intents.
- [x] Reject stale movement intents older than an allowed window.
- [ ] Reject movement intents too far from current authoritative position if not explained by normal travel.
- [x] Reject movement targets outside playable world bounds.
- [ ] Reject movement targets into impassable terrain once collision/navmesh exists.
- [ ] Add per-player movement speed budget based on stats and effects.
- [ ] **Enemy movement double-step**: `moveEnemyToward` integrates `velocity * dt` into position, and `worldMovement.advanceEnemyPosition` does it again in the same tick. Enemies effectively move at 2× their nominal speed. Fix requires removing one integration AND rebalancing every enemy template's `movementSpeed`.
- [ ] Add speed-hack detection metrics.
- [ ] Add teleport detection metrics.
- [ ] Add client reconciliation acknowledgements using movement sequence numbers.
- [ ] Add server snapshots with authoritative sequence acknowledgement.
- [ ] Add tests for long-walk synchronization.
- [ ] Add tests for movement under slow and speed boost effects.
- [ ] Add tests for movement after stun/freeze/root.
- [ ] Add tests for movement after death and respawn.
- [ ] Add tests for crossing region boundaries while moving.
- [x] Add tests for client sending movement for another player ID.
- [ ] Add pathing constraints if terrain, water, cliffs, or obstacles should block movement.
- [ ] Add collision rules for enemies, players, world props, and loot if collision is desired.
- [ ] Add navmesh or lightweight walkability grid for server validation if needed.
- [ ] Add server/client agreement for terrain height at a coordinate.
- [ ] Add safeguards against floating-point precision issues in continent-scale coordinates.
- [ ] Add coordinate origin rebasing on the client if visual precision degrades far from origin.

## 11. Enemy AI, Spawning, Packs, and Encounters

- [ ] Add deterministic or seeded patrol target generation if reproducibility matters for tests.
- [ ] Add status-effect awareness to enemy AI.
- [x] Add stun handling for enemies.
- [x] Add slow handling for enemies.
- [x] Add taunt priority handling for enemies.
- [x] Add invisibility handling for enemies.
- [x] Add return-to-spawn leash rules with max chase distance.
- [ ] Add anti-kite rules if enemies should not chase forever.
- [ ] Add pack aggro rules with configurable radius per species or encounter.
- [ ] Add pack disengage rules.
- [ ] Add mini-boss leash rules.
- [ ] Add mini-boss respawn rules.
- [ ] Add named encounter state tracking.
- [ ] Add spawn protection against spawning on top of players.
- [ ] Add terrain-aware spawn placement.
- [ ] Add biome-aware spawn validation.
- [ ] Add day/night spawn validation.
- [ ] Add encounter density budgets per active region.
- [ ] Add enemy update throttling so patrolling mobs do not flood clients.
- [ ] Add tests for idle to patrol transitions.
- [ ] Add tests for patrol to chase transitions.
- [ ] Add tests for chase to attack transitions.
- [ ] Add tests for attack cooldowns.
- [ ] Add tests for returning to spawn.
- [ ] Add tests for pack aggro propagation.
- [ ] Add tests for inactive-zone enemies not ticking AI.
- [ ] Add tests for respawn after death.
- [ ] Add tests for loot generation on death.
- [ ] Add tests for XP rewards on death.
- [ ] Add enemy behavior telemetry: aggro count, attacks, kills, deaths, average lifespan, stuck count.

## 12. World, Regions, Streaming, and Sharding

- [ ] Define target maximum concurrent players for the first production milestone.
- [ ] Define target maximum active enemies for the first production milestone.
- [ ] Define target active regions per room.
- [ ] Define target snapshot payload budget per client.
- [ ] Add load tests with 10 simulated clients.
- [ ] Add load tests with 50 simulated clients.
- [ ] Add load tests with 100 simulated clients.
- [ ] Add load tests with 200 simulated clients if that remains the room cap.
- [ ] Add soak tests running for at least one hour.
- [ ] Add reconnect churn tests.
- [ ] Add region-transition churn tests.
- [ ] Add combat-heavy tests.
- [ ] Add loot-heavy tests.
- [ ] Add chat-heavy tests.
- [ ] Add inventory/equipment-heavy tests.
- [ ] Track CPU per tick during load tests.
- [ ] Track memory during load tests.
- [ ] Track outbound messages per second during load tests.
- [ ] Track bytes per second per client during load tests.
- [ ] Track initial snapshot size during load tests.
- [ ] Track batch update size during load tests.
- [ ] Track region visibility count per client during load tests.
- [ ] Decide whether one Colyseus `world` room can meet the target.
- [ ] Design shard strategy if one room cannot meet the target.
- [ ] Design zone-to-room mapping if sharding is needed.
- [ ] Design cross-room handoff protocol if sharding is needed.
- [ ] Design cross-room chat if sharding is needed.
- [ ] Design cross-room party/guild visibility if sharding is needed.
- [ ] Design cross-room persistence consistency if sharding is needed.
- [ ] Add region event hooks for activation, deactivation, spawn, despawn, and handoff.
- [ ] Add tests that inactive zones remain cheap.
- [ ] Add tests that inactive zone state is preserved as intended.
- [ ] Add tests that player movement changes visibility but not global spawn ownership.
- [ ] Add tests for overlapping regions and nearest-region lookup.
- [ ] Add tests for hundreds or thousands of region definitions.

## 13. Persistence, Database, Migrations, and Backups

- [ ] Split players/accounts/characters if identity rewrite is adopted.
- [ ] Add inventory/equipment durable schema.
- [ ] Add quest state durable schema.
- [ ] Add mail state durable schema if mail exists.
- [ ] Add party/guild durable schema if social systems exist.
- [ ] Add world-event durable schema if inactive zones need persistent events.
- [ ] Add schema migration order documentation.
- [ ] Add migration rollback documentation.
- [ ] Add migration smoke tests against an empty database.
- [ ] Add migration smoke tests against a restored production-like backup.
- [ ] Add backup restore drill to CI or scheduled local workflow if feasible.
- [ ] Add explicit backup retention policy.
- [ ] Add backup encryption policy if backups contain account data.
- [ ] Add backup integrity verification.
- [ ] Add DB write batching for frequent player persistence if needed.
- [ ] Add dirty-player tracking so persistence does not write unchanged players every cycle.
- [ ] Add persistence queue metrics.
- [ ] Add DB error retry policy.
- [ ] Add DB connection pool sizing policy.
- [ ] Add graceful shutdown that persists active players before process exit.
- [ ] Add crash recovery tests for player state.
- [ ] Add tests for disconnect persistence.
- [ ] Add tests for periodic persistence.
- [ ] Add tests for persistence disabled mode.
- [ ] Add tests for partial persistence failure.
- [ ] Add tests for invalid JSONB values.
- [ ] Add tests for legacy row hydration.
- [ ] Update `docs/PERSISTENCE.md` whenever a persisted field changes.

## 14. Server Operations, Observability, and Alerting

- [x] Protect or intentionally scope `/runtimez`.
- [ ] Add structured logs with request/session/player IDs where safe.
- [ ] Add log levels configurable by environment.
- [ ] Add metrics endpoint suitable for scraping or export.
- [x] Add counters for accepted and rejected messages by type.
- [x] Add counters for rate-limit hits by command type.
- [x] Add counters for invalid ownership attempts.
- [x] Add counters for protocol-version rejections.
- [ ] Add counters for chat moderation rejections.
- [ ] Add gauges for active rooms.
- [ ] Add gauges for connected clients.
- [ ] Add gauges for active players.
- [ ] Add gauges for active enemies.
- [ ] Add gauges for active casts.
- [ ] Add gauges for ground loot stacks.
- [ ] Add histograms for tick duration.
- [ ] Add histograms for initial snapshot size.
- [ ] Add histograms for batch update size.
- [ ] Add histograms for DB write latency.
- [ ] Add histograms for Colyseus join latency.
- [ ] Add histograms for reconnect latency.
- [ ] Add alert threshold for server tick average.
- [ ] Add alert threshold for server tick max.
- [ ] Add alert threshold for memory usage.
- [ ] Add alert threshold for DB failures.
- [ ] Add alert threshold for reconnect spikes.
- [ ] Add alert threshold for invalid message spikes.
- [ ] Add external uptime check for public frontend.
- [ ] Add external uptime check for `/healthz` through production HTTPS path if safe.
- [ ] Add external WebSocket/Colyseus join check.
- [ ] Add deploy marker logs and metrics.
- [ ] Add rollback marker logs and metrics.
- [ ] Add incident runbook.
- [ ] Add dashboard for runtime metrics.

## 15. Security and Abuse Prevention

- [ ] Add account/session authentication before durable player ownership matters.
- [ ] Add CSRF policy for any HTTP endpoints that mutate state.
- [ ] Add origin checks for WebSocket and matchmaker paths.
- [ ] Add production validation for allowed origins.
- [ ] Add maximum message size per protocol type.
- [ ] Add rate limits per socket.
- [ ] Add rate limits per account.
- [ ] Add rate limits per IP if safe behind proxy headers.
- [ ] Add proxy-header trust policy.
- [ ] Add suspicious activity metrics.
- [ ] Add temporary mute for chat spam.
- [ ] Add temporary disconnect or cooldown for severe spam.
- [ ] Add ban support for abusive accounts.
- [ ] Add server-side profanity or unsafe-content filtering if public chat is kept.
- [ ] Add chat report tools if public social features grow.
- [ ] Add admin permission model.
- [ ] Add audit logs for admin actions.
- [ ] Add dev-command access control beyond environment flag if any admin tools exist online.
- [ ] Add dependency vulnerability scanning.
- [ ] Add secret scanning for full Git history if not already done.
- [ ] Add security review checklist before production deploy.
- [ ] Add safe handling for unhandled exceptions and rejections without duplicate handlers.
- [ ] Add graceful process shutdown path.
- [ ] Add container user hardening if the Docker image currently runs as root.
- [ ] Add Nginx security header checks for the frontend.

## 16. Client Architecture and State Management

- [ ] Normalize owner player state separately from public players.
- [ ] Normalize inventory state separately from player snapshots.
- [ ] Normalize equipment state separately from player snapshots.
- [ ] Normalize world public state separately from gameplay state.
- [ ] Split `gameReducer` into domain reducers: connection, entities, combat visuals, inventory, equipment, chat, world, progression.
- [ ] Add reducer tests for every server message type.
- [ ] Add reducer tests for snapshot resync.
- [ ] Add reducer tests for region visibility changes.
- [ ] Add reducer tests for equipment update.
- [ ] Add reducer tests for inventory update after equip/unequip.
- [ ] Add reducer tests for duplicate or out-of-order updates.
- [ ] Add reducer tests for disconnected/reconnected state transitions.
- [ ] Add explicit client-side handling for command rejections.
- [ ] Add UI feedback for rate-limited actions.
- [ ] Add UI feedback for protocol rejection.
- [ ] Add UI feedback for inventory full.
- [ ] Add UI feedback for invalid equip slot.
- [ ] Add UI feedback for wrong class/race/level requirements.
- [ ] Add UI feedback for out-of-range casts.
- [ ] Add UI feedback for missing target.
- [ ] Add a local event bus or domain action layer if reducer actions become too broad.
- [ ] Add client telemetry hooks for load time, FPS, WebSocket reconnects, and major UI errors.
- [ ] Add error boundary around the game UI.
- [ ] Add fallback screen for WebGL unsupported or failed context.
- [ ] Add fallback screen for server unavailable.

## 17. Mobile UX, Input, and Accessibility

- [ ] Define supported mobile browsers and minimum device class.
- [ ] Add mobile safe-area tests for iOS Safari.
- [ ] Add mobile safe-area tests for Android Chrome.
- [ ] Add touch target size standards for skill buttons, inventory items, map controls, and panel buttons.
- [ ] Add input conflict tests for tap-to-move vs camera drag.
- [ ] Add input conflict tests for world pinch zoom vs map pinch zoom.
- [ ] Add long-press behavior for item details.
- [ ] Add drag behavior for inventory only where it does not fight scroll/touch gestures.
- [ ] Add combat target selection that works without precise mouse clicks.
- [ ] Add clear target indicator on mobile.
- [ ] Add clear cooldown indicator on mobile.
- [ ] Add clear cast progress indicator on mobile.
- [ ] Add readable floating damage/heal numbers on mobile.
- [ ] Add compact mobile chat mode.
- [ ] Add mobile keyboard avoidance for chat input.
- [ ] Add mobile map fullscreen QA.
- [ ] Add mobile character panel QA.
- [ ] Add mobile paperdoll and bag QA.
- [ ] Add mobile quest panel QA.
- [ ] Add mobile performance budget for draw calls.
- [ ] Add mobile performance budget for terrain chunks.
- [ ] Add mobile performance budget for foliage instances.
- [ ] Add accessibility labels for major buttons and panels.
- [ ] Add color contrast checks for HUD text.
- [ ] Add reduced-motion option for camera and effects.
- [ ] Add volume controls and mute option.
- [ ] Add keyboard-only usability for desktop.

## 18. UI, HUD, Panels, and Player Feedback

- [ ] Add consistent panel framework for draggable, resizable, fullscreen, minimized, and persistent panels.
- [ ] Add panel z-index management.
- [ ] Add panel reset layout button.
- [ ] Add panel safe-area clamping after viewport resize.
- [ ] Add inventory item tooltip details.
- [ ] Add equipment item tooltip details.
- [ ] Add skill tooltip details with requirements and reasons unavailable.
- [ ] Add enemy tooltip details with level, status, and difficulty.
- [ ] Add player tooltip details with public-safe fields only.
- [ ] Add combat log filters.
- [ ] Add chat tabs for near/all/system/party/guild if those channels exist.
- [ ] Add system messages for level up, death, respawn, loot, learn skill, equip, unequip, and errors.
- [ ] Add quest tracker objective states.
- [ ] Add minimap or compass if world navigation remains large.
- [ ] Add navigation pin persistence per session.
- [ ] Add clear region/zone transition feedback.
- [ ] Add latency/connection indicator.
- [ ] Add reconnecting overlay.
- [ ] Add server maintenance or deploy message support.
- [ ] Add settings panel.
- [ ] Add keybinding panel for desktop.
- [ ] Add screenshot-safe HUD mode if useful.

## 19. Content Validation and Authoring Tools

- [ ] Add content schema validation for classes.
- [ ] Add content schema validation for races.
- [ ] Add content schema validation for skills.
- [ ] Add content schema validation for items.
- [ ] Add content schema validation for equipment specs.
- [ ] Add content schema validation for loot tables.
- [ ] Add content schema validation for enemies.
- [ ] Add content schema validation for zones.
- [ ] Add content schema validation for roads, rivers, passes, landmarks, and biome data.
- [ ] Add content schema validation for quests.
- [ ] Add validation that every skill icon exists or has fallback.
- [ ] Add validation that every item icon exists or has fallback.
- [ ] Add validation that every enemy visual exists or has fallback.
- [ ] Add validation that every loot table referenced by enemies exists.
- [ ] Add validation that every zone spawn table references valid enemy species.
- [ ] Add validation that every level gate is reachable.
- [ ] Add validation that class skill prerequisites do not form impossible cycles.
- [ ] Add validation that item stats remain within balance budgets.
- [ ] Add validation that enemy stats remain within balance budgets.
- [ ] Add validation that spawn budgets remain within runtime limits.
- [ ] Add authoring docs for adding a new skill.
- [ ] Add authoring docs for adding a new item.
- [ ] Add authoring docs for adding a new enemy.
- [ ] Add authoring docs for adding a new zone.
- [ ] Add authoring docs for adding a new quest.
- [ ] Add a generated content catalog for designers and testers.

## 20. Quests, Starter Path, and Progression Content

- [ ] Define quest data schema.
- [ ] Define quest objective types: kill, collect, talk, explore, equip, learn skill, reach level, use item, discover zone.
- [ ] Define quest reward types: XP, item, currency, skill point, unlock, title.
- [ ] Persist quest state per character.
- [ ] Add server-owned quest progress updates.
- [ ] Add quest visibility rules.
- [ ] Add quest acceptance rules.
- [ ] Add quest completion rules.
- [ ] Add quest reward claiming rules.
- [ ] Add quest rollback protection against duplicate rewards.
- [ ] Add tests for starter path progress.
- [ ] Add tests for kill objectives.
- [ ] Add tests for collect objectives.
- [ ] Add tests for level objectives.
- [ ] Add tests for equip objectives.
- [ ] Add tests for reward claiming.
- [ ] Add tests for reconnect restoring quest state.
- [ ] Add initial quest chain beyond starter path.
- [ ] Add zone discovery quests.
- [ ] Add class tutorial quests.
- [ ] Add equipment tutorial quests.
- [ ] Add map/navigation tutorial quest.
- [ ] Add mobile-control tutorial hints.

## 21. Loot, Economy, Vendors, Trading, and Currency

- [ ] Decide whether the game has currency in the first public milestone.
- [ ] Add currency to durable character state if needed.
- [ ] Add server-owned currency transaction model.
- [ ] Add loot roll model with deterministic seeded tests.
- [ ] Add per-species loot tables.
- [ ] Add per-zone loot modifiers.
- [ ] Add mini-boss loot tables.
- [ ] Add quest item loot rules.
- [ ] Add rare drop announcements only if product rules allow them.
- [ ] Add anti-dupe tests around loot pickup.
- [ ] Add ground loot expiration policy.
- [ ] Add ground loot owner reservation policy if needed.
- [ ] Add tests for two players trying to pick up the same loot.
- [ ] Add tests for full inventory during loot pickup.
- [ ] Add tests for partial stack pickup.
- [ ] Add vendor NPC model if vendors are planned.
- [ ] Add buy/sell transaction tests if vendors are planned.
- [ ] Add player trading model if trading is planned.
- [ ] Add atomic trade transaction tests if trading is planned.
- [ ] Add trade cancel tests if trading is planned.
- [ ] Add trade scam-prevention UI if trading is planned.
- [ ] Add item sink systems if economy inflation matters.
- [ ] Add economy telemetry for item creation, deletion, currency creation, currency deletion, and trade volume.

## 22. Chat, Social, Moderation, Party, and Guilds

- [ ] Add server-side chat rate limit.
- [ ] Add message normalization and trimming on the server.
- [ ] Add blocked word or moderation hook if public chat is enabled.
- [ ] Add chat mute system.
- [ ] Add chat report system if public chat grows.
- [ ] Add system messages separated from player chat.
- [ ] Add party chat only after party system exists.
- [ ] Add guild chat only after guild system exists.
- [ ] Add private whisper only after identity and moderation exist.
- [ ] Add chat persistence policy: none, short-lived, or moderated logs.
- [ ] Add tests for near-chat radius.
- [ ] Add tests for all-chat broadcast.
- [ ] Add tests for hidden region players not receiving inappropriate local messages if region scoping should apply.
- [ ] Add tests for empty/whitespace messages.
- [ ] Add tests for maximum length messages.
- [ ] Add tests for rate-limited messages.
- [ ] Add party model if grouping is planned.
- [ ] Add party invitation protocol.
- [ ] Add party join/leave/kick/leader rules.
- [ ] Add party loot rules.
- [ ] Add party XP sharing rules.
- [ ] Add party member map indicators.
- [ ] Add guild model only after identity/account system is stable.

## 23. Map, Navigation, Terrain, and World Feel

- [ ] Add terrain collision/walkability policy.
- [ ] Add impassable terrain support if mountains, water, cliffs, or walls are meant to block movement.
- [ ] Add roads and safe lanes as server-understood navigation metadata.
- [ ] Add landmark discovery state if landmarks should be tracked.
- [ ] Add map fog-of-war if exploration matters.
- [ ] Add map marker persistence if users should keep markers across sessions.
- [ ] Add multi-marker support if needed.
- [ ] Add quest markers.
- [ ] Add party member markers if party exists.
- [ ] Add region border visualization.
- [ ] Add zone danger-level visualization.
- [ ] Add biome labels.
- [ ] Add terrain chunk memory budget.
- [ ] Add terrain chunk generation benchmark.
- [ ] Add foliage instance budget.
- [ ] Add weather visual budget.
- [ ] Add time-of-day visual budget.
- [ ] Add deterministic terrain tests for shared server/client terrain contract.
- [ ] Add tests that server spawn height matches terrain height.
- [ ] Add tests that click-to-move target resolves correct x/z on terrain.
- [ ] Add tests for movement near world bounds.
- [ ] Add tests for very large coordinates.

## 24. Audio, VFX, Animation, and Presentation Polish

- [ ] Add audio settings and mute support.
- [ ] Add skill cast sounds.
- [ ] Add impact sounds.
- [ ] Add enemy attack sounds.
- [ ] Add loot pickup sounds.
- [ ] Add UI click sounds if desired.
- [ ] Add ambient biome audio.
- [ ] Add weather audio if weather remains cosmetic.
- [ ] Add animation states for idle, walk, cast, attack, hit, death, respawn, and equip weapon stance.
- [ ] Add class-specific animation differences if useful.
- [ ] Add projectile VFX per skill family.
- [ ] Add AoE VFX per skill family.
- [ ] Add buff/debuff VFX per effect type.
- [ ] Add hit reaction VFX.
- [ ] Add death VFX.
- [ ] Add mini-boss VFX accents.
- [ ] Add performance budgets for particles and transparencies.
- [ ] Add cleanup of expired visual events.
- [ ] Add visual fallback when assets fail to load.
- [ ] Add screenshots or visual smoke tests for core scenes.

## 25. Testing Strategy and Quality Gates

- [ ] Make CI run the exact same full gate as local `pnpm run check` or document every intentional difference.
- [ ] Add `typecheck:packages` to CI if not already covered.
- [ ] Add `content:check` to CI if not already covered.
- [ ] Add tests for all protocol schema changes.
- [ ] Add tests for all content validation changes.
- [ ] Add tests for all persistence migrations.
- [ ] Add tests for all privacy DTOs.
- [ ] Add tests for all combat effect behaviors.
- [ ] Add tests for all inventory transactions.
- [ ] Add tests for all equipment transactions.
- [ ] Add tests for all client reducer server-message handling.
- [ ] Add tests for all region visibility filters.
- [ ] Add tests for all admin/dev commands.
- [ ] Add tests for all production deploy script assumptions.
- [ ] Add Playwright desktop smoke for connect, move, cast, loot, inventory, equip, map, chat, respawn.
- [ ] Add Playwright mobile smoke for connect, move, camera, cast, inventory, equip, map, chat.
- [ ] Add Playwright reconnect smoke.
- [ ] Add Playwright protocol rejection smoke if feasible.
- [ ] Add load-test suite separate from normal CI if too slow.
- [ ] Add nightly or manual soak-test script.
- [ ] Add benchmark baselines for server tick, snapshot size, join latency, and build bundle size.
- [ ] Add flaky-test tracking if Playwright becomes unstable.
- [ ] Add coverage reports for server and sim packages if useful.
- [ ] Add mutation or property tests for inventory transactions if bugs appear.

## 26. Deployment, Infrastructure, and Release Management

- [ ] Add branch protection for `main` if not already enabled.
- [ ] Require CI success before merging to `main`.
- [ ] Require review for deployment script changes.
- [ ] Add release tags or deployment records for production deploys.
- [ ] Add changelog entry per production deploy.
- [ ] Add migration-before-deploy and migration-after-deploy policy.
- [ ] Add zero-downtime or low-downtime deploy strategy if uptime matters.
- [ ] Add graceful shutdown before replacing the game server container.
- [ ] Add active-player warning before deploy if needed.
- [ ] Add rollback test after major migration changes.
- [ ] Add Docker image hardening.
- [ ] Add production environment validation script.
- [ ] Add Nginx config validation step.
- [ ] Add check that game server only listens on localhost in production.
- [ ] Add check that frontend can reach Colyseus through HTTPS.
- [ ] Add check that static assets are cache-busted after deploy.
- [ ] Add check that old assets do not break active clients during deploy.
- [ ] Add deployment smoke that creates a real room, joins it, receives snapshot, sends move, and disconnects.
- [ ] Add production database backup before migrations.
- [ ] Add post-deploy metrics sanity check.
- [ ] Add deploy failure notification.
- [ ] Add rollback notification.

## 27. Documentation and Developer Experience

- [ ] Update README to focus on current architecture and remove stale protocol notes.
- [ ] Keep ROADMAP focused on product milestones, not every bug or implementation detail.
- [ ] Keep this remediation roadmap as a separate hardening backlog.
- [ ] Update `docs/ARCHITECTURE.md` after DTO, identity, inventory, and sharding changes.
- [ ] Update `docs/PROTOCOL.md` after every protocol change.
- [ ] Update `docs/PERSISTENCE.md` after every persistence change.
- [ ] Add `docs/SECURITY.md` for auth, rate limits, origins, admin tools, and abuse handling.
- [ ] Add `docs/OBSERVABILITY.md` for metrics, logs, dashboards, and alerts.
- [ ] Add `docs/LOAD_TESTING.md` for bot harness and soak tests.
- [ ] Add `docs/CONTENT_AUTHORING.md` for skills, items, enemies, zones, quests, and loot.
- [ ] Add `docs/INVENTORY_MIGRATION.md` while legacy inventory bridge exists.
- [ ] Add local development troubleshooting guide.
- [ ] Add production troubleshooting guide.
- [ ] Add rollback runbook.
- [ ] Add incident runbook.
- [ ] Add contribution rules for future agents or collaborators.
- [ ] Add dependency update policy.
- [ ] Add architecture diagrams if the project grows beyond solo development.

## 28. Product Roadmap and Milestone Gates

### Milestone A: Safe Public Prototype

- [ ] Identity is no longer name-based.
- [ ] Public snapshots cannot leak private player state.
- [ ] Inventory and equipment persist across reconnect.
- [ ] Protocol schemas are strict and tested.
- [ ] Basic rate limits are active.
- [ ] Basic load test passes target concurrency.
- [ ] Production deploy and rollback are verified.
- [ ] External uptime and join checks exist.
- [ ] Core mobile flow works: connect, move, fight, loot, equip, chat, respawn.

### Milestone B: Combat and Progression Foundation

- [ ] Combat pipeline is unified for player and enemy attacks.
- [ ] Status effect engine handles all content effect types.
- [ ] Class/race/stat scaling is tested and balanced.
- [ ] Skill learning and shortcuts persist and survive class/race changes according to policy.
- [ ] Enemy AI respects combat effects.
- [ ] Starter path and first quest chain are persisted and tested.
- [ ] Loot, XP, and equipment rewards are balanced for early levels.

### Milestone C: Scalable World Foundation

- [ ] Region streaming passes load and visibility tests.
- [ ] Sharding decision is made based on measured data.
- [ ] Inactive zone persistence strategy is chosen.
- [ ] Snapshot size and update rate are within budget.
- [ ] Terrain, landmarks, map, and navigation remain performant on mobile.
- [ ] World content validation catches bad zones, spawns, and landmarks.

### Milestone D: RPG Depth

- [ ] Wearable visuals are visible on avatars.
- [ ] More enemies and mini-bosses have distinct behaviors and loot.
- [ ] Quests go beyond starter checklist.
- [ ] Economy rules are defined.
- [ ] Vendors or trading are implemented only if transaction safety is ready.
- [ ] Party system is implemented only after identity and chat moderation are ready.
- [ ] Guild system is implemented only after account identity and social moderation are ready.

### Milestone E: Production-Ready Live Game

- [ ] Authentication, abuse controls, persistence, backups, observability, and alerts are all active.
- [ ] Load/soak tests pass expected production concurrency.
- [ ] Rollback and restore drills are practiced.
- [ ] Admin tooling has permissions and audit logs.
- [ ] Public docs and player onboarding are clear.
- [ ] Live operations playbook exists.
- [ ] Content pipeline is repeatable without breaking runtime contracts.

## 29. Suggested First 10 PRs

- [ ] PR 1: Privacy hardening for `characterInventory`, exact-key DTO tests, and public snapshot regression tests.
- [ ] PR 2: Protocol strictness audit, `LearnSkillFailed` schema fix, and exhaustive command type test.
- [ ] PR 3: Instance-aware inventory/equipment persistence design, migration, hydration, and reconnect tests.
- [ ] PR 4: Auth/session design slice with signed guest sessions and ownership validation on join.
- [ ] PR 5: Self-cast and beneficial-skill targeting fix with tests for heal, shield, bless, evasion, and invisibility.
- [ ] PR 6: Status effect engine foundation with expiration, shield absorption, slow, stun, and DoT tests.
- [ ] PR 7: Unified enemy/player damage pipeline with defense, crit, evasion, shield, and combat log details.
- [ ] PR 8: Rate limits for chat, movement, casts, and inventory/equipment commands with metrics and tests.
- [ ] PR 9: CI parity with local `pnpm run check`, including package typecheck and content validation.
- [ ] PR 10: Load-test harness for simulated clients joining, moving, fighting, chatting, looting, equipping, and reconnecting.

## 30. Definition of Done for Future Gameplay Slices

- [ ] The feature has a server-authoritative implementation.
- [ ] The feature has explicit protocol schemas.
- [ ] The feature has strict network validation.
- [ ] The feature has owner/public privacy classification.
- [ ] The feature has persistence if it affects durable character state.
- [ ] The feature has migration and restore compatibility checks if schema changes.
- [ ] The feature has unit tests for pure rules.
- [ ] The feature has server tests for authority and ownership.
- [ ] The feature has client reducer tests for messages and snapshots.
- [ ] The feature has Playwright coverage if it affects core UI.
- [ ] The feature has content validation if it adds content definitions.
- [ ] The feature has observability if it affects runtime cost or production behavior.
- [ ] The feature updates docs in the same PR.
- [ ] The feature passes the full local and CI quality gate before merge.
