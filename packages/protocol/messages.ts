import { z } from 'zod';
import type { SkillId } from '../content/skills';
import type { ItemId } from '../content/items';

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
  pos: VecXZ;
  dir?: VecXZ;
  startedAt: number;
  castTimeMs: number;
  progressMs: number;
}

export interface StatusEffect {
  id: string;
  type: string;
  value: number;
  durationMs: number;
  startTimeTs: number;
  sourceSkill: string;
  stacks?: number;
}

export const skillIdValues = ['fireball', 'iceBolt', 'waterSplash', 'petrify'] as const satisfies readonly SkillId[];
export const skillIdSchema = z.enum(skillIdValues);

export const vecXZSchema = z.object({
  x: z.number(),
  z: z.number(),
}).passthrough().superRefine((value, ctx) => {
  if ('y' in value && typeof value.y !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['y'],
      message: 'Expected number',
    });
  }
});

export const vec3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
}).passthrough();

export const predictionKeyframeSchema = z.object({
  pos: vecXZSchema,
  rotY: z.number().optional(),
  ts: z.number(),
}).passthrough();

export const playerMovementStateSchema = z.object({
  isMoving: z.boolean(),
  targetPos: vecXZSchema.nullable().optional(),
  lastUpdateTime: z.number(),
  speed: z.number(),
}).passthrough();

export const statusEffectSchema = z.object({
  id: z.string(),
  type: z.string(),
  value: z.number(),
  durationMs: z.number(),
  startTimeTs: z.number(),
  sourceSkill: z.string(),
  stacks: z.number().optional(),
}).passthrough();

export const inventorySlotSchema = z.object({
  itemId: z.string(),
  quantity: z.number(),
}).passthrough();

export const castSnapshotSchema = z.object({
  castId: z.string(),
  casterId: z.string(),
  skillId: skillIdSchema,
  state: z.nativeEnum(CastState),
  origin: vecXZSchema,
  pos: vecXZSchema,
  dir: vecXZSchema.optional(),
  startedAt: z.number(),
  castTimeMs: z.number(),
  progressMs: z.number(),
}).passthrough();

export const moveIntentSchema = z.object({
  type: z.literal('MoveIntent'),
  id: z.string(),
  targetPos: vecXZSchema,
  clientTs: z.number(),
  seq: z.number().optional(),
}).passthrough();

export const castReqSchema = z.object({
  type: z.literal('CastReq'),
  id: z.string(),
  skillId: skillIdSchema,
  targetId: z.string().optional(),
  targetPos: vecXZSchema.optional(),
  clientTs: z.number(),
}).passthrough();

export const learnSkillSchema = z.object({
  type: z.literal('LearnSkill'),
  skillId: skillIdSchema,
}).passthrough();

export const setSkillShortcutSchema = z.object({
  type: z.literal('SetSkillShortcut'),
  slotIndex: z.number().int().min(0).max(8),
  skillId: skillIdSchema.nullable(),
}).passthrough();

export const selectClassSchema = z.object({
  type: z.literal('SelectClass'),
  className: z.string(),
}).passthrough();

export const respawnRequestSchema = z.object({
  type: z.literal('RespawnRequest'),
  id: z.string(),
  clientTs: z.number(),
}).passthrough();

export const lootPickupSchema = z.object({
  type: z.literal('LootPickup'),
  lootId: z.string(),
  playerId: z.string(),
}).passthrough();

export const useItemSchema = z.object({
  type: z.literal('UseItem'),
  slotIndex: z.number().int().min(0),
  clientTs: z.number(),
}).passthrough();

export const requestInventorySchema = z.object({
  type: z.literal('RequestInventory'),
}).passthrough();

export const clientMessageSchema = z.discriminatedUnion('type', [
  moveIntentSchema,
  castReqSchema,
  learnSkillSchema,
  setSkillShortcutSchema,
  selectClassSchema,
  respawnRequestSchema,
  lootPickupSchema,
  useItemSchema,
  requestInventorySchema,
]);

export const posSnapSchema = z.object({
  type: z.literal('PosSnap'),
  id: z.string(),
  pos: vecXZSchema,
  vel: vecXZSchema,
  rotY: z.number().optional(),
  snapTs: z.number(),
  seq: z.number().optional(),
  predictions: z.array(predictionKeyframeSchema).optional(),
}).passthrough();

export const instantHitSchema = z.object({
  type: z.literal('InstantHit'),
  skillId: z.string(),
  origin: vec3DSchema,
  targetPos: vec3DSchema,
  hitIds: z.array(z.string()),
  dmg: z.array(z.number()).optional(),
}).passthrough();

export const skillLearnedSchema = z.object({
  type: z.literal('SkillLearned'),
  skillId: skillIdSchema,
  remainingPoints: z.number(),
}).passthrough();

export const skillShortcutUpdatedSchema = z.object({
  type: z.literal('SkillShortcutUpdated'),
  slotIndex: z.number().int().min(0).max(8),
  skillId: skillIdSchema.nullable(),
}).passthrough();

export const classSelectedSchema = z.object({
  type: z.literal('ClassSelected'),
  className: z.string(),
  baseStats: z.object({
    healthMultiplier: z.number(),
    manaMultiplier: z.number(),
    damageMultiplier: z.number(),
    speedMultiplier: z.number(),
  }).passthrough(),
}).passthrough();

export const castFailSchema = z.object({
  type: z.literal('CastFail'),
  clientSeq: z.number(),
  reason: z.enum(['cooldown', 'nomana', 'invalid', 'outofrange']),
}).passthrough();

export const castSnapshotMsgSchema = z.object({
  type: z.literal('CastSnapshot'),
  data: castSnapshotSchema,
}).passthrough();

export const effectSnapshotMsgSchema = z.union([
  z.object({
    type: z.literal('EffectSnapshot'),
    targetId: z.string(),
    effects: z.array(statusEffectSchema),
  }).passthrough(),
  z.object({
    type: z.literal('EffectSnapshot'),
    id: z.string(),
    src: z.string(),
    effectId: z.string(),
    stacks: z.number(),
    remainingMs: z.number(),
    seed: z.number(),
  }).passthrough(),
]);

export const combatLogMsgSchema = z.object({
  type: z.literal('CombatLog'),
  castId: z.string(),
  skillId: z.string(),
  casterId: z.string(),
  targets: z.array(z.string()),
  damages: z.array(z.number()),
}).passthrough();

export const enemyAttackSchema = z.object({
  type: z.literal('EnemyAttack'),
  enemyId: z.string(),
  targetId: z.string(),
  damage: z.number(),
}).passthrough();

export const inventoryUpdateMsgSchema = z.object({
  type: z.literal('InventoryUpdate'),
  playerId: z.string().optional(),
  inventory: z.array(inventorySlotSchema),
  maxInventorySlots: z.number(),
}).passthrough();

export const lootAcquiredMsgSchema = z.object({
  type: z.literal('LootAcquired'),
  items: z.array(inventorySlotSchema),
  sourceEnemyName: z.string().optional(),
}).passthrough();

export const itemDropSchema = z.object({
  itemId: z.string(),
  quantity: z.number(),
}).passthrough();

export const lootSpawnSchema = z.object({
  type: z.literal('LootSpawn'),
  enemyId: z.string(),
  lootId: z.string().optional(),
  position: z.union([vec3DSchema, vecXZSchema]).optional(),
  loot: z.array(itemDropSchema),
}).passthrough();

export const itemUsedSchema = z.object({
  type: z.literal('ItemUsed'),
  slotIndex: z.number().int().min(0),
  itemId: z.string(),
  newQuantity: z.number(),
  healthDelta: z.number().optional(),
  manaDelta: z.number().optional(),
}).passthrough();

export const batchUpdateSchema = z.object({
  type: z.literal('BatchUpdate'),
  updates: z.array(z.lazy(() => serverMessageSchema)),
}).passthrough();

export const nonEffectServerMessageSchema = z.discriminatedUnion('type', [
  posSnapSchema,
  instantHitSchema,
  skillLearnedSchema,
  skillShortcutUpdatedSchema,
  classSelectedSchema,
  castFailSchema,
  castSnapshotMsgSchema,
  combatLogMsgSchema,
  enemyAttackSchema,
  inventoryUpdateMsgSchema,
  lootAcquiredMsgSchema,
  lootPickupSchema,
  lootSpawnSchema,
  itemUsedSchema,
  batchUpdateSchema,
]);

export const serverMessageSchema = z.union([
  nonEffectServerMessageSchema,
  effectSnapshotMsgSchema,
]);

export interface VecXZ {
  x: number;
  z: number;
}

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

export interface PredictionKeyframe {
  pos: VecXZ;
  rotY?: number;
  ts: number;
}

export interface PlayerMovementState {
  isMoving: boolean;
  targetPos?: VecXZ | null;
  lastUpdateTime: number;
  speed: number;
}

export interface MoveIntent {
  type: 'MoveIntent';
  id: string;
  targetPos: VecXZ;
  clientTs: number;
  seq?: number;
}

export interface CastReq {
  type: 'CastReq';
  id: string;
  skillId: SkillId;
  targetId?: string;
  targetPos?: VecXZ;
  clientTs: number;
}

export interface LearnSkill {
  type: 'LearnSkill';
  skillId: SkillId;
}

export interface SetSkillShortcut {
  type: 'SetSkillShortcut';
  slotIndex: number;
  skillId: SkillId | null;
}

export interface SelectClass {
  type: 'SelectClass';
  className: string;
}

export interface RespawnRequest {
  type: 'RespawnRequest';
  id: string;
  clientTs: number;
}

export interface LootPickup {
  type: 'LootPickup';
  lootId: string;
  playerId: string;
}

export interface UseItem {
  type: 'UseItem';
  slotIndex: number;
  clientTs: number;
}

export interface RequestInventory {
  type: 'RequestInventory';
}

export interface PosSnap {
  type: 'PosSnap';
  id: string;
  pos: VecXZ;
  vel: VecXZ;
  rotY?: number;
  snapTs: number;
  seq?: number;
  predictions?: PredictionKeyframe[];
}

export interface InstantHit {
  type: 'InstantHit';
  skillId: string;
  origin: Vec3D;
  targetPos: Vec3D;
  hitIds: string[];
  dmg?: number[];
}

export interface SkillLearned {
  type: 'SkillLearned';
  skillId: SkillId;
  remainingPoints: number;
}

export interface SkillShortcutUpdated {
  type: 'SkillShortcutUpdated';
  slotIndex: number;
  skillId: SkillId | null;
}

export interface ClassSelected {
  type: 'ClassSelected';
  className: string;
  baseStats: {
    healthMultiplier: number;
    manaMultiplier: number;
    damageMultiplier: number;
    speedMultiplier: number;
  };
}

export interface CastFail {
  type: 'CastFail';
  clientSeq: number;
  reason: 'cooldown' | 'nomana' | 'invalid' | 'outofrange';
}

export interface CastSnapshotMsg {
  type: 'CastSnapshot';
  data: CastSnapshot;
}

export interface EffectSnapshotTargetMsg {
  type: 'EffectSnapshot';
  targetId: string;
  effects: StatusEffect[];
  id?: never;
}

export interface EffectSnapshotSingleMsg {
  type: 'EffectSnapshot';
  targetId?: never;
  effects?: never;
  id: string;
  src: string;
  effectId: string;
  stacks: number;
  remainingMs: number;
  seed: number;
}

export type EffectSnapshotMsg = EffectSnapshotTargetMsg | EffectSnapshotSingleMsg;

export interface CombatLogMsg {
  type: 'CombatLog';
  castId: string;
  skillId: string;
  casterId: string;
  targets: string[];
  damages: number[];
}

export interface EnemyAttack {
  type: 'EnemyAttack';
  enemyId: string;
  targetId: string;
  damage: number;
}

export interface InventoryUpdateMsg {
  type: 'InventoryUpdate';
  playerId?: string;
  inventory: InventorySlot[];
  maxInventorySlots: number;
}

export interface LootAcquiredMsg {
  type: 'LootAcquired';
  items: InventorySlot[];
  sourceEnemyName?: string;
}

export interface ItemDrop {
  itemId: string;
  quantity: number;
}

export interface LootSpawn {
  type: 'LootSpawn';
  enemyId: string;
  lootId?: string;
  position?: VecXZ | Vec3D;
  loot: ItemDrop[];
}

export interface ItemUsed {
  type: 'ItemUsed';
  slotIndex: number;
  itemId: ItemId;
  newQuantity: number;
  healthDelta?: number;
  manaDelta?: number;
}

export interface BatchUpdate {
  type: 'BatchUpdate';
  updates: ServerMessage[];
}

export type ClientMessage =
  | MoveIntent
  | CastReq
  | LearnSkill
  | SetSkillShortcut
  | SelectClass
  | RespawnRequest
  | LootPickup
  | UseItem
  | RequestInventory;

export type ServerMessage =
  | PosSnap
  | InstantHit
  | SkillLearned
  | SkillShortcutUpdated
  | ClassSelected
  | CastFail
  | CastSnapshotMsg
  | EffectSnapshotMsg
  | CombatLogMsg
  | EnemyAttack
  | InventoryUpdateMsg
  | LootAcquiredMsg
  | LootPickup
  | LootSpawn
  | ItemUsed
  | BatchUpdate;

/** @deprecated Removed in protocol v2 - use CastSnapshot pipeline instead. */
export interface ProjHit2 {
  type: 'ProjHit2';
  castId: string;
  hitIds: string[];
  dmg: number[];
  impactPos?: VecXZ;
}

/** @deprecated Removed in protocol v2 - use CastSnapshot pipeline instead. */
export interface ProjSpawn2 {
  type: 'ProjSpawn2';
  castId: string;
  skillId: string;
  origin: Vec3D;
  dir: VecXZ;
  speed: number;
  launchTs: number;
  casterId: string;
  hitRadius?: number;
  travelMs?: number;
}

export function describeProtocolError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

export function safeParseClientMessage(message: unknown): z.SafeParseReturnType<unknown, ClientMessage> {
  return clientMessageSchema.safeParse(message) as z.SafeParseReturnType<unknown, ClientMessage>;
}

export function safeParseServerMessage(message: unknown): z.SafeParseReturnType<unknown, ServerMessage> {
  return serverMessageSchema.safeParse(message) as z.SafeParseReturnType<unknown, ServerMessage>;
}
