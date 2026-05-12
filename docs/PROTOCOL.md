# Game Protocol

This document describes the current messaging protocol used for communication between the client and server.

## Core Message Types

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
