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
  level: number;
  experience: number;
  experienceToNextLevel: number;
  isAlive: boolean;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  starterProgress?: StarterProgressState;
  skillCooldownEndTs: Record<string, number>;
  castingSkill: SkillId | null;
  castingProgressMs: number;
  statusEffects: StatusEffect[];
  movement?: PlayerMovementState;
  velocity?: VecXZ;
  inventory?: InventorySlot[];
  maxInventorySlots?: number;
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
  combatLog: CombatLine[];
  chatLines: ChatLine[];
  starterProgress: StarterProgress;
  worldPublicState: WorldPublicState | null;
  streamedRegionIds: string[];
};
