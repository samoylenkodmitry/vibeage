import type { VecXZ } from '../protocol/messages';

export function distanceSqXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function distanceXZ(a: VecXZ, b: VecXZ): number {
  return Math.sqrt(distanceSqXZ(a, b));
}

export function directionXZ(from: VecXZ, to: VecXZ): VecXZ {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance === 0) {
    return { x: 0, z: 0 };
  }

  return { x: dx / distance, z: dz / distance };
}

export function rotationYForDirection(direction: VecXZ): number {
  return Math.atan2(direction.x, direction.z);
}

export function randomAnnulusDistance(minDistance: number, maxDistance: number, sample: number = Math.random()): number {
  const minArea = Math.min(minDistance, maxDistance) ** 2;
  const maxArea = maxDistance ** 2;
  return Math.sqrt(minArea + clamp01(sample) * (maxArea - minArea));
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
