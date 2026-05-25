import * as THREE from 'three';
import { getTerrainY } from './worldSceneConfig';

// World units: any positional update larger than this snaps the entity
// instead of lerping. Picked so a normal walk-to-target update (a few
// units) still smooths, but a teleport (>10 units) reads as instant.
export const SNAP_THRESHOLD = 10;

export function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

// One smoothing step toward the target position + facing.
export function advanceSmoothedGroup(
  group: THREE.Group,
  scratch: THREE.Vector3,
  p: {
    targetX: number; targetZ: number; posY: number; rotationY: number;
    alpha: number; groundedOffset?: number;
  },
): void {
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
}
