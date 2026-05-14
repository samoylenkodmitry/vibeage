import type { VecXZ } from '../protocol/messages';
import { clamp01, distanceSqXZ } from './geometry.js';

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
