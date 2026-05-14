import type { CharacterClass } from '../content/classes.js';
import type { SkillId } from '../content/skills.js';
import type {
  CastSnapshot,
  InventorySlot,
  PlayerMovementState,
  StarterProgressState,
  StatusEffect,
  VecXZ,
} from '../protocol/messages.js';

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
  aiState: 'idle' | 'chasing' | 'attacking' | 'returning';
  aggroRadius: number;
  attackCooldownMs: number;
  lastAttackTime: number;
  movementSpeed: number;
  velocity?: { x: number; z: number };
  dirtySnap?: boolean;
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
  };
  inventory: InventorySlot[];
  maxInventorySlots: number;
}
