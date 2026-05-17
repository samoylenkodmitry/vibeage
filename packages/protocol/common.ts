import { z } from 'zod';
import type { ItemId } from '../content/items.js';
import type { SkillId } from '../content/skills.js';

export enum CastState { Casting = 0, Traveling = 1, Impact = 2 }

// EVERY skill in the SKILLS catalog has to appear here, otherwise its
// CastReq is rejected at the wire boundary with "Invalid option" — real
// bug seen on prod: pressing slash as a warrior failed silently because
// only the four mage skills were listed.
//
// Kept as a literal array (not derived from SKILLS) so the protocol
// stays a build-time constant and the cross-package import graph stays
// flat. tests/protocolSkillIdCoverage.spec.ts asserts every SKILLS
// entry has a matching schema entry so a designer adding a new skill
// can't silently break casting.
export const skillIdValues = [
  'basicAttack',
  'fireball', 'iceBolt', 'waterSplash', 'petrify',
  'slash', 'powerStrike', 'shieldWall', 'taunt', 'bash',
  'holyLight', 'bless', 'dispel', 'smite', 'divineShield',
  'arrowShot', 'volley', 'rapidFire',
  'evade', 'backstab', 'poisonBlade', 'vanish',
] as const satisfies readonly SkillId[];
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
