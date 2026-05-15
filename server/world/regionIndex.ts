import type { Vec3D } from '../../packages/protocol/messages.js';
import type { ServerWorldRegion } from './regions.js';

const REGION_INDEX_CELL_SIZE = 32_000;
const regionIndexCache = new WeakMap<readonly ServerWorldRegion[], RegionIndex>();

type RegionIndex = {
  cells: Map<string, ServerWorldRegion[]>;
};

export function getRegionCandidatesAtPosition(
  regions: readonly ServerWorldRegion[],
  position: Vec3D,
): readonly ServerWorldRegion[] {
  return getRegionIndex(regions).cells.get(cellKey(position.x, position.z)) ?? [];
}

function getRegionIndex(regions: readonly ServerWorldRegion[]): RegionIndex {
  const cached = regionIndexCache.get(regions);
  if (cached) {
    return cached;
  }

  const index = buildRegionIndex(regions);
  regionIndexCache.set(regions, index);
  return index;
}

function buildRegionIndex(regions: readonly ServerWorldRegion[]): RegionIndex {
  const cells = new Map<string, ServerWorldRegion[]>();

  for (const region of regions) {
    const minCellX = coordinateToCell(region.center.x - region.radius);
    const maxCellX = coordinateToCell(region.center.x + region.radius);
    const minCellZ = coordinateToCell(region.center.z - region.radius);
    const maxCellZ = coordinateToCell(region.center.z + region.radius);

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = `${cellX}:${cellZ}`;
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(region);
        } else {
          cells.set(key, [region]);
        }
      }
    }
  }

  return { cells };
}

function cellKey(x: number, z: number): string {
  return `${coordinateToCell(x)}:${coordinateToCell(z)}`;
}

function coordinateToCell(value: number): number {
  return Math.floor(value / REGION_INDEX_CELL_SIZE);
}
