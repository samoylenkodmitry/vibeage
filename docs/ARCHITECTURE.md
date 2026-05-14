# Architecture

VibeAge is a browser multiplayer RPG prototype. The live architecture is a Vite React client, a Colyseus authoritative server, shared protocol/content/simulation packages, and Postgres persistence behind a local VPS deployment flow.

Production pulls `origin/main` on the VPS through local scripts. GitHub-hosted SSH deployment is intentionally disabled.

## Runtime Shape

- Browser client: `apps/client/src`, built by `apps/client/vite.config.ts`.
- Server entry point: `apps/server/src/main.ts`, which calls `server/server.ts`.
- Room transport: `server/transport/vibeAgeRoom.ts` defines the Colyseus `world` room.
- Authoritative world: `server/world.ts` creates state, loops, regions, persistence, and the public world API.
- Shared contracts: `packages/protocol`, `packages/content`, and `packages/sim`.
- Persistence: `server/persistence.ts`, `server/persistence/playerRepository.ts`, `server/db.ts`, and `scripts/migrations`.
- Deployment: `scripts/deploy-from-local.sh` SSHes to the VPS and runs `scripts/deploy-production.sh`.

## Core Flows

### Join And Reconnect

1. The client calls `useRoomConnection` in `apps/client/src/roomConnection.ts`.
2. It joins the Colyseus `world` room with `playerName` and `clientProtocolVersion`.
3. `VibeAgeRoom.onJoin` calls `joinWorldRoomClient`.
4. `ColyseusAuthoritativeRoomAdapter.handleJoin` validates protocol version and asks the room port to join the client.
5. `server/players/playerSession.ts` creates or restores the player and maps socket/session ownership.
6. `sendClientInitialSnapshot` sends `joinGame`, owner-only inventory/starter progress, the scoped `gameState`, and active cast snapshots.
7. The client reducer in `apps/client/src/gameReducer.ts` installs the snapshot and direct updates.

Reconnect is client-driven with bounded backoff in `apps/client/src/roomConnection.ts`. Server state ownership remains socket/session scoped; never trust player IDs from the client without checking the socket.

### Client Commands

1. The client sends protocol messages through `ClientActions` in `apps/client/src/clientActions.ts`.
2. Colyseus receives those messages on `SESSION_EVENTS.message`.
3. `ColyseusAuthoritativeRoomAdapter.handleMessage` validates them with `safeParseClientMessage`.
4. `server/world/clientMessageRouter.ts` dispatches by message type.

Supported client commands are declared in `packages/protocol/clientMessages.ts` and mirrored by `WORLD_CLIENT_COMMAND_TYPES` in `server/transport/roomBoundary.ts`.

### Movement

1. The client sends `MoveIntent`.
2. `server/world/clientMessageRouter.ts` calls `server/movement/moveIntent.ts`.
3. `server/world/tickPipeline.ts` advances movement through `server/movement/worldMovement.ts`.
4. `server/movement/snapshotDeltas.ts` emits `PosSnap` deltas.
5. The client reducer applies snapshots and the camera reads smoothed state from client-side selectors.

Movement authority is server-side. Client changes may improve input, smoothing, and presentation, but they must not become the source of truth for final position.

### Combat And Casts

1. The client sends `CastReq`.
2. `server/world/clientMessageRouter.ts` validates socket ownership and calls `server/combat/castHandler.ts`.
3. Cast rules, cooldowns, costs, projectiles, effects, and impact resolution live under `server/combat`.
4. Shared math and effects live in `packages/sim`.
5. Skill content lives in `packages/content/skills.ts`.
6. Server messages such as `CastSnapshot`, `InstantHit`, `CombatLog`, and `EffectSnapshot` are validated in `packages/protocol/serverMessages.ts`.

Do not hardcode skill behavior in the client when the same value exists in content or simulation packages.

### Loot And Inventory

1. Enemy death routes through `server/combat/targetDeath.ts`.
2. Loot generation and ground loot live in `server/loot`.
3. The client sends `LootPickup`; the server tries to give loot and then sends owner-only inventory messages.
4. Item use routes through `server/inventory/itemUse.ts`.
5. Slot behavior lives in `server/inventory/inventorySlots.ts`.

Inventory is owner-visible. Public broadcasts must never leak another player's full inventory.

### Region Streaming

Regions are server-owned and global. A player's position can affect which regions are streamed to that player, but spawning and activation must not depend on a particular player.

- Region definitions and lookup helpers: `packages/content/zones.ts`.
- Server runtime regions: `server/world/regions.ts`.
- Zone activation policy: `server/world/zoneRuntime.ts`.
- Initial enemy spawn: `server/enemies/enemyLifecycle.ts`.
- Per-client filtering: `server/transport/colyseusRoomAdapter.ts` and `server/transport/clientState.ts`.

When changing streaming, test that hidden entities are filtered while global spawns, enemy updates, and activation continue independently of any single client.

### Public State And Direct Messages

Colyseus public room state in `server/transport/worldStateSchema.ts` is coarse public metadata for the world and regions. The detailed game snapshot is sent through session events because it is filtered per client.

Owner-only messages include inventory, starter progress, skill learn failures, and cast failures. Classification is documented in `docs/PROTOCOL.md`.

### Persistence

Player persistence is periodic and server-driven:

- `server/world.ts` starts the persistence loop.
- `server/players/playerSession.ts` loads, saves, and removes sessions.
- `server/persistence/playerRepository.ts` maps game state to Postgres rows.
- Migrations are under `scripts/migrations`.

Persistence changes should include a repository test and, when schema changes are involved, a migration plus restore compatibility check.

### Deployment And Rollback

The supported production path is local-initiated:

- Deploy: `pnpm run deploy:production`.
- Rollback: `pnpm run deploy:rollback`.
- Health: `pnpm run health:production`.
- Script syntax: `pnpm run check:scripts`.

Before editing deployment scripts, inspect `/opt/vibeage` assumptions in `scripts/setup-server.sh`, `scripts/setup-client.sh`, Docker Compose, Nginx, and generated `manage.sh` behavior. The setup scripts are bootstrap-era scripts, not live update scripts.

## Files That Should Stay Small

- `server/world.ts`: world construction and orchestration only.
- `server/world/tickPipeline.ts`: tick phase coordination only.
- `server/transport/colyseusRoomAdapter.ts`: transport validation and scoped emit glue only.
- `apps/client/src/roomConnection.ts`: Colyseus connection lifecycle only.
- `apps/client/src/gameReducer.ts`: client state transitions only.
- `apps/client/src/Hud.tsx`: UI composition only; push domain formatting into helpers/components.
- `apps/client/src/WorldScene.tsx`: scene composition only; avoid embedding gameplay rules.

When a change wants to grow one of these files, first look for a domain module under `server/combat`, `server/movement`, `server/loot`, `server/inventory`, `server/players`, `server/world`, `apps/client/src/hud`, or `packages`.

## Change Boundaries

- Protocol changes must update schemas, server handling, client handling, and tests together.
- Content changes should go through `packages/content` and `pnpm run check:content`.
- Simulation math should go through `packages/sim` and pure Vitest tests.
- Server runtime changes should keep authority on the server and run `pnpm run check:server`.
- Client rendering changes should not move authority to the browser and should run `pnpm run check:client`.
- Deployment changes need manual review of VPS/Nginx assumptions before running scripts.
