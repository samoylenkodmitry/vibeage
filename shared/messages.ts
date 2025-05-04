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

export interface CastStart extends ClientMsg {
  type: 'CastStart';
  id: string;
  skillId: string;
  castTimeMs: number;
  targetId?: string;
  targetPos?: VecXZ;
  serverTs: number;
}

export interface CastEnd extends ClientMsg {
  type: 'CastEnd';
  id: string;
  skillId: string;
  success: boolean;
  serverTs: number;
}

// Projectile messages
export interface ProjSpawn extends ClientMsg {
  type: 'ProjSpawn';
  id: string; // Projectile ID
  skillId: string;
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  speed: number;
  launchTs: number;
}

export interface ProjHit extends ClientMsg {
  type: 'ProjHit';
  id: string; // Projectile ID
  pos: { x: number; y: number; z: number };
  hitIds: string[]; // IDs of entities hit by this projectile
}

export interface ProjEnd extends ClientMsg {
  type: 'ProjEnd';
  id: string; // Projectile ID
  pos: { x: number; y: number; z: number };
}

// Instant skill hit effect
export interface InstantHit extends ClientMsg {
  type: 'InstantHit';
  skillId: string;
  origin: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  hitIds: string[];
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

// Legacy - to be removed
export interface SetActiveSkills extends ClientMsg {
  type: 'SetActiveSkills';
  skills: SkillId[];
}

export interface ActiveSkillsUpdated extends ClientMsg {
  type: 'ActiveSkillsUpdated';
  skills: SkillId[];
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
}

export interface ProjHit2 extends ServerMsg {
  type: 'ProjHit2';
  castId: string;
  hitIds: string[];
  dmg: number[];   // Aligned with hitIds
  impactPos?: VecXZ; // Position of the projectile impact (optional for backwards compatibility)
}
