import { SkillId } from './skillsDefinition';
import { CastSnapshot } from './types';

export interface VecXZ {
  x: number;
  z: number;
}

export interface PlayerMovementState {
  isMoving: boolean;
  path?: VecXZ[];
  pos: VecXZ;  // Current position
  targetPos?: VecXZ; // Target position when moving
  lastUpdateTime: number;
  speed: number;
}

// Base message with type
export interface ClientMsg {
  type: string;
  [key: string]: any;
}

// Movement messages
export interface MoveStart extends ClientMsg {
  type: 'MoveStart';
  id: string;
  path: VecXZ[];
  speed: number;
  clientTs: number;
}

export interface MoveSync extends ClientMsg {
  type: 'MoveSync';
  id: string;
  pos: VecXZ;
  clientTs: number;
}

export interface MoveStop extends ClientMsg {
  type: 'MoveStop';
  id: string;
  pos: VecXZ;
  clientTs: number;
}

// Server-driven position correction
export interface PosSnap extends ClientMsg {
  type: 'PosSnap';
  id: string;
  pos: VecXZ;
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
  reason: 'cooldown' | 'nomana' | 'invalid';
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

export interface ProjSpawn2 extends ServerMsg {
  type: 'ProjSpawn2';
  castId: string;
  origin: VecXZ;
  dir: VecXZ;   // Normalized, XZ plane
  speed: number;
  launchTs: number;
  hitRadius?: number;  // Optional hitRadius for VFX
  casterId?: string;   // ID of the entity that cast this projectile
  skillId?: string;    // ID of the skill that created this projectile
  travelMs?: number;   // Flight time client-side
}

export interface ProjHit2 extends ServerMsg {
  type: 'ProjHit2';
  castId: string;
  hitIds: string[];
  dmg: number[];   // Aligned with hitIds
  impactPos?: VecXZ; // Position of the projectile impact (optional for backwards compatibility)
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
