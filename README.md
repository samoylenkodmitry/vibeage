# Vibe Game

A multiplayer game with movement and skill systems.

## Network Architecture

The game uses a client-server architecture with the following components:

### Message Protocol

| Direction | Type | When | Payload |
|-----------|------|------|---------|
| Client → Server | MoveStart | Once per path | `{id, path: VecXZ[], speed, clientTs}` |
| Client → Server | MoveSync | Every 2s or when speed/path changes | `{id, pos, clientTs}` |
| Client → Server | CastReq | Skill button | `{skillId, targetId?, targetPos?, clientTs}` |
| Server → Client | MoveStart | Broadcast | Same as above |
| Server → Client | PosSnap | 10 Hz | `[{id, pos, vel, ts}]` |
| Server → Client | CastStart/CastEnd | Skill events | `{id, skillId, castMs, success}` |

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

## Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```

## Technical Notes

### Skill System Architecture

The skill system uses the following flow:

1. **Skill Cast Request**: 
   - Client sends `CastReq` message with `skillId` and `targetId`
   - Server validates range, mana cost, cooldowns
   - If valid, server broadcasts `CastStart` message

2. **Casting Period**:
   - Server waits for the skill's cast time
   - Client shows casting animation/UI

3. **Skill Execution**:
   - Server applies skill effects (damage, status effects)
   - Server broadcasts `CastEnd` message
   - Server emits `skillEffect` event with source and target info

4. **Visual Effects**:
   - Client receives `skillEffect` event 
   - `SocketManager` converts this to a DOM custom event `skillTriggered`
   - `ActiveSkills` component listens for this event and creates the visual effect
   - After effect animation completes, it's removed from the scene

5. **State Updates**:
   - Server sends updated health/status via `enemyUpdated` and `playerUpdated`
   - Client UI reflects these changes

This event-based system allows for decoupling of skill logic from visual effects and enables client-side prediction for responsive gameplay.

- Movement system uses intent-based movement with server validation
- Skills have range checks that account for player movement
- Position reconciliation prevents cheating with speed hacks
- Fixed timestep simulation provides consistent gameplay experience

## Known Issues

- [Current] Client sometimes gets out of sync on very long walks
- [Current] AoEs sometimes target wrong position when player is moving
- [Fixed] Server now properly tracks player position during movement
