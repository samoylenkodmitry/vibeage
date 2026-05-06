# VibeAge

A browser-first multiplayer game prototype with movement, combat, skills, loot, and server-authoritative state experiments.

The current repository is being stabilized before a cleaner web-native architecture. See [ROADMAP.md](ROADMAP.md) for the target stack and migration plan. See [AGENTS.md](AGENTS.md) for commands and rules for automated coding agents.

## Development

```bash
pnpm install
cp .env.example .env

# frontend only
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
pnpm run build
pnpm run build:server
pnpm test
pnpm run lint
```

Local secrets and environment-specific values belong in `.env`. Only `.env.example` and `server/.env.example` should be tracked.

## Network Architecture

The game uses a client-server architecture with the following components:

### Message Protocol

#### Client → Server Messages

| Type | When | Payload |
|------|------|---------|
| MoveIntent | When player clicks to move | `{id, targetPos, clientTs}` |
| CastReq | Skill button | `{id, skillId, targetId?, targetPos?, clientTs}` |
| RespawnRequest | After player death | `{id, clientTs}` |

#### Server → Client Messages

| Type | When | Payload |
|------|------|---------|
| PosSnap | 10 Hz | `{snaps: [{id, pos, vel, snapTs}]}` |
| CastSnapshot | Skill state changes | `{castId, casterId, skillId, state, origin, target?, pos?, dir?, startedAt, castTimeMs}` |
| EffectSnapshot | Status effects | `{targetId, effects: []}` |
| CombatLog | Combat results | `{castId, skillId, casterId, targets, damages}` |
| EnemyAttack | Enemy attacks | `{enemyId, targetId, damage}` |

> **Note**: As of May 2025, legacy message types `skillEffect`, `ProjSpawn2`, and `ProjHit2` have been removed from the protocol. Clients must use protocol v2+ to connect to current servers.

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
   - `SocketManager` updates projectile/VFX stores
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
