import { z } from 'zod';
import type { SkillId } from '../content/skills.js';
import { skillIdSchema, vecXZSchema, type VecXZ } from './common.js';

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

export const selectRaceSchema = z.object({
  type: z.literal('SelectRace'),
  race: z.string(),
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

export const devTeleportSchema = z.object({
  type: z.literal('DevTeleport'),
  id: z.string(),
  targetPos: vecXZSchema,
  clientTs: z.number(),
}).passthrough();

export const chatRequestSchema = z.object({
  type: z.literal('ChatRequest'),
  text: z.string().min(1).max(240),
  scope: z.union([z.literal('near'), z.literal('all')]),
  clientTs: z.number(),
}).passthrough();

export const equipItemSchema = z.object({
  type: z.literal('EquipItem'),
  slotIndex: z.number().int().min(0),
  requestedSlot: z.string().optional(),
}).passthrough();

export const unequipItemSchema = z.object({
  type: z.literal('UnequipItem'),
  slot: z.string(),
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
  devTeleportSchema,
  chatRequestSchema,
  equipItemSchema,
  unequipItemSchema,
  selectRaceSchema,
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

export type ClientMessage =
  | MoveIntent
  | CastReq
  | LearnSkill
  | SetSkillShortcut
  | SelectClass
  | RespawnRequest
  | LootPickup
  | UseItem
  | RequestInventory
  | DevTeleport
  | ChatRequest
  | EquipItem
  | UnequipItem
  | SelectRace;
