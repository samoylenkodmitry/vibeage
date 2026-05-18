import { z } from 'zod';
import type { SkillId } from '../content/skills.js';
import { skillIdSchema, vecXZSchema, type VecXZ } from './common.js';

export const moveIntentSchema = z.object({
  type: z.literal('MoveIntent'),
  id: z.string(),
  targetPos: vecXZSchema,
  clientTs: z.number(),
  seq: z.number().optional(),
}).strict();

export const castReqSchema = z.object({
  type: z.literal('CastReq'),
  id: z.string(),
  skillId: skillIdSchema,
  targetId: z.string().optional(),
  targetPos: vecXZSchema.optional(),
  clientTs: z.number(),
}).strict();

export const learnSkillSchema = z.object({
  type: z.literal('LearnSkill'),
  skillId: skillIdSchema,
}).strict();

export const setSkillShortcutSchema = z.object({
  type: z.literal('SetSkillShortcut'),
  slotIndex: z.number().int().min(0).max(8),
  skillId: skillIdSchema.nullable(),
}).strict();

export const selectClassSchema = z.object({
  type: z.literal('SelectClass'),
  className: z.string(),
}).strict();

export const selectRaceSchema = z.object({
  type: z.literal('SelectRace'),
  race: z.string(),
}).strict();

export const respawnRequestSchema = z.object({
  type: z.literal('RespawnRequest'),
  id: z.string(),
  clientTs: z.number(),
}).strict();

export const lootPickupSchema = z.object({
  type: z.literal('LootPickup'),
  lootId: z.string(),
  playerId: z.string(),
}).strict();

export const useItemSchema = z.object({
  type: z.literal('UseItem'),
  slotIndex: z.number().int().min(0),
  clientTs: z.number(),
}).strict();

export const craftItemSchema = z.object({
  type: z.literal('CraftItem'),
  recipeSlotIndex: z.number().int().min(0),
  clientTs: z.number(),
}).strict();

export const requestInventorySchema = z.object({
  type: z.literal('RequestInventory'),
}).strict();

export const devTeleportSchema = z.object({
  type: z.literal('DevTeleport'),
  id: z.string(),
  targetPos: vecXZSchema,
  clientTs: z.number(),
}).strict();

export const chatRequestSchema = z.object({
  type: z.literal('ChatRequest'),
  text: z.string().min(1).max(240),
  scope: z.union([z.literal('near'), z.literal('all')]),
  clientTs: z.number(),
}).strict();

export const equipItemSchema = z.object({
  type: z.literal('EquipItem'),
  slotIndex: z.number().int().min(0),
  requestedSlot: z.string().optional(),
}).strict();

export const unequipItemSchema = z.object({
  type: z.literal('UnequipItem'),
  slot: z.string(),
}).strict();

export const selectSpecializationSchema = z.object({
  type: z.literal('SelectSpecialization'),
  specializationId: z.string(),
}).strict();

export const upgradeSkillSchema = z.object({
  type: z.literal('UpgradeSkill'),
  skillId: skillIdSchema,
}).strict();

export const talkNpcSchema = z.object({
  type: z.literal('TalkNpc'),
  npcId: z.string(),
}).strict();

export const acceptQuestSchema = z.object({
  type: z.literal('AcceptQuest'),
  questId: z.string(),
}).strict();

export const cancelQuestSchema = z.object({
  type: z.literal('CancelQuest'),
  questId: z.string(),
}).strict();

export const advanceQuestSchema = z.object({
  type: z.literal('AdvanceQuest'),
  questId: z.string(),
}).strict();

export const claimQuestRewardSchema = z.object({
  type: z.literal('ClaimQuestReward'),
  questId: z.string(),
}).strict();

// ---- GM commands. Server gates by VIBEAGE_ENABLE_DEV_COMMANDS. -----
// targetId omitted = the caller (most common: a GM modifying their
// own test character). Each verb is a flat shape so the audit log
// can capture verb + value cleanly.
export const gmCommandSchema = z.object({
  type: z.literal('GmCommand'),
  targetId: z.string().optional(),
  verb: z.enum([
    'grantXp', 'grantGold', 'grantSp', 'grantItem', 'grantSkill',
    'setLevel', 'setRace', 'setClass', 'setSpecialization',
  ]),
  value: z.union([z.number(), z.string()]),
  // Optional quantity for grantItem; defaults to 1.
  quantity: z.number().optional(),
}).strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  moveIntentSchema,
  castReqSchema,
  learnSkillSchema,
  setSkillShortcutSchema,
  selectClassSchema,
  respawnRequestSchema,
  lootPickupSchema,
  useItemSchema,
  craftItemSchema,
  requestInventorySchema,
  devTeleportSchema,
  chatRequestSchema,
  equipItemSchema,
  unequipItemSchema,
  selectRaceSchema,
  selectSpecializationSchema,
  upgradeSkillSchema,
  talkNpcSchema,
  acceptQuestSchema,
  cancelQuestSchema,
  advanceQuestSchema,
  claimQuestRewardSchema,
  gmCommandSchema,
]);

export type MoveIntent = {
  type: 'MoveIntent';
  id: string;
  targetPos: VecXZ;
  clientTs: number;
  seq?: number;
};

export type CastReq = {
  type: 'CastReq';
  id: string;
  skillId: SkillId;
  targetId?: string;
  targetPos?: VecXZ;
  clientTs: number;
};

export type LearnSkill = {
  type: 'LearnSkill';
  skillId: SkillId;
};

export type SetSkillShortcut = {
  type: 'SetSkillShortcut';
  slotIndex: number;
  skillId: SkillId | null;
};

export type SelectClass = {
  type: 'SelectClass';
  className: string;
};

export type SelectRace = {
  type: 'SelectRace';
  race: string;
};

export type RespawnRequest = {
  type: 'RespawnRequest';
  id: string;
  clientTs: number;
};

export type LootPickup = {
  type: 'LootPickup';
  lootId: string;
  playerId: string;
};

export type UseItem = {
  type: 'UseItem';
  slotIndex: number;
  clientTs: number;
};

export type CraftItem = {
  type: 'CraftItem';
  recipeSlotIndex: number;
  clientTs: number;
};

export type RequestInventory = {
  type: 'RequestInventory';
};

export type DevTeleport = {
  type: 'DevTeleport';
  id: string;
  targetPos: VecXZ;
  clientTs: number;
};

export type ChatScope = 'near' | 'all';

export type ChatRequest = {
  type: 'ChatRequest';
  text: string;
  scope: ChatScope;
  clientTs: number;
};

export type EquipItem = {
  type: 'EquipItem';
  slotIndex: number;
  requestedSlot?: string;
};

export type UnequipItem = {
  type: 'UnequipItem';
  slot: string;
};

export type SelectSpecialization = {
  type: 'SelectSpecialization';
  specializationId: string;
};

export type UpgradeSkill = {
  type: 'UpgradeSkill';
  skillId: SkillId;
};

export type TalkNpc = { type: 'TalkNpc'; npcId: string };
export type AcceptQuest = { type: 'AcceptQuest'; questId: string };
export type CancelQuest = { type: 'CancelQuest'; questId: string };
export type AdvanceQuest = { type: 'AdvanceQuest'; questId: string };
export type ClaimQuestReward = { type: 'ClaimQuestReward'; questId: string };

export type GmCommandVerb =
  | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
  | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';

export type GmCommand = {
  type: 'GmCommand';
  /** Target player id; defaults to the caller when omitted. */
  targetId?: string;
  verb: GmCommandVerb;
  value: number | string;
  /** Quantity for grantItem (defaults to 1). */
  quantity?: number;
};

export type ClientMessage =
  | MoveIntent
  | CastReq
  | LearnSkill
  | SetSkillShortcut
  | SelectClass
  | RespawnRequest
  | LootPickup
  | UseItem
  | CraftItem
  | RequestInventory
  | DevTeleport
  | ChatRequest
  | EquipItem
  | UnequipItem
  | SelectRace
  | SelectSpecialization
  | UpgradeSkill
  | TalkNpc
  | AcceptQuest
  | CancelQuest
  | AdvanceQuest
  | ClaimQuestReward
  | GmCommand;
