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

export interface PlayerActiveQuestProgress {
  stageIndex: number;
  progress: number;
  /** Set when the player is ready to claim (last stage objective met). */
  readyToClaim?: boolean;
}

export interface PlayerQuestState {
  active: Record<string, PlayerActiveQuestProgress>;
  completed: string[];
}

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
  /**
   * Aggro suppression deadline. While context.now is below this, the
   * returning / idle / patrolling states refuse to re-aggro — used by
   * anti-kite so the same-tick cascade after a kite trip doesn't
   * instantly re-target the same player and undo the give-up.
   */
  aggroSuppressedUntilTs?: number;
  packId?: string;
  isMiniBoss?: boolean;
  /**
   * Stable id linking this mini-boss spawn to the content registry
   * in packages/content/miniBosses.ts. Empty/absent for normal mobs.
   * Used by the quest engine's `kill_boss` objective so a quest can
   * target Vorthax specifically, not just any dragon.
   */
  bossId?: string;
  /**
   * First moment this enemy entered an aggressive state (chasing /
   * attacking) since its current life. Reset when the enemy returns
   * to spawn or respawns. Drives mini-boss enrage timer.
   */
  combatStartedTs?: number;
  /**
   * Mini-boss only: set once the enrage timer trips. Damage is
   * multiplied by bossConfig.enragedDamageMul and stays elevated for
   * the rest of this life.
   */
  enraged?: boolean;
  /**
   * Mini-boss only: set once HP first crosses below
   * bossConfig.phaseTwoHpFraction. Speed + damage get a one-time
   * boost; later HP swings don't re-trigger.
   */
  phaseShifted?: boolean;
  /**
   * Captured at spawn so enrage / phase-shift multipliers compound on
   * the original stats, not on already-buffed values. Set only for
   * mini-bosses; normal mobs read attackDamage / movementSpeed
   * directly.
   */
  baseAttackDamage?: number;
  baseMovementSpeed?: number;
  /**
   * Mini-boss progression config. Populated by createEnemy when
   * isMiniBoss is true; absent on normal mobs. Default values live in
   * server/enemies/enemyLifecycle.ts (DEFAULT_BOSS_CONFIG).
   */
  bossConfig?: {
    enrageAfterMs: number;
    enragedDamageMul: number;
    phaseTwoHpFraction: number;
    phaseTwoSpeedMul: number;
    phaseTwoDamageMul: number;
  };
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
  /**
   * Specialization id (e.g. 'arcanist') the player chose at
   * SPECIALIZATION_UNLOCK_LEVEL. Null until picked. Drives the
   * spec-level passive layer; proficiency passive engages once
   * level >= PROFICIENCY_LEVEL.
   */
  specializationId?: string | null;
  /**
   * Per-skill upgrade level (default 1). Keys are SkillId; values
   * are 1..(skill.upgrades.length + 1). The cast pipeline reads
   * this and applies the cumulative SkillUpgrade modifiers.
   */
  skillLevels?: Record<string, number>;
  starterProgress?: StarterProgressState;
  /**
   * Per-player quest tracker. `active` maps QuestId → {stageIndex,
   * progress} where progress meaning depends on the current stage's
   * objective kind (kill: counter, reach: 0 or 1, talk: 0 or 1,
   * manual: always 0). `completed` is the set of finished QuestIds.
   * Engine reads QUESTS to interpret these — there is no per-quest
   * code path.
   */
  questState?: PlayerQuestState;
  skillCooldownEndTs: Record<string, number>;
  /**
   * Server clock at the last regen tick. Used by
   * handleResourceRegeneration to compute real elapsed seconds and
   * apply HP / MP regen per second (matching the displayed stat
   * rate), instead of a fixed per-tick amount.
   */
  lastRegenTimeMs?: number;
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
