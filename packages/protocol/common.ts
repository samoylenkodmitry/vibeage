import { z } from 'zod';
import type { ItemId } from '../content/items.js';
import { SKILL_IDS, type SkillId } from '../content/skills.js';

export enum CastState { Casting = 0, Traveling = 1, Impact = 2 }

// PR UU — single source of truth for SkillId lives in
// `packages/content/skills.ts:SKILL_IDS`. Re-export under the legacy
// `skillIdValues` name so existing callers + the protocol-coverage
// test keep working without churn.
export const skillIdValues = SKILL_IDS;
export const skillIdSchema = z.enum(SKILL_IDS);
// Re-export the type so consumers can `import { SkillId } from
// '@/protocol/common'` without reaching into content.
export type { SkillId };

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

export const itemDropSchema = z.object({
  itemId: z.string(),
  quantity: z.number(),
}).passthrough();

export type VecXZ = {
  x: number;
  z: number;
};

export type Vec3D = {
  x: number;
  y: number;
  z: number;
};

export type PredictionKeyframe = {
  pos: VecXZ;
  rotY?: number;
  ts: number;
};

export type PlayerMovementState = {
  isMoving: boolean;
  targetPos?: VecXZ | null;
  lastUpdateTime: number;
  speed: number;
};

export type StatusEffect = {
  id: string;
  type: string;
  value: number;
  durationMs: number;
  startTimeTs: number;
  sourceSkill: string;
  stacks?: number;
};

export type InventorySlot = {
  itemId: ItemId;
  quantity: number;
};

export type CastSnapshot = {
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
};

export type ItemDrop = {
  itemId: string;
  quantity: number;
};
