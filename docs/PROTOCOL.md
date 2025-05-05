# Game Protocol - v0.6.1

This document describes the current messaging protocol used for communication between the client and server.

## Core Message Types

### CastSnapshot

Represents the current state of a skill cast, with all information needed to render VFX and predict outcomes.

```typescript
interface CastSnapshot {
  castId: string;       // Unique ID for this cast
  casterId: string;     // Entity that initiated the cast
  skillId: string;      // Type of skill being cast
  state: CastStateEnum; // Current state (Casting, Release, Hit, Complete)
  origin: VecXZ;        // Starting position
  target?: VecXZ;       // Target position (if any)
  startedAt: number;    // Timestamp when cast began
}
```

### ProjSpawn2

Enhanced projectile spawn message that contains all information needed to render and track a projectile.

```typescript
interface ProjSpawn2 {
  type: 'ProjSpawn2';
  castId: string;       // ID that links to the cast 
  origin: VecXZ;        // Starting position
  dir: VecXZ;           // Direction vector (normalized)
  speed: number;        // Movement speed
  launchTs: number;     // Timestamp when launched
  hitRadius?: number;   // Optional collision radius for VFX
  casterId?: string;    // ID of the entity that cast this
  skillId?: string;     // Type of skill
  travelMs?: number;    // Flight time for client-side animation
}
```

### ProjHit2

Enhanced projectile hit message that contains hit information and damage values.

```typescript
interface ProjHit2 {
  type: 'ProjHit2';
  castId: string;       // ID that links to the cast
  hitIds: string[];     // Entities hit by this projectile
  dmg: number[];        // Damage values aligned with hitIds
  impactPos?: VecXZ;    // Position of impact
}
```

## Legacy Messages (Removed)

The following message types have been removed in v0.5.0:

- ~~CastStart~~
- ~~CastEnd~~
- ~~ProjSpawn~~
- ~~ProjHit~~
- ~~ProjEnd~~

These have been replaced by the enhanced messages above for a more efficient and consistent protocol.
