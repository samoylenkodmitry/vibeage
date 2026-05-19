# VibeAge

A browser-first multiplayer game prototype with movement, combat, skills, loot, and server-authoritative state experiments.

The current repository is being stabilized before a cleaner web-native architecture. See [ROADMAP.md](ROADMAP.md) for the target stack and migration plan. See [AGENTS.md](AGENTS.md) for commands and rules for automated coding agents.

## Branch Policy

Use `main` as the canonical working branch. The previous GitHub `main` has been archived as `old_version`; the former `server` branch was moved to `main`. Current deployment is VPS-only, with the game server and static frontend served from the VPS.

## Development

```bash
pnpm install
cp .env.example .env

# Vite frontend only
pnpm run dev

# game server only
pnpm run dev:server

# frontend + game server
pnpm run dev:all

# local Postgres + frontend + game server
pnpm run dev:db
```

## Checks

```bash
pnpm run check
pnpm run build
pnpm run build:server
pnpm test
pnpm run lint
```

See [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md) for the full local and CI gate.
See [docs/PERSISTENCE.md](docs/PERSISTENCE.md) for the current Postgres/Kysely persistence contract.
See [docs/COLYSEUS_017.md](docs/COLYSEUS_017.md) for the current Colyseus runtime package window.

Local secrets and environment-specific values belong in `.env`. Only `.env.example` and `server/.env.example` should be tracked.

## Network Architecture

The game uses a client-server architecture with the following components:

### Message Protocol

The Zod schemas in `packages/protocol/` are the authoritative
definitions for every message on the wire. Both client and
server schemas use `.strict()` — unknown fields are rejected at
the boundary, so adding a property requires declaring it in the
schema first. This table is a high-level map; for the exact
shape of any message, read the schema directly.

#### Client → Server Messages

See `packages/protocol/clientMessages.ts`. Key entries:

| Type | When | Notes |
|------|------|-------|
| `MoveIntent` | Player clicks the world | `{id, targetPos, clientTs}` |
| `CastReq` | Player presses a skill button | `{id, skillId, targetId?, targetPos?, clientTs}` |
| `RespawnRequest` | Player clicks "Respawn" | `{id, clientTs}` |
| `Chat` | Player sends a chat message | `{id, message, scope?}` |
| `EquipReq` / `UnequipReq` | Inventory drag-and-drop | `{id, slot, instanceId?}` |
| `LearnSkill` | Player spends a skill point | `{id, skillId}` |
| `LootPickup` | Player walks over a loot stack | `{id, lootId}` |

#### Server → Client Messages

See `packages/protocol/serverMessages.ts`. Each is its own
top-level message (one per emit; `PosSnap` is per-entity, not a
batch). Selection:

| Type | When |
|------|------|
| `PosSnap` | 10 Hz per-entity position. `{type, id, pos, vel, rotY?, snapTs, seq?, predictions?}` |
| `CastSnapshot` | Cast state transitions. `{castId, casterId, skillId, state, origin, pos, dir?, startedAt, castTimeMs, progressMs}` |
| `EffectSnapshot` | Status-effect list updated. Single-target form: `{targetId, effects[]}` |
| `CombatLog` | Damage / heal applied (one per impact or per pierce hit) |
| `EnemyAttack` | Enemy lands a melee swing |
| `BossTelegraph` | Mini-boss is about to swing its signature ability |
| `InventoryUpdate`, `EquipmentUpdate`, `LootAcquired`, `LootSpawn`, `ItemUsed` | Loot / bag / gear changes |
| `ChatBroadcast` | Chat message fan-out |
| `SkillLearned`, `SkillShortcutUpdated`, `ClassSelected`, `LearnSkillFailed` | Progression UI sync |
| `CastFail`, `EquipFailed` | Negative acknowledgements |
| `StarterProgressUpdate` | Starter-path progress |
| `BatchUpdate` | Coalesced patch envelope for player / enemy state |

> **Protocol versioning**: clients send `clientProtocolVersion`
> on Colyseus join; rooms reject anything below
> `MIN_CLIENT_PROTOCOL_VERSION`. Legacy `skillEffect`, `ProjSpawn2`,
> and `ProjHit2` are gone.

### Server Update Loop

The server runs at a fixed 30Hz update rate with the following steps:

1. Update player positions based on their movement state
2. Process skill effects and other game systems
3. Send position snapshots at 10Hz to clients

### Client Prediction

Clients implement:

1. Local path-finding for smoother movement
2. Client-side prediction to reduce perceived latency 
3. Interpolation for other player movement
4. Rubber-band correction when server indicates position errors

## Technical Notes

### Skill System Architecture

The skill system uses the following flow:

1. **Skill Cast Request**: 
   - Client sends `CastReq` message with `skillId` and `targetId`
   - Server validates range, mana cost, cooldowns
   - If valid, server broadcasts `CastSnapshot` updates

2. **Casting Period**:
   - Server waits for the skill's cast time
   - Client shows casting animation/UI

3. **Skill Execution**:
   - Server applies skill effects (damage, status effects)
   - Server broadcasts `CastSnapshot`, `EffectSnapshot`, and `CombatLog` messages

4. **Visual Effects**:
   - Client receives authoritative cast snapshots
   - the Vite client reducer and scene components update projectile/VFX state
   - Render components play visuals from client-side state

5. **State Updates**:
   - Server sends updated health/status via `enemyUpdated` and `playerUpdated`
   - Client UI reflects these changes

- Movement system uses intent-based movement with server validation
- Skills have range checks that account for player movement
- Position reconciliation prevents cheating with speed hacks
- Fixed timestep simulation provides consistent gameplay experience

## WebSocket compression

`WS_COMPRESSION=0 npm start` disables gzip/deflate for debugging.
By default it is **enabled** and uses per-message deflate with
zero-byte threshold.

## Known Issues

- [Current] Client sometimes gets out of sync on very long walks
- [Current] AoEs sometimes target wrong position when player is moving
- [Fixed] Server now properly tracks player position during movement

## VPS Deployment

For VPS deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).
