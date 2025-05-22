import { SkillId } from './skillsDefinition';
import { CastSnapshot, InventorySlot, StatusEffect } from './types';
import { ItemId } from './items';

export interface VecXZ {
  x: number;
  z: number;
}

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

/**
 * A keyframe of predicted entity state at a specific future timestamp
 */
export interface PredictionKeyframe {
    pos: VecXZ;     // Predicted position
    rotY?: number;  // Optional: Predicted Y rotation
    ts: number;     // Server timestamp (epoch ms) this keyframe is valid for
}

export interface PlayerMovementState {
  isMoving: boolean;            // True if actively moving towards a target
  targetPos?: VecXZ | null;     // Server-acknowledged target position
  lastUpdateTime: number;       // Server time of last movement state update
  speed: number;                // Current server-authoritative speed for this player
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
  seq?: number;        // Optional sequence number for reconciliation
}

// Server-driven position
export interface PosSnap extends ServerMsg {
  type: 'PosSnap';
  id: string;                    // Entity id (player uid)
  pos: VecXZ;                    // Current authoritative position at snapTs
  vel: { x: number; z: number }; // Current authoritative velocity at snapTs
  rotY?: number;                 // Optional: Current authoritative Y rotation (yaw)
  snapTs: number;                // Server timestamp (epoch ms) when this snapshot was generated
  seq?: number;                  // Optional sequence number for reconciliation
  
  /** Server's prediction of future states */
  predictions?: PredictionKeyframe[];
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

// Loot related messages
export interface ItemDrop {
  itemId: string;
  quantity: number;
}

export interface LootSpawn {
  type: 'LootSpawn';
  enemyId: string;
  loot: ItemDrop[];
}

export interface LootPickup {
  type: 'LootPickup';
  lootId: string;
  playerId: string;
}

// Item usage messages
export interface UseItem extends ClientMsg {
  type: 'UseItem';
  slotIndex: number;        // inventory slot             (0-based)
  clientTs: number;         // epoch-ms
}

export interface ItemUsed extends ServerMsg {
  type: 'ItemUsed';
  slotIndex: number;
  itemId: ItemId;
  newQuantity: number;      // 0 if stack emptied
  healthDelta?: number;     // +HP applied (for VFX/UI)
  manaDelta?: number;       // +MP applied (future-proof)
}
