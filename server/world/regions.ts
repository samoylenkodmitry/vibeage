import type { Zone, ZoneManager } from '../../packages/content/zones.js';
import type { Vec3D, VecXZ } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import { getRegionCandidatesAtPosition } from './regionIndex.js';

const DEFAULT_REGION_STREAM_MARGIN = 80;

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

export type SocketPlayerLookup = ReadonlyMap<string, string>;

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
  const activeRegionIds: string[] = [];
  for (const region of regions) {
    if (region.active) {
      activeRegionIds.push(region.id);
    }
  }
  return activeRegionIds;
}

export function refreshWorldRegionRuntime(
  state: GameState,
  regions: readonly ServerWorldRegion[],
): void {
  state.zones.activeZoneIds = getActiveRegionIds(regions);
  state.zones.playerZoneIds = {};

  for (const playerId in state.players) {
    if (!hasRecordKey(state.players, playerId)) {
      continue;
    }

    const player = state.players[playerId];
    const regionId = findActiveRegionIdAtPosition(regions, player.position);
    if (regionId) {
      state.zones.playerZoneIds[playerId] = regionId;
    }
  }
}

export function getEnemiesInActiveRegions(state: GameState): GameState['enemies'] {
  const activeRegionIds = createActiveRegionIdSet(state);
  if (!activeRegionIds) {
    return state.enemies;
  }

  const enemies: GameState['enemies'] = {};
  for (const enemyId in state.enemies) {
    if (!hasRecordKey(state.enemies, enemyId)) {
      continue;
    }

    if (isEnemyInActiveRegion(state, enemyId, activeRegionIds)) {
      enemies[enemyId] = state.enemies[enemyId];
    }
  }
  return enemies;
}

export function createActiveRegionIdSet(state: GameState): ReadonlySet<string> | null {
  return state.zones.activeZoneIds.length === 0
    ? null
    : new Set(state.zones.activeZoneIds);
}

export function isEnemyInActiveRegion(
  state: GameState,
  enemyId: string,
  activeRegionIds: ReadonlySet<string> | null = createActiveRegionIdSet(state),
): boolean {
  return !activeRegionIds || activeRegionIds.has(state.zones.enemyZoneIds[enemyId]);
}

export function createSocketPlayerLookup(state: GameState): Map<string, string> {
  const playerIdsBySocket = new Map<string, string>();
  for (const playerId in state.players) {
    if (!hasRecordKey(state.players, playerId)) {
      continue;
    }

    playerIdsBySocket.set(state.players[playerId].socketId, playerId);
  }
  return playerIdsBySocket;
}

export function getPlayerStreamRegionIds(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  socketId: string,
  margin = DEFAULT_REGION_STREAM_MARGIN,
): ReadonlySet<string> {
  return getPlayerStreamRegionIdsForPlayer(
    state,
    regions,
    createSocketPlayerLookup(state).get(socketId),
    margin,
  );
}

export function getPlayerStreamRegionIdsForPlayer(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  playerId: string | undefined,
  margin = DEFAULT_REGION_STREAM_MARGIN,
): ReadonlySet<string> {
  const activeRegions = getActiveRegions(regions);
  if (activeRegions.length === 0) {
    return new Set();
  }

  const player = playerId ? state.players[playerId] : undefined;
  if (!player || !playerId) {
    return getActiveRegionIdSet(activeRegions);
  }

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

export function getWorldRegionStats(
  state: GameState,
  regions: readonly ServerWorldRegion[],
): WorldRegionStats[] {
  const playerCounts = new Map<string, number>();
  const enemyCounts = new Map<string, number>();
  const aliveEnemyCounts = new Map<string, number>();

  for (const playerId in state.zones.playerZoneIds) {
    if (!hasRecordKey(state.zones.playerZoneIds, playerId)) {
      continue;
    }

    const regionId = state.zones.playerZoneIds[playerId];
    playerCounts.set(regionId, (playerCounts.get(regionId) ?? 0) + 1);
  }

  for (const enemyId in state.enemies) {
    if (!hasRecordKey(state.enemies, enemyId)) {
      continue;
    }

    const enemy = state.enemies[enemyId];
    const regionId = state.zones.enemyZoneIds[enemyId];
    if (!regionId) {
      continue;
    }

    enemyCounts.set(regionId, (enemyCounts.get(regionId) ?? 0) + 1);
    if (enemy.isAlive) {
      aliveEnemyCounts.set(regionId, (aliveEnemyCounts.get(regionId) ?? 0) + 1);
    }
  }

  const stats: WorldRegionStats[] = [];
  for (const region of regions) {
    stats.push({
      ...region,
      playerCount: playerCounts.get(region.id) ?? 0,
      enemyCount: enemyCounts.get(region.id) ?? 0,
      aliveEnemyCount: aliveEnemyCounts.get(region.id) ?? 0,
    });
  }
  return stats;
}

function selectActiveZoneIds(zones: readonly Zone[], maxActiveZones: number): string[] {
  return zones.slice(0, Math.max(0, maxActiveZones)).map((zone) => zone.id);
}

function getActiveRegions(regions: readonly ServerWorldRegion[]): ServerWorldRegion[] {
  const activeRegions: ServerWorldRegion[] = [];
  for (const region of regions) {
    if (region.active) {
      activeRegions.push(region);
    }
  }
  return activeRegions;
}

function getActiveRegionIdSet(activeRegions: readonly ServerWorldRegion[]): Set<string> {
  const activeRegionIds = new Set<string>();
  for (const region of activeRegions) {
    activeRegionIds.add(region.id);
  }
  return activeRegionIds;
}

export function findActiveRegionIdAtPosition(
  regions: readonly ServerWorldRegion[],
  position: Vec3D,
): string | null {
  for (const region of getRegionCandidatesAtPosition(regions, position)) {
    if (region.active && isInsideRegion(region, position)) {
      return region.id;
    }
  }

  return null;
}

export function findRegionIdAtPosition(
  regions: readonly ServerWorldRegion[],
  position: Vec3D,
): string | null {
  for (const region of getRegionCandidatesAtPosition(regions, position)) {
    if (isInsideRegion(region, position)) {
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

function hasRecordKey<T>(record: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
