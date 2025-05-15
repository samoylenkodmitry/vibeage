import { SkillId, SkillType } from './skillsDefinition';
import { CharacterClass } from './classSystem';
import { ItemId } from './items';

export enum CastState { Casting = 0, Traveling = 1, Impact = 2 }

export interface InventorySlot {
  itemId: ItemId;
  quantity: number;
}

export interface CastSnapshot {
  castId: string;
  casterId: string;
  skillId: SkillId;
  state: CastState;
  origin: VecXZ;
  target?: VecXZ;
  pos?: VecXZ;       // Current projectile position for authoritative trajectories
  dir?: VecXZ;       // Direction vector for traveling projectiles
  startedAt: number; // Timestamp
  castTimeMs: number; // Cast time from skill definition
}

export interface StatusEffect {
    id: string;
    type: string;
    value: number;
    durationMs: number;
    startTimeTs: number;
    sourceSkill: string;
    stacks?: number; // Optional: for stackable effects
}

export interface Enemy {
    id: string;
    type: string;
    name: string;
    level: number;
    position: { x: number; y: number; z: number };
    spawnPosition: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    maxHealth: number;
    isAlive: boolean;
    attackDamage: number;
    attackRange: number;
    baseExperienceValue: number;
    experienceValue: number;
    statusEffects: StatusEffect[];
    targetId?: string | null;
    markedForRemoval?: boolean;
    deathTimeTs?: number;
    attackCooldown?: boolean;
    posHistory?: { ts: number; x: number; z: number }[];  // Position history buffer similar to players
    lastUpdateTime?: number;  // Track last update time
    lootTableId?: string;     // ID of the loot table to generate drops from
    
    // AI-related fields
    aiState: 'idle' | 'chasing' | 'attacking' | 'returning'; // Current AI state
    aggroRadius: number;         // Distance at which enemy detects players
    attackCooldownMs: number;    // Cooldown between attacks in milliseconds
    lastAttackTime: number;      // Timestamp of the last attack
    movementSpeed: number;       // Units per second
    velocity?: { x: number; z: number }; // Similar to player velocity
}

// Intent-based movement messages
// These have been moved to shared/messages.ts
// Only keeping old interface definitions for backward compatibility during migration
import type { VecXZ, PlayerMovementState } from './messages';
export type { VecXZ, PlayerMovementState };

export interface MoveStartMsg {
    type: 'moveStart';
    id: string;            // playerId
    from: VecXZ;           // current server-accepted pos (xz only)
    to: VecXZ;             // destination clicked on ground
    speed: number;         // client's intended speed (u/s)
    ts: number;            // client epoch ms when click happened
}

export interface MoveStopMsg {
    type: 'moveStop';
    id: string;
    pos: VecXZ;            // here the client thinks he stopped
    ts: number;
}

// Update PlayerState with optional movement field and class data
export interface PlayerState {
    id: string;
    socketId: string;
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    className: CharacterClass;
    unlockedSkills: SkillId[];     // All skills the player has learned
    skillShortcuts: (SkillId | null)[];  // Skills assigned to number keys 1-9
    availableSkillPoints: number;  // Points available to learn new skills
    skillCooldownEndTs: Record<string, number>;
    statusEffects: StatusEffect[];
    level: number;
    experience: number;
    experienceToNextLevel: number;
    castingSkill: SkillType | null;
    castingProgressMs: number;
    isAlive: boolean;
    deathTimeTs?: number;
    lastUpdateTime?: number;
    targetId?: string | null;      // ID of the entity the player is targeting
    lastSnapTime?: number; // Track when the last position snapshot was sent
    movement?: PlayerMovementState;
    velocity?: { x: number; z: number };
    posHistory?: { ts: number; x: number; z: number }[]; // Position history for better hit detection
    stats?: {
        dmgMult?: number;
        critChance?: number;
        critMult?: number;
    };
    inventory: InventorySlot[];          // Player's inventory items
    maxInventorySlots: number;           // Maximum number of inventory slots
}
