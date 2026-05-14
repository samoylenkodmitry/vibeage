import type { SkillId } from '../content/skills';
import type {
  CastSnapshot,
  InventorySlot,
  ItemDrop,
  PlayerMovementState,
  PredictionKeyframe,
  StarterProgressState,
  StatusEffect,
  Vec3D,
  VecXZ,
} from '../protocol/messages';

export type EntityId = string;
export type CastId = string;
export type LootId = string;
export type ZoneId = string;

export type AuthoritativeAiState = 'idle' | 'chasing' | 'attacking' | 'returning';

export interface AuthoritativeStats {
  dmgMult?: number;
  critChance?: number;
  critMult?: number;
}

export interface AuthoritativeActorState {
  id: EntityId;
  position: Vec3D;
  rotation: Vec3D;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  targetId?: EntityId | null;
  velocity?: VecXZ;
  posHistory?: PredictionKeyframe[];
  lastUpdateTime?: number;
}

export interface AuthoritativePlayerState extends AuthoritativeActorState {
  socketId: string;
  name: string;
  mana: number;
  maxMana: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  starterProgress?: StarterProgressState;
  skillCooldownEndTs: Record<string, number>;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  castingSkill: string | null;
  castingProgressMs: number;
  deathTimeTs?: number;
  lastSnapTime?: number;
  movement?: PlayerMovementState;
  stats?: AuthoritativeStats;
  inventory: InventorySlot[];
  maxInventorySlots: number;
}

export interface AuthoritativeEnemyState extends AuthoritativeActorState {
  type: string;
  name: string;
  level: number;
  spawnPosition: Vec3D;
  spawnRotation?: number;
  attackDamage: number;
  attackRange: number;
  baseExperienceValue: number;
  experienceValue: number;
  markedForRemoval?: boolean;
  deathTimeTs?: number;
  attackCooldown?: boolean;
  lootTableId?: string;
  aiState: AuthoritativeAiState;
  aggroRadius: number;
  attackCooldownMs: number;
  lastAttackTime: number;
  movementSpeed: number;
}

export interface AuthoritativeProjectileState {
  id: string;
  casterId: EntityId;
  skillId: SkillId;
  pos: VecXZ;
  dir: VecXZ;
  speed: number;
  spawnTs: number;
  targetId?: EntityId;
  hitTargets: EntityId[];
  hitCount: number;
}

export type AuthoritativeCastState = CastSnapshot;
export type AuthoritativeEffectState = StatusEffect;

export interface AuthoritativeGroundLootStack<Item extends ItemDrop = ItemDrop> {
  position: VecXZ;
  items: Item[];
}

export interface AuthoritativeZoneRuntimeState {
  activeZoneIds: ZoneId[];
  playerZoneIds: Record<EntityId, ZoneId>;
  enemyZoneIds: Record<EntityId, ZoneId>;
}

export interface AuthoritativeWorldState<
  Player = AuthoritativePlayerState,
  Enemy = AuthoritativeEnemyState,
  Projectile = AuthoritativeProjectileState,
  Cast = AuthoritativeCastState,
  Effect = AuthoritativeEffectState,
  LootStack = AuthoritativeGroundLootStack,
> {
  players: Record<EntityId, Player>;
  enemies: Record<EntityId, Enemy>;
  activeCasts: Record<CastId, Cast>;
  effectsByTarget: Record<EntityId, Effect[]>;
  projectiles: Projectile[];
  lastProjectileId: number;
  groundLoot: Record<LootId, LootStack>;
  zones: AuthoritativeZoneRuntimeState;
}

export type AuthoritativeEntityState<
  State extends { players: unknown; enemies: unknown },
> = Pick<State, 'players' | 'enemies'>;
