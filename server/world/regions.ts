import type { Zone, ZoneManager } from '../../packages/content/zones.js';
import type { Vec3D } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';

export type WorldRegionSpawnPolicy = {
  maxActiveZones: number;
  maxEnemiesPerZone: number;
};

export type ServerWorldRegion = {
  id: string;
  zoneId: string;
  name: string;
  center: Vec3D;
  radius: number;
  active: boolean;
  maxEnemies: number;
};

export type WorldRegionStats = ServerWorldRegion & {
  playerCount: number;
  enemyCount: number;
  aliveEnemyCount: number;
};

export function createServerOwnedRegions(
  zoneManager: ZoneManager,
  policy: WorldRegionSpawnPolicy,
): ServerWorldRegion[] {
  const activeZoneIds = new Set(selectActiveZoneIds(zoneManager.getZones(), policy.maxActiveZones));

  return zoneManager.getZones().map((zone) => ({
    id: zone.id,
    zoneId: zone.id,
    name: zone.name,
    center: zone.position,
    radius: zone.radius,
    active: activeZoneIds.has(zone.id),
    maxEnemies: policy.maxEnemiesPerZone,
  }));
}

export function getActiveRegionIds(regions: readonly ServerWorldRegion[]): string[] {
  return regions.filter((region) => region.active).map((region) => region.id);
}

export function refreshWorldRegionRuntime(
  state: GameState,
  regions: readonly ServerWorldRegion[],
): void {
  state.zones.activeZoneIds = getActiveRegionIds(regions);
  state.zones.playerZoneIds = Object.fromEntries(
    Object.entries(state.players)
      .map(([playerId, player]) => [playerId, findActiveRegionIdAtPosition(regions, player.position)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function getEnemiesInActiveRegions(state: GameState): GameState['enemies'] {
  if (state.zones.activeZoneIds.length === 0) {
    return state.enemies;
  }

  return Object.fromEntries(
    Object.entries(state.enemies).filter(([enemyId]) => isEnemyInActiveRegion(state, enemyId)),
  );
}

export function isEnemyInActiveRegion(state: GameState, enemyId: string): boolean {
  const activeZoneIds = new Set(state.zones.activeZoneIds);
  return activeZoneIds.size === 0 || activeZoneIds.has(state.zones.enemyZoneIds[enemyId]);
}

export function getWorldRegionStats(
  state: GameState,
  regions: readonly ServerWorldRegion[],
): WorldRegionStats[] {
  return regions.map((region) => {
    let enemyCount = 0;
    let aliveEnemyCount = 0;

    for (const [enemyId, enemy] of Object.entries(state.enemies)) {
      if (state.zones.enemyZoneIds[enemyId] !== region.id) {
        continue;
      }

      enemyCount += 1;
      if (enemy.isAlive) {
        aliveEnemyCount += 1;
      }
    }

    return {
      ...region,
      playerCount: countRegionPlayers(state, region.id),
      enemyCount,
      aliveEnemyCount,
    };
  });
}

function selectActiveZoneIds(zones: readonly Zone[], maxActiveZones: number): string[] {
  return zones.slice(0, Math.max(0, maxActiveZones)).map((zone) => zone.id);
}

function findActiveRegionIdAtPosition(
  regions: readonly ServerWorldRegion[],
  position: Vec3D,
): string | null {
  for (const region of regions) {
    if (region.active && isInsideRegion(region, position)) {
      return region.id;
    }
  }

  return null;
}

function isInsideRegion(region: ServerWorldRegion, position: Vec3D): boolean {
  const dx = position.x - region.center.x;
  const dz = position.z - region.center.z;
  return dx * dx + dz * dz <= region.radius * region.radius;
}

function countRegionPlayers(state: GameState, regionId: string): number {
  return Object.values(state.zones.playerZoneIds).filter((playerRegionId) => playerRegionId === regionId).length;
}
