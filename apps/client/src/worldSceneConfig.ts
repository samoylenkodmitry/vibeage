import { getTerrainHeight } from '../../../packages/content/terrain';

export const GROUND_Y = 0;

export function getTerrainY(x: number, z: number): number {
  return GROUND_Y + getTerrainHeight(x, z);
}
