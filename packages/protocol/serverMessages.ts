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
  timeStopFieldSnapshotSchema,
  vec3DSchema,
  vecXZSchema,
  type CastSnapshot,
  type InventorySlot,
  type ItemDrop,
  type PredictionKeyframe,
  type StatusEffect,
  type TimeStopFieldSnapshot,
  type Vec3D,
  type VecXZ,
} from './common.js';
import { lootPickupSchema, type LootPickup } from './clientMessages.js';
import { rejectableCommandSchema, type RejectableCommand } from './commandRejections.js';
import { starterProgressStateSchema, type StarterProgressState } from './starterProgress.js';

export const posSnapSchema = z.object({
  type: z.literal('PosSnap'),
  id: z.string(),
  pos: vecXZSchema,
  vel: vecXZSchema,
  rotY: z.number().optional(),
  snapTs: z.number(),
  seq: z.number().optional(),
  snap: z.boolean().optional(),
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

export const reactionTriggeredSchema = z.object({
  type: z.literal('ReactionTriggered'),
  reactionId: z.string(),
  /** Burst colour flavor (ReactionVfxFlavor) so the client renders the right combo VFX. */
  flavor: z.string(),
  position: vec3DSchema,
  targetId: z.string().optional(),
}).strict();

export const skillLearnedSchema = z.object({
  type: z.literal('SkillLearned'),
  skillId: skillIdSchema,
  remainingPoints: z.number(),
}).strict();

export const classSelectedSchema = z.object({
  type: z.literal('ClassSelected'),
  className: z.string(),
  // PR PP — `baseStats` removed. Class differentiation flows through
  // PASSIVE_SKILL_CONTRIBUTIONS, not a wire-shipped multiplier block.
}).strict();

export const castSnapshotMsgSchema = z.object({
  type: z.literal('CastSnapshot'),
  data: castSnapshotSchema,
}).strict();

export const physicsFieldSnapshotMsgSchema = z.object({
  type: z.literal('PhysicsFieldSnapshot'),
  field: timeStopFieldSnapshotSchema,
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
  /**
   * §49/M2 — parallel to `damages`: whether each hit was a crit.
   * Optional for backwards-compat: pre-§49/M2 messages from older
   * server builds simply omit the array. Client treats absent as
   * "no crits".
   */
  crits: z.array(z.boolean()).optional(),
  /**
   * §52 #6 — parallel to `damages`: whether each hit missed
   * (target's evasion buff dodged it). Optional for the same
   * backwards-compat reason. Client treats absent as "no misses",
   * which matches the pre-§52 invariant that every hit landed.
   */
  misses: z.array(z.boolean()).optional(),
  /**
   * §52 #6 — parallel to `damages`: positive value when a heal
   * effect on the skill restored HP on that target. Overheal is
   * already trimmed against maxHealth. Pure-heal skills emit
   * damages=[0] / heals=[N] so the client can render "X heals Y"
   * instead of "X hit Y for 0".
   */
  heals: z.array(z.number()).optional(),
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
  // Archwork #6 — donut mechanic carries a non-zero safe-spot
  // radius; circle mechanics either omit it or send 0. Older
  // clients that don't render the inner ring still get the outer
  // threat ring at the same place.
  innerRadius: z.number().optional(),
  // Archwork #6 follow-up — cone mechanic. When present, the
  // client renders a wedge instead of a ring: cone vertex at
  // (x, z), forward direction `directionRad` (radians, world
  // XZ plane), length = radius, total arc = 2× halfAngleDeg.
  // Circle / donut mechanics omit these.
  directionRad: z.number().optional(),
  halfAngleDeg: z.number().optional(),
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

export const learnSkillFailedReasonSchema = z.enum([
  'noSkillPoints',
  'levelTooLow',
  'missingPrereq',
  'unknownSkill',
  'wrongClass',
  'alreadyKnown',
]);

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
  /**
   * The client message `type` the rejection is for. Archwork #3 —
   * was `z.string()`, now constrained to the rejectable-command
   * registry in `commandRejections.ts`. A typo in a handler's
   * commandType is now a Zod parse failure on the wire and a TS
   * error at the emit site (once the helper is typed in the
   * sub-work 3 follow-up).
   */
  commandType: rejectableCommandSchema,
  /** Short stable enum-ish string the client can branch on. */
  reason: z.string(),
  /** Optional one-line human-readable detail. Safe for direct render. */
  detail: z.string().max(240).optional(),
  /**
   * §52 #1 — optional command-specific subject id (skill id, item id,
   * vendor id, quest id, etc.). Lets the client hang the rejection
   * next to the right UI element (e.g. the skill icon for a
   * LearnSkill rejection) without having to remember per-command
   * outbound state. Free-form because the meaning is per-commandType.
   */
  targetId: z.string().optional(),
}).strict();

function getServerMessageSchema(): z.ZodType<unknown> {
  return serverMessageSchema;
}

export const batchUpdateSchema = z.object({
  type: z.literal('BatchUpdate'),
  updates: z.array(z.lazy(getServerMessageSchema)),
}).strict();

/**
 * §52 follow-up — free-form system messages addressed to one player.
 * Used for action confirmations that don't fit a structured event
 * (e.g. \"Crafted Worn Sword — consumed Iron Ore ×2, Leather Strap\").
 * Client appends to its combat-log so the player sees a record of
 * what just happened.
 */
export const systemMessageSchema = z.object({
  type: z.literal('SystemMessage'),
  text: z.string(),
  /** Optional category, may drive future styling (info / warn / etc.) */
  kind: z.union([z.literal('info'), z.literal('craft'), z.literal('reward')]).optional(),
}).strict();

export const nonEffectServerMessageSchema = z.discriminatedUnion('type', [
  posSnapSchema,
  instantHitSchema,
  reactionTriggeredSchema,
  skillLearnedSchema,
  classSelectedSchema,
  castSnapshotMsgSchema,
  physicsFieldSnapshotMsgSchema,
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
  commandRejectedSchema,
  systemMessageSchema,
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
  snap?: boolean;
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

export type ReactionTriggered = {
  type: 'ReactionTriggered';
  reactionId: string;
  /** ReactionVfxFlavor — picks the combo burst colour on the client. */
  flavor: string;
  position: Vec3D;
  targetId?: string;
};

export type SkillLearned = {
  type: 'SkillLearned';
  skillId: SkillId;
  remainingPoints: number;
};


export type ClassSelected = {
  type: 'ClassSelected';
  className: string;
};

export type CastSnapshotMsg = {
  type: 'CastSnapshot';
  data: CastSnapshot;
};

export type PhysicsFieldSnapshotMsg = {
  type: 'PhysicsFieldSnapshot';
  field: TimeStopFieldSnapshot;
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
  crits?: boolean[];
  /** §52 #6 — per-target miss flags. Absent = no misses. */
  misses?: boolean[];
  /** §52 #6 — per-target heal amounts (post-cap). Absent = no heal. */
  heals?: number[];
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
  innerRadius?: number;
  directionRad?: number;
  halfAngleDeg?: number;
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

export type LearnSkillFailedReason = z.infer<typeof learnSkillFailedReasonSchema>;

// §46/slice-5 — structured rejection envelope. See schema for the
// contract; consumers route on `requestId` (the client's matching
// `clientSeq`) to surface per-request rejection UX without parsing
// log lines. Archwork #3 — `commandType` is now constrained to
// `RejectableCommand` so a typo at the emit site is a compile error.
export type CommandRejected = {
  type: 'CommandRejected';
  requestId?: number;
  commandType: RejectableCommand;
  reason: string;
  detail?: string;
  /** §52 #1 — optional subject id (skill / item / vendor / quest …). */
  targetId?: string;
};

export type SystemMessage = {
  type: 'SystemMessage';
  text: string;
  kind?: 'info' | 'craft' | 'reward';
};

export type ServerMessage =
  | PosSnap
  | InstantHit
  | ReactionTriggered
  | SkillLearned
  | ClassSelected
  | CastSnapshotMsg
  | PhysicsFieldSnapshotMsg
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
  | CommandRejected
  | SystemMessage;
