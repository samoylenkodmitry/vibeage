import { z } from 'zod';
import type { ItemId } from '../content/items.js';
import type { SkillId } from '../content/skills.js';
import {
  castSnapshotSchema,
  inventorySlotSchema,
  itemDropSchema,
  predictionKeyframeSchema,
  skillIdSchema,
  statusEffectSchema,
  vec3DSchema,
  vecXZSchema,
  type CastSnapshot,
  type InventorySlot,
  type ItemDrop,
  type PredictionKeyframe,
  type StatusEffect,
  type Vec3D,
  type VecXZ,
} from './common.js';
import { lootPickupSchema, type LootPickup } from './clientMessages.js';
import { starterProgressStateSchema, type StarterProgressState } from './starterProgress.js';

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

export const effectSnapshotTargetMsgSchema = z.object({
  type: z.literal('EffectSnapshot'),
  targetId: z.string(),
  effects: z.array(statusEffectSchema),
}).passthrough();

export const effectSnapshotSingleMsgSchema = z.object({
  type: z.literal('EffectSnapshot'),
  id: z.string(),
  src: z.string(),
  effectId: z.string(),
  stacks: z.number(),
  remainingMs: z.number(),
  seed: z.number(),
}).passthrough();

export const effectSnapshotMsgSchema = z.union([
  effectSnapshotTargetMsgSchema,
  effectSnapshotSingleMsgSchema,
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

export const starterProgressUpdateSchema = z.object({
  type: z.literal('StarterProgressUpdate'),
  progress: starterProgressStateSchema,
  rewardGranted: z.boolean().optional(),
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
  starterProgressUpdateSchema,
  lootPickupSchema,
  lootSpawnSchema,
  itemUsedSchema,
  batchUpdateSchema,
]);

export const serverMessageSchema = z.union([
  nonEffectServerMessageSchema,
  effectSnapshotMsgSchema,
]);

export type PosSnap = {
  type: 'PosSnap';
  id: string;
  pos: VecXZ;
  vel: VecXZ;
  rotY?: number;
  snapTs: number;
  seq?: number;
  predictions?: PredictionKeyframe[];
};

export type InstantHit = {
  type: 'InstantHit';
  skillId: string;
  origin: Vec3D;
  targetPos: Vec3D;
  hitIds: string[];
  dmg?: number[];
};

export type SkillLearned = {
  type: 'SkillLearned';
  skillId: SkillId;
  remainingPoints: number;
};

export type SkillShortcutUpdated = {
  type: 'SkillShortcutUpdated';
  slotIndex: number;
  skillId: SkillId | null;
};

export type ClassSelected = {
  type: 'ClassSelected';
  className: string;
  baseStats: {
    healthMultiplier: number;
    manaMultiplier: number;
    damageMultiplier: number;
    speedMultiplier: number;
  };
};

export type CastFail = {
  type: 'CastFail';
  clientSeq: number;
  reason: 'cooldown' | 'nomana' | 'invalid' | 'outofrange';
};

export type CastSnapshotMsg = {
  type: 'CastSnapshot';
  data: CastSnapshot;
};

export type EffectSnapshotTargetMsg = {
  type: 'EffectSnapshot';
  targetId: string;
  effects: StatusEffect[];
  id?: never;
};

export type EffectSnapshotSingleMsg = {
  type: 'EffectSnapshot';
  targetId?: never;
  effects?: never;
  id: string;
  src: string;
  effectId: string;
  stacks: number;
  remainingMs: number;
  seed: number;
};

export type EffectSnapshotMsg = EffectSnapshotTargetMsg | EffectSnapshotSingleMsg;

export type CombatLogMsg = {
  type: 'CombatLog';
  castId: string;
  skillId: string;
  casterId: string;
  targets: string[];
  damages: number[];
};

export type EnemyAttack = {
  type: 'EnemyAttack';
  enemyId: string;
  targetId: string;
  damage: number;
};

export type InventoryUpdateMsg = {
  type: 'InventoryUpdate';
  playerId?: string;
  inventory: InventorySlot[];
  maxInventorySlots: number;
};

export type LootAcquiredMsg = {
  type: 'LootAcquired';
  items: InventorySlot[];
  sourceEnemyName?: string;
};

export type StarterProgressUpdate = {
  type: 'StarterProgressUpdate';
  progress: StarterProgressState;
  rewardGranted?: boolean;
};

export type LootSpawn = {
  type: 'LootSpawn';
  enemyId: string;
  lootId?: string;
  position?: VecXZ | Vec3D;
  loot: ItemDrop[];
};

export type ItemUsed = {
  type: 'ItemUsed';
  slotIndex: number;
  itemId: ItemId;
  newQuantity: number;
  healthDelta?: number;
  manaDelta?: number;
};

export type BatchUpdate = {
  type: 'BatchUpdate';
  updates: ServerMessage[];
};

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
  | StarterProgressUpdate
  | LootPickup
  | LootSpawn
  | ItemUsed
  | BatchUpdate;
