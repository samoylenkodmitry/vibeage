import type { VecXZ } from '../protocol/messages';

export const DEFAULT_TARGET_RADIUS = 0.5;

export function sweptCircleHit(
  movingStart: VecXZ,
  movingEnd: VecXZ,
  targetCenter: VecXZ,
  movingRadius: number,
  targetRadius: number = DEFAULT_TARGET_RADIUS,
): boolean {
  const effectiveRadius = movingRadius + targetRadius;
  const movement = {
    x: movingEnd.x - movingStart.x,
    z: movingEnd.z - movingStart.z,
  };
  const movementLengthSq = movement.x * movement.x + movement.z * movement.z;

  if (movementLengthSq < 0.0001) {
    return distanceSqXZ(movingStart, targetCenter) <= effectiveRadius * effectiveRadius;
  }

  const targetFromStart = {
    x: targetCenter.x - movingStart.x,
    z: targetCenter.z - movingStart.z,
  };
  const projection = clamp01(
    (targetFromStart.x * movement.x + targetFromStart.z * movement.z) / movementLengthSq,
  );
  const closestPoint = {
    x: movingStart.x + movement.x * projection,
    z: movingStart.z + movement.z * projection,
  };

  return distanceSqXZ(closestPoint, targetCenter) <= effectiveRadius * effectiveRadius;
}

function distanceSqXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
