import type { SkillId } from '../../../packages/content/skills';
import type { CharacterClass } from '../../../packages/content/classes';
import type {
  CastSnapshot,
  ItemDrop,
  InventorySlot,
  PlayerMovementState,
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

export type StarterProgress = {
  defeatedEnemies: number;
  defeatedEnemyIds: string[];
  lootPickups: number;
  levelReached: number;
  learnedSkills: number;
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
  inventory: InventorySlot[];
  maxInventorySlots: number;
  combatLog: CombatLine[];
  starterProgress: StarterProgress;
};
