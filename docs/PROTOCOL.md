# Game Protocol And State Contract

This document describes the current client/server contract used by the browser client and the Colyseus authoritative server.

Source files:

- Client message schemas: `packages/protocol/clientMessages.ts`.
- Server message schemas: `packages/protocol/serverMessages.ts`.
- Common schemas and shared types: `packages/protocol/common.ts`.
- Session event names: `packages/protocol/sessionEvents.ts`.
- Room boundary constants: `server/transport/roomBoundary.ts`.
- Public Colyseus state: `server/transport/worldStateSchema.ts`.
- Per-client snapshot shaping: `server/transport/clientState.ts`.
- Client transport bridge: `apps/client/src/roomConnection.ts`.
- Server command router: `server/world/clientMessageRouter.ts`.

## Transport Lanes

The game uses four lanes over one Colyseus room:

| Lane | Event/path | Direction | Validation | Purpose |
| --- | --- | --- | --- | --- |
| Room join options | `joinOrCreate('world', options)` | Client to server | `parseWorldRoomJoinOptions` | Player name and minimum client protocol version. |
| Client commands | `SESSION_EVENTS.message` / `msg` | Client to server | `safeParseClientMessage` | Movement, casting, inventory, skill, loot, and respawn commands. |
| Server messages | `SESSION_EVENTS.message` / `msg` | Server to client | `safeParseServerMessage` on client | Combat, snapshots, inventory, loot, skills, starter progress, and batched updates. |
| Public room state | Colyseus state sync | Server to client | Colyseus schema plus client normalization | Coarse world/region metadata such as counts and active region status. |

Additional session events:

- `joinGame`: tells the joined client its authoritative player id.
- `requestGameState`: asks the server to resend a scoped game snapshot.
- `gameState`: sends an initial or resync snapshot.
- `playerJoined` / `playerLeft`: public join/leave events.
- `playerUpdated` / `enemyUpdated`: scoped entity updates.
- `connectionRejected`: connection or protocol rejection details.

## Public Colyseus State

`server/transport/worldStateSchema.ts` defines the public state synchronized through Colyseus. It is intentionally coarse:

- world revision
- player count
- enemy count
- alive enemy count
- active region count
- total region count
- per-region id, zone id, name, active flag, player count, enemy count, alive enemy count, and max enemy budget

The public room state must not include private player fields, full inventories, hidden loot details, or owner-only progression state. Detailed gameplay state goes through scoped snapshots and messages instead.

## Initial Snapshot Contract

When a client joins or requests resync, `sendClientInitialSnapshot` sends:

1. `joinGame` with `{ playerId }` when the socket is attached to a player.
2. Direct `InventoryUpdate` for the owner.
3. Direct `StarterProgressUpdate` for the owner.
4. `gameState` with a per-client snapshot from `makeClientGameStateSnapshot`.
5. Direct active cast snapshots for the owner.

The client should be able to rebuild the playable HUD from this path alone. If a field is needed after reconnect, it belongs in this contract or in a direct owner-only follow-up message.

## Visibility Boundary

The server treats the authoritative `PlayerState` as owner-visible by default. Full snapshots sent to a joining or resyncing client keep private fields only for the player whose `socketId` matches that client. Other players are sanitized in `server/transport/clientState.ts`.

Owner-only player fields:

- `socketId`
- `starterProgress`
- `inventory`
- `maxInventorySlots`

Owner-only/direct messages:

- `InventoryUpdate`
- `LootAcquired`
- `ItemUsed`
- `SkillLearned`
- `SkillShortcutUpdated`
- `StarterProgressUpdate`
- `CastFail`

Public broadcasts may include combat, movement, loot visibility, enemy updates, and sanitized player joins/updates. Any new player field must be classified here and covered by a transport privacy test before it is broadcast.

## Region-Scoped State

Region activation and spawning are global server decisions. Region scoping only limits what each client sees.

Scoped paths:

- Initial and resync snapshots: `makeClientGameStateSnapshot`.
- Broadcast server messages and `BatchUpdate` children: `filterServerMessageForClient`.
- `playerUpdated` and `enemyUpdated` direct sends: `emitScopedEntityEvent`.

Region-scoped snapshots must keep these collections consistent with one another:

- `players`
- `enemies`
- `groundLoot`
- `zones.playerZoneIds`
- `zones.enemyZoneIds`

If an entity or loot stack is hidden, its zone mapping should be hidden too.

## Client Commands

### MoveIntent

Client request to move the controlled player toward a target position.

```typescript
type MoveIntent = {
  type: 'MoveIntent';
  id: string;
  targetPos: VecXZ;
  clientTs: number;
  seq?: number;
};
```

### CastReq

Client request to cast a skill. The server validates ownership, mana, cooldown, range, and target state.

```typescript
type CastReq = {
  type: 'CastReq';
  id: string;
  skillId: SkillId;
  targetId?: string;
  targetPos?: VecXZ;
  clientTs: number;
};
```

### Other Commands

| Type | Purpose | Server owner check |
| --- | --- | --- |
| `LearnSkill` | Learn a skill by content id. | Player is found by socket. |
| `SetSkillShortcut` | Assign or clear a skill bar slot. | Player is found by socket. |
| `RespawnRequest` | Ask to respawn a dead player. | Player id must match server state. |
| `UseItem` | Use an inventory slot. | Player is found by socket. |
| `LootPickup` | Pick up a ground loot stack. | `playerId` must belong to the socket. |
| `RequestInventory` | Resend owner inventory. | Player is found by socket. |
| `SelectClass` | Legacy/no-op command. | No active behavior. |

## Server Messages

### CastSnapshot

Represents the current state of a skill cast, with all information needed to render VFX and predict outcomes.

```typescript
type CastSnapshot = {
  castId: string;       // Unique ID for this cast
  casterId: string;     // Entity that initiated the cast
  skillId: SkillId;     // Type of skill being cast
  state: CastState;     // Casting, Traveling, or Impact
  origin: VecXZ;        // Starting position
  pos: VecXZ;           // Current position
  dir?: VecXZ;          // Projectile direction, if any
  startedAt: number;    // Timestamp when cast began
  castTimeMs: number;
  progressMs: number;
};
```

### Message Ownership

| Type | Visibility | Notes |
| --- | --- | --- |
| `PosSnap` | Region-scoped public | Position updates for visible players/enemies. |
| `InstantHit` | Region-scoped public | Visible impact VFX and hit ids. |
| `CastSnapshot` | Region-scoped public/direct on initial sync | Cast presentation state. |
| `EffectSnapshot` | Region-scoped public | Target or single effect state. |
| `CombatLog` | Region-scoped public | Damage numbers and combat feedback. |
| `EnemyAttack` | Region-scoped public | Enemy attack feedback. |
| `LootSpawn` | Region-scoped public | Visible ground loot only. |
| `LootPickup` | Region-scoped public | Visible pickup event. |
| `SkillLearned` | Owner-only/direct | Skill unlock confirmation. |
| `SkillShortcutUpdated` | Owner-only/direct | Skill bar update confirmation. |
| `CastFail` | Owner-only/direct | Rejected cast reason. |
| `InventoryUpdate` | Owner-only/direct | Full owner inventory. |
| `LootAcquired` | Owner-only/direct | Inventory award details. |
| `ItemUsed` | Owner-only/direct | Consumable result. |
| `StarterProgressUpdate` | Owner-only/direct | Starter path state and reward. |
| `BatchUpdate` | Per-child scoped | Empty batches are not sent. |

## Change Checklist

When adding or changing a protocol message:

1. Update the Zod schema and exported type in `packages/protocol`.
2. Update `WORLD_CLIENT_COMMAND_TYPES` or server message handling if needed.
3. Update `server/world/clientMessageRouter.ts` or the relevant server domain handler.
4. Update `apps/client/src/roomConnection.ts`, `apps/client/src/clientActions.ts`, and `apps/client/src/gameReducer.ts` as needed.
5. Classify visibility as public, region-scoped, or owner-only.
6. Add or update tests:
   - `tests/protocol.schemas.spec.ts`
   - `tests/clientMessageRouter.spec.ts`
   - `tests/clientSnapshot.spec.ts`
   - `tests/clientStatePrivacy.spec.ts`
   - `tests/outboundEvents.spec.ts`
   - `tests/transportBoundary.spec.ts`
7. Run `pnpm run check:protocol`.

## Legacy Messages (Removed)

The following message types have been removed in v0.5.0:

- ~~CastStart~~
- ~~CastEnd~~
- ~~ProjSpawn~~
- ~~ProjHit~~
- ~~ProjEnd~~
- ~~ProjSpawn2~~
- ~~ProjHit2~~

These have been replaced by `CastReq`, `CastSnapshot`, `InstantHit`, and `CombatLog` messages validated in `packages/protocol/messages.ts`.
