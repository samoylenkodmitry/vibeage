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
}).strict();

export const instantHitSchema = z.object({
  type: z.literal('InstantHit'),
  skillId: z.string(),
  origin: vec3DSchema,
  targetPos: vec3DSchema,
  hitIds: z.array(z.string()),
  dmg: z.array(z.number()).optional(),
}).strict();

export const skillLearnedSchema = z.object({
  type: z.literal('SkillLearned'),
  skillId: skillIdSchema,
  remainingPoints: z.number(),
}).strict();

export const skillShortcutUpdatedSchema = z.object({
  type: z.literal('SkillShortcutUpdated'),
  slotIndex: z.number().int().min(0).max(8),
  skillId: skillIdSchema.nullable(),
}).strict();

export const classSelectedSchema = z.object({
  type: z.literal('ClassSelected'),
  className: z.string(),
  // PR PP — `baseStats` removed. Class differentiation flows through
  // PASSIVE_SKILL_CONTRIBUTIONS, not a wire-shipped multiplier block.
}).strict();

export const castFailSchema = z.object({
  type: z.literal('CastFail'),
  clientSeq: z.number(),
  reason: z.enum(['cooldown', 'nomana', 'invalid', 'outofrange']),
}).strict();

export const castSnapshotMsgSchema = z.object({
  type: z.literal('CastSnapshot'),
  data: castSnapshotSchema,
}).strict();

export const effectSnapshotTargetMsgSchema = z.object({
  type: z.literal('EffectSnapshot'),
  targetId: z.string(),
  effects: z.array(statusEffectSchema),
}).strict();

export const effectSnapshotSingleMsgSchema = z.object({
  type: z.literal('EffectSnapshot'),
  id: z.string(),
  src: z.string(),
  effectId: z.string(),
  stacks: z.number(),
  remainingMs: z.number(),
  seed: z.number(),
}).strict();

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
}).strict();

export const enemyAttackSchema = z.object({
  type: z.literal('EnemyAttack'),
  enemyId: z.string(),
  targetId: z.string(),
  damage: z.number(),
}).strict();

/**
 * PR Q — boss telegraph. Server emits one when a mini-boss begins to
 * channel its signature ability, carrying everything the client
 * needs to render the growing ring under (x, z). Impact lands at
 * impactAt (Date.now ms); after that the client should fade the
 * ring out. Damage application is broadcast via EnemyAttack +
 * playerUpdated like any other hit.
 */
export const bossTelegraphSchema = z.object({
  type: z.literal('BossTelegraph'),
  enemyId: z.string(),
  bossName: z.string(),
  abilityName: z.string(),
  x: z.number(),
  z: z.number(),
  radius: z.number(),
  windUpMs: z.number(),
  impactAt: z.number(),
}).strict();

export const inventoryUpdateMsgSchema = z.object({
  type: z.literal('InventoryUpdate'),
  playerId: z.string().optional(),
  inventory: z.array(inventorySlotSchema),
  maxInventorySlots: z.number(),
}).strict();

export const lootAcquiredMsgSchema = z.object({
  type: z.literal('LootAcquired'),
  items: z.array(inventorySlotSchema),
  sourceEnemyName: z.string().optional(),
}).strict();

export const starterProgressUpdateSchema = z.object({
  type: z.literal('StarterProgressUpdate'),
  progress: starterProgressStateSchema,
  rewardGranted: z.boolean().optional(),
}).strict();

export const lootSpawnSchema = z.object({
  type: z.literal('LootSpawn'),
  enemyId: z.string(),
  lootId: z.string().optional(),
  position: z.union([vec3DSchema, vecXZSchema]).optional(),
  loot: z.array(itemDropSchema),
}).strict();

export const itemUsedSchema = z.object({
  type: z.literal('ItemUsed'),
  slotIndex: z.number().int().min(0),
  itemId: z.string(),
  newQuantity: z.number(),
  healthDelta: z.number().optional(),
  manaDelta: z.number().optional(),
}).strict();

export const chatBroadcastSchema = z.object({
  type: z.literal('ChatBroadcast'),
  fromId: z.string(),
  fromName: z.string(),
  text: z.string(),
  scope: z.union([z.literal('near'), z.literal('all')]),
  ts: z.number(),
}).strict();

export const equipmentEntrySchema = z.object({
  slot: z.string(),
  itemId: z.string(),
}).strict();

export const equipmentUpdateSchema = z.object({
  type: z.literal('EquipmentUpdate'),
  equipment: z.array(equipmentEntrySchema),
}).strict();

export const equipFailedSchema = z.object({
  type: z.literal('EquipFailed'),
  reason: z.string(),
}).strict();

export const learnSkillFailedReasonSchema = z.enum([
  'noSkillPoints',
  'levelTooLow',
  'missingPrereq',
  'unknownSkill',
  'wrongClass',
  'alreadyKnown',
]);

export const learnSkillFailedSchema = z.object({
  type: z.literal('LearnSkillFailed'),
  skillId: skillIdSchema,
  reason: learnSkillFailedReasonSchema,
}).strict();

// §46/slice-5 — structured rejection envelope. Replaces the
// patchwork of per-command failure messages with one shape the
// client can route on `requestId` (when the command supplied a
// `clientSeq`) instead of fishing reasons out of console logs.
// `detail` is optional safe context — never include user input
// or PII; it should be the same kind of string we'd write in a
// log line ("slotIndex out of range", "cooldown 1.2s remaining").
export const commandRejectedSchema = z.object({
  type: z.literal('CommandRejected'),
  /** Client's `clientSeq` for the offending command, when set. */
  requestId: z.number().optional(),
  /** The client message `type` the rejection is for (e.g. 'DropItem'). */
  commandType: z.string(),
  /** Short stable enum-ish string the client can branch on. */
  reason: z.string(),
  /** Optional one-line human-readable detail. Safe for direct render. */
  detail: z.string().max(240).optional(),
}).strict();

function getServerMessageSchema(): z.ZodType<unknown> {
  return serverMessageSchema;
}

export const batchUpdateSchema = z.object({
  type: z.literal('BatchUpdate'),
  updates: z.array(z.lazy(getServerMessageSchema)),
}).strict();

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
  bossTelegraphSchema,
  inventoryUpdateMsgSchema,
  lootAcquiredMsgSchema,
  starterProgressUpdateSchema,
  lootPickupSchema,
  lootSpawnSchema,
  itemUsedSchema,
  batchUpdateSchema,
  chatBroadcastSchema,
  equipmentUpdateSchema,
  equipFailedSchema,
  learnSkillFailedSchema,
  commandRejectedSchema,
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

export type BossTelegraph = {
  type: 'BossTelegraph';
  enemyId: string;
  bossName: string;
  abilityName: string;
  x: number;
  z: number;
  radius: number;
  windUpMs: number;
  impactAt: number;
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

export type ChatBroadcast = {
  type: 'ChatBroadcast';
  fromId: string;
  fromName: string;
  text: string;
  scope: 'near' | 'all';
  ts: number;
};

export type EquipmentEntry = {
  slot: string;
  itemId: string;
};

export type EquipmentUpdateMsg = {
  type: 'EquipmentUpdate';
  equipment: EquipmentEntry[];
};

export type EquipFailedMsg = {
  type: 'EquipFailed';
  reason: string;
};

export type LearnSkillFailedReason = z.infer<typeof learnSkillFailedReasonSchema>;

export type LearnSkillFailedMsg = {
  type: 'LearnSkillFailed';
  skillId: SkillId;
  reason: LearnSkillFailedReason;
};

// §46/slice-5 — structured rejection envelope. See schema for the
// contract; consumers route on `requestId` (the client's matching
// `clientSeq`) to surface per-request rejection UX without parsing
// log lines.
export type CommandRejected = {
  type: 'CommandRejected';
  requestId?: number;
  commandType: string;
  reason: string;
  detail?: string;
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
  | BossTelegraph
  | InventoryUpdateMsg
  | LootAcquiredMsg
  | StarterProgressUpdate
  | LootPickup
  | LootSpawn
  | ItemUsed
  | BatchUpdate
  | ChatBroadcast
  | EquipmentUpdateMsg
  | EquipFailedMsg
  | LearnSkillFailedMsg
  | CommandRejected;
