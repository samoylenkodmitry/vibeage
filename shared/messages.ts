import { SkillId } from './skillsDefinition';
import { CastSnapshot, InventorySlot, StatusEffect } from './types';

export interface VecXZ {
  x: number;
  z: number;
}

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

export interface PlayerMovementState {
  isMoving: boolean;
  path?: VecXZ[];
  pos?: VecXZ;  // Current position (optional)
  targetPos?: VecXZ; // Target position when moving
  lastUpdateTime: number;
  speed?: number; // Speed is now optional
}

// Base message with type
export interface ClientMsg {
  type: string;
  [key: string]: any;
}

// Movement messages
// Client → Server: request to move
export interface MoveIntent extends ClientMsg {
  type: 'MoveIntent';
  id: string;          // Entity id (player uid)
  targetPos: VecXZ;    // World coords (XZ plane)
  clientTs: number;    // Ms since epoch on the client
}

// Server-driven position correction
export interface PosSnap extends ServerMsg {
  type: 'PosSnap';
  snaps: {
    id: string;
    pos: VecXZ;
    vel: { x: number; z: number };
    snapTs: number;
  }[];
}

export interface PosDelta extends ClientMsg {
  type: 'PosDelta';
  id: string;
  dx: number;
  dz: number;
  vdx?: number;
  vdz?: number;
  serverTs: number;
}

// Skill casting
export interface CastReq extends ClientMsg {
  type: 'CastReq';
  id: string;
  skillId: string;
  targetId?: string;
  targetPos?: VecXZ;
  clientTs: number;
}

// Projectile messages - Legacy interfaces removed

// Instant skill hit effect
export interface InstantHit extends ClientMsg {
  type: 'InstantHit';
  skillId: string;
  origin: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  hitIds: string[];
  dmg?: number[];  // Damage values for each hit target
}

// Skill management
export interface LearnSkill extends ClientMsg {
  type: 'LearnSkill';
  skillId: SkillId;
}

export interface SetSkillShortcut extends ClientMsg {
  type: 'SetSkillShortcut';
  slotIndex: number;  // 0-8 for keys 1-9
  skillId: SkillId | null;  // null to clear the slot
}

export interface SkillLearned extends ClientMsg {
  type: 'SkillLearned';
  skillId: SkillId;
  remainingPoints: number;
}

export interface SkillShortcutUpdated extends ClientMsg {
  type: 'SkillShortcutUpdated';
  slotIndex: number;
  skillId: SkillId | null;
}

// Class system messages
export interface SelectClass extends ClientMsg {
  type: 'SelectClass';
  className: string;
}

export interface ClassSelected extends ClientMsg {
  type: 'ClassSelected';
  className: string;
  baseStats: {
    healthMultiplier: number;
    manaMultiplier: number;
    damageMultiplier: number;
    speedMultiplier: number;
  };
}

// Skill cast failure message
export interface CastFail extends ClientMsg {
  type: 'CastFail';
  clientSeq: number;
  reason: 'cooldown' | 'nomana' | 'invalid' | 'outofrange';
}

// Server-facing message base type
export interface ServerMsg extends ClientMsg {
  type: string;
}

// New additive messages - do NOT edit old ones
export interface CastSnapshotMsg extends ServerMsg {
  type: 'CastSnapshot';
  data: CastSnapshot;
}

export interface EffectSnapshotMsg extends ServerMsg {
  type: 'EffectSnapshot';
  targetId: string;
  effects: StatusEffect[];
}

export interface CombatLogMsg extends ServerMsg {
  type: 'CombatLog';
  castId: string;
  skillId: string;
  casterId: string;
  targets: string[];
  damages: number[];
}

/** @deprecated Removed in protocol v2 – use CastSnapshot pipeline instead. */
export interface ProjHit2 extends ServerMsg {
  type: 'ProjHit2';
  castId: string;
  hitIds: string[];
  dmg: number[];   // Aligned with hitIds
  impactPos?: VecXZ; // Position of the projectile impact (optional for backwards compatibility)
}

/** @deprecated Removed in protocol v2 – use CastSnapshot pipeline instead. */
export interface ProjSpawn2 extends ServerMsg {
  type: 'ProjSpawn2';
  castId: string;
  skillId: string;
  origin: Vec3D;
  dir: VecXZ;
  speed: number;
  launchTs: number;
  casterId: string;
  hitRadius?: number;
}

// Status effect messages
export interface EffectSnapshotMsg extends ServerMsg {
  type: 'EffectSnapshot';
  id: string;       // Entity ID
  src: string;      // Source entity ID
  effectId: string; // Effect type identifier
  stacks: number;   // Current stacks
  remainingMs: number; // Remaining duration in ms
  seed: number;     // RNG seed for deterministic calculations
}

export interface EnemyAttack extends ServerMsg {
  type: 'EnemyAttack';
  enemyId: string;
  targetId: string; // Player ID
  damage: number;
}

// Player respawn message - Client → Server request to resurrect
export interface RespawnRequest extends ClientMsg {
  type: 'RespawnRequest';
  id: string;          // Player ID
  clientTs: number;    // Ms since epoch on the client
}

// Inventory related messages
export interface InventoryUpdateMsg extends ServerMsg {
  type: 'InventoryUpdate';
  inventory: InventorySlot[]; // The full updated inventory
  maxInventorySlots: number;
}

export interface LootAcquiredMsg extends ServerMsg {
  type: 'LootAcquired';
  items: InventorySlot[]; // Items that were acquired
  sourceEnemyName?: string;
}
