import type { SkillId } from '../../../packages/content/skills';
import type { CharacterClass } from '../../../packages/content/classes';
import type {
  CastSnapshot,
  ItemDrop,
  InventorySlot,
  PlayerMovementState,
  StarterProgressState,
  StatusEffect,
  VecXZ,
} from '../../../packages/protocol/messages';

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type PlayerEntity = {
  id: string;
  socketId?: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  className: CharacterClass;
  race?: string;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  isAlive: boolean;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  starterProgress?: StarterProgressState;
  specializationId?: string | null;
  skillLevels?: Record<string, number>;
  questState?: {
    active: Record<string, { stageIndex: number; progress: number; readyToClaim?: boolean }>;
    completed: string[];
  };
  skillCooldownEndTs: Record<string, number>;
  castingSkill: SkillId | null;
  castingProgressMs: number;
  statusEffects: StatusEffect[];
  movement?: PlayerMovementState;
  velocity?: VecXZ;
  inventory?: InventorySlot[];
  maxInventorySlots?: number;
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
};

export type EnemyEntity = {
  id: string;
  type: string;
  name: string;
  level: number;
  position: Vec3;
  spawnPosition?: Vec3;
  rotation: Vec3;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  statusEffects?: StatusEffect[];
  velocity?: VecXZ;
  aiState?: string;
  packId?: string;
  isMiniBoss?: boolean;
  bossId?: string;
};

export type ServerGameState = {
  players?: Record<string, PlayerEntity>;
  enemies?: Record<string, EnemyEntity>;
  groundLoot?: Record<string, {
    position: VecXZ | Vec3;
    items: ItemDrop[];
  }>;
  zones?: {
    activeZoneIds?: string[];
    playerZoneIds?: Record<string, string>;
    enemyZoneIds?: Record<string, string>;
  };
};

export type WorldRegionPublicState = {
  id: string;
  zoneId: string;
  name: string;
  active: boolean;
  playerCount: number;
  enemyCount: number;
  aliveEnemyCount: number;
  maxEnemies: number;
};

export type WorldPublicPlayerPresence = {
  id: string;
  name: string;
  className: CharacterClass | string;
  level: number;
  isAlive: boolean;
  regionId: string;
};

export type WorldPublicState = {
  revision: number;
  playerCount: number;
  enemyCount: number;
  aliveEnemyCount: number;
  activeRegionCount: number;
  regionCount: number;
  regions: Record<string, WorldRegionPublicState>;
  players: Record<string, WorldPublicPlayerPresence>;
};

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'joining'
  | 'online'
  | 'offline'
  | 'rejected';

export type VisibleCast = {
  snapshot: CastSnapshot;
  seenAt: number;
};

export type CombatLine = {
  id: string;
  text: string;
};

export type GroundLootStack = {
  id: string;
  position: Vec3;
  items: ItemDrop[];
};

export type VisualEventKind = 'healing' | 'mana' | 'splash' | 'petrify' | 'damage';

export type VisualEvent = {
  id: string;
  kind: VisualEventKind;
  position: Vec3;
  amount?: number;
  radius?: number;
  createdAt: number;
};

export type StarterProgress = StarterProgressState;

export type ChatScopeView = 'near' | 'all';

export type ChatLine = {
  id: string;
  fromId: string;
  fromName: string;
  text: string;
  scope: ChatScopeView;
  ts: number;
};

export type GameClientState = {
  connectionState: ConnectionState;
  message: string;
  myPlayerId: string | null;
  players: Record<string, PlayerEntity>;
  enemies: Record<string, EnemyEntity>;
  groundLoot: Record<string, GroundLootStack>;
  selectedTargetId: string | null;
  targetWorldPos: Vec3 | null;
  casts: Record<string, VisibleCast>;
  visualEvents: Record<string, VisualEvent>;
  nextVisualEventSeq: number;
  inventory: InventorySlot[];
  maxInventorySlots: number;
  equipment: Record<string, string>;
  /** Last server reject of a LearnSkill attempt, keyed by SkillId. */
  learnSkillRejections: Record<string, string>;
  combatLog: CombatLine[];
  chatLines: ChatLine[];
  starterProgress: StarterProgress;
  worldPublicState: WorldPublicState | null;
  streamedRegionIds: string[];
  /**
   * Pending approach-and-cast. When the player presses a targeted skill
   * with the target out of range, we queue the cast here, send a
   * MoveIntent toward the target, and fire the actual CastReq once the
   * polling loop sees us in range (or expire it after expiresAtTs).
   */
  pendingCast: PendingCast | null;
  /**
   * Pending approach-and-pickup. Mirrors pendingCast: player presses
   * the Pickup action, we walk toward the nearest GroundLoot stack and
   * send a LootPickup once we're close enough (or expire after TTL).
   */
  pendingPickup: PendingPickup | null;
  /**
   * Auto-attack: pressing Basic Attack (or any autoRepeat skill) sets
   * this and the polling tick keeps re-casting it at the same target
   * every cooldown. Cleared on target death, manual move, deselect,
   * different skill cast, or player death.
   */
  autoAttack: AutoAttack | null;
  /**
   * Active boss telegraphs. Server broadcasts a BossTelegraph when a
   * mini-boss begins to channel its signature; the renderer draws a
   * ring on the ground that grows toward `impactAt`. Entries are
   * pruned automatically once they're a second past impact.
   */
  bossTelegraphs: BossTelegraphEntry[];
};

export type BossTelegraphEntry = {
  enemyId: string;
  bossName: string;
  abilityName: string;
  x: number;
  z: number;
  radius: number;
  startedAt: number;
  impactAt: number;
};

export type PendingCast = {
  skillId: string;
  targetId: string;
  expiresAtTs: number;
};

export type PendingPickup = {
  lootId: string;
  expiresAtTs: number;
};

export type AutoAttack = {
  skillId: string;
  targetId: string;
};
