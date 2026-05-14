import type { Zone, ZoneManager } from '../../packages/content/zones.js';
import type { Vec3D, VecXZ } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';

export const DEFAULT_REGION_STREAM_MARGIN = 80;

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

export function getPlayerStreamRegionIds(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  socketId: string,
  margin = DEFAULT_REGION_STREAM_MARGIN,
): ReadonlySet<string> {
  const activeRegions = regions.filter((region) => region.active);
  if (activeRegions.length === 0) {
    return new Set();
  }

  const playerEntry = Object.entries(state.players).find(([, player]) => player.socketId === socketId);
  if (!playerEntry) {
    return new Set(activeRegions.map((region) => region.id));
  }

  const [playerId, player] = playerEntry;
  const primaryRegionId = state.zones.playerZoneIds[playerId]
    ?? findActiveRegionIdAtPosition(regions, player.position)
    ?? findNearestActiveRegionId(regions, player.position);
  const primaryRegion = primaryRegionId ? regions.find((region) => region.id === primaryRegionId) : null;

  if (!primaryRegion) {
    return new Set();
  }

  const visibleRegionIds = new Set<string>([primaryRegion.id]);
  for (const region of activeRegions) {
    if (region.id === primaryRegion.id || areRegionsNear(primaryRegion, region, margin)) {
      visibleRegionIds.add(region.id);
    }
  }

  return visibleRegionIds;
}

export function getEntityRegionId(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  entityId: string,
): string | undefined {
  if (state.zones.enemyZoneIds[entityId]) {
    return state.zones.enemyZoneIds[entityId];
  }

  if (state.zones.playerZoneIds[entityId]) {
    return state.zones.playerZoneIds[entityId];
  }

  const enemy = state.enemies[entityId];
  if (enemy) {
    return findActiveRegionIdAtPosition(regions, enemy.position) ?? undefined;
  }

  const player = state.players[entityId];
  if (player) {
    return findActiveRegionIdAtPosition(regions, player.position) ?? undefined;
  }

  return undefined;
}

export function getPositionRegionId(
  regions: readonly ServerWorldRegion[],
  position: Vec3D | VecXZ | undefined,
): string | undefined {
  if (!position) {
    return undefined;
  }

  return findActiveRegionIdAtPosition(regions, toVec3D(position)) ?? undefined;
}

export function isEntityVisibleToSocket(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  socketId: string,
  entityId: string,
): boolean {
  const player = state.players[entityId];
  if (player?.socketId === socketId) {
    return true;
  }

  const regionId = getEntityRegionId(state, regions, entityId);
  return !regionId || getPlayerStreamRegionIds(state, regions, socketId).has(regionId);
}

export function isRegionVisibleToSocket(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  socketId: string,
  regionId: string | undefined,
): boolean {
  return !regionId || getPlayerStreamRegionIds(state, regions, socketId).has(regionId);
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

export function findActiveRegionIdAtPosition(
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

function findNearestActiveRegionId(
  regions: readonly ServerWorldRegion[],
  position: Vec3D,
): string | null {
  let nearestRegionId: string | null = null;
  let nearestDistance = Infinity;

  for (const region of regions) {
    if (!region.active) {
      continue;
    }

    const distance = distanceSqXZ(region.center, position);
    if (distance < nearestDistance) {
      nearestRegionId = region.id;
      nearestDistance = distance;
    }
  }

  return nearestRegionId;
}

function areRegionsNear(
  primaryRegion: ServerWorldRegion,
  region: ServerWorldRegion,
  margin: number,
): boolean {
  const maxDistance = primaryRegion.radius + region.radius + margin;
  return distanceSqXZ(primaryRegion.center, region.center) <= maxDistance * maxDistance;
}

function distanceSqXZ(a: Vec3D, b: Vec3D): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function toVec3D(position: Vec3D | VecXZ): Vec3D {
  return { x: position.x, y: 'y' in position ? position.y : 0, z: position.z };
}

function countRegionPlayers(state: GameState, regionId: string): number {
  return Object.values(state.zones.playerZoneIds).filter((playerRegionId) => playerRegionId === regionId).length;
}
