import type { Vec3 } from './gameTypes';

export function normalizeVec3(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}

export function mergeVec3(current: Vec3, update: Partial<Vec3> | undefined): Vec3 {
  return update ? { ...current, ...update } : current;
}
