import { GAME_ZONES, type Zone } from './zones.js';

export const WORLD_SPAWN_BUDGETS = {
  warningInitialEnemySpawns: 240,
  maxInitialEnemySpawns: 260,
  warningZoneCount: 18,
  maxZoneCount: 24,
  warningEnemiesPerZone: 24,
  maxEnemiesPerZone: 36,
} as const;

export type ZoneSpawnRange = {
  min: number;
  max: number;
};

export type WorldSpawnBudgetReport = {
  zoneCount: number;
  configuredMinInitialEnemySpawns: number;
  configuredMaxInitialEnemySpawns: number;
  configuredMaxEnemiesPerZone: number;
  warningInitialEnemySpawns: number;
  maxInitialEnemySpawns: number;
  warningZoneCount: number;
  maxZoneCount: number;
  warningEnemiesPerZone: number;
  maxEnemiesPerZone: number;
};

export function getZoneSpawnRange(zone: Zone): ZoneSpawnRange {
  return zone.mobs.reduce(
    (range, mob) => ({
      min: range.min + mob.minCount,
      max: range.max + mob.maxCount,
    }),
    { min: 0, max: 0 },
  );
}

export function getWorldSpawnBudgetReport(zones: readonly Zone[] = GAME_ZONES): WorldSpawnBudgetReport {
  const ranges = zones.map(getZoneSpawnRange);
  const configuredMinInitialEnemySpawns = ranges.reduce((sum, range) => sum + range.min, 0);
  const configuredMaxInitialEnemySpawns = ranges.reduce((sum, range) => sum + range.max, 0);
  const configuredMaxEnemiesPerZone = Math.max(0, ...ranges.map((range) => range.max));

  return {
    zoneCount: zones.length,
    configuredMinInitialEnemySpawns,
    configuredMaxInitialEnemySpawns,
    configuredMaxEnemiesPerZone,
    ...WORLD_SPAWN_BUDGETS,
  };
}
