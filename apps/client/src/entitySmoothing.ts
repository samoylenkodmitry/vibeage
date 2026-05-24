import * as THREE from 'three';
import { getTerrainY } from './worldSceneConfig';

// World units: any positional update larger than this snaps the entity
// instead of lerping. Picked so a normal walk-to-target update (a few
// units) still smooths, but a teleport (>10 units) reads as instant.
export const SNAP_THRESHOLD = 10;

// Below these gaps a stationary entity is visually "arrived"; the caller
// snaps it exactly and parks the per-frame lerp/terrain/rotation work
// until the next snapshot moves it again.
export const SETTLE_POS_EPSILON = 0.002;
export const SETTLE_ANGLE_EPSILON = 0.0015;

export function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

// One smoothing step toward the target. Returns true once a stationary
// entity has converged to within epsilon (position + facing): the caller
// parks the per-frame work until the next snapshot changes its inputs.
export function advanceSmoothedGroup(
  group: THREE.Group,
  scratch: THREE.Vector3,
  p: {
    targetX: number; targetZ: number; posY: number; rotationY: number;
    alpha: number; stationary: boolean; groundedOffset?: number;
  },
): boolean {
  scratch.set(p.targetX, p.posY, p.targetZ);
  // Teleports (Escape, GM setPosition) push the target past SNAP_THRESHOLD,
  // so snap instead of drifting across the world for many frames.
  const gap = group.position.distanceTo(scratch);
  if (gap > SNAP_THRESHOLD) {
    group.position.copy(scratch);
  } else {
    group.position.lerp(scratch, p.alpha);
  }
  if (typeof p.groundedOffset === 'number') {
    group.position.y = getTerrainY(group.position.x, group.position.z) + p.groundedOffset;
  }
  group.rotation.y = lerpAngle(group.rotation.y, p.rotationY, p.alpha);

  const angleGap = Math.abs(Math.atan2(Math.sin(p.rotationY - group.rotation.y), Math.cos(p.rotationY - group.rotation.y)));
  if (!p.stationary || gap > SETTLE_POS_EPSILON || angleGap > SETTLE_ANGLE_EPSILON) {
    return false;
  }
  group.position.set(p.targetX, p.posY, p.targetZ);
  if (typeof p.groundedOffset === 'number') {
    group.position.y = getTerrainY(p.targetX, p.targetZ) + p.groundedOffset;
  }
  group.rotation.y = p.rotationY;
  return true;
}
