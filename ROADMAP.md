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
- [x] Stop using `playerName` as the durable account key. (Shipped via migration 009 — accounts table, players.account_id FK, names unique per-account.)
- [x] Add signed identity or authenticated account ownership before treating the public game as production-safe. (Shipped — scrypt password hashing in `server/auth/passwords.ts`, signed bearer tokens in `sessionTokens.ts`, Colyseus join rejects without a valid session token.)
- [x] Persist equipped items and equipment slot state; do not rely on the legacy flat bag inventory for durable equipment. (Shipped — `006_persist_character_inventory.sql` + `CharacterInventory` aggregate; the legacy flat-bag is a wire-only DTO now.)
- [x] Add a migration and restore-compatibility check for the new durable inventory/equipment shape. (Shipped — migration 006 + `scripts/check-restored-postgres-compatibility.sql`.)
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

- [x] Create an `accounts` table with stable account IDs. (`009_add_accounts.sql`.)
- [x] Create a `characters` table with stable character IDs owned by accounts. (Modelled as `players` with `account_id` FK + composite uniqueness; functionally equivalent to per-account characters. A separate `characters` table is a future refactor, not a missing feature.)
- [x] Split account identity from character name. (accounts.login is the credential; players.name is per-character.)
- [x] Make character names unique only where product rules require it, not as authentication keys. (Constraint relaxed to `UNIQUE (account_id, lower(name))` in migration 009.)
- [ ] Add signed guest sessions for unauthenticated play.
- [x] Add passwordless login, OAuth, or another chosen authentication path. (Password chosen; `authRoutes.ts` exposes /register + /login.)
- [x] Add secure session cookies or signed bearer tokens. (HMAC-signed bearer tokens in `sessionTokens.ts`.)
- [x] Add server-side token verification on Colyseus join. (`colyseusRoomAdapter.ts:75` rejects joins without a valid `sessionToken`.)
- [x] Add token expiration and refresh policy. (`DEFAULT_TTL_MS` in `sessionTokens.ts`; clients re-login on expiry.) Refresh-token rotation is a hardening follow-up.
- [x] Add logout and token revocation policy. `POST /api/auth/logout` bumps `accounts.tokens_valid_after` (migration 010); `verifySessionToken` rejects any token whose `iat` predates that timestamp. In-process Map for sync verification, rehydrated from DB at boot (`primeRevocationCache`).
- [ ] Add device/session listing if persistent accounts are supported.
- [ ] Add account deletion flow. (Character deletion is live via `DELETE /api/account/characters/:name`; account-level deletion is open.)
- [x] Add character creation flow that writes race, class, name, initial position, starter state, and inventory atomically. (`createCharacterForAccount` + `Lobby` `CreateCharacterForm`.)
- [x] Add character selection flow for accounts with multiple characters. (Lobby roster + Enter World per character.)
- [ ] Add character rename policy.
- [ ] Add account ban and character ban support.
- [x] Add server checks that a socket can only control the character bound to its authenticated session. (Per-message `socketId` checks in command handlers + session token → accountId binding at join.)
- [x] Add tests for attempting to join as another player name or character ID. (See `tests/playerPrivacyAllowList.spec.ts`, `tests/invalidOwnership.spec.ts`.)
- [ ] Add tests for reconnecting with a valid token and restoring the correct character.
- [x] Add tests for expired, malformed, and revoked tokens. (`tests/sessionTokens.spec.ts`, `tests/sessionTokenRevocation.spec.ts`, `tests/authValidation.spec.ts` — TTL expiry, malformed JWT segments, post-logout `tokens_valid_after` cutoff.)
- [x] Add audit events for login, logout, character creation, deletion, character selection, account deletion, and suspicious ownership attempts. (`server/auth/authAudit.ts` writes `server_events` rows + grep-friendly `[audit] …` console lines. Reconnect audit is still open — Colyseus rejoin doesn't surface as a distinct event from the room boundary today.)

## 4. Protocol and Network Contract

- [x] Convert every client message schema from `.passthrough()` to `.strict()` unless a specific compatibility reason exists.
- [x] Convert every server message schema from `.passthrough()` to `.strict()` (shipped PR #233, every `.strict()` declaration in `packages/protocol/serverMessages.ts`).
- [x] Add protocol version constants in one shared file consumed by client and server. (PR #256 — `packages/protocol/protocolVersion.ts` exports `PROTOCOL_VERSION` + `MIN_SUPPORTED_CLIENT_PROTOCOL_VERSION`; both client and server import from there.)
- [ ] Add a migration path for protocol versions rather than a single hardcoded minimum only.
- [x] Add a `serverProtocolVersion` message or join response so clients can display useful upgrade errors. (PR #256 — `serverProtocolVersion` stamped on the `joinGame` event in `server/transport/clientSnapshot.ts:50-55` and on the `connectionRejected` payload in `server/transport/colyseusRoomAdapter.ts:64-69`.)
- [ ] Generate TypeScript message types from Zod schemas or generate Zod schemas from TypeScript types.
- [x] Add a test that schema-inferred types match exported message types for every protocol message.
- [x] Add an exhaustive discriminated-union test for client messages.
- [x] Add an exhaustive discriminated-union test for server messages.
- [~] Add explicit `clientSeq` fields to commands that need acknowledgement or rejection. (PR #261 — `clientSeq?: number` added to `EquipItem` + `UnequipItem` schemas. Remaining commands — inventory, vendor, skill, chat, drop — follow the same shape but haven't been wired yet.)
- [ ] Stop overloading `clientTs` as an acknowledgement key.
- [ ] Add request IDs for inventory, equipment, class, race, skill, chat, and admin commands where user feedback matters. (Partial: equipment done in PR #261; rest pending.)
- [ ] Add structured rejection messages for all client commands, not only cast, learn-skill, and equip. (Partial: PR #261 added the `CommandRejected` envelope, wired on equip/unequip only.)
- [x] Add a standard error envelope with `requestId`, `commandType`, `reason`, and optional safe detail. (PR #261 — `commandRejectedSchema` in `packages/protocol/serverMessages.ts:200-218`; type at `:438-444`.)
- [x] Add protocol tests for unknown fields, wrong types, invalid enums, oversized text, invalid coordinates, and stale versions.
- [ ] Add message-size budget tests for initial snapshot, batch updates, inventory update, equipment update, and chat messages.
- [ ] Add snapshot compression and payload-size tracking as explicit metrics.
- [ ] Add a changelog for protocol changes.
- [ ] Add protocol fixtures for old-client compatibility tests.
- [ ] Add schema docs generated from protocol definitions.

## 5. Player State Privacy and DTO Boundary

- [ ] Define `OwnerPlayerSnapshot` with only fields the owning client needs. (Today the owner snapshot is the full `PlayerState`; explicit owner DTO not modelled.)
- [x] Define `PublicPlayerSnapshot` with only fields other players may see. (PR #260 — `server/transport/clientState.ts` `PUBLIC_PLAYER_FIELDS` allowlist + `PublicPlayerSnapshot` type; `sanitizePlayerForPublic` projects to it.)
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
- [x] Add tests that new fields added to `PlayerState` fail privacy audits until classified. (PR #260 — `tests/playerPrivacyAllowList.spec.ts` derives the expected key set from the runtime `PUBLIC_PLAYER_FIELDS` allowlist; a new PlayerState field defaults to private and the test catches it.)
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
- [x] Make shield effects absorb damage from all damage sources.
- [ ] Make evasion affect enemy attacks and relevant player attacks.
- [ ] Make accuracy affect hit chance.
- [ ] Make crit chance and crit multiplier affect eligible skills only.
- [ ] Make attack speed and cast speed affect relevant cooldown/cast-time rules only if intended.
- [ ] Make run speed feed movement consistently through shared stats.
- [ ] Add an effect tick system for players and enemies.
- [x] Add expiration pruning for player status effects.
- [x] Add expiration pruning for enemy status effects.
- [x] Add periodic damage for burn.
- [x] Add periodic damage for poison.
- [x] Add periodic damage for generic DoT.
- [ ] Add periodic healing if future HoTs are added.
- [x] Add slow effect behavior that reliably changes movement speed while active.
- [x] Add stun behavior that blocks movement, casting, and attacking while active.
- [x] Add freeze/root behavior if distinct from stun.
- [x] Add taunt behavior that changes enemy target priority for the duration.
- [x] Add knockback behavior with server-owned position changes and collision/bounds validation. (PR §45 — `applyKnockback` in `server/combat/impactResolver.ts:492-540`; pushes target along caster→target vector, sets `dirtySnap`. Tests at `tests/knockback.spec.ts`. Bounds validation is the world-edge clamp inherited from `advanceEnemyPosition` / movement pipeline.)
- [x] Add invisibility behavior that breaks or suppresses aggro according to product rules.
- [ ] Add dispel behavior with configurable categories: negative, positive, magic, poison, bleed, stun, shield.
- [x] Add buff stacking policy: replace, stack, refresh, or reject. (PR #257 — `packages/content/effects.ts` declares `stacking` per `EFFECT_SPECS` entry; `impactResolver.upsertStatusEffect` reads `getStackingPolicy(type)`.)
- [x] Add debuff stacking policy: replace, stack, refresh, or reject. (PR #257 — same registry; DoTs `dot`/`burn`/`poison` use `stack`, CC like `stun`/`slow`/`taunt` use `refresh`.)
- [x] Add maximum stack validation per effect type. (PR #257 — `getMaxStacks(type)` reads `EFFECT_SPECS[type].maxStacks` (defaults to 1); `reconcileExisting` caps `stacks` at the declared max.)
- [ ] Add effect source tracking for ownership, threat, and combat logs.
- [ ] Add status-effect snapshots that avoid leaking hidden entity IDs.
- [ ] Add combat logs that distinguish raw damage, absorbed damage, resisted damage, crits, misses, heals, and kills.
- [ ] Add tests for each skill effect type currently present in content.
- [ ] Add tests for simultaneous effects on one target.
- [x] Add tests for shield absorption order.
- [x] Add tests for effect expiration during combat.
- [x] Add tests for death while affected by DoT.
- [x] Add tests for self-cast skills.
- [ ] Add tests for ground-target skills.
- [x] Add tests for target-required skills.
- [ ] Add tests for projectile impact at max range.
- [ ] Add tests for projectile piercing and max-pierce hits.
- [x] Add tests for AoE target deduplication.
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

- [x] Add deterministic or seeded patrol target generation if reproducibility matters for tests.
- [ ] Add status-effect awareness to enemy AI.
- [x] Add stun handling for enemies.
- [x] Add slow handling for enemies.
- [x] Add taunt priority handling for enemies.
- [x] Add invisibility handling for enemies.
- [x] Add return-to-spawn leash rules with max chase distance.
- [x] Add anti-kite rules if enemies should not chase forever.
- [x] Add pack aggro rules with configurable radius per species or encounter. (PR #258 — `EnemyStatMultipliers.packAggroRadius` × `DEFAULT_PACK_AGGRO_RADIUS_M`; `propagatePackAggro` reads from `source.packAggroRadius` in `server/ai/enemyAI.ts:115-130`.)
- [x] Add pack disengage rules. (PR #258 — new `packDisengage` event in `enemyStateMachine.ts` emitted at every chasing/attacking→returning transition; `propagatePackDisengage` in `enemyAI.ts:135-165` pulls packmates back to `returning`.)
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
- [x] Add gauges for active players.
- [x] Add gauges for active enemies.
- [x] Add gauges for active casts.
- [x] Add gauges for ground loot stacks.
- [x] Add histograms for tick duration.
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
- [x] Add validation that class skill prerequisites do not form impossible cycles.
- [x] Add validation that item stats remain within balance budgets.
- [x] Add validation that enemy stats remain within balance budgets.
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

- [x] Add server-side chat rate limit.
- [x] Add message normalization and trimming on the server.
- [ ] Add blocked word or moderation hook if public chat is enabled.
- [ ] Add chat mute system.
- [ ] Add chat report system if public chat grows.
- [ ] Add system messages separated from player chat.
- [ ] Add party chat only after party system exists.
- [ ] Add guild chat only after guild system exists.
- [ ] Add private whisper only after identity and moderation exist.
- [ ] Add chat persistence policy: none, short-lived, or moderated logs.
- [x] Add tests for near-chat radius.
- [x] Add tests for all-chat broadcast.
- [ ] Add tests for hidden region players not receiving inappropriate local messages if region scoping should apply.
- [x] Add tests for empty/whitespace messages.
- [x] Add tests for maximum length messages.
- [x] Add tests for rate-limited messages.
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

- [x] PR 1: Privacy hardening for `characterInventory`, exact-key DTO tests, and public snapshot regression tests. (Shipped PR #260 — `PUBLIC_PLAYER_FIELDS` allowlist + `tests/playerPrivacyAllowList.spec.ts` derives from runtime allowlist.)
- [x] PR 2: Protocol strictness audit, `LearnSkillFailed` schema fix, and exhaustive command type test. (Shipped — every `.strict()` declaration in `packages/protocol/{clientMessages,serverMessages}.ts`; `tests/protocolTypeDrift.spec.ts` pins literals + `learnSkillFailedReasonSchema` enum.)
- [ ] PR 3: Instance-aware inventory/equipment persistence design, migration, hydration, and reconnect tests.
- [x] PR 4: Auth/session design slice with signed guest sessions and ownership validation on join (shipped — password auth live, JWT verification + ownership checks in `server/transport/index.ts` `handleJoin`; see §45 audit-events item).
- [x] PR 5: Self-cast and beneficial-skill targeting fix with tests for heal, shield, bless, evasion, and invisibility. (Shipped — `tests/selfSkillEffects.spec.ts`, `skillSelfCast.spec.ts`, `vanishSelfTarget.spec.ts`, `healOutputMultiplier.spec.ts`, `shieldAbsorption.spec.ts`, `beneficialBuffDuration.spec.ts`, `evasionBonusSpecPassive.spec.ts`; `resolveCastTargets` short-circuits beneficial-only casts to the caster.)
- [x] PR 6: Status effect engine foundation with expiration, shield absorption, slow, stun, and DoT tests. (Shipped — `pruneExpiredStatusEffects`, `dotTicker`, `absorbWithShield`, `upsertStatusEffect`; tests at `shieldAbsorption.spec.ts`, `buffPruneEmit.spec.ts`, `buffStackingPolicy.spec.ts`, `dotEffects.spec.ts`.)
- [ ] PR 7: Unified enemy/player damage pipeline with defense, crit, evasion, shield, and combat log details.
- [x] PR 8: Rate limits for chat, movement, casts, and inventory/equipment commands with metrics and tests. (Shipped — `server/world/rateLimiter.ts` `RATE_LIMITS` buckets cover `movement/cast/chat/inventory/equipment/lifecycle/identity`; counters via `runtimeMetrics.increment('rateLimit.dropped.*')` in `clientMessageRouter.ts:58-62`.)
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

## 31. Open Visual Experiments

- [ ] Try the analytical atmosphere / Rayleigh + Mie sky shader from
  https://blog.maximeheckel.com/posts/on-rendering-the-sky-sunsets-and-planets/
  in place of the current keyframe-interpolated palette in
  `apps/client/src/WorldEnvironment.tsx` + `timeOfDay.ts`. Would
  replace the hardcoded sunrise/midday/dusk/midnight colour stops
  with a physically-derived gradient driven by sun direction +
  scattering coefficients. Big visual win for sunsets and night
  transitions; needs a dedicated shader pass and probably a separate
  skybox geometry. Park behind the current QoL pass; revisit when
  baseline is comfortable.

## 32. Live Run — Quest Expansion Follow-ups (2026-05-18)

User report from prod (PRs #169–#171 deployed). The slice below ships
in 4 PRs; the loop continues until every box is ticked, CI green, and
deployed.

### PR D — Bug fixes from prod feedback

- [ ] Race is locked once the player is in the world. Race is chosen
  only at character creation (see PR D2 below); any in-game `SelectRace`
  is rejected unless the caller is a GM.
- [ ] On class change, clear `specializationId` so it doesn't carry
  over to an incompatible class.
- [ ] On race change (GM-only, after PR F), clear stale `specializationId`
  too.
- [ ] Escape is visible in the Actions panel (universal skills land
  on the action bar, not only in the shortcut list).
- [ ] Skill tooltips + Wiki Skills tab + SkillTreePanel show
  *effective* damage / mana cost / cooldown given the player's current
  `skillLevels[skillId]` (engine already applies the modifiers;
  only the display is stale).

### PR D2 — Character creation lobby

- [ ] On login the player sees a Lobby with their existing characters
  and a "Create New Character" button. Selecting a character + "Enter
  the World" sends them in; create-new walks them through Race ->
  Class (filtered by allowedClasses) and persists the choice before
  enter.
- [ ] Server: persistence per-account character list (one account ->
  many characters). Initially: one account = one socket login; this
  may need a follow-up auth slice — keep this PR scoped to the
  per-character row + lobby protocol.
- [ ] Migration + new tables / columns as needed.
- [ ] Race / initial class are only mutable through the create flow
  (or via GM after PR F). All in-game `SelectClass` / `SelectRace`
  are server-rejected for non-GMs.

### PR E — Spec + proficiency content (skills via specs, not code)

- [ ] Extend `Specialization` with `specSkills: SkillId[]` (unlocked
  at `SPECIALIZATION_UNLOCK_LEVEL`) and `proficiencySkills: SkillId[]`
  (unlocked at `PROFICIENCY_LEVEL`). Pure data.
- [ ] Seed 1–2 spec-specific skills per spec; engine reads the spec
  for gating (no per-spec code branch).
- [ ] `canPlayerLearnSkill` honours spec gating + level gating.
- [ ] SkillTreePanel + WikiPanel render spec / proficiency skills with
  a "spec-locked" badge when the player isn't on that spec.

### PR F — GM panel + GM-gated mutations

- [ ] New GM protocol messages: GrantXp, GrantGold, GrantSp, GrantItem,
  GrantSkill, SetLevel, SetRace, SetClass, SetSpecialization,
  SetProficiency.
- [ ] Server gate: `VIBEAGE_ENABLE_DEV_COMMANDS=1` already exists; reuse
  it as the GM gate. Log every GM action with target id + verb +
  value (auditable).
- [ ] In-game GM panel (new HUD section, only rendered when client
  detects GM mode). Targets the currently-selected player or self.
- [ ] Tests for each GM verb (allowed when env on, rejected when off).

### PR G — Wiki polish (clickable everything + Stats + Mobs)

- [ ] Tree tab nodes are clickable: race -> Races tab, class -> Classes
  tab, spec -> Specs tab (with focus highlight on the row).
- [ ] Classes tab: each "Tree: skill, skill, …" name is a clickable
  chip that jumps to Skills tab with focus.
- [ ] Specs tab: list spec / proficiency skills (from PR E content) as
  clickable chips that jump to Skills tab.
- [ ] New **Stats** tab. Pure data catalog of attributes (STR / DEX /
  CON / INT / WIT / MEN) with one-paragraph descriptions of what
  each one influences. PlayerPanel stat labels become clickable
  links that jump to the Stats tab and focus the row.
- [ ] New **Mobs** tab. Pure data catalog of enemy templates with
  spawn coordinates pulled from existing spawn definitions. Each
  row has a "Show on map" button that drops a marker (same
  mechanism Quest "Show on map" uses).
- [ ] Everything above lives in `packages/content/*` — no hardcoded
  strings or numbers in the UI tabs.


## 33. Live Run — Wave 3 follow-ups (2026-05-18)

Prod feedback after §32 deployed.

### PR H — Casting semantics + Escape bug + Wiki nav + Lobby flow

- [ ] Investigate why a finished Escape cast didn't teleport
  (likely: cast completion path expects requiresTarget true OR
  isBeneficialOnly check vs. caster fails). Add a regression test.
- [ ] `SkillDef.isBlocking` (default true): while casting, the
  player cannot move or fire another cast / action.
- [ ] `SkillDef.isInterruptable` (default true): a contradictory
  player action (move, cast a different skill, basicAttack) cancels
  the cast WITHOUT applying mana cost or cooldown.
- [ ] Server: castMachine rejects new commands while blocking;
  interrupt path refunds mana + clears the cooldown timer.
- [ ] Wiki: **Back / Forward** stack on the focus-navigation history
  (clicking a chip pushes; Back returns to the previous tab+focus).
- [ ] Lobby: after Create New Character, return to the lobby with
  the new character selected — don't auto-enter the world.

### PR I — Login + password auth

- [ ] Drop the existing `players` table content (per user) and
  introduce an `accounts` table: (id, login, password_hash,
  created_at, last_login_at). bcrypt for hashing.
- [ ] `players` gets an `account_id` FK; lobby + character roster
  live server-side per account.
- [ ] New protocol messages: `AuthLogin`, `AuthRegister`, and a
  pre-game `RequestCharacterRoster` / response. World join still
  takes a chosen character name + the new auth session token.
- [ ] Lobby gains a login screen (login + password fields). On
  successful auth, the lobby loads the account's character roster
  from the server (replaces the localStorage roster from PR D2).
- [ ] Migration 009 (or 010): drop players content + add accounts
  + foreign key. Acceptable to wipe prod data per user direction.
- [ ] Single open session per account (newer login boots the old
  socket) — punt to follow-up if scope balloons.


## 34. Live Run — Wave 4 follow-ups (2026-05-18)

### PR J — Single-button auth + relaxed validation

- [ ] Replace lobby's Login/Register tabs with a single "Continue"
  button. Server endpoint `POST /api/auth` registers if the login
  is new, logs in otherwise. Returns the same token shape.
- [ ] Relax credential validation: minimum 1 char each for login
  and password (the user explicitly wants "a"/"a" to work). Keep
  the per-char allow-list + length caps for sanity.


## 35. Live Run — Wave 5 follow-ups (2026-05-18)

### PR K — Bug fixes from prod ✅ (shipped 2026-05-18)

- [x] Character name 'a' accepted. (`accountRepository.ts:141` allows length ≥ 1.)
- [x] NPC dialog Greet / Accept buttons wired. (`hud/NpcDialog.tsx:39` onClick → `AcceptQuest`.)
- [x] Legacy StarterProgressPanel removed; QuestPanel owns the list.
- [x] Lobby inputs use `autoComplete="username"` / `"current-password"`; form unmounts cleanly via `pendingSession` (`Lobby.tsx:227,236`).
- [x] Char panel removed; race/class shows in `PlayerPanel.tsx:37`.

### PR L — Engine + UI polish ✅ (shipped 2026-05-18)

- [x] HP / MP regen applied each tick from `player.stats.hpRegen` / `mpRegen` (`server/players/playerLifecycle.ts:93-101`).
- [x] Map zoom recalibrated (12 → 40) in `hud/MapPanel.tsx`.
- [x] SkillBar + PlayerPanel rows click through to the Wiki via `openWikiAt`.

## 36. Live Run — Wave 6 follow-ups (2026-05-19)

Playtest report. Treat each item as a real fix, not a one-off
patch — figure out the engine-level rule that makes the bug
impossible across every mob / skill / quest.

### PR BB — Combat engine bugs ✅ (shipped 2026-05-19)

- [x] Stun stops the mob: `enemyStateMachine.ts:81` calls `stopEnemy()` and short-circuits the AI tick when `isEnemyStunned` is true.
- [x] Approach-and-cast: `clientActions.ts:282-296` waits for `isOutOfCastRange(..., PENDING_CAST_RANGE_MARGIN)` to drop before firing — second-press bug fixed by the 1.5u range pad.
- [x] Quest kill counters persist + emit on each kill (`server/players/playerQuests.ts:156-159`); reward delivery on Done verified by `tests/questFlow.spec.ts`.

### PR CC — UX + content ✅ (shipped 2026-05-19)

- [x] Status-effect pill click → `openWikiAt('effects', effect.type)` (`hud/hudPrimitives.tsx:45`).
- [x] Beneficial skill auto-falls back to caster when target is hostile (`apps/client/src/clientActions.ts:618-619` in `resolveCastTargetId` — client redirects pre-send so Ctrl-cast can keep the explicit-enemy path).
- [x] Non-boss mobs use a widened leash (`LEASH_NORMAL = 200m` in `enemyStateMachine.ts`); bosses keep the tight return-to-spawn rule.
- [x] Zone ↔ mob audit shipped — Frost Wolf spawn anchor fix lives in PR WW (`tests/frostWolfSpawn.spec.ts`).

## 37. Live Run — Wave 7 follow-ups (2026-05-19)

Spec-driven content fills. Single source of truth: every record
that drives runtime behaviour also generates its wiki entry; no
duplicated descriptions.

### PR DD — Boss wiki: stats + signature ability mechanics

- [ ] Bosses tab shows derived HP / damage / level for each
  mini-boss using the same formula createEnemy uses (mirror the
  PR W MobStatsSummary already on the Mobs tab).
- [ ] Show signature ability mechanics inline: windUpMs, radius,
  cooldownMs, damageMul. The same `signatureAbility.engine`
  record that drives the in-game cast also drives the wiki — no
  manual maintenance.
- [ ] Show enrage / phase-shift parameters (DEFAULT_BOSS_CONFIG)
  so players can teach themselves the encounter rhythm.

### PR EE — NPCs in wiki

- [ ] New `Npcs` tab listing every QUEST_NPCS entry with name,
  title, zone hint, and a chip per quest they offer (linking
  back to the Quests tab).
- [ ] Add an optional `description` field to QuestNpcDef so the
  wiki can render flavor text. Same record that wires the
  quest dialog flows to the wiki description.
- [ ] Tapping an NPC in the 3D world (or its tag on the map) →
  open the Npcs tab focused on that NPC.

### PR FF — Per-mob spawn coords (live + accurate)

- [x] Extend `ZoneMob` with optional `position` + `spawnRadius`.
  When declared, the spawner jitters mob groups around that
  anchor (packs cluster from the jittered center) and
  `getMobZones` emits the camp coord; wiki "Spawns in" pins
  jump to the actual encounter instead of the zone centre.
- [x] Backfill explicit camps for every authored zone
  (starter_meadow through temporal_rifts — 14 zones, 31 mob
  entries). Huge biome zones stay procedural.
- [x] When no per-mob coord is declared, fall back to the
  existing random-in-zone behaviour so the giant biome zones
  keep working.
- [x] `getMobZones` emits both the boss lair and the regular
  camp when a mob type is both (goblins + Grakk), so the wiki
  shows both pins rather than collapsing them.

### PR GG — Vendors + gold-spend loop

- [x] New `VENDORS` content record. Each vendor is a kind of
  NPC; the same record drives the in-game vendor dialog AND
  the wiki entry.
- [x] Vendor stock: a list of `{itemId, price}` rows for items
  the vendor sells. Single source of truth.
- [x] Sell side: vendor pays `defaultSellPrice` (derived from
  grade — none/d/c/b/a/s = 5/15/30/150/500/2000) times the
  vendor's `buyRate` (e.g. 1.5x for trophy buyers, 0.6x for
  general merchants). Vendor panel shows the rate the vendor
  pays per item.
- [x] Gold counter on `PlayerState` (persisted to the existing
  `players.gold` column). `gold_coin` drops auto-convert on
  pickup so the bag stays clean. Quest gold rewards credit
  the same counter. Buying consumes gold; selling adds it.
  Snapshot/restore covers gold to prevent dupe on partial
  pickup failure.
- [x] Three starter vendors near Gludin: Thala (general goods
  — potions), Tinker Drev (worn sword), Oren (trophy buyer,
  no stock, 1.5x buy rate).
- [x] Wiki tab `Vendors` listing each vendor + stock with
  prices, cross-linked to Items and NPCs.
- [x] HUD: gold counter on the vitals strip; visible at a
  glance next to HP/MP/XP.

### Held over (do not start until requested)

- Wearable visuals on avatars — frozen until real 3D model
  pipeline is in place. Don't sink time into placeholder mesh
  swapping.
- Stat balance pass — too early; more classes / races / skills
  are planned first.

## 38. Live Run — Wave 8 follow-ups (2026-05-19)

User report from VPS playtest. Theme: deep-link everything to
the wiki + automated spec validation so we stop shipping
"hanging" content (items nobody can drop/buy/craft, NPCs
nobody can find). Plus three concrete in-game bugs that
surfaced during the session.

### PR HH — Wiki obtainability index + spec validator

- [x] New `packages/content/obtainability.ts` — for any item
  id, returns *all* sources: vendor stock, loot drops,
  crafting recipes, quest reward grants. Pure derivation
  from existing registries; no per-item override list.
- [x] Wiki Items tab renders Sold-by / Dropped-by / Quest-
  reward / Crafted-from on every item card; the previously
  blank leather/bone/short-bow entries now show their
  vendor (Tinker Drev).
- [x] `tests/contentGraph.spec.ts` fails CI when:
  - an `ITEMS` entry isn't sold, dropped, crafted, or
    quest-rewarded (hanging item)
  - an `ENEMY_TEMPLATES` entry isn't in any zone spawn
    (hanging mob)
  - a `QUEST_NPCS` entry isn't referenced by quest/vendor
    (hanging NPC)
  - a spec references an itemId / npcId / enemyType /
    bossId that doesn't exist
- [x] `OBTAINABILITY_WHITELIST` for currency + 7 flavour
  placeholders (ancient_tome, sealed_letter, etc.) so the
  gate is strict by default without blocking legitimate
  future-content scaffolding.
- [x] 38 hanging items at audit time cleared by adding
  drops to existing mob/boss tables (`SUPPLEMENTAL_DROPS`)
  + vendor stock at Thala/Tinker Drev.

### PR II — Stats registry as single source of truth

- [x] `STATS` in `packages/content/stats.ts` now covers every
  derived combat stat the HUD displays (pAtk, mAtk, pDef,
  mDef, hpRegen, mpRegen, accuracy, evasion, attackSpeed,
  castSpeed, runSpeed, critChance) alongside the six
  attributes. Single source of truth.
- [x] PlayerPanel renders every derived row via the existing
  `StatRow` chip so each one becomes a wiki link → Stats
  tab focused on that stat. Hover tooltip from the STATS
  description; click → wiki.
- [x] Wiki Stats tab picks up the new entries automatically
  (it walks `Object.values(STATS)`); `tags` carry the
  `attribute` / `derived` distinction so future grouping
  can read off the same field.
- (Deferred) Engine still reads weights from RACE_PROFILES /
  STAT_WEIGHTS; folding those into STATS would touch
  derivePlayerStats more invasively than this PR's scope
  and isn't user-visible — recorded for later.

### PR JJ — Wiki UX polish: clickable coords, hoverable tooltips, gear popup

- [x] `(x, z)` coords are now `onShowMarker` chips on the
  Npcs / Vendors / Bosses wiki tabs (previously only the
  Mobs tab dropped a pin). Same handler the rest of the
  wiki already uses; no new plumbing.
- [x] `useTooltipTrigger.hoverHandlers` bridge: 200ms close
  grace window after the cursor leaves the trigger, and a
  `onPointerEnter/Leave` pair spread on SkillTooltip /
  ItemTooltip so the floating tooltip stays alive while the
  cursor sits on it. Wiki links inside tooltips are now
  reachable (SkillBar, ActionsPanel, Inventory, Paperdoll).
- [x] `useTooltipTrigger.openAt(payload, x, y)` exposed for
  click-to-open. PaperdollPanel's gear name now opens the
  ItemTooltip immediately on click (was hover-only); right-
  click still jumps straight to the wiki. The popup carries
  the "Open in Wiki" link via the hover bridge.

### PR KK — Skill self-target flag + NPC labels + Greet wire-up

- [x] `SkillDef.selfTarget?: boolean` added. Engine reads it
  in `resolveCastTargets` (impactResolver) to force the cast
  on the caster even when another entity is selected. Wiki
  Skills tab shows "Target: self (ignores selection)".
- [x] New `aggroReset` SkillEffectType. impactResolver scans
  a 60m radius around the target and clears `targetId` on
  any chaser that was tracking them. Mob returns to idle.
- [x] Vanish updated to `selfTarget: true` + carries both
  `invisible` and `aggroReset` effects. Verified by
  `tests/vanishSelfTarget.spec.ts`: cast with a mob
  targeted ⇒ invisible lands on caster, chaser's threat
  cleared, bystander untouched.
- [x] `NameLabel` floats above every `QUEST_NPCS` marker
  (yellow tint to match the marker cylinder). Reads
  `QUEST_NPCS[id].name` directly — no per-NPC label code.
- [x] NpcDialog "Greet" button now emits a direct
  ChatBroadcast carrying `npc.greet` (one line per NPC,
  authored in `QUEST_NPCS`). Falls back to a generic
  acknowledgement for any NPC without a custom line.

## 39. Live Run — Wave 9 follow-ups (2026-05-19)

Three playtest reports landed after wave 8 deployed.

### PR LL — Stale buff cleanup + self-target keeps current target

- [x] Movement tick (`advanceAll`) now passes the outbound
  sink to `pruneExpiredStatusEffects` and emits
  `playerUpdated` / `enemyUpdated` whenever the prune
  actually changes the array. The client drops the chip
  the same tick instead of carrying a stale icon. Covered
  by `tests/buffPruneEmit.spec.ts`.
- [x] `resolveCastTargetId` short-circuits to null when
  `skill.selfTarget` is set; server's resolveCastTargets
  routes the cast at the caster via the existing
  selfTarget branch. `fireCastReq` no longer dispatches
  `selectTarget` when the resolved id matches the caster,
  so casting Vanish with a goblin selected keeps the
  goblin on the target plate.

### PR MM — Scrollable system chat

- [x] New `CombatLogPanel` with scrollable container,
  styled scrollbar, "stuck to bottom" auto-scroll (24px
  tolerance), and a `↓` jump-to-latest button when
  scrolled up.
- [x] Render order flipped: oldest at top, newest at
  bottom (standard chat flow). Newest line keeps the
  warm yellow highlight.
- [x] `MAX_COMBAT_LINES` bumped 5 → 200; DOM stays
  bounded.

## 43. Bot architecture review — finishing single-source-of-truth (2026-05-19)

A code-review bot audited the recent stats / class-as-skills work
and flagged four real architectural gaps. The PRs below close
each one. Direction is right; "looks unified" needs to become
"actually unified". Each item ends with an old-system-removal
checkpoint.

### PR SS — Specialization passive modifiers feed Contributions ✅

- [x] `SPECIALIZATIONS[*].specializationPassive.modifiers` and
  `proficiencyPassive.modifiers` now drive Contribution rows
  directly. `pushSpecPassiveModifiers` explodes each non-default
  modifier into a labelled row (`spec:<id>:spec:dmg`,
  `spec:<id>:prof:mp`, …) so the breakdown popup reads
  e.g. "arcanist · Arcane Focus II (dmg) ×1.15".
- [x] Level gating: spec passive applies at
  `SPECIALIZATION_UNLOCK_LEVEL`, proficiency stacks on top
  once the player reaches `PROFICIENCY_LEVEL`.
- [x] **Old-system removal**: the placeholder ×1 row is
  deleted; the only spec-stat code path is the registry →
  Contribution emit.

### PR TT — Movement consumes player.stats.runSpeed ✅

- [x] `server/movement/worldMovement.ts:getPlayerSpeed`
  now reads `player.stats.runSpeed` directly (units/sec),
  capping at `MAX_PLAYER_SPEED`. The DEX/dmgMult kludge
  and per-effect `if (slow)…else if (speed_boost)` branches
  are gone.
- [x] `STATUS_EFFECT_STAT_CONTRIBUTIONS.speed_boost` is now
  wired (mirrors `slow`), so haste-style buffs feed the same
  runSpeed pipeline as everything else (class passive muls,
  spec passives, DEX scaling).
- [x] `baseline:runSpeed` raised from 7 → 20 so the stat is
  in world-units/sec — no separate translation constant.
- [x] **Old-system removal**: `getPlayerSpeed` is a 3-line
  read of the resolved stat; `DEFAULT_PLAYER_SPEED` survives
  only as the fallback for entities lacking
  `player.stats.runSpeed` (e.g. mid-bootstrap snapshots).

### PR UU — Single source of SkillId across TS + protocol ✅

- [x] `SKILL_IDS` in `packages/content/skills.ts` is now the
  canonical list. `SkillId` is `(typeof SKILL_IDS)[number]`
  and `protocol/common.ts:skillIdSchema` is
  `z.enum(SKILL_IDS)`. `skillIdValues` is kept as a re-export
  alias so existing callers don't churn.
- [x] **Old-system removal**: the hand-written TS union is
  gone; the parallel `skillIdValues` literal array in
  `protocol/common.ts` is gone (now just a re-export).
  `protocolSkillIdCoverage.spec.ts` is kept — it still
  enforces `SKILLS` catalog ↔ `SKILL_IDS` parity, which is a
  separate invariant (catalog vs id list) and remains
  worth policing.

### PR VV — Audit hardening + HUD overlap fix ✅

- [x] **Fix audit comment refs**: corrected — `waterWeakness`
  now annotated as living on `waterSplash` (not `iceBolt`);
  `knockback` on `powerStrike` (not `bash`).
- [x] **Percent-claim test**: `tests/passivePercentClaims.spec.ts`
  parses every `+N%` / `−N%` claim in a passive's description,
  maps the keyword to a `StatId`, and asserts the matching
  Contribution row's value produces that magnitude
  (`mul → 1 ± N/100`, `addPre → ±N/100`). 21/21 passive skills
  reconcile. The Lethal-Focus-shaped bug (description claims
  X, row is no-op) now fails the suite.
- [x] **Playwright HUD overlap**: gave `.skill-bar` `z-index: 5`
  so the centered skill bar sits above `.combat-log` (which
  has `pointer-events: auto` from PR MM and was eating clicks
  on the leftmost skill slots at ≥1024px viewports).
- [ ] **Old-system removal**: every type in
  `UNIMPLEMENTED_EFFECT_TYPES` either gets wired in a follow-up
  PR or carries a dated owner. (Carried to next wave — not
  blocking PR VV.)

## 44. Live Run — Wave 12 playtest bugs (2026-05-19)

### PR WW — Escape skill + Frost Wolf spawn drift

- [x] **Bug: Escape didn't teleport.** Player cast Escape
  (the universal recall skill) and stayed in place. The
  cast was supposed to route the caster to the nearest
  village via the `teleport` effect handler in
  impactResolver. Trace: was the cast accepted server-
  side? Did it reach `resolveCastImpact`? Did
  `getNearestVillage` pick a destination? Add a regression
  spec that runs the whole Escape pipeline against a
  fixture player and asserts the position changed to the
  closest village.
  - **Old-system removal**: no duplicate village-recall
    code path should survive — `teleport` effect is the
    only route.

- [x] **Bug: Frost Wolf absent from claimed location.**
  Wiki Mobs tab claims Frost Wolf spawns at `(-460, 480)`
  in Frozen Tundra (per PR FF anchor). Player teleported
  there, found no frost wolves. Possible causes:
  1. Spawn budget cap (`WORLD_SPAWN_BUDGETS`) starved the
     zone before frost wolves were placed.
  2. `activePhases` gate kept them un-spawned at the
     player's time-of-day.
  3. `jitterAround` chose a point outside the navmesh /
     under terrain.
  4. Respawn loop never fired because the zone is far
     from any active player when the server initialised.
  Walk the spawner with a small repro script (run the
  server's `spawnInitialEnemies` on a stub state, assert
  ≥ 1 frost wolf lands at the anchor). Fix whichever
  cause it turns out to be.
  - **Old-system removal**: nothing carrying old per-mob
    spawn logic should survive — `ZoneMob.position` is the
    sole anchor as of PR FF.

## 42. Stat-popup polish + skill-spec audit (planned 2026-05-19)

User playtested the PR PP popup and caught five concrete bugs +
asked for a top-to-bottom audit. Each is captured below with an
explicit old-system-removal line.

### PR QQ — Stat popup polish + passive learn flow

- [x] **Race rows mislabelled.** Today the breakdown shows
  `Dark Elf race | 13` for STR. The principle is "race
  contributes only its component attributes — not a row
  named 'Dark Elf race'." Re-label each per-attribute
  contribution as `Dark Elf base STR`, `Dark Elf base DEX`,
  etc. Single source: derive label from `${profile.name}
  base ${attr.toUpperCase()}` inside
  `pushRaceContributions`.
  - **Old-system removal**: no per-race-label override
    elsewhere — the generic-label path is the only one.
- [x] **Cast speed convention reads backwards.** Total =
  0.85 with a negative `−0.15` row looks like a debuff,
  when in fact it's "15% faster cast". Flip the semantic
  to `castSpeedMul` (higher = faster); WIT contributes
  `+0.15`; impact resolver divides by it instead of
  multiplying. Players see `+15% faster`.
  - **Old-system removal**: every consumer of `castSpeed`
    in the engine (skillSystem, impactResolver) flips to
    the new direction in the same PR. No "legacy castSpeed"
    interpretation survives.
- [x] **Passive learn doesn't refresh stats.** Player
  learned `passive_lethal_focus` and saw no critChance
  change. `applyLearnSkill` adds the id to
  `unlockedSkills` but never calls `recomputePlayerStats`.
  Wire it.
  - **Old-system removal**: no other "passive learned but
    not applied" code path — this is the single hook.
- [x] **Passives invisible in the skill UI.** Players
  need to see which passives they own and which they can
  learn. Surface them:
  - Skill tree panel: a "Passives" section per class
    listing auto-granted + learnable, with the same
    learn-button affordance as active skills.
  - Wiki Skills tab: separate "Passive" filter / tag so
    the catalog shows them.
  - HUD: not in the skill bar (passives don't fire), but a
    small "Passives" chip strip below the bar with the
    icon-only owned passives so the player feels the
    presence.
- [ ] **Upgradable passives** later — for v1, learnable
  passives are level-locked tier-1 entries. The existing
  `SkillUpgrade` mechanism we have for actives is overkill
  for passive +5% bumps; punt that to a follow-up unless
  the user pushes.

### PR RR — Skill spec audit (single source of truth)

Walk every entry in `SKILLS` (BASE_SKILLS, spec /
proficiency, passives) and assert one wiring discipline:

- [x] **For each skill**: open a row in `tests/skillSpecAudit.spec.ts`
  asserting:
  - Active skill: at least one `SkillEffect` AND consumers
    of every declared effect exist in `impactResolver`.
  - Passive: at least one entry in
    `PASSIVE_SKILL_CONTRIBUTIONS` matches its id.
  - No skill has *both* effects + a passive contribution
    (would be duplicate-source).
  - SkillDef's `description` mentions the actual numbers
    its effects / contribution produce (catches "claims +5%
    but value 0" drift).
- [x] **For each effect type**: assert `EFFECT_SPECS` covers
  it (already done via the type union, but lock the
  description/category at runtime too).
- [x] **For each passive contribution**: assert the
  declared `stat` is in `STATS` and the contribution shows
  up on the breakdown when the passive is owned (sanity
  sweep already does the second half — extend it).
- [x] **Old-system removal** sweep at the end: grep for
  any leftover `*Multiplier` field on a skill or class
  spec that *isn't* expressed as a Contribution. Delete
  or migrate.

## 41. Class-as-skills + stats sanity sweep (planned 2026-05-19)

User caught two things on the live breakdown popup:

1. `Class: rogue ×1.25 (+25%)` shouldn't exist. Class is the
   tree of allowed skills, not a stat multiplier. The current
   `CLASS_PASSIVES.modifiers` (healthMultiplier / manaMultiplier
   / damageMultiplier / speedMultiplier) violates the
   race=attrs / class=skills / equipment=skills model. Should be
   modelled as auto-granted passive *skills* — Warrior unlocks
   "Battle Hardened" which emits a `+30% maxHealth` contribution.
   Source label becomes `Skill: Battle Hardened`, not `Class: warrior`.
2. `STR scaling: 0` in the popup even though pAtk total is
   correct. The function-valued contribution evaluates to 0 in
   the popup because the row renderer passes an empty `{}`
   instead of the engine's resolved attribute map. Fix at the
   source: `computeAllStats` emits the resolved numeric value
   on `breakdown.parts[i].value` so the popup never re-evaluates.

### PR PP — Class-as-passive-skills + breakdown display fix + sanity sweep

- [x] **Class passives become real passive skills.**
  - `CLASS_PASSIVES` keep their `id` (`passive_arcane_focus` etc.).
  - Picking / hydrating class X auto-owns the matching passive
    skill id in `player.unlockedSkills`. Reuses the same path
    `starterSkillsFor(className)` uses for active starters.
  - New `PASSIVE_SKILL_CONTRIBUTIONS: Record<SkillId, Contribution[]>`
    keyed by passive-skill id. Warrior's "Battle Hardened" emits
    `{stat:'maxHealth', op:'mul', value:1.3, source:'skill:passive_battle_hardened'}`.
  - `pushPassiveSkillContributions(out, unlockedSkills)` replaces
    `pushClassPassiveContributions`.

- [x] **Learnable passive skills per class.** Each base class
  gets one tier of additional passives a player can buy with
  skill points (separate from the auto-granted starter passive).
  - Warrior: `passive_toughness` (+5% maxHealth), `passive_brutality` (+8% pAtk).
  - Mage: `passive_focus_mind` (+5% maxMana), `passive_arcane_potency` (+8% mAtk).
  - Healer: `passive_serene_mind` (+10% mpRegen), `passive_warding` (+5% mDef).
  - Ranger: `passive_keen_eye` (+5% accuracy), `passive_swift_step` (+5% runSpeed).
  - Knight: `passive_armor_training` (+10% pDef), `passive_iron_grip` (+5% pAtk).
  - Paladin: `passive_holy_aegis` (+5% maxHealth), `passive_radiant_focus` (+5% mAtk).
  - Rogue: `passive_shadow_grace` (+5% evasion), `passive_lethal_focus` (+5% critChance).
  - Each entry: regular `SkillDef` with `kind:'utility'`, `castMs:0`,
    `cooldownMs:0`, `manaCost:0`, `effects:[]`, plus a flag
    indicating it's passive (no cast trigger). Adding it to
    `player.unlockedSkills` is enough; its Contribution lights up.
  - Skill-tree gate: each class's passive entries are listed in
    `CLASS_SKILL_TREES[c].skillProgression` at appropriate levels
    so the existing learn-skill UI surfaces them.

- [x] **Breakdown rows show evaluated values.**
  - `Contribution.value` stays `number | (resolved) => number` at
    the spec level so authors can write derived contributions.
  - `computeAllStats` evaluates each function once during
    resolution and emits the resulting number on the breakdown
    entry: `breakdown[stat].parts[i] = {source, label, op, value: number}`.
  - Popup reads `.value` directly — no re-evaluation, no empty-
    map fallback.

- [x] **Sanity sweep**: `tests/statSanitySweep.spec.ts`.
  - Loop over `CharacterRace × CharacterClass × level ∈ {1, 10, 20, 40}`
    plus three loadout fixtures (`empty`, `starter sword`, `late-game set`).
  - Asserts: STR/DEX/CON/INT/WIT/MEN identical across classes when
    race + level match; derived totals positive; caps respected
    (castSpeed ≥ 0.4, runSpeed ≥ 2); Bless on top of base adds a
    measurable dmgMult bump.
  - With `VERBOSE=1`, emit a tabular printout
    `race | class | level | str | pAtk | maxHealth | dmgMult` so a
    designer can eyeball it.
- [x] **Each new learnable passive verified** via an extra
  sanity-sweep block: for every passive in
  `PASSIVE_SKILL_CONTRIBUTIONS`, build a player with + without
  that passive learned and assert the affected stat moves in
  the expected direction by the expected magnitude. Fails CI if
  a passive silently does nothing.

- [x] **Old system removal** (NO PARALLEL CODE):
  - DELETE `modifiers: {healthMultiplier?, manaMultiplier?,
    damageMultiplier?, speedMultiplier?}` from `ClassPassive` —
    data moves into `PASSIVE_SKILL_CONTRIBUTIONS`.
  - DELETE `pushClassPassiveContributions` from
    `statContributions.ts`; replaced by
    `pushPassiveSkillContributions(player.unlockedSkills)`.
  - DELETE `modifiersForClass` in `classPassives.ts`; nothing
    will read it after the cutover.
  - DELETE `CLASS_SKILL_TREES[c].baseStats` if no consumer remains.

## 40. Stats unification — Contribution registry (planned 2026-05-19)

**Why this exists.** Today, a player's stats are produced by three
unrelated code paths (`derivePlayerStats` reads RACE_PROFILES +
STAT_WEIGHTS by level; `refreshPlayerStatsFromEquipment` adds gear
bonuses; impact-time helpers like `blessDamageMultiplier` fold
buffs into damage on the fly). The Wiki Stats popup we want to
build (click P.Atk → see the full formula decomposed) is
impossible without a single point of computation.

**Design.** Every input to a stat is a *Contribution*. Race base
stats, class progression, the level curve, every equipped item,
every active status effect — they're all just rows in a single
list. `computeAllStats(contributions)` walks the list in
topological + 3-phase order (base → add → mul → optional cap)
and returns the final stat map *and* the per-stat breakdown the
popup renders. The HUD popup re-derives client-side from the
same shared registry; server and client cannot drift because
both call the same function.

**No parallel system.** Every PR in this section deletes the
old code path it replaces *in the same PR*. Carrying both
versions in parallel is forbidden — context risk is high, and
partial migrations rot fast. Each PR below ends with an
explicit deletion checklist.

### PR NN — Contribution model + computeAllStats (rip-and-replace)

This PR is the big cutover. Land in one push.

- [x] **Type:** `Contribution = {source: string; label: string;
  stat: StatId; op: 'base'|'addPre'|'mul'|'addPost';
  value: number | ((resolved: ResolvedStats) => number);
  predicate?: (ctx: StatCtx) => boolean}`.
  - `source` is a stable id (e.g. `race:orc`, `level:8`,
    `class:warrior`, `item:worn_sword:<instanceId>`,
    `effect:bless:<effectId>`, `spec:arcanist`).
  - `label` is the player-facing line in the popup.
  - **4-phase pipeline** (preserves current balance — see
    note below): `final = ((base + Σaddpre) × Πmul) + ΣaddPost`,
    then optional `cap`. The two add phases are necessary
    because the existing pAtk math has equipment added
    *after* the class damage multiplier — collapsing into
    a single add phase would change the balance of every
    weapon's scaling.
  - `value` may be a function so CON-derived health flats /
    INT-derived mAtk scaling can read already-resolved
    attributes (`(r) => (r.con - 8) * 6`).
  - `predicate` returns `false` to mark the contribution
    inactive (e.g. Rage requires HP<30%); inactive
    contributions are still emitted on `parts` for the
    popup but excluded from the sum.

- [x] **StatDef extension** in `packages/content/stats.ts`:
  - `dependsOn?: readonly StatId[]` — derived stat says
    which base attributes (or other derived stats) it
    needs computed first.
  - `cap?: (n: number, ctx: StatCtx) => number` — optional
    post-mul clamp (runSpeed cap, evasion soft-cap).
  - Stays compatible with the per-stat description /
    label fields already added in PR II.

- [x] **Registries** under `packages/content/`:
  - `RACE_BASE_STATS: Record<Race, Contribution[]>` — Orc
    contributes three rows (STR base 20, DEX base 12, INT
    base 8); other races likewise. **Race itself is not a
    contribution row — only its component stat lines are.**
  - `CLASS_LEVEL_CURVE: Record<Class, (level) => Contribution[]>`
    — warrior at level 8 contributes the +STR / +CON
    rows; mage contributes +INT / +WIT, etc.
  - `EQUIPMENT_CONTRIBUTIONS: (instance, item) => Contribution[]`
    — reads `item.stats` (pAtk, mAtk, …) and `item.equip`
    and emits one contribution per non-zero stat.
  - `STATUS_EFFECT_CONTRIBUTIONS: Record<SkillEffectType,
    {stat, op, valueFrom: 'value'|'percent'} | null>` —
    Bless emits a mul contribution; an effect with `null`
    has no stat impact (it's pure tag — invisible,
    aggroReset).
  - `SPECIALIZATION_CONTRIBUTIONS: Record<SpecId, Contribution[]>`
    — Arcanist passive emits `+10% mAtk` once unlocked.

- [x] **`buildContributions(player)`** assembles the list:
  race + class+level + equipment + statusEffects + spec /
  proficiency passives. Pure function over PlayerState.

- [x] **`computeAllStats(contributions, ctx)`**:
  1. Topological order over `StatDef.dependsOn`.
  2. For each stat, filter contributions targeting this
     stat, partition by op, evaluate predicates.
  3. Phase pipeline: `(base + Σadd) × Πmul → cap`.
  4. Return `{totals: Record<StatId, number>; breakdown:
     Record<StatId, {parts: Contribution[]; total: number}>}`
     so the popup never re-computes.

- [x] **Cache** on the player: `_statsCacheKey: string`
  derived from `(level, classId, race, raceVariant,
  sorted equippedInstanceIds, sorted active
  statusEffect ids)`. `getOrComputeStats(player)` returns
  the cached blob when the key matches, recomputes when
  it doesn't. Single cache helper used by both engine and
  any future caller.

- [x] **Engine hookup**: `player.stats` becomes the
  *cached* result of `getOrComputeStats(player).totals`.
  Combat math (`impactResolver`, damage / hit / dodge,
  HP regen) keeps reading `player.stats.xyz` exactly as
  today — no impact-pipeline changes.

- [x] **Cache invalidation sites**:
  - Level-up (playerLifecycle.ts).
  - Equip / unequip (equipHandlers.ts).
  - Effect added (`upsertStatusEffect` in
    impactResolver.ts).
  - Effect expired (`pruneExpiredStatusEffects` in
    worldMovement.ts — already touches the array;
    bump the key when the prune actually removes
    anything).
  - Specialization picked (playerIdentity.ts).
  - Hydration from DB (playerSession.ts).

- [x] **Tests**:
  - One unit test per stat verifying the formula
    (`Orc warrior, level 8, no gear, no buffs → pAtk
    = X`). Hardcoded expected numbers so regressions
    surface clearly.
  - An integration test that loads a representative
    fixture (race + class + level + equipped sword +
    Bless active) and asserts the breakdown rows
    match the expected `(label, op, value)` triplets
    in order.
  - A cache test: same player, two calls →
    identical reference; bump level → new compute.

- [x] **Old system removal** (NO PARALLEL CODE):
  - DELETE `derivePlayerStats` in
    `packages/sim/derivedStats.ts` (or wherever it
    lives now); replace every call site with
    `getOrComputeStats(player).totals`.
  - DELETE `refreshPlayerStatsFromEquipment` in
    `server/inventory/`; equip / unequip handlers
    invalidate the cache instead.
  - DELETE the RACE_PROFILES + STAT_WEIGHTS tables
    in their current location; their numbers move
    into `RACE_BASE_STATS` and `CLASS_LEVEL_CURVE`.
  - DELETE `blessDamageMultiplier` in impactResolver
    — Bless's contribution is now folded into
    `player.stats.dmgMult` directly via
    `STATUS_EFFECT_CONTRIBUTIONS`. (Impact math reads
    the cached stat; no per-cast fold.)
  - DELETE `projectPlayerStats` (the legacy
    intermediate projection) if it still exists.
  - Grep audit at end of PR: no remaining reference
    to the deleted symbols; the migration is total.

### PR OO — HUD breakdown popup (consumes PR NN)

This PR is purely UI on top of the new model.

- [x] **Popup component** `StatBreakdownPopup` rendered on
  click of any stat row in `PlayerPanel` (replaces
  today's "open wiki on click"; right-click keeps the
  wiki shortcut for power users).

- [x] **Renders** the contributions list grouped by op
  phase: `Base` rows, then `Flat bonuses`, then
  `Multipliers`, then `Cap (if any)`, then the final
  `Total`. Each row shows `label` + signed value +
  op symbol (`+`, `×`).

- [x] **Inactive contributions** (predicate failed) shown
  greyed with the reason in italics (e.g. "Rage —
  inactive (needs HP<30%)") so the player knows why
  it's not adding up.

- [x] **Client-side derivation**: popup calls
  `getOrComputeStats(playerSnapshot)` from the same
  shared module the server uses. No new protocol
  message — the breakdown is computed from the
  player blob the client already has.

- [x] **Tests**: a vitest spec that mounts the popup
  with a fixture player and asserts the rendered
  rows match the breakdown computed by
  `computeAllStats`.

- [x] **Old system removal**:
  - DELETE the `openWikiAt('stats', id)` left-click
    handler on `StatRow` in `PlayerPanel.tsx`; left
    click now opens the popup. Wiki shortcut moves
    to right-click (handled by the popup's "Open in
    Wiki" link or directly via context menu).
  - No other dead code expected — PR NN already
    cleared the old computation paths.

### Order of operations

1. Ship PR NN (full cutover; merge only when **every**
   delete-checklist item is verified by grep).
2. Ship PR OO (UI consumer; the breakdown popup is a
   pure render of what PR NN produces).

If a third PR is needed for caps / diminishing returns
(`PR PP — stat caps`), file it as a follow-up; v1 of the
Contribution model only needs the optional `cap` hook to
be in place, not full content tuning.


## 45. External audit — stale code paths & content drift (2026-05-19)

Verbatim findings from an external audit of HEAD after the §43
shipped. Each item is a real bug or stale artefact; the unchecked
boxes are the work needed to make the codebase agree with what it
claims to do. Some items overlap earlier sections (esp. §4 strict
protocol, §6 inventory migration); they're kept here as one
contiguous list so the audit doesn't fragment.

### Stale findings

- [x] **Equipment stat names split between content and engine.**
  Added `ITEM_STAT_KEY_TO_STAT_ID` alias in
  `packages/sim/statContributions.ts` so `hp` → `maxHealth`,
  `mp` → `maxMana`, `critRate` → `critChance`,
  `moveSpeed` → `runSpeed`. Unknown keys are now dropped explicitly
  instead of silently. New `tests/equipmentStatKeysResolvable.spec.ts`
  pins the invariant: every key in any item's `stats` block (and
  every set bonus's `statModifiers`) must resolve to a real
  `StatId` either directly or via the alias map.
- [x] **`deriveEquipmentStats` is a stale parallel path.** Deleted
  `packages/sim/equipmentStats.ts` and `tests/equipmentStats.spec.ts`;
  the only stat-from-equipment path is now
  `pushEquipmentContributions` in `statContributions.ts`.
- [x] **Spec descriptions trimmed to data.** Each spec passive
  description now reads as `<what the modifier does>. (planned:
  <designer intent that's not represented yet>)`. The cardinal
  KNOWN-ISSUE comment is gone — its placeholder modifier was
  replaced with `{}` + a clear "planned: heal-output multiplier"
  note so the wiki stops promising a +25% that doesn't fire. New
  `tests/specPassiveHonesty.spec.ts` enforces the invariant:
  any passive with no working modifier must carry a `(planned:
  …)` disclaimer, so future authors can't ship a quiet lie. The
  bigger task — actually extending
  `SpecializationPassiveModifiers` to cover fire flavour, heal
  output, lifesteal, per-skill cooldown reduction, party auras,
  loot rates — proceeds slice-by-slice as each mechanic lands.
  Done so far:
  - [x] `healOutputMultiplier` → new `healMult` stat consumed by
    `applyHealEffect`. Cardinal's `Greater Calling` now actually
    delivers +25% effective healing; Eva's Templar `Grace` +20%.
  - [x] `evasionBonus` → flat addPost on the existing `evasion`
    stat. Treasure Hunter `Light Step` and Phantom Ranger
    `Phantom Step` both un-planned with +5 each.
  - [x] `belowHalfHpDamageTakenMultiplier` → live-evaluated at
    damage time in `applyCastToTarget` (predicate against current
    HP, not a stale stat snapshot). Templar Knight's `Last Stand`
    delivers the +15% damage reduction below half HP its
    description always promised.
  - [x] `lifestealPercent` → caster HP restore = damage dealt ×
    pct after mitigation, capped at maxHealth. Dark Avenger's
    `Sanguine Blade` (proficiency, L40) restores 5% of every
    landed hit.
  - [x] `beneficialBuffDurationMultiplier` → scales the
    `durationMs` of beneficial status effects (bless, evasion,
    shield, invisible, etc.) at upsert time. Theurge
    `Inspiration` (spec, L20) extends every buff cast by +25%.
  - [x] `cooldownMultiplierBySkill` → per-skill cooldown shortener
    applied alongside the existing skill-upgrade multiplier.
    Eva's Templar `Aegis` (proficiency, L40) halves Divine
    Shield; Plains Walker `Shadow Step` (proficiency, L40) halves
    Vanish.
  - [x] `poisonTickMultiplier` → scales the per-tick `value` of
    `poison` effects at upsert time so `dotTicker` reads the
    amplified damage directly. Phantom Ranger `Venom` (spec, L20)
    delivers +30%; Plains Walker `Toxin` (spec, L20) +25%.
  - [x] `lootRateMultiplier` → scales every loot-table drop
    chance by the killer's spec multiplier, clamped at 1.0.
    Threaded the killer through `targetDeath → spawnLootForEnemyDeath
    → generateLoot`. Treasure Hunter `Lucky Find` (proficiency,
    L40) ships +50%.
  - [x] `damageElementMultiplier` → caster's flavour-scoped damage
    boost. Skills tagged with `damageElement` (fireball + meteor +
    inferno_aura → fire; smite → holy) get extra damage when the
    caster's spec carries a matching entry. Pyromancer Kindling
    (+20% fire) and Conflagration (+15% fire) un-planned; Phoenix
    Knight Holy Fire (+20% holy) un-planned. Spec + proficiency
    tiers stack multiplicatively.
  - [x] `rangeMultiplierBySkill` → per-skill cast-range multiplier
    applied at `validateCastRequest`. Templar Knight `Bulwark`
    (spec, L20) widens Taunt range by 50% (12m → 18m). Spec +
    proficiency tiers stack per skill.
  - [x] `resurrectionInvulnMs` → one-shot per life save. A
    killing hit on a Phoenix Knight (proficiency, L40) drops
    them to 1 HP and applies an `invuln` status effect for the
    configured ms instead of killing. `applyCastToTarget` zeroes
    all incoming damage during the window;
    `usedResurrectionThisLife` on PlayerState gates the save,
    reset by `respawnPlayer` so it's available again next life.
  - [x] `partyDamageAuraMultiplier` + `partyDamageAuraRadiusM`
    → other-player aura that boosts allied casts within radius.
    Live evaluated at `calculateDamage` via
    `world.getEntitiesInCircle`. Theurge `Patron Saint`
    (proficiency, L40) grants +5% damage to allies within 15m.
    Multiple Theurges stack multiplicatively.

  **Every `(planned: …)` disclaimer is gone.** Every spec
  passive shipped today has a working modifier in
  `SpecializationPassiveModifiers` and a runtime that consumes it.
- [x] **Active-skill effects audit fully closed.** `transform`
  was a phantom declaration: no skill emitted it (petrify uses
  `stun`). Removed from `SkillEffectType`, `EFFECT_SPECS`, and
  the audit's `UNIMPLEMENTED_EFFECT_TYPES`. `waterWeakness` and
  `knockback` shipped earlier (see below). Every declared
  effect type now has a runtime consumer.
- [x] **Knockback wired.** `applyKnockback` in
  `server/combat/impactResolver.ts` now pushes the target along
  the caster→target vector by `effect.value` world units. Cancels
  in-flight velocity, sets `dirtySnap` so the next PosSnap
  broadcasts the new position. Tests at `tests/knockback.spec.ts`
  pin the displacement math + the zero-vector no-op edge.
- [x] **WaterWeakness wired.** Added
  `SkillDamageElement` to `SkillDef`; `waterSplash` is tagged
  `damageElement: 'water'`. New
  `elementVulnerabilityMultiplier` in `impactResolver.ts`
  inspects the target's active status effects and applies
  `1 + value/100` when a `waterWeakness` (or future
  `<element>Weakness`) effect matches the cast's element. Other
  elements pass through unchanged. Tests at
  `tests/waterWeaknessAmplifier.spec.ts` pin the +30%
  amplification on a water cast and the no-amplification path
  on a non-water cast against the same weakened target.
- [x] **Projectile pierce is wired.** `projectileRuntime` now
  applies per-hit damage to each new enemy in the sweep when
  `skill.projectile.pierce` is true, appending entity ids to
  `Cast.pierceHits`. The projectile keeps Traveling until
  `pierceHits.length >= maxPierceHits` or it runs out of range.
  `applyProjectileHit` in `impactResolver.ts` calls the same
  damage / status-effect / death pipeline as a full impact and
  emits a per-hit CombatLog. Non-piercing projectiles keep the
  legacy single-hit-then-Impact path. Tests at
  `tests/combat.projectileRuntime.spec.ts` pin both paths.
- [x] **Item catalog placeholders.** `fire_resistance_potion`
  description now includes "(effect not yet implemented)" so it
  matches its placeholder siblings (`elixir_of_strength`,
  `ice_resistance_potion`, `ethereal_elixir`, `temporal_draught`,
  `teleport_scroll`). New `tests/itemPlaceholderHonesty.spec.ts`
  guards the invariant: any item with a consumable-sounding name
  (potion / elixir / draught / scroll) stored as `type='material'`
  must disclose "not yet implemented" in its description, so a
  future author can't accidentally restore a broken promise.
  Obtainability whitelist intentionally lists known no-source
  items (`gold_coin`, `ancient_tome`, etc.) — re-evaluating that
  on each pass is a follow-up wiki / content task.
- [~] **Inventory migration — single source of truth on disk.**
  Persistence layer now only writes / reads `character_inventory`;
  the legacy `inventory` jsonb column is left in the schema for
  compat but persisted as `[]` and ignored on hydrate. Mutators
  already went through `addItemsToPlayer` / `removeItemsFromPlayer`
  (which keep `player.inventory` and `player.characterInventory`
  in lockstep), so readers (vendor / craft / quest / item-use /
  client panels) continue working off the projected legacy shape
  while the aggregate is the truth. Outstanding follow-ups:
  - [x] Drop the `inventory` column entirely. Migration 011
    runs `ALTER TABLE players DROP COLUMN IF EXISTS inventory`;
    `PlayersTable` type, `PERSISTED_PLAYER_COLUMNS`, the
    persistence write-path, and the restore-compat check all
    stopped referencing it. Tests that used to seed legacy
    inventory data now build a `CharacterInventory` aggregate.
    `players.character_inventory` is the only inventory column
    on disk.
  - [~] Stop maintaining the in-memory `player.inventory` wire
    projection. Server code now reads from `characterInventory`
    everywhere (vendor, craft, quest, item use, snapshot emit);
    `player.inventory` is downgraded to a deprecated wire-shape
    mirror tagged transient on the persistence policy. Mutators
    still call `syncLegacyInventory` after every aggregate change
    so tests + the InventoryUpdate wire emitter keep observing
    the slot view. Final removal needs a real snapshot boundary
    that computes the projection on the way out — filed as a
    follow-up.
  - [ ] Migrate the protocol's `inventoryUpdateMsg` to ship the
    full aggregate (or a typed delta) instead of the flat-bag
    slot array.
- [x] **Restore-compatibility check is stale.** Extended
  `scripts/check-restored-postgres-compatibility.sql` to require
  the `accounts` table + every column added by migrations 002
  through 010: `accounts.{id,login,password_hash,password_salt,
  created_at,last_login_at,tokens_valid_after}`,
  `players.{account_id,character_inventory,quest_state,race,
  skill_levels,specialization_id}`. CI hook (running the script
  against a restored backup) is still open as a follow-up — the
  script lives alongside `scripts/test-postgres-restore.sh`
  which already wires the full restore cycle, so the next slice
  is just adding a workflow trigger.
- [x] **Server message schemas are `.strict()`.** All 22
  `.passthrough()` declarations in
  `packages/protocol/serverMessages.ts` flipped to `.strict()`.
  Full protocol + outbound-emit test surface (52 tests across 6
  files) passes; full `bun test` shows the same 31 pre-existing
  bun-suite-order flakes (verified to fail on main without this
  change too). Server now refuses to ship undocumented fields on
  the wire — adding one requires updating the schema explicitly.
- [x] **README protocol table.** Refreshed to match the live
  schemas: `PosSnap` shape corrected (per-entity, not a batch),
  full server-message list aligned with `serverMessages.ts`,
  client-message list rounded out. Added a pointer that the
  `packages/protocol/` Zod schemas are authoritative — no more
  hand-curating a parallel doc that drifts.
- [x] **PR #226 (audit events) initial typecheck failure + missing
  hooks.** Original audit-event commit failed `typecheck:server` at
  `server/auth/authAudit.ts:40` (Insertable shape) and mislabeled
  register failures as `auth.login.failure`. Also missing audits for
  successful room join, character selection, and valid-token /
  wrong-character ownership rejection. **Resolved in the merged
  version of PR #226**: typed `Pick<Insertable<ServerEventsTable>, …>`,
  added `auth.register.failure` event type, and the
  `handleJoin` try/catch now emits `character.selected` on success
  + `ownership.suspicious` (`joinClientFailed:<errorName>`) on a
  post-token-verify failure.

## 46. Roadmap refresh + Sanctity cleanup (2026-05-20)

User asked: *"refresh the roadmap, what items are stale, and what
we should add and whats left"*. An exploratory audit walked HEAD
against this file and found 16 unticked items that already shipped,
1 lingering `(planned: …)` parenthetical to close, and 1 known-
issue worth promoting from inline comment to roadmap entry.

### PR XX — Cardinal Sanctity regen aura (closes the last `(planned)` line) ✅

- [x] `partyHpRegenAuraBonus` + `partyHpRegenAuraRadiusM` added
  to `SpecializationPassiveModifiers`
  (`packages/content/specializations.ts`).
- [x] `handleResourceRegeneration` adds the aura bonus on top of
  `player.stats.hpRegen` via `partyHpRegenAuraBonusFor` walking
  every other alive player and filtering against each spec
  carrier's declared radius. Multiple Cardinals stack additively.
  Live-eval so movement toggles the bonus without a stat
  recompute (`server/players/playerLifecycle.ts:88-142`).
- [x] Cardinal `Sanctity` (proficiency, L40):
  `{ healthMultiplier: 1.05, partyHpRegenAuraBonus: 2,
  partyHpRegenAuraRadiusM: 12 }`. Description: "+5% max HP;
  nearby allies (within 12m) regen +2 HP/sec."
- [x] `tests/sanctityRegenAura.spec.ts` pins both directions:
  teammate within 12m → base + 2 HP/s; teammate beyond 12m →
  base only.

**Every spec passive now has a runtime consumer.** No more
`(planned: …)` strings in `packages/content/specializations.ts`.

### Cross-section ticks (already shipped, were unticked)

Discovered during the audit — each one corresponds to a
specific file/line that already implements the listed behaviour:

- §4 Protocol: server-message `.strict()` (above, line ~382).
- §29 PR 4: auth/session shipped (above, line ~1131).

### Movement double-step — promoted from inline KNOWN ISSUE

- [ ] `server/ai/enemyBehavior.ts:71-79` documents that
  `moveEnemyToward` integrates `velocity * dt` into position
  AND `worldMovement.advanceEnemyPosition` does it again the
  same tick — enemies effectively travel at 2× their nominal
  speed. Already tracked at §10. Fix is its own PR because it
  requires rebalancing every enemy template's `movementSpeed`
  (the comment explicitly says "balance change that belongs in
  its own PR"). Not a regression; tuning is currently built
  around the doubled speed.

### What's actually open and concrete (prioritized)

Pulled forward as the user-visible "what's left" so the next
session can pick a slice without re-auditing:

1. **Protocol versioning** (§4:383-385). `serverProtocolVersion`
   on the join response so clients can render a useful upgrade
   error rather than a silent stale-schema break.
2. **`clientSeq` + structured rejection envelopes** (§4:390-393).
   `clientTs` is currently overloaded as an ack key; explicit
   sequence IDs would let inventory/equipment/skill flows surface
   per-request rejection reasons.
3. **DTO privacy split** (§5:404-417). `OwnerPlayerSnapshot` vs
   `PublicPlayerSnapshot` vs `PlayerPresenceSnapshot` so other
   players never receive owner-only fields by accident.
4. **Buff stacking policy** (§8:519-521). Today every status
   effect upsert is "replace + refresh duration"; dispel
   categories and per-effect stack rules are unspecified.
5. **Pack aggro + disengage** (§11:605-606). Currently every
   mob aggros individually; pack pulls would land naturally
   on the existing `zoneSpawner` group infrastructure.
6. **Mini-boss leash + respawn** (§11:607-609). Bosses
   currently reuse the regular leash; they want their own
   distance and a longer respawn window.
7. **Inventory transaction audits** (§6). Vendor / craft /
   quest reward / pickup flows mutate gold + slots; an audit
   row per flow would close the dupe-detection gap.
8. **Respec / class-change policy** (§9). Today picking a spec
   is permanent; product hasn't decided respec cost vs. cooldown
   yet.
9. **Snapshot projection boundary** (carried from §45
   inventory migration). Final step to retire the in-memory
   `player.inventory` wire mirror.

### Stale items to consider deleting

- §31 "Open Visual Experiments" — held over indefinitely;
  3D model pipeline is frozen and the placeholders aren't
  worth re-listing.
- Some §28 milestone gates pre-date the pre-alpha "drop
  freely" stance and don't reflect current cadence; revisit
  when a real release schedule lands.

## 47. Player requests — bag UX (2026-05-20)

User asked, verbatim: *"i want to be able to remove items from
bag or drop them on ground and i want item name to be visible
on the ground if i point cursor to it"*.

### PR YY — Drop / discard items from inventory

- [ ] New `DropItem` client command: `{ slot: number,
  count: number }`. Server validates ownership (slot is in the
  caster's `characterInventory`), removes the requested count,
  and spawns a ground-loot entity at the player's current
  position using the existing `groundLoot` pipeline.
- [ ] Audit row per drop (ties to §6 inventory audits).
- [ ] HUD: right-click on an inventory slot → "Drop" option in
  the existing context menu (already used for "Use" / "Equip").
- [ ] Tests: ownership rejection (other player's slot), count
  capping at slot quantity, ground-loot entity appears with
  correct itemId.

### PR ZZ — Ground-loot hover label

- [ ] Cursor hover over a ground-loot entity → render the item
  name as a NameLabel above the entity (same component
  QUEST_NPCS markers already use).
- [x] Label fades in on enter, out on leave; no plumbing on the
  server — name is derived client-side from `ITEMS[item.id]`.
  (PR #259 — `SceneVfx.LootMarker` toggles `hovered` state from
  `onPointerOver` / `onPointerOut`, renders `NameLabel` from
  `ITEMS[itemId].name`.)
- [x] Stacked drops (multiple items in one pile) show the top
  item name + a "+N more" suffix. (PR #259 — `labelText`
  appends "+N more" when `loot.items.length > 1`.)

## 48. Status snapshot + reprioritization (2026-05-20)

A full audit on `main` against ROADMAP found ~25 unchecked items
that were already shipped (ticked above with file:line citations)
and several aspirational sections that no longer match the
pre-alpha cadence. This section captures the resulting picture
so the next session can pick a slice without re-auditing.

### What shipped today (2026-05-20)

- **PR #255** §47 docs — drop + ground hover label feature spec.
- **PR #256** §4 — shared protocol version + `serverProtocolVersion`
  on join responses.
- **PR #257** §8 — explicit per-effect stacking policy
  (replace/refresh/stack/reject) in `EFFECT_SPECS`; DoTs actually
  stack to 3 now.
- **PR #258** §11 — configurable `packAggroRadius` per species +
  new `packDisengage` event so packs engage and break as a unit.
- **PR #259** §47 — `DropItem` command + ground-loot hover label.
- **PR #260** §5 — `PUBLIC_PLAYER_FIELDS` allowlist DTO; strips
  ~10 owner-only fields from the public wire and makes new fields
  private by default.
- **PR #261** §4 — `clientSeq` + `CommandRejected` envelope; wired
  on `EquipItem` / `UnequipItem`.

### What's actually open (prioritized)

The "real backlog" after the audit. Ordered by impact × cost.

1. **§4 — finish the clientSeq + CommandRejected rollout.** PR #261
   wired equip only. Remaining: inventory (UseItem, CraftItem,
   DropItem, BuyFromVendor, SellToVendor), skill (LearnSkill,
   UpgradeSkill, CastReq), chat. Once every command emits the
   envelope, retire the legacy `EquipFailed`/`LearnSkillFailed`.
2. **§10:577 — enemy movement double-step.** Documented as KNOWN
   ISSUE in `server/ai/enemyBehavior.ts:71-79`. Requires removing
   one integration AND rebalancing every enemy template's
   `movementSpeed`. Own PR.
3. **§5 — finish the DTO trio.** PR #260 added
   `PublicPlayerSnapshot`. Still missing: `OwnerPlayerSnapshot`
   (today the owner sees full PlayerState; needs an explicit
   shape) and `PlayerPresenceSnapshot` for world public state.
4. **§11:607-609 — mini-boss leash + respawn + named encounter
   tracking.** Today bosses reuse the regular leash; product
   wants tighter constraints.
5. **§14 histograms — snapshot size, batch update size, DB write
   latency, join latency, reconnect latency.** Required before
   any serious load test.
6. **§13 backup/restore drill in CI.** Existing
   `scripts/check-restored-postgres-compatibility.sql` covers
   schema parity; wiring it into a scheduled CI job is the next
   slice.
7. **§9 — respec / class-change policy.** Today picking a spec is
   permanent; product hasn't decided respec cost / cooldown yet.
8. **§8:519 — dispel with categories.** Dispel exists but strips
   the same fixed set; category-aware dispel (negative / positive
   / magic / poison / bleed / stun / shield) is open.
9. **§6 — protocol shape for `inventoryUpdateMsg`.** Today it
   ships the flat-slot projection; carried as the last step of
   the §45 inventory migration. Aggregate-shaped wire DTO is open.
10. **§12 — load-test harness** (§29 PR 10). Required before
    scaling decisions. Heading off this work until the histograms
    above land so we can measure improvements.

### Deferred — do not start without explicit user direction

These sections are kept in the file as a reference but should NOT
be picked off opportunistically. They either rely on systems that
don't exist (3D art, multi-region sharding) or describe features
explicitly held over until post-release.

- §2 "Things That Should Be Redone First" — most foundational
  decisions have been answered by §45-§47 PRs. Re-visit only on
  user prompt.
- §6 — granular inventory fields (durability, sockets, enchant
  level, custom names) are content features, not missing parts of
  current inventory. Add when the relevant gameplay slice asks.
- §7 — equipment visuals; **frozen until real 3D model pipeline**
  (already noted at §37 "Held over").
- §15 — security/moderation (profanity filter, bans, secret scan,
  Docker hardening) — pre-alpha doesn't need moderation yet.
- §17 — mobile UX (safe-area, touch-target, conflict tests, a11y)
  — post-release polish sprint.
- §18 — UI polish (panel framework, tooltip, keybind config,
  minimap, chat filtering) — post-release polish sprint.
- §19 — content authoring tools / docs — post-release.
- §22 — guilds, parties, friend lists, mail — not on the near-term
  roadmap.
- §24 — audio / VFX / animation — out of scope for the visual
  prototype direction.
- §28 — milestone gates predate the pre-alpha "drop freely"
  stance; revisit when a real release cadence lands.

### Open count after this pass

- ROADMAP.md still has many `[ ]` items, but ~80% live in the
  "deferred" sections above. The "real" open backlog is the
  10-item list under "What's actually open" — that's what the
  next session should pick from.


---

# 49. Imported External Roadmap (2026-05-20)

Pasted verbatim from `~/Downloads/roadmap.md` on the user's request. The document below is the long-arc plan authored separately and reconciled into this file as a single appendix. Future PRs may tick its boxes; the **Immediate Next Action** section at the end lists the three starting tasks.

**Reconciliation notes** (this file already had overlapping sections; rules of the road):

- The "Suggested PR Sequence" in this appendix renumbers from PR 001. The repo PR history continues from #266 — treat the **001–044** labels as *relative ids within this roadmap document*, not GitHub PR numbers. When opening an actual PR, use the next GitHub number.
- This appendix's **Definition Of Done** sections are the authoritative versions; §30 "Definition of Done for Future Gameplay Slices" predates them and stays in the file for history but is **superseded** by §49 ("Definition Of Done" sub-section) for new work.
- This appendix's **Immediate Next Action** lists 3 tasks (M1 content-graph, M2 starter polish, M4 balance report). The §48 prioritized backlog enumerates 10 items in finer-grained detail. The two are **complementary**: §49's 3 items are the strategic starts; §48's 10 items are the per-PR queue. When in doubt, the §49 strategic priorities win the order; §48 items get folded into the M-milestone they belong to.

# VibeAge Roadmap

Prepared: 2026-05-20

## Project Direction

VibeAge should become a browser-first, server-authoritative fantasy MMO/RPG with a compact polished early game, Lineage-style race/class identity, boss-driven gear progression, readable world travel, and a scalable content pipeline.

The current project already has many strong systems: shared content packages, authoritative Colyseus server, React/Three client, Postgres persistence, race/class/stat systems, skill trees, quests, NPCs, zones, mobs, mini-bosses, loot, recipes, equipment, and a huge-world direction. The next phase should not be about adding more random breadth. The next phase should be about making one complete player journey excellent, then using that journey as the template for the rest of the world.

## North Star

A new player should be able to play for 30 minutes and clearly understand:

- who their race/class is;
- how to move, target, fight, and use skills;
- where to go next;
- why the world matters;
- how quests, bosses, loot, recipes, and gear connect;
- what their next goal is after the first boss;
- why they want to log in again.

## Core Product Loop

```text
Create race/class
→ enter starter village
→ learn movement/combat/first skill
→ accept first quest
→ fight starter mobs
→ return to NPC
→ follow road/map marker
→ accept named boss bounty
→ fight a readable mini-boss
→ loot trophy/recipe/materials
→ craft or equip first meaningful gear
→ learn or upgrade a skill
→ choose next zone path
```

## Non-Negotiables

- [ ] The server remains authoritative for movement, combat, loot, inventory, equipment, quests, spawning, region activation, persistence, economy-relevant state, and player identity.
- [ ] The browser client remains responsible for input, prediction/smoothing, camera, rendering, HUD, VFX, audio, and cosmetic-only atmosphere.
- [ ] No gameplay rule should live only in client code if it affects power, rewards, movement validity, combat result, or persistence.
- [ ] Content IDs must stay stable once saved, sent over the protocol, used in quests, or referenced by recipes/loot tables.
- [ ] Do not add new gameplay systems directly into large orchestration files such as `server/world.ts`, transport glue, root reducers, or scene/HUD composition files.
- [ ] Put reusable gameplay rules into `packages/content`, `packages/sim`, `packages/protocol`, or focused server/client modules.
- [ ] Every content expansion must ship with validation and at least one runtime or content-invariant test.
- [ ] Every new protocol message must include schema, TypeScript type, server handler, client handler, rejection behavior, and tests.
- [ ] Every player-facing command should have a clear success or rejection path, not silent failure.
- [ ] Every major gameplay number should have one source of truth: damage, cooldown, mana, XP, loot chance, stat scaling, item weight, equip requirement, spawn budget, travel speed, and level gate.
- [ ] Production deployment should remain boring: clean branch, passing checks, explicit deploy, health check, smoke check, rollback path.

## What Not To Do Yet

- [ ] Do not add more base races until the existing five have distinct fantasy, UI explanation, allowed classes, and early-game feel.
- [ ] Do not add more base classes until the existing seven have clear identity and balanced early skills.
- [ ] Do not add more huge zones until the starter and first midgame path are fun.
- [ ] Do not add auction house, player trading, guild banks, or PvP economy until identity, persistence, anti-abuse, and observability are stronger.
- [ ] Do not add procedural “infinite world” promises until handcrafted loops prove the game is fun.
- [ ] Do not add prophecy/lore text as a wiki-only feature; prophecies should connect to quests, zones, bosses, gear, class identity, or achievements.

---

# Milestone 0 — Roadmap Hygiene And Planning Source Of Truth

## Goal

Make this roadmap usable as an execution document rather than a wishlist.

## Tasks

- [x] Decide whether this file replaces the current `ROADMAP.md` or becomes a focused companion file such as `docs/NEXT_ROADMAP.md`. (Resolved: integrated as §49 of `ROADMAP.md`.)
- [ ] Move completed historical items out of the active roadmap into a changelog or release history document.
- [ ] Keep only active and future work in the primary roadmap.
- [ ] Group roadmap work by milestone, not by random live request order.
- [ ] Add an owner/priority/status convention for tasks if multiple agents or contributors work on the repo.
- [ ] Add a rule that every merged feature updates the roadmap, docs, tests, and any wiki panels it affects.
- [ ] Add a “Do not start” list for systems that are tempting but premature.
- [ ] Add a “Definition of Done” section for gameplay PRs.
- [ ] Add a “Definition of Done” section for infrastructure PRs.
- [ ] Add a “Definition of Done” section for content-only PRs.

## Acceptance Criteria

- [ ] The active roadmap is readable in under 10 minutes.
- [ ] Open work is clearly separated from completed history.
- [ ] Every major next PR can be traced to a milestone.
- [ ] The roadmap does not encourage adding more breadth before polishing the vertical slice.

---

# Milestone 1 — Content Graph Validator And Designer Report

## Goal

Create a single command that proves authored content is internally consistent and produces a human-readable report for balancing and debugging.

## Why This Matters

VibeAge already depends on many linked content records: races, classes, skills, passives, specializations, quests, NPCs, enemy templates, zones, mini-bosses, loot tables, recipes, gear, sets, vendors, landmarks, and travel lanes. These references should never drift silently.

## Deliverable

Add a command such as:

```bash
pnpm run content:graph
```

It should print a structured report and fail CI on broken references.

## Graph Coverage

### Race And Class Graph

- [ ] Validate every race ID is stable, non-empty, and unique.
- [ ] Validate every race has display name, description, base attributes, per-level growth, and allowed classes.
- [ ] Validate every allowed class exists in the class registry.
- [ ] Validate every class has at least one allowed race.
- [ ] Validate every class has a starter skill.
- [ ] Validate every class has exactly one auto-granted passive.
- [ ] Validate every class has at least two learnable passive skills.
- [ ] Validate every class has a clear skill progression from level 1 to at least level 8.
- [ ] Validate every class has at least one skill tagged as primary damage or primary utility.
- [ ] Validate every class has a readable player-facing description.

### Skill Graph

- [ ] Validate every `SkillId` has a matching `SkillDef`.
- [ ] Validate every active skill has at least one effect.
- [ ] Validate passive skills intentionally have no active effects and have contribution rows.
- [ ] Validate harmful skills require or define a target mode.
- [ ] Validate beneficial self skills do not accidentally require enemy targets.
- [ ] Validate every projectile skill has projectile speed and hit radius.
- [ ] Validate every skill has mana cost, cast time, cooldown, level requirement, icon, name, and description.
- [ ] Validate every skill with upgrades has valid upgrade levels and numeric modifiers.
- [ ] Validate no skill has impossible cooldown, impossible mana cost, negative duration, or missing damage/heal interpretation.
- [ ] Validate every skill referenced by class trees exists.
- [ ] Validate every skill referenced by specialization/proficiency trees exists.
- [ ] Validate every skill referenced by starter shortcuts exists.

### Specialization Graph

- [ ] Validate every specialization has a base class.
- [ ] Validate every base class has exactly two specialization options.
- [ ] Validate specialization unlock level is consistent.
- [ ] Validate proficiency unlock level is consistent.
- [ ] Validate every specialization skill exists and is gated by the correct specialization.
- [ ] Validate every proficiency skill exists and is gated by the correct specialization/proficiency tier.
- [ ] Validate every specialization passive has a readable name, description, and at least one meaningful modifier.
- [ ] Validate every modifier type used by specialization data is implemented in the engine or explicitly marked as future/unimplemented.

### Quest Graph

- [ ] Validate every quest has stable ID, name, description, NPC giver, minimum level, stages, and reward.
- [ ] Validate every quest NPC exists.
- [ ] Validate every quest reward item exists.
- [ ] Validate every kill objective references an enemy template.
- [ ] Validate every boss-kill objective references a mini-boss.
- [ ] Validate every reach objective has finite coordinates and radius.
- [ ] Validate every talk objective references an NPC.
- [ ] Validate every quest stage has a unique stage ID within that quest.
- [ ] Validate quest level requirements align with the zone/mob/boss level band.
- [ ] Validate every boss bounty rewards either a trophy, recipe, gear path, or meaningful currency/XP.
- [ ] Validate every starter quest has an obvious map marker or NPC direction.

### NPC And Vendor Graph

- [ ] Validate every NPC has ID, name, title, position, description, and greeting.
- [ ] Validate every NPC position is inside playable world bounds.
- [ ] Validate every quest-giver NPC offers at least one quest.
- [ ] Validate every vendor NPC has a matching vendor record if it exposes a browse action.
- [ ] Validate every vendor item exists.
- [ ] Validate vendor prices are positive and reasonable for expected player level.
- [ ] Validate vendor categories are displayed in wiki and HUD.

### Enemy, Zone, And Encounter Graph

- [ ] Validate every enemy template has family, display name, visual spec, and stat multipliers.
- [ ] Validate every enemy type used in a zone has a template.
- [ ] Validate every enemy type has a loot table or explicit no-loot flag.
- [ ] Validate every zone has stable ID, name, description, center, radius, level band, and mobs.
- [ ] Validate `maxLevel >= minLevel` for every zone.
- [ ] Validate spawn exclusion radius is smaller than zone radius.
- [ ] Validate every zone mob has valid min/max count.
- [ ] Validate every zone mob with pack size has a valid pack size.
- [ ] Validate every mob active phase is valid.
- [ ] Validate every mini-boss zone reference has matching mini-boss registry data.
- [ ] Validate every mini-boss has a loot table and trophy item.
- [ ] Validate every continent-scale zone uses biome encounter tables rather than huge duplicate mob lists.
- [ ] Validate every spawn point is inside or intentionally near its zone.

### Loot, Item, Recipe, Gear, And Set Graph

- [ ] Validate every item has ID, name, description, icon, type, stack behavior, and max stack when stackable.
- [ ] Validate every equippable item has kind, grade, weight, equip spec, and stat block.
- [ ] Validate every equippable item with requirements has sane requirements.
- [ ] Validate every two-hand/bow item clears or blocks off-hand correctly.
- [ ] Validate every recipe item has input items and output item.
- [ ] Validate every recipe input exists.
- [ ] Validate every recipe output exists.
- [ ] Validate every boss recipe consumes the corresponding boss trophy.
- [ ] Validate every loot table has at least one drop.
- [ ] Validate every loot table drop item exists.
- [ ] Validate every loot chance is between 0 and 1.
- [ ] Validate every quantity range is valid.
- [ ] Validate every gear set references existing item IDs.
- [ ] Validate every gear set bonus has valid stat modifiers.
- [ ] Validate gear set tiers are sorted by required piece count.

### World Feature Graph

- [ ] Validate every landmark has ID, name, kind, zone ID, position, radius, and height.
- [ ] Validate every landmark zone exists.
- [ ] Validate every landmark position is inside playable world bounds.
- [ ] Validate every travel lane has ID, name, kind, zone IDs, safe flag, width, and at least two points.
- [ ] Validate every travel lane references existing zones.
- [ ] Validate every travel lane point is inside playable world bounds.
- [ ] Validate every major zone has at least one landmark, boss, rare material, quest, or travel reason.

## Designer Report Output

- [ ] Print count of races, classes, skills, passives, specs, quests, NPCs, mobs, zones, bosses, items, recipes, loot tables, gear sets, landmarks, and travel lanes.
- [ ] Print broken references grouped by content type.
- [ ] Print unreachable content such as item never dropped/sold/rewarded/crafted.
- [ ] Print orphan bosses not used by any zone or quest.
- [ ] Print orphan quests not offered by any reachable NPC.
- [ ] Print class skill counts by level band.
- [ ] Print zone level bands and expected rewards.
- [ ] Print recipe chains for boss gear.
- [ ] Print warning when a player-facing description says an effect exists but the engine does not implement it.

## Acceptance Criteria

- [ ] `pnpm run content:graph` fails on any broken reference.
- [ ] `pnpm run check` includes the content graph command or an equivalent CI gate.
- [ ] The report is readable enough for design review.
- [ ] The report can be run locally without connecting to production.

---

# Milestone 2 — Level 1–8 Starter Vertical Slice

## Goal

Make the first 30 minutes of VibeAge feel like a real game.

## Target Experience

The player creates a character, spawns near Warden Galen, learns controls, kills goblins, returns to town, meets Mira, accepts a boss bounty, follows the map, fights Grakk, loots a trophy/recipe path, gets a meaningful gear upgrade, learns or upgrades a skill, and sees clear next steps.

## Scope

Focus only on the early path:

```text
Character creation
→ Warden Galen
→ Rats in the Cellar
→ Scout the Road / mapping step
→ Mira bounty board
→ Grakk boss fight
→ first crafted/equipped reward
→ next-zone choice
```

## Character Creation

- [ ] Make race/class choices understandable without opening a wiki.
- [ ] Show allowed classes after selecting a race.
- [ ] Show each race’s fantasy in one short line.
- [ ] Show each class’s role in one short line.
- [ ] Show visible stat tendencies without overwhelming the player.
- [ ] Show starter skill for the selected class.
- [ ] Show difficulty hint for first-time players.
- [ ] Prevent invalid race/class combinations client-side.
- [ ] Reject invalid race/class combinations server-side.
- [ ] Add a test that every valid race/class combination can create a character.
- [ ] Add a test that invalid race/class combinations are rejected.

## Spawn And Tutorial Cues

- [ ] Spawn the player facing Warden Galen or an obvious starter marker.
- [ ] Add a clear first prompt: “Talk to Warden Galen.”
- [ ] Add a movement hint for desktop.
- [ ] Add a movement hint for mobile.
- [ ] Add a targeting hint when the first goblin objective appears.
- [ ] Add a skill-use hint when combat starts.
- [ ] Add a loot pickup hint after the first kill.
- [ ] Add a return-to-NPC hint when the objective is complete.
- [ ] Ensure tutorial hints are dismissible.
- [ ] Ensure tutorial hints do not block core HUD on mobile.

## Quest Flow Polish

- [ ] Make Warden Galen’s first quest impossible to miss.
- [x] Show current quest objective in a compact tracker. (`QuestTrackerStrip` — small left-edge HUD button showing active quest + stage + objective progress. Click drops a navigation marker. Stays out of the way; only renders when there's an active quest.)
- [ ] Show quest target marker on the map.
- [x] Show distance to quest marker. (`QuestTrackerStrip` shows the resolved marker distance as a yellow chip — "<1 m", "43 m", "1.5 km". Hidden for manual stages with no marker. `formatDistance` tested at 3 input ranges.)
- [ ] Show when the current objective is complete.
- [ ] Make “Next” and “Claim” button states obvious.
- [x] Show reward preview before accepting a quest. (`NpcDialog.OfferedRow` now renders a yellow "Reward:" line with XP / gold / items resolved to display names. `formatRewardSummary` exported + tested.)
- [x] Show reward summary after claiming a quest. (`applyClaimQuestReward` emits a system `ChatBroadcast` "✓ Quest Name — 120 XP, 25g, 2× Health Potion" using the same `formatRewardSummary` helper as the pre-accept preview. Rendered in the existing chat/combat-log panel.)
- [ ] Add clear error feedback when player is too far from an NPC.
- [ ] Add clear error feedback when player is too low level for a quest.
- [ ] Add regression tests for accept, progress, advance, claim, cancel, and too-far rejection.

## First Combat Loop

- [x] Ensure every class can kill starter goblins with starter gear and starter skill. (`tests/starterBalance.spec.ts` — all 7 classes kill a L1 goblin within 40 cast cycles, using their L1 starter skill or basicAttack.)
- [ ] Ensure every class has enough mana or no-mana alternatives to complete the first quest.
- [ ] Ensure healer/paladin support skills do not make the first kill confusing.
- [ ] Ensure ranger target range and projectile behavior feel reliable.
- [ ] Ensure rogue melee range is readable.
- [ ] Ensure basic attack is always available and clearly visible.
- [ ] Add combat log lines that explain hits, misses, heals, and deaths in simple terms.
- [x] Add class-specific first-kill smoke tests. (Same file — one test per class via `it.each`-style loop over `CLASS_SKILL_TREES`.)
- [~] Add a balance test for expected time-to-kill for starter goblins. (Soft check now: 40-round cap. Hard time-to-kill SLO lands with M4 balance report.)

## Grakk Boss Encounter

- [ ] Make Grakk easy to find from the bounty quest marker.
- [ ] Give Grakk a visible nameplate and boss marker.
- [ ] Give Grakk a visible telegraphed signature ability.
- [ ] Implement Grakk’s signature ability in the engine, not only lore text.
- [ ] Add a ground telegraph VFX for the ability.
- [ ] Add combat log text when Grakk starts the ability.
- [ ] Add a reasonable cooldown so players see the mechanic but are not spammed.
- [ ] Make Grakk harder than a normal goblin but soloable for level-appropriate players.
- [ ] Ensure Grakk drops or rewards a trophy path that leads to gear/crafting.
- [ ] Add a test that killing Grakk progresses the bounty quest only when `bossId` matches.
- [ ] Add a test that Grakk’s signature ability respects player position and damage rules.

## First Gear Reward

- [ ] Make the first boss trophy feel meaningful.
- [ ] Explain whether the trophy is a quest item, crafting input, or both.
- [ ] Make the recipe/crafting path visible after the first boss kill.
- [ ] Ensure the first craftable/equippable item has obvious stat improvement.
- [ ] Ensure equipping the item visibly changes paperdoll or avatar overlay.
- [ ] Show stat delta when equipping an item.
- [ ] Add an equip success message.
- [ ] Add an equip rejection message for level/slot/hand conflicts.
- [ ] Add a test that the first boss gear recipe consumes correct inputs and outputs correct item.

## Next-Step Choice

- [ ] After Grakk, show 2–3 next goals, not an open-ended blank world.
- [ ] Offer “Pinewood / Old Greyfang” as a nearby combat path.
- [ ] Offer “Scout / mapping” as an exploration path.
- [ ] Offer “craft better gear” as a loot/crafting path.
- [ ] Use map pins and NPC dialog to guide the next path.
- [ ] Avoid overwhelming the player with every zone and every system at once.

## Acceptance Criteria

- [ ] A fresh player can complete the first quest without external instructions.
- [ ] A fresh player can find and fight Grakk without external instructions.
- [ ] A fresh player gets at least one satisfying reward within 30 minutes.
- [ ] Every starter class can complete the flow.
- [ ] Mobile player can complete the flow in browser.
- [ ] The flow is covered by unit/integration tests and at least one Playwright smoke test.

---

# Milestone 3 — Class Fantasy And Skill Identity

## Goal

Make every class readable, distinct, and fun from level 1 while preserving shared engine mechanics.

## Current Problem To Solve

Some skills are shared in ways that may weaken class fantasy. Reusing engine effects is good. Reusing the same player-facing spell names across unrelated classes is less good unless the world intentionally supports hybrid classes.

## Class Identity Targets

### Mage

- [ ] Define mage as elemental burst/AoE/control with low durability.
- [ ] Make `fireball` feel like the primary opener.
- [ ] Make water/ice/arcane progression coherent.
- [ ] Ensure mage gets a clear level 2 or 3 follow-up skill.
- [ ] Ensure mage has a visible downside: fragile, mana-hungry, or cast-time dependent.

### Warrior

- [ ] Define warrior as durable melee damage with bleed/knockback/rage options.
- [ ] Remove or reskin off-fantasy magical skills from warrior progression unless there is a lore reason.
- [ ] Make `slash` and `powerStrike` feel distinct.
- [ ] Ensure warrior has a satisfying defensive or sustain option.
- [ ] Ensure melee range and attack feedback are readable.

### Knight

- [ ] Define knight as defense, taunt, shield control, and line-holding.
- [ ] Make `taunt` useful against mobs and packs.
- [ ] Make `shieldWall` visibly reduce incoming damage.
- [ ] Give knight a clear solo path even if it kills slower.
- [ ] Ensure shield-related skills require or benefit from shield where appropriate.

### Paladin

- [ ] Define paladin as holy melee, self-sustain, shielding, and cleanse.
- [ ] Make `holyLight`, `smite`, `bless`, and `divineShield` feel connected.
- [ ] Ensure paladin does not become simply better knight or better healer.
- [ ] Add holy visual/audio feedback.
- [ ] Add at least one undead-themed advantage if it fits the world.

### Ranger

- [ ] Define ranger as bow damage, kiting, slows, traps/poison/nature utility.
- [ ] Make `arrowShot` and `volley` feel reliable at range.
- [ ] Convert generic magic-like control into ranger-flavored skills where possible.
- [ ] Ensure bow hand usage and off-hand conflicts are obvious.
- [ ] Add better projectile hit feedback and target-leading feel.

### Rogue

- [ ] Define rogue as mobility, evasion, poison, stealth, burst, and positioning.
- [ ] Make `backstab` meaningfully different from generic melee damage.
- [ ] Make `poisonBlade` readable as a damage-over-time tool.
- [ ] Make `vanish` reliably drop aggro and communicate that clearly.
- [ ] Add positioning/backstab tests if directional logic is implemented.

### Healer

- [ ] Define healer as sustain, buffs, cleanse, holy damage, and future party utility.
- [ ] Ensure healer has a solo-friendly early damage option.
- [ ] Ensure self-heal does not require awkward target handling.
- [ ] Make `bless` and `dispel` useful in real encounters.
- [ ] Prepare healer for future party play without requiring parties in the starter slice.

## Skill Data Improvements

Add richer metadata to skill definitions.

- [x] Add `role` to skills: damage, heal, tank, control, mobility, utility, passive. (`packages/content/skillTags.ts` `SkillRole`; derived via `getSkillTags()` + per-skill overrides.)
- [x] Add `school` or `flavor`: fire, water, ice, holy, shadow, physical, nature, arcane, poison. (`SkillSchool` in skillTags.ts.)
- [x] Add `scalingStat`: str, dex, con, int, wit, men, pAtk, mAtk, or hybrid. (`SkillScalingStat` in skillTags.ts.)
- [x] Add `targetMode`: self, enemy, ally, ground, direction, area-self, aura, passive. (`SkillTargetMode` in skillTags.ts.)
- [x] Add `pveUse`: single-target, pack, boss, escape, opener, finisher, sustain. (`SkillPveUse` in skillTags.ts; array per skill so a skill can be both opener + finisher.)
- [ ] Add `resourceType` if future classes need stamina/rage/focus.
- [x] Add `designerNotes` for balance intent. (Optional field on `SkillDef`.)
- [ ] Show these tags in the wiki or skill tree where useful.
- [ ] Validate these tags in `content:graph`. (Deferred: tags are derived not authored, so they always resolve. Validation becomes meaningful once authors override them; then a `tag-mismatch` rule can fail CI.)

## Skill Learning Improvements

- [ ] Add explicit skill point cost per skill instead of assuming every skill costs 1.
- [ ] Add skill upgrade cost per tier.
- [ ] Add server rejection reasons for insufficient skill upgrade points.
- [ ] Add server rejection reasons for wrong specialization.
- [ ] Add server rejection reasons for missing item/class trainer if trainer gating is added.
- [x] Add UI text explaining exactly why a skill is locked. (`SkillTreePanel` row detail now says e.g. "need Lv 7 (you're 4) · need Slash" — concrete gap + skill display name, not id. Spec-locked rows hint at the spec to pick + the L20 spec gate when below it. Tests at `tests/skillTreeRows.spec.ts`.)
- [ ] Add tests for every learn rejection reason.

## Acceptance Criteria

- [ ] Each class has a readable level 1–8 identity.
- [ ] Each class has at least one damage path and one unique fantasy hook.
- [ ] Shared engine effects are allowed, but player-facing class skills feel class-specific.
- [ ] Skill tree UI explains locked/available/learned states clearly.
- [ ] Server and client agree on skill gates.

---

# Milestone 4 — Combat Traceability And Balance Tools

## Goal

Make combat debuggable, explainable, and tunable.

## Combat Trace

Every damage/heal event should be traceable in development mode.

- [ ] Add a combat trace object for skill resolution.
- [ ] Include caster ID, target ID, skill ID, timestamp, and target type.
- [ ] Include base skill damage/heal.
- [ ] Include caster stat contribution.
- [ ] Include gear contribution.
- [ ] Include passive skill contribution.
- [ ] Include specialization contribution.
- [ ] Include set bonus contribution.
- [ ] Include active buff/debuff contribution.
- [ ] Include target defense/resistance contribution.
- [ ] Include shield/absorb contribution.
- [ ] Include crit/evasion/hit roll contribution.
- [ ] Include final damage/heal result.
- [ ] Ensure traces are safe and not broadcast publicly unless intentionally surfaced.
- [ ] Add a dev-only trace viewer or console output.
- [ ] Add tests for trace totals matching final combat result.

## Balance Report

Add a command such as:

```bash
pnpm run balance:report
```

- [x] Generate race/class stat tables at levels 1, 5, 10, 20, and 40. (`pnpm run balance:report` — `scripts/balance-report.ts`; HP/MP/dmgMult/pAtk/mAtk/pDef/mDef per class per checkpoint.)
- [x] Generate starter time-to-kill estimates for starter mobs. (Same script — sims L1 player vs L1 goblin per class via the real `resolveCastImpact` path.)
- [ ] Generate expected boss time-to-kill estimates for early bosses.
- [ ] Generate expected damage taken for early bosses.
- [ ] Generate mana sustain estimates for caster/healer classes.
- [ ] Generate movement speed comparisons.
- [ ] Generate skill cooldown/damage-per-mana/damage-per-second summaries.
- [ ] Generate gear progression stat deltas by tier.
- [ ] Generate warning when a class is far outside expected range.
- [x] Save report as text or Markdown for easy diffing. (Output is Markdown tables; redirect to a file for diffing.)

## Early Balance Targets

- [ ] Level 1 characters should kill a starter goblin quickly enough to feel capable.
- [ ] Level 1 characters should not die to one normal starter mob unless idle or badly played.
- [ ] Level 4–6 characters should be able to solo Grakk with moderate risk.
- [ ] Tank classes may kill slower but should survive more comfortably.
- [ ] Glass classes may kill faster but should care about positioning.
- [ ] Healer should complete solo content without being painfully slow.
- [ ] Ranger should feel strongest when keeping distance.
- [ ] Rogue should feel strongest when using burst/poison/evasion correctly.

## Acceptance Criteria

- [ ] Designers can inspect why a combat result happened.
- [ ] Developers can debug wrong damage without reading five modules manually.
- [ ] Balance changes can be reviewed with generated before/after numbers.
- [ ] Starter combat is covered by automated sanity checks.

---

# Milestone 5 — Prophecies / Fate System

## Goal

Add prophecies as a gameplay-connected identity/progression layer, not just lore text.

## Design Principle

A prophecy should connect at least three of these:

- race;
- class;
- specialization;
- zone;
- landmark;
- boss;
- quest;
- item;
- recipe;
- title;
- cosmetic;
- passive;
- world event.

## Data Model

- [ ] Create `packages/content/prophecies.ts`.
- [ ] Define stable `ProphecyId`.
- [ ] Define `ProphecyDef` with ID, title, description, eligibility, stages, rewards, and display metadata.
- [ ] Allow eligibility by race, class, specialization, level, completed quest, killed boss, or owned item.
- [ ] Allow stages similar to quests: talk, reach, kill, kill_boss, craft, equip, discover, manual.
- [ ] Allow prophecy rewards: title, cosmetic, item, XP, gold, passive unlock, recipe unlock, or map marker reveal.
- [ ] Add prophecy content validation.
- [ ] Add prophecy wiki tab.
- [ ] Add prophecy panel or character-sheet section.
- [ ] Add server-owned prophecy progress state.
- [ ] Persist prophecy state.
- [ ] Add protocol messages for prophecy progress updates.
- [ ] Add tests for prophecy eligibility and progress.

## Starter Prophecy Examples

- [ ] Add a human starter prophecy tied to Warden Galen, Grakk, and first gear craft.
- [ ] Add an elf starter prophecy tied to scouting, a grove landmark, and a fey/sprite encounter.
- [ ] Add a dark elf starter prophecy tied to shadow mobs, Nyaraal foreshadowing, and rogue/mage identity.
- [ ] Add an orc starter prophecy tied to warrior combat, Hammerback, and physical gear.
- [ ] Add a dwarf starter prophecy tied to crafting, Smith Alric, and gear recipes.

## Prophecy Reward Ideas

- [ ] Add titles such as `Goblin-Breaker`, `Ash-Woken`, `Pathfinder`, `Greyfang-Hunter`.
- [ ] Add cosmetic-only aura/title rewards first to avoid balance risk.
- [ ] Add minor passive rewards only after combat trace and balance report are in place.
- [ ] Add recipe unlock rewards only if recipe availability is clearly communicated.
- [ ] Add landmark reveal rewards to support exploration.

## Acceptance Criteria

- [ ] Prophecies are optional but visible.
- [ ] Prophecies never block the core starter quest path.
- [ ] Prophecies connect existing systems rather than creating disconnected lore.
- [ ] Prophecy progress is server-owned and persisted.
- [ ] Prophecies are validated by content graph checks.

---

# Milestone 6 — Quests 2.0 And Narrative Flow

## Goal

Turn quests from isolated tasks into arcs that teach systems and move players through the world.

## Quest Types To Support

- [ ] Tutorial quests.
- [ ] Bounty quests.
- [ ] Exploration quests.
- [ ] Crafting quests.
- [ ] Class-flavored quests.
- [ ] Boss chain quests.
- [ ] Prophecy-linked quests.
- [ ] Repeatable/daily quests only after abuse and economy controls are ready.

## Quest Engine Improvements

- [~] Add quest prerequisites: required level, completed quest, race, class, item, boss kill, or prophecy stage. (Partial: `QuestPrerequisites.completedQuests` shipped — server `applyAcceptQuest` rejects when a prereq quest hasn't been completed. Race/class/item/boss-kill/prophecy gates open until a boss-kill registry + race/class predicates land in their own slices. Content-graph validator catches unknown prereq quest ids.)
- [ ] Add quest follow-up relationships.
- [ ] Add quest chain grouping.
- [ ] Add quest categories for UI filtering.
- [ ] Add quest abandon/cancel rules.
- [ ] Add quest reward preview calculation.
- [ ] Add deterministic server-side reward granting.
- [ ] Add clear rejection messages for invalid quest actions.
- [ ] Add quest progress persistence tests.
- [ ] Add reconnect tests for active quest state.

## Starter Quest Chain

- [ ] Polish `Rats in the Cellar` as the first combat quest.
- [ ] Polish `Scout the Road` or equivalent as the first movement/exploration quest.
- [ ] Polish `Bounty: Grakk` as the first boss quest.
- [ ] Add a first crafting/equipment quest after Grakk.
- [ ] Add a choice quest that points to Old Greyfang, Hammerback, or mapping path.
- [ ] Add NPC dialog that explains why the player should care.
- [ ] Add map pins for every non-obvious step.
- [ ] Add quest completion celebration that is not intrusive.

## Midgame Quest Chain Direction

- [ ] Build a Wildlands chain around goblins, wolves, trolls, and first boss gear set.
- [ ] Build a Ruins chain around Mistwalker, Vereth, undead, and holy/shadow mechanics.
- [ ] Build a Peaks chain around Vorthax, fire resistance, and Elementborn gear.
- [ ] Build a Silverwood chain around Elder Vinebrook, bow/nature gear, and pathfinding.
- [ ] Build a Wetland chain around Cthulun, abyssal materials, and higher-tier rewards.
- [ ] Build a Chronoglass chain around Aethariel, time effects, and endgame foreshadowing.

## Acceptance Criteria

- [ ] A player always has 1–3 sensible next objectives.
- [ ] Quest arcs introduce systems gradually.
- [ ] Quest rewards connect to gear, skills, world travel, or character identity.
- [ ] Quest content validates against the content graph.

---

# Milestone 7 — Mobs, AI, Packs, And Boss Mechanics

## Goal

Make enemies memorable through behavior, not only names and stat multipliers.

## Normal Mob Behavior

### Goblins

- [ ] Add simple call-for-help behavior within a small radius.
- [ ] Add weak ranged or thrown-stone variant if needed.
- [ ] Add cowardly flee behavior at low HP for some goblins.
- [ ] Teach pack awareness through goblin camps.

### Wolves

- [ ] Improve pack aggro and shared target behavior.
- [ ] Add short lunge attack with cooldown.
- [ ] Add stronger night behavior only if communicated.
- [ ] Use wolves to teach kiting and positioning.

### Skeletons / Undead

- [ ] Make undead more common at night or in ruins.
- [ ] Add slow but steady behavior.
- [ ] Add holy vulnerability only if resistance system exists.
- [ ] Use undead to make paladin/healer fantasy matter.

### Trolls

- [ ] Add slow heavy attack with visible wind-up.
- [ ] Add knockback or stun on slam.
- [ ] Make trolls durable but avoid unfair speed.
- [ ] Use trolls to teach telegraph dodging.

### Wraiths / Spirits

- [ ] Add phase/fade behavior or intermittent target drop.
- [ ] Make glow/visual identity clear.
- [ ] Avoid invisible unfair hits.
- [ ] Use spirits to teach dispel/cleanse or magic defense later.

### Elementals / Golems

- [ ] Add element-themed attacks.
- [ ] Add resistance/vulnerability only after combat trace is ready.
- [ ] Make golems slow and hard-hitting.
- [ ] Make elementals more mobile or ranged.

### Treants / Plants

- [ ] Add root/snare behavior.
- [ ] Add slow movement and large hitbox.
- [ ] Use treants to teach movement skills and ranged advantage.

### Drakes / Dragons

- [ ] Add cone breath telegraph.
- [ ] Add burn damage-over-time.
- [ ] Use drakes as first serious environmental threat.

## Boss Engine

- [ ] Implement shared boss ability scheduler.
- [ ] Support wind-up, telegraph, resolve, cooldown, and cancellation/death cleanup.
- [ ] Support circle telegraphs.
- [ ] Support cone telegraphs.
- [ ] Support line telegraphs.
- [ ] Support self-centered AoE telegraphs.
- [ ] Support targeted player markers.
- [ ] Support add-spawn mechanics later.
- [ ] Support phase changes at HP thresholds.
- [ ] Support enrage after time threshold.
- [ ] Send safe boss mechanic events to clients for VFX.
- [ ] Keep damage resolution server-authoritative.

## Early Boss Priority

- [ ] Implement Grakk: Warband Howl or camp rally mechanic.
- [ ] Implement Old Greyfang: Hamstring Lunge / pack elder mechanic.
- [ ] Implement Hammerback: Stone Slam / ground pound mechanic.
- [ ] Implement Mistwalker: Veil Step / reposition mechanic.
- [ ] Implement Vereth: Marrow Tithe / undead drain mechanic.
- [ ] Implement Vorthax: Cinder Breath / cone fire mechanic.

## Acceptance Criteria

- [ ] At least three early bosses have real mechanics, not just text.
- [ ] Boss mechanics are visible and avoidable or counterable.
- [ ] Boss mechanics are tested at the engine level.
- [ ] Normal mobs have at least one behavior difference by family.
- [ ] AI remains budgeted and does not create huge per-tick cost.

---

# Milestone 8 — Gear, Crafting, Loot, And Economy Spine

## Goal

Make boss trophies, recipes, materials, crafted gear, equipment stats, and set bonuses the main PvE chase.

## Gear Progression Bands

- [ ] Define gear tier bands for levels 1–8, 5–10, 9–14, 12–18, 18–25, 25–40, and 40+.
- [ ] Assign each tier a target pAtk/mAtk/pDef/mDef/HP/MP/stat budget.
- [ ] Add gear budget validation to content graph or balance report.
- [ ] Avoid large stat jumps that invalidate previous content too quickly.
- [ ] Make every tier have at least one physical, magical, defensive, and utility path.

## Boss Trophy Loop

- [ ] Ensure every mini-boss has a guaranteed trophy.
- [ ] Ensure every trophy has at least one use: quest turn-in, recipe input, vendor sale, prophecy, title, or craft.
- [ ] Ensure every boss recipe consumes the boss trophy.
- [ ] Ensure every boss recipe is discoverable through wiki, NPC, or loot UI.
- [ ] Add item tooltip text explaining recipe sources and uses.
- [ ] Add item tooltip text explaining which boss dropped a trophy.

## Crafting UX

- [ ] Show craftable recipes in a Craft panel.
- [ ] Show missing ingredients clearly.
- [ ] Show source hints for missing ingredients.
- [ ] Show output item stats before crafting.
- [ ] Show output item equip requirements before crafting.
- [ ] Prevent crafting if inventory weight/slot constraints would fail.
- [ ] Make crafting server-authoritative and atomic.
- [ ] Add crafting rejection messages.
- [ ] Add recipe tests for all boss gear.

## Loot UX

- [ ] Show loot drops clearly without blocking combat.
- [ ] Show rare drops with stronger feedback.
- [ ] Show trophy/recipe drops distinctly.
- [ ] Show auto-pickup or pickup button behavior consistently on mobile.
- [ ] Add loot log entries.
- [ ] Add loot table expected-value report.
- [ ] Add warning for unreachable item drops.

## Equipment UX

- [ ] Show stat delta before equipping.
- [ ] Show why an item cannot be equipped.
- [ ] Show multi-slot conflicts clearly.
- [ ] Show current set bonus progress.
- [ ] Show active set bonuses in paperdoll or tooltip.
- [ ] Show avatar visual changes for common gear categories.
- [ ] Broadcast safe public equipment DTOs for other players when ready.
- [ ] Never broadcast private inventory or full item instance data to other players.

## Economy Guardrails

- [ ] Keep gold rewards conservative until sinks exist.
- [ ] Add basic gold sinks: potions, repairs, recipes, travel, crafting fees, cosmetics.
- [ ] Track gold generated per hour in balance report.
- [ ] Track item drop expected value by level band.
- [ ] Avoid repeatable gold farms until anti-abuse and observability exist.
- [ ] Add vendor buy/sell tests.
- [ ] Add inventory full/weight full tests around reward grants.

## Acceptance Criteria

- [ ] First boss gear path is understandable and satisfying.
- [ ] Every boss trophy has a purpose.
- [ ] Crafting is server-authoritative, atomic, and tested.
- [ ] Gear progression can be reviewed through generated reports.

---

# Milestone 9 — World, Locations, Travel, And Exploration

## Goal

Make the large world feel meaningful, navigable, and alive without exploding server tick cost.

## Location Design Rule

Every major place should have at least one gameplay reason to exist:

- boss;
- rare material;
- quest arc;
- prophecy stage;
- class/spec trainer;
- vendor;
- crafting station;
- landmark discovery reward;
- travel shortcut;
- safe hub;
- dangerous high-value route;
- unique mob behavior.

## Starter Region Polish

- [ ] Make the starter village visually recognizable.
- [ ] Make Warden Galen and nearby NPCs visually obvious.
- [ ] Add signs, paths, or environmental cues from spawn to goblin camp.
- [ ] Add visible camp identity for goblins.
- [ ] Add visible wolf area identity.
- [ ] Add visible grave/barrow identity for skeletons.
- [ ] Add at least one landmark visible from spawn.
- [ ] Ensure map and 3D world agree on landmarks and pins.
- [ ] Ensure mobile players can follow pins without constant map opening.

## Travel Lanes

- [ ] Make roads visually distinct from normal terrain.
- [ ] Make safe roads reduce encounter risk or at least communicate safety.
- [ ] Add roadside landmarks at long intervals.
- [ ] Add distance/travel-time estimates that feel accurate.
- [ ] Add map labels for major roads, rivers, and passes.
- [ ] Consider movement speed bonus on roads only if server-authoritative.
- [ ] Add tests for travel lane content references.

## Landmark Discovery

- [ ] Add discovery state for major landmarks.
- [ ] Persist discovered landmarks per character.
- [ ] Show discovery toast when a player reaches a landmark.
- [ ] Grant small XP/title/cosmetic rewards for major discoveries.
- [ ] Link landmarks to quests and prophecies.
- [ ] Show discovered landmarks in map/wiki.
- [ ] Add tests for discovery radius and persistence.

## Huge Zone Rules

- [ ] Keep continent-scale zones cheap when inactive.
- [ ] Keep spawn budgets bounded regardless of configured zone size.
- [ ] Use biome encounter tables for large regions.
- [ ] Use activation policy based on server budget, population pressure, and frontier rules.
- [ ] Avoid per-tick AI for inactive zones.
- [ ] Avoid broadcasting entities outside client visibility.
- [ ] Track active regions and entity counts as metrics.

## Acceptance Criteria

- [ ] Players understand where to go in the starter region.
- [ ] Roads and landmarks help navigation.
- [ ] Large zones have gameplay reasons to exist.
- [ ] Huge-world content remains budgeted and testable.

---

# Milestone 10 — Mobile And Browser UX

## Goal

Make VibeAge genuinely playable in a mobile browser, not merely viewable.

## Mobile Controls

- [ ] Ensure tap-to-move is reliable on terrain.
- [ ] Ensure camera drag works from terrain and sky.
- [ ] Ensure pinch zoom works on world canvas.
- [ ] Ensure map pinch zoom works.
- [ ] Ensure combat skill buttons are thumb-sized.
- [ ] Ensure target selection is clear on touch.
- [ ] Ensure loot pickup is touch-friendly.
- [ ] Ensure NPC interaction is touch-friendly.
- [ ] Ensure quest panel is readable on small screens.
- [ ] Ensure paperdoll/bag/craft panels fit viewport.
- [ ] Ensure Android navigation bar does not hide core controls.
- [ ] Ensure iOS safe area does not hide core controls.

## HUD Priorities

- [ ] Define a mobile HUD hierarchy: vitals, target, skill bar, quest tracker, map button, inventory, chat.
- [ ] Keep optional panels hidden until needed.
- [ ] Avoid too many draggable overlapping windows on mobile.
- [ ] Add a one-tap “current objective” focus action.
- [ ] Add a one-tap “attack target” action if targeting remains awkward.
- [ ] Add a one-tap “loot nearby” action if pickup is awkward.
- [ ] Add a compact combat feedback mode.

## Desktop UX

- [ ] Preserve keyboard shortcuts.
- [ ] Improve skill shortcut assignment feedback.
- [ ] Add optional keybind help panel.
- [ ] Add panel layout reset.
- [ ] Add better hover tooltips for stats, skills, and gear.

## Accessibility And Readability

- [ ] Add readable contrast for skill cooldowns.
- [ ] Add scalable UI text options.
- [ ] Add color-independent status indicators where possible.
- [ ] Add motion-reduction option for heavy VFX if needed.
- [ ] Avoid tiny map markers on mobile.

## Acceptance Criteria

- [ ] The starter vertical slice is completable on mobile browser.
- [ ] Core panels are usable on small screens.
- [ ] Mobile combat does not require keyboard-like precision.
- [ ] Playwright or equivalent coverage protects the mobile viewport.

---

# Milestone 11 — Protocol, DTO Boundary, And Player Privacy

## Goal

Keep the network boundary strict, minimal, and safe as content systems grow.

## Protocol Discipline

- [ ] Keep schemas strict unless a field is explicitly versioned.
- [ ] Keep TypeScript message types and schemas from drifting.
- [ ] Add request/client sequence IDs to commands that need user feedback.
- [ ] Standardize rejection envelopes for quest, craft, vendor, inventory, skill, class, race, prophecy, and admin commands.
- [ ] Stop using timestamps as implicit acknowledgement keys.
- [ ] Add message-size budget tests for initial snapshot, region update, inventory update, equipment update, quest update, and chat.
- [ ] Add protocol fixtures for old-client compatibility if public clients are expected.
- [ ] Generate protocol docs from schemas when practical.

## DTO Boundary

- [ ] Define explicit owner-player snapshot DTO.
- [ ] Define explicit public-player snapshot DTO.
- [ ] Define explicit equipment public DTO.
- [ ] Define explicit quest owner DTO.
- [ ] Define explicit prophecy owner DTO.
- [ ] Define explicit inventory owner DTO.
- [ ] Avoid object spreading from internal runtime state across network boundary.
- [ ] Add exact-key allow-list tests for owner snapshots.
- [ ] Add exact-key allow-list tests for public snapshots.
- [ ] Add regression tests that private fields never leak through public updates.

## Acceptance Criteria

- [ ] Public broadcasts never include owner-only state.
- [ ] Every client command has validation and rejection behavior.
- [ ] Snapshot sizes are known and budgeted.
- [ ] New content systems do not increase privacy risk.

---

# Milestone 12 — Persistence, Accounts, Characters, And Recovery

## Goal

Make character state durable, reconnect-safe, and migration-safe.

## Character Persistence

- [ ] Persist race, class, level, XP, position, health, mana, skills, shortcuts, specialization, inventory, equipment, quest state, prophecy state, discovered landmarks, and relevant cooldown state as needed.
- [ ] Ensure inventory/equipment persistence uses item instances and locations, not only legacy flat bag DTOs.
- [ ] Add migration compatibility checks for every schema change.
- [ ] Add restore-from-backup compatibility test for character state.
- [ ] Add reconnect test that restores the correct character with correct owner-only data.
- [ ] Add test for reconnect during active quest.
- [ ] Add test for reconnect after equipment changes.
- [ ] Add test for reconnect after crafted item creation.

## Account And Character Management

- [ ] Add character rename policy.
- [ ] Add account deletion flow if persistent accounts are public.
- [ ] Add character deletion safeguards.
- [ ] Add device/session listing if long-lived accounts are supported.
- [ ] Add ban/mute support for accounts and characters.
- [ ] Add signed guest sessions if unauthenticated play is desired.
- [ ] Add refresh-token or session renewal policy if public login remains long-lived.

## Audit Events

- [ ] Audit login.
- [ ] Audit logout.
- [ ] Audit character creation.
- [ ] Audit character selection.
- [ ] Audit character deletion.
- [ ] Audit account deletion.
- [ ] Audit suspicious ownership attempts.
- [ ] Audit GM/admin commands.
- [ ] Audit item grants if admin item tools exist.

## Acceptance Criteria

- [ ] Character progress survives reconnect and restart.
- [ ] Schema changes are migration-tested.
- [ ] Ownership rules are enforced server-side.
- [ ] Sensitive account actions are auditable.

---

# Milestone 13 — Server Scale, Load Tests, And Observability

## Goal

Know what the server can handle before increasing public ambition.

## Load And Soak Tests

- [ ] Add simulated Colyseus clients.
- [ ] Simulate join/reconnect churn.
- [ ] Simulate movement intents.
- [ ] Simulate combat casts.
- [ ] Simulate loot pickup.
- [ ] Simulate inventory/equipment actions.
- [ ] Simulate quest accept/advance/claim.
- [ ] Simulate region transitions.
- [ ] Simulate chat traffic.
- [ ] Simulate mobile-like slower clients.
- [ ] Run a 10-minute local soak test.
- [ ] Run a 1-hour staging/prod-like soak test before major public pushes.

## Metrics To Track

- [ ] Connected clients.
- [ ] Active players.
- [ ] Active zones.
- [ ] Active regions.
- [ ] Active enemies.
- [ ] Enemy AI tick time.
- [ ] Movement tick time.
- [ ] Combat tick time.
- [ ] Persistence write count and latency.
- [ ] Outbound messages per second.
- [ ] Average and p95 snapshot size.
- [ ] Memory usage.
- [ ] CPU usage.
- [ ] Error/rejection counts by command type.
- [ ] Rate limit hits by command type.

## Sharding/Room Strategy

- [ ] Measure whether one world room can support current goals.
- [ ] Define thresholds that trigger sharding exploration.
- [ ] Keep protocol stable before splitting zones across rooms.
- [ ] Decide how chat, party, inventory, and persistence behave across rooms.
- [ ] Avoid premature sharding until load test data proves it is needed.

## Production Observability

- [ ] Add structured runtime metrics endpoint or logs.
- [ ] Add external uptime checks.
- [ ] Add alert thresholds for server down, high CPU, high memory, high error rate, and failed health check.
- [ ] Add deployment smoke test that joins world and verifies basic state.
- [ ] Add log redaction for sensitive data.
- [ ] Add dashboard or compact status report.

## Acceptance Criteria

- [ ] There is a known client-count baseline.
- [ ] There is a known message-size baseline.
- [ ] Server tick cost is measured before and after large systems.
- [ ] Production issues can be diagnosed without guessing.

---

# Milestone 14 — Wiki, Docs, And In-Game Explainability

## Goal

Make VibeAge self-explaining through in-game UI and generated docs.

## Wiki Coverage

- [ ] Wiki page for races.
- [ ] Wiki page for classes.
- [ ] Wiki page for class skill trees.
- [ ] Wiki page for specializations.
- [ ] Wiki page for skills with tags, costs, cooldowns, target modes, and effects.
- [ ] Wiki page for quests.
- [ ] Wiki page for NPCs.
- [ ] Wiki page for mobs.
- [ ] Wiki page for bosses and boss mechanics.
- [ ] Wiki page for loot tables or drop sources.
- [ ] Wiki page for recipes.
- [ ] Wiki page for gear and set bonuses.
- [ ] Wiki page for zones.
- [ ] Wiki page for landmarks and travel lanes.
- [ ] Wiki page for prophecies once implemented.

## Generated Docs

- [ ] Generate skill reference from content data.
- [ ] Generate item reference from content data.
- [ ] Generate quest reference from content data.
- [ ] Generate boss reference from mini-boss data.
- [ ] Generate recipe reference from recipe data.
- [ ] Generate stat/balance report from simulation data.
- [ ] Avoid hand-written docs that can drift from content.

## In-Game Explanation

- [ ] Add stat breakdown popups for major derived stats.
- [ ] Add skill tooltips with why locked/available/learned.
- [ ] Add item tooltips with source and use.
- [ ] Add quest reward previews.
- [ ] Add map pin explanations.
- [ ] Add boss mechanic hints in bounty text or combat log.
- [ ] Add class role explanation in creation and character panel.

## Acceptance Criteria

- [ ] A player can understand core systems without reading source code.
- [ ] Wiki data comes from the same source as runtime data.
- [ ] Docs are updated automatically or checked in CI where possible.

---

# Milestone 15 — Audio, VFX, And Game Feel

## Goal

Make actions feel responsive and the world feel alive without compromising browser performance.

## Combat Feel

- [ ] Add hit flashes for damage.
- [ ] Add heal visuals.
- [ ] Add shield absorb visuals.
- [ ] Add status effect icons above entities or in target frame.
- [ ] Add projectile trails.
- [ ] Add impact effects by element/flavor.
- [ ] Add boss telegraph visuals.
- [ ] Add cooldown ready feedback.
- [ ] Add critical hit feedback.
- [ ] Add death/loot feedback.

## Audio

- [ ] Add basic UI sounds with mute option.
- [ ] Add skill cast sounds by school/flavor.
- [ ] Add hit/impact sounds.
- [ ] Add quest accept/complete sounds.
- [ ] Add boss warning sound.
- [ ] Add ambient biome loops carefully.
- [ ] Add volume settings.

## World Feel

- [ ] Improve starter village props.
- [ ] Add campfire/torch effects near NPCs.
- [ ] Add biome-specific ambient VFX.
- [ ] Add water/river visual pass if rivers matter.
- [ ] Add simple creature idle animations.
- [ ] Add NPC idle indicators.
- [ ] Keep performance budgets visible.

## Acceptance Criteria

- [ ] Core actions have readable feedback.
- [ ] Boss mechanics are visible before they hit.
- [ ] VFX/audio can be disabled or reduced if needed.
- [ ] Performance remains acceptable on mobile browser.

---

# Milestone 16 — Social And Multiplayer Layer

## Goal

Add social systems only after the solo starter loop and server safety are solid.

## Chat Improvements

- [ ] Keep near/all chat rate-limited.
- [ ] Add mute/ignore support.
- [ ] Add moderation/admin visibility if public.
- [ ] Add chat command help.
- [ ] Add safe server rejection for oversized/invalid chat.

## Party System

- [ ] Add party invite/accept/decline protocol.
- [ ] Add party membership state.
- [ ] Add party HUD.
- [ ] Add party chat.
- [ ] Add party XP/loot rules.
- [ ] Add party aura mechanics only after party state exists.
- [ ] Add tests for invite, leave, disconnect, reconnect.

## Trading And Economy Safety

- [ ] Do not add direct trading until item instance persistence and audit logs are strong.
- [ ] Design trade as atomic two-party transaction.
- [ ] Add trade logs.
- [ ] Add trade cancellation rules.
- [ ] Add tests for disconnect during trade.
- [ ] Add tests for duplicate item prevention.

## Guilds / Clans

- [ ] Defer guilds until party and account management are stable.
- [ ] Define guild creation cost and ownership rules.
- [ ] Add guild chat only after moderation tools exist.

## Acceptance Criteria

- [ ] Social features do not compromise item/account safety.
- [ ] Multiplayer systems have clear disconnect/reconnect behavior.
- [ ] Public abuse controls exist before public scale.

---

# Suggested PR Sequence

## Foundation PRs

- [ ] PR 001 — Replace/clean roadmap and move historical completed work to changelog.
- [ ] PR 002 — Add `content:graph` command and basic graph report.
- [ ] PR 003 — Add race/class/skill/spec graph checks.
- [ ] PR 004 — Add quest/NPC/boss/loot/recipe graph checks.
- [ ] PR 005 — Add balance report command with race/class level table.

## Starter Slice PRs

- [ ] PR 006 — Character creation explanation and race/class validity tests.
- [ ] PR 007 — Starter tutorial hints and quest tracker polish.
- [~] PR 008 — Warden Galen first quest UX and map marker polish. (Partial: tracker strip shipped this PR. First-quest content polish + spawn-near-Galen direction is a follow-up.)
- [ ] PR 009 — Starter combat balance tests for every class.
- [ ] PR 010 — Mira bounty board and Grakk path polish.
- [ ] PR 011 — Grakk real boss mechanic with telegraph.
- [ ] PR 012 — First trophy/recipe/craft/equip reward polish.
- [ ] PR 013 — Playwright starter vertical slice smoke test.

## Combat/Class PRs

- [ ] PR 014 — Add skill tags: role, school, scaling, target mode, PvE use.
- [x] PR 015 — Skill tree lock/rejection UI improvement. (Shipped — see M3 "Add UI text" tick above.)
- [ ] PR 016 — Combat trace object and dev output.
- [ ] PR 017 — Mage/warrior/knight early skill fantasy cleanup.
- [ ] PR 018 — Paladin/ranger/rogue/healer early skill fantasy cleanup.
- [ ] PR 019 — Skill upgrade cost and upgrade UI.

## Boss/Mob PRs

- [ ] PR 020 — Shared boss mechanic scheduler.
- [ ] PR 021 — Old Greyfang boss mechanic.
- [ ] PR 022 — Hammerback boss mechanic.
- [ ] PR 023 — Normal mob family behavior pass.
- [ ] PR 024 — Boss mechanics wiki and VFX pass.

## Prophecy/Quest PRs

- [ ] PR 025 — Prophecy content model and validation.
- [ ] PR 026 — Server-owned prophecy progress and persistence.
- [ ] PR 027 — Prophecy UI/wiki tab.
- [ ] PR 028 — Starter race prophecies.
- [~] PR 029 — Quest prerequisite/follow-up system. (Partial — see Quest Engine Improvements above.)

## Gear/Economy PRs

- [ ] PR 030 — Gear tier budget report.
- [ ] PR 031 — Crafting UI missing-source hints.
- [ ] PR 032 — Item tooltip source/use improvements.
- [ ] PR 033 — Set bonus display and stat delta polish.
- [ ] PR 034 — Gold/item economy report.

## World/UX PRs

- [ ] PR 035 — Starter village visual/navigation pass.
- [ ] PR 036 — Landmark discovery state and reward.
- [ ] PR 037 — Travel lane visual/map pass.
- [ ] PR 038 — Mobile HUD objective/action polish.
- [ ] PR 039 — Mobile Playwright viewport coverage.

## Scale/Production PRs

- [ ] PR 040 — Simulated Colyseus clients load test.
- [ ] PR 041 — Snapshot/message-size metrics.
- [ ] PR 042 — Tick-cost metrics and report.
- [ ] PR 043 — Production observability and alert thresholds.
- [ ] PR 044 — Reconnect/persistence test expansion.

---

# Definition Of Done

## Gameplay Feature PR

- [ ] Feature is server-authoritative if it affects gameplay, rewards, combat, movement, inventory, or persistence.
- [ ] Content definitions live in `packages/content` where appropriate.
- [ ] Simulation math lives in `packages/sim` where appropriate.
- [ ] Protocol messages are schema-validated.
- [ ] Client shows success and failure states.
- [ ] Feature has unit tests.
- [ ] Feature has integration tests if it crosses server/client/persistence boundaries.
- [ ] Wiki/docs are updated or generated.
- [ ] `pnpm run check` passes before merge.

## Content PR

- [ ] Content IDs are stable and unique.
- [ ] Content references validate through `content:graph` or equivalent.
- [ ] Content has player-facing names/descriptions.
- [ ] Content has runtime behavior or is clearly marked as future/unimplemented.
- [ ] Content appears in wiki or relevant UI.
- [ ] Content is covered by content validation tests.
- [ ] Balance impact is reviewed.

## Protocol PR

- [ ] Shared schema added or updated.
- [ ] TypeScript type added or updated.
- [ ] Server handler added or updated.
- [ ] Client handler added or updated.
- [ ] Rejection/error behavior defined.
- [ ] Unknown field and invalid payload tests added.
- [ ] Snapshot/message-size impact reviewed.

## Persistence PR

- [ ] Migration added if schema changes.
- [ ] Repository mapping updated.
- [ ] Restore compatibility checked.
- [ ] Reconnect behavior tested.
- [ ] Backward compatibility considered for existing saves.
- [ ] Owner/public DTO privacy reviewed.

## Client UI PR

- [ ] Desktop usable.
- [ ] Mobile usable.
- [ ] Safe-area and viewport behavior checked.
- [ ] Keyboard/mouse behavior checked where relevant.
- [ ] Touch behavior checked where relevant.
- [ ] No gameplay authority moved to client.
- [ ] UI failure states are visible.

---

# Key Metrics To Track

## Player Experience Metrics

- [ ] Time from character creation to first movement.
- [ ] Time from spawn to accepting first quest.
- [ ] Time to first kill.
- [ ] Time to first quest completion.
- [ ] Time to first boss encounter.
- [ ] Time to first gear upgrade.
- [ ] Starter quest completion rate.
- [ ] Deaths during starter slice.
- [ ] Mobile starter completion rate.

## Combat Metrics

- [ ] Time-to-kill by class and level.
- [ ] Damage taken by class and level.
- [ ] Mana spent per kill.
- [ ] Potion usage per encounter.
- [ ] Skill usage frequency.
- [ ] Miss/evasion/crit rate.
- [ ] Boss mechanic hit/dodge rate.

## Server Metrics

- [ ] Connected clients.
- [ ] Region visibility counts.
- [ ] Active enemy count.
- [ ] Active zone count.
- [ ] Tick time by subsystem.
- [ ] Outbound messages per second.
- [ ] Snapshot size average and p95.
- [ ] Rate-limit hits.
- [ ] Persistence latency.
- [ ] Error/rejection counts.

## Economy Metrics

- [ ] Gold generated per hour.
- [ ] Gold spent per hour.
- [ ] Item drops per hour.
- [ ] Rare recipe drop rate.
- [ ] Crafted items per level band.
- [ ] Vendor purchases and sales.
- [ ] Inventory full events.
- [ ] Weight limit events.

---

# Future Features To Defer Until Core Loop Is Strong

- [ ] Auction house.
- [ ] Direct player trading.
- [ ] PvP.
- [ ] Guilds/clans.
- [ ] Large-scale raids.
- [ ] Mounts.
- [ ] Housing.
- [ ] Complex professions.
- [ ] Dynamic player economy.
- [ ] Procedural infinite world.
- [ ] Multiple shards/rooms unless load data requires it.
- [ ] Full party-required healer/tank content.
- [ ] Advanced AI factions.

---

# Immediate Next Action

Start with these three tasks:

- [ ] Add `content:graph` and make content drift impossible.
- [ ] Polish the level 1–8 Warden Galen → Mira → Grakk → first gear loop.
- [ ] Add combat/balance reporting so class and gear changes are based on numbers, not guesses.

Once those are complete, the project will have a reliable foundation for expanding prophecies, deeper class identity, richer bosses, and larger world content without becoming unmaintainable.
