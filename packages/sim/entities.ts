import type { CharacterClass } from '../content/classes.js';
import type { CharacterRace } from '../content/races.js';
import type { SkillId } from '../content/skills.js';
import type {
  CastSnapshot,
  InventorySlot,
  PlayerMovementState,
  StarterProgressState,
  StatusEffect,
  VecXZ,
} from '../protocol/messages.js';
import type { CharacterInventory } from './characterInventory.js';

export type {
  CastSnapshot,
  InventorySlot,
  PlayerMovementState,
  StarterProgressState,
  StatusEffect,
  VecXZ,
};

export interface Enemy {
  id: string;
  type: string;
  name: string;
  level: number;
  position: { x: number; y: number; z: number };
  spawnPosition: { x: number; y: number; z: number };
  spawnRotation?: number;
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
  posHistory?: { ts: number; x: number; z: number }[];
  lastUpdateTime?: number;
  lootTableId?: string;
  aiState: 'idle' | 'patrolling' | 'chasing' | 'attacking' | 'returning';
  aggroRadius: number;
  attackCooldownMs: number;
  lastAttackTime: number;
  movementSpeed: number;
  velocity?: { x: number; z: number };
  dirtySnap?: boolean;
  patrolTarget?: { x: number; z: number };
  patrolWaitUntilTs?: number;
  /**
   * Timestamp the enemy last entered the chasing state. The state machine
   * uses this for the anti-kite timeout: if MAX_CHASE_TIME_WITHOUT_HIT
   * elapses without the enemy reaching attack range, it gives up.
   */
  chaseStartedAt?: number;
  packId?: string;
  isMiniBoss?: boolean;
}

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
  race?: CharacterRace;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  starterProgress?: StarterProgressState;
  skillCooldownEndTs: Record<string, number>;
  statusEffects: StatusEffect[];
  level: number;
  experience: number;
  experienceToNextLevel: number;
  castingSkill: SkillId | null;
  castingProgressMs: number;
  isAlive: boolean;
  deathTimeTs?: number;
  lastUpdateTime?: number;
  targetId?: string | null;
  lastSnapTime?: number;
  movement?: PlayerMovementState;
  velocity?: { x: number; z: number };
  dirtySnap?: boolean;
  posHistory?: { ts: number; x: number; z: number }[];
  stats?: {
    dmgMult?: number;
    critChance?: number;
    critMult?: number;
    pAtk?: number;
    mAtk?: number;
    pDef?: number;
    mDef?: number;
    hpRegen?: number;
    mpRegen?: number;
    accuracy?: number;
    evasion?: number;
    attackSpeed?: number;
    castSpeed?: number;
    runSpeed?: number;
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wit?: number;
    men?: number;
  };
  inventory: InventorySlot[];
  maxInventorySlots: number;
  characterInventory?: CharacterInventory;
}
