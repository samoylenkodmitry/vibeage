import { z } from 'zod';
import { ITEMS } from './items.js';
import { LOOT_TABLES } from './lootTables.js';
import { SKILLS } from './skills.js';
import { WORLD_SETTINGS } from './world.js';
import { getWorldSpawnBudgetReport, type WorldSpawnBudgetReport } from './zoneSpawnBudget.js';
import { GAME_ZONES } from './zones.js';

export type WorldContentValidation = {
  ok: boolean;
  issues: string[];
  spawnBudget: WorldSpawnBudgetReport;
};

const finiteNumber = z.number().refine(Number.isFinite, 'must be finite');
const nonNegativeNumber = finiteNumber.refine((value) => value >= 0, 'must be non-negative');
const positiveNumber = finiteNumber.refine((value) => value > 0, 'must be positive');

const WorldSettingsSchema = z.object({
  playableRadius: positiveNumber,
  groundSize: positiveNumber,
  gridDivisions: positiveNumber,
  cameraFar: positiveNumber,
  fogNear: nonNegativeNumber,
  fogFar: positiveNumber,
  terrainChunkSize: positiveNumber,
  terrainChunkSegments: positiveNumber,
  visibleTerrainChunkRadius: positiveNumber,
  foliageCellSize: positiveNumber,
  visibleFoliageCellRadius: positiveNumber,
}).superRefine((settings, ctx) => {
  if (settings.groundSize < settings.playableRadius * 2) {
    ctx.addIssue({
      code: 'custom',
      message: 'groundSize must cover the playable diameter',
      path: ['groundSize'],
    });
  }
  if (settings.fogFar <= settings.fogNear) {
    ctx.addIssue({
      code: 'custom',
      message: 'fogFar must be greater than fogNear',
      path: ['fogFar'],
    });
  }
});

const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manaCost: nonNegativeNumber,
  castMs: nonNegativeNumber,
  cooldownMs: nonNegativeNumber,
  levelRequired: positiveNumber,
  range: positiveNumber.optional(),
  effects: z.array(z.object({
    type: z.string().min(1),
    value: finiteNumber,
    durationMs: positiveNumber.optional(),
  })).min(1),
  projectile: z.object({
    speed: positiveNumber,
    maxRange: positiveNumber.optional(),
    hitRadius: positiveNumber.optional(),
    splashRadius: positiveNumber.optional(),
    maxPierceHits: positiveNumber.optional(),
  }).optional(),
});

const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stackable: z.boolean(),
  maxStack: positiveNumber.optional(),
  type: z.enum(['weapon', 'armor', 'consumable', 'material', 'currency']),
}).superRefine((item, ctx) => {
  if (item.stackable && !item.maxStack) {
    ctx.addIssue({
      code: 'custom',
      message: 'stackable items need maxStack',
      path: ['maxStack'],
    });
  }
});

const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.object({ x: finiteNumber, y: finiteNumber, z: finiteNumber }),
  radius: positiveNumber,
  spawnExclusionRadius: nonNegativeNumber.optional(),
  minLevel: positiveNumber,
  maxLevel: positiveNumber,
  mobs: z.array(z.object({
    type: z.string().min(1),
    weight: positiveNumber,
    minCount: nonNegativeNumber,
    maxCount: nonNegativeNumber,
  })).min(1),
}).superRefine((zone, ctx) => {
  if (zone.maxLevel < zone.minLevel) {
    ctx.addIssue({
      code: 'custom',
      message: 'maxLevel must be at least minLevel',
      path: ['maxLevel'],
    });
  }
  if (zone.spawnExclusionRadius !== undefined && zone.spawnExclusionRadius >= zone.radius) {
    ctx.addIssue({
      code: 'custom',
      message: 'spawnExclusionRadius must be smaller than radius',
      path: ['spawnExclusionRadius'],
    });
  }

  for (const [index, mob] of zone.mobs.entries()) {
    if (mob.maxCount < mob.minCount) {
      ctx.addIssue({
        code: 'custom',
        message: 'maxCount must be at least minCount',
        path: ['mobs', index, 'maxCount'],
      });
    }
  }
});

export function validateWorldContent(): WorldContentValidation {
  const issues: string[] = [];
  collectSchemaIssues(issues, 'world settings', WorldSettingsSchema.safeParse(WORLD_SETTINGS));
  collectKeyedSchemaIssues(issues, 'skill', SKILLS, SkillSchema);
  collectKeyedSchemaIssues(issues, 'item', ITEMS, ItemSchema);
  collectZoneIssues(issues);
  collectLootIssues(issues);

  const spawnBudget = getWorldSpawnBudgetReport();
  if (spawnBudget.configuredMaxInitialEnemySpawns > spawnBudget.maxInitialEnemySpawns) {
    issues.push(
      `configured max initial enemies ${spawnBudget.configuredMaxInitialEnemySpawns} exceeds budget ${spawnBudget.maxInitialEnemySpawns}`,
    );
  }
  if (spawnBudget.zoneCount > spawnBudget.maxZoneCount) {
    issues.push(
      `configured zones ${spawnBudget.zoneCount} exceeds budget ${spawnBudget.maxZoneCount}`,
    );
  }
  if (spawnBudget.configuredMaxEnemiesPerZone > spawnBudget.maxEnemiesPerZone) {
    issues.push(
      `configured max enemies per zone ${spawnBudget.configuredMaxEnemiesPerZone} exceeds budget ${spawnBudget.maxEnemiesPerZone}`,
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    spawnBudget,
  };
}

function collectKeyedSchemaIssues<T>(
  issues: string[],
  label: string,
  records: Record<string, T & { id: string }>,
  schema: z.ZodType<T & { id: string }>,
): void {
  for (const [id, value] of Object.entries(records)) {
    if (value.id !== id) {
      issues.push(`${label} ${id} has mismatched id ${value.id}`);
    }
    collectSchemaIssues(issues, `${label} ${id}`, schema.safeParse(value));
  }
}

function collectZoneIssues(issues: string[]): void {
  const seenZoneIds = new Set<string>();
  for (const zone of GAME_ZONES) {
    if (seenZoneIds.has(zone.id)) {
      issues.push(`duplicate zone id ${zone.id}`);
    }
    seenZoneIds.add(zone.id);
    collectSchemaIssues(issues, `zone ${zone.id}`, ZoneSchema.safeParse(zone));

    if (Math.abs(zone.position.x) + zone.radius > WORLD_SETTINGS.playableRadius) {
      issues.push(`zone ${zone.id} extends beyond playable X radius`);
    }
    if (Math.abs(zone.position.z) + zone.radius > WORLD_SETTINGS.playableRadius) {
      issues.push(`zone ${zone.id} extends beyond playable Z radius`);
    }

    for (const mob of zone.mobs) {
      const tableId = `${mob.type}_loot`;
      if (!LOOT_TABLES[tableId]) {
        issues.push(`zone ${zone.id} mob ${mob.type} references missing loot table ${tableId}`);
      }
    }
  }
}

function collectLootIssues(issues: string[]): void {
  for (const [tableId, table] of Object.entries(LOOT_TABLES)) {
    if (table.id !== tableId) {
      issues.push(`loot table ${tableId} has mismatched id ${table.id}`);
    }
    if (table.drops.length === 0) {
      issues.push(`loot table ${tableId} has no drops`);
    }

    for (const [index, drop] of table.drops.entries()) {
      if (!ITEMS[drop.itemId]) {
        issues.push(`loot table ${tableId} drop ${index} references missing item ${drop.itemId}`);
      }
      if (drop.chance < 0 || drop.chance > 1) {
        issues.push(`loot table ${tableId} drop ${index} chance must be between 0 and 1`);
      }
      if (drop.quantity.min < 0 || drop.quantity.max < drop.quantity.min) {
        issues.push(`loot table ${tableId} drop ${index} has invalid quantity range`);
      }
    }
  }
}

function collectSchemaIssues(
  issues: string[],
  label: string,
  result: { success: true } | { success: false; error: z.ZodError },
): void {
  if (result.success === false) {
    for (const issue of result.error.issues) {
      issues.push(`${label}: ${issue.path.join('.') || '<root>'} ${issue.message}`);
    }
  }
}
