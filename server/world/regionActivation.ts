import { WORLD_SPAWN_BUDGETS } from '../../packages/content/zoneSpawnBudget.js';
import type { GameState } from '../gameState.js';
import {
  findRegionIdAtPosition,
  type ServerWorldRegion,
} from './regions.js';

export type WorldRegionActivationPolicy = {
  maxActiveZones: number;
  anchorRegionId: string;
  frontierNeighborCount: number;
  frontierMargin: number;
};

export const DEFAULT_WORLD_REGION_ACTIVATION_POLICY: WorldRegionActivationPolicy = {
  maxActiveZones: WORLD_SPAWN_BUDGETS.maxRuntimeActiveZones,
  anchorRegionId: 'starter_meadow',
  frontierNeighborCount: 2,
  frontierMargin: 1_200,
};

export function refreshServerOwnedRegionActivation(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  policy: WorldRegionActivationPolicy = DEFAULT_WORLD_REGION_ACTIVATION_POLICY,
): string[] {
  const activeRegionIds = selectServerOwnedActiveRegionIds(state, regions, policy);
  const activeRegionIdSet = new Set(activeRegionIds);

  for (const region of regions) {
    region.active = activeRegionIdSet.has(region.id);
  }

  return activeRegionIds;
}

export function selectServerOwnedActiveRegionIds(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  policy: WorldRegionActivationPolicy = DEFAULT_WORLD_REGION_ACTIVATION_POLICY,
): string[] {
  const maxActiveZones = Math.max(0, policy.maxActiveZones);
  if (maxActiveZones === 0 || regions.length === 0) {
    return [];
  }

  const selectedRegionIds = new Set<string>();
  addRegionIds(selectedRegionIds, getPopulatedRegionIds(state, regions), maxActiveZones);
  addFrontierNeighbors(selectedRegionIds, regions, policy, maxActiveZones);
  addRegionId(selectedRegionIds, policy.anchorRegionId, maxActiveZones);
  addRegionIds(selectedRegionIds, getCurrentActiveRegionIds(regions), maxActiveZones);
  addRegionIds(selectedRegionIds, getFallbackRegionIds(regions), maxActiveZones);

  return [...selectedRegionIds];
}

function getPopulatedRegionIds(
  state: GameState,
  regions: readonly ServerWorldRegion[],
): string[] {
  const playerCountsByRegion = new Map<string, number>();

  for (const player of Object.values(state.players)) {
    const regionId = findRegionIdAtPosition(regions, player.position);
    if (regionId) {
      playerCountsByRegion.set(regionId, (playerCountsByRegion.get(regionId) ?? 0) + 1);
    }
  }

  return [...playerCountsByRegion.entries()]
    .sort(([leftId, leftCount], [rightId, rightCount]) => (
      rightCount - leftCount || getRegionOrder(regions, leftId) - getRegionOrder(regions, rightId)
    ))
    .map(([regionId]) => regionId);
}

function addFrontierNeighbors(
  selectedRegionIds: Set<string>,
  regions: readonly ServerWorldRegion[],
  policy: WorldRegionActivationPolicy,
  maxActiveZones: number,
): void {
  const populatedRegionIds = [...selectedRegionIds];
  for (const regionId of populatedRegionIds) {
    const region = regions.find((candidate) => candidate.id === regionId);
    if (!region) {
      continue;
    }

    const neighborIds = getNearestFrontierRegionIds(region, regions, selectedRegionIds, policy);
    addRegionIds(selectedRegionIds, neighborIds, maxActiveZones);
  }
}

function getNearestFrontierRegionIds(
  region: ServerWorldRegion,
  regions: readonly ServerWorldRegion[],
  selectedRegionIds: ReadonlySet<string>,
  policy: WorldRegionActivationPolicy,
): string[] {
  return regions
    .filter((candidate) => candidate.id !== region.id && !selectedRegionIds.has(candidate.id))
    .filter((candidate) => isFrontierNeighbor(region, candidate, policy.frontierMargin))
    .sort((left, right) => (
      distanceSqXZ(region, left) - distanceSqXZ(region, right)
      || getRegionOrder(regions, left.id) - getRegionOrder(regions, right.id)
    ))
    .slice(0, Math.max(0, policy.frontierNeighborCount))
    .map((candidate) => candidate.id);
}

function isFrontierNeighbor(
  primary: ServerWorldRegion,
  candidate: ServerWorldRegion,
  margin: number,
): boolean {
  const frontierDistance = primary.radius + candidate.radius + margin;
  return distanceSqXZ(primary, candidate) <= frontierDistance * frontierDistance;
}

function getCurrentActiveRegionIds(regions: readonly ServerWorldRegion[]): string[] {
  return regions.filter((region) => region.active).map((region) => region.id);
}

function getFallbackRegionIds(regions: readonly ServerWorldRegion[]): string[] {
  return [...regions]
    .sort((left, right) => (
      distanceFromOriginSq(left) - distanceFromOriginSq(right)
      || getRegionOrder(regions, left.id) - getRegionOrder(regions, right.id)
    ))
    .map((region) => region.id);
}

function addRegionIds(
  selectedRegionIds: Set<string>,
  regionIds: readonly string[],
  maxActiveZones: number,
): void {
  for (const regionId of regionIds) {
    addRegionId(selectedRegionIds, regionId, maxActiveZones);
    if (selectedRegionIds.size >= maxActiveZones) {
      return;
    }
  }
}

function addRegionId(
  selectedRegionIds: Set<string>,
  regionId: string | undefined,
  maxActiveZones: number,
): void {
  if (!regionId || selectedRegionIds.size >= maxActiveZones) {
    return;
  }

  selectedRegionIds.add(regionId);
}

function distanceSqXZ(left: ServerWorldRegion, right: ServerWorldRegion): number {
  const dx = left.center.x - right.center.x;
  const dz = left.center.z - right.center.z;
  return dx * dx + dz * dz;
}

function distanceFromOriginSq(region: ServerWorldRegion): number {
  return region.center.x * region.center.x + region.center.z * region.center.z;
}

function getRegionOrder(regions: readonly ServerWorldRegion[], regionId: string): number {
  const index = regions.findIndex((region) => region.id === regionId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}
