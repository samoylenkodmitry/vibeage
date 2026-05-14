import type { ZoneManager } from '../../packages/content/zones.js';
import { WORLD_SPAWN_BUDGETS } from '../../packages/content/zoneSpawnBudget.js';
import type { GameState } from '../gameState.js';

export type WorldZoneSpawnPolicy = {
  maxActiveZones: number;
  maxActiveEnemies: number;
  maxEnemiesPerZone: number;
};

export const DEFAULT_WORLD_ZONE_SPAWN_POLICY: WorldZoneSpawnPolicy = {
  maxActiveZones: WORLD_SPAWN_BUDGETS.maxZoneCount,
  maxActiveEnemies: WORLD_SPAWN_BUDGETS.maxInitialEnemySpawns,
  maxEnemiesPerZone: WORLD_SPAWN_BUDGETS.maxEnemiesPerZone,
};

export function initializeServerDrivenZoneRuntime(
  state: GameState,
  zoneManager: ZoneManager,
  policy: WorldZoneSpawnPolicy = DEFAULT_WORLD_ZONE_SPAWN_POLICY,
): string[] {
  const activeZoneIds = selectServerActiveZoneIds(zoneManager, policy);
  state.zones.activeZoneIds = activeZoneIds;
  state.zones.playerZoneIds = {};
  state.zones.enemyZoneIds = {};
  return activeZoneIds;
}

export function selectServerActiveZoneIds(
  zoneManager: ZoneManager,
  policy: WorldZoneSpawnPolicy = DEFAULT_WORLD_ZONE_SPAWN_POLICY,
): string[] {
  return zoneManager.getZones()
    .slice(0, Math.max(0, policy.maxActiveZones))
    .map((zone) => zone.id);
}

export function getActiveZoneIdSet(state: GameState): ReadonlySet<string> {
  return new Set(state.zones.activeZoneIds);
}

export function isZoneActive(state: GameState, zoneId: string | undefined): boolean {
  return Boolean(zoneId) && getActiveZoneIdSet(state).has(zoneId);
}
