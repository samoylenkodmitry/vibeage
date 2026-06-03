import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceSmoothedGroup,
  lerpAngle,
  SNAP_THRESHOLD,
} from '../apps/client/src/entitySmoothing';

function makeGroup(x = 0, y = 0, z = 0, rotY = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  return group;
}

const scratch = () => new THREE.Vector3();

describe('advanceSmoothedGroup', () => {
  it('lerps toward the target without overshooting when a gap remains', () => {
    const group = makeGroup(0, 0, 0);
    advanceSmoothedGroup(group, scratch(), {
      targetX: 4, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5,
    });
    // Half-way lerp (alpha 0.5) of a 4-unit gap → x ≈ 2.
    expect(group.position.x).toBeCloseTo(2, 5);
  });

  it('snaps instantly (no lerp) when the gap exceeds SNAP_THRESHOLD', () => {
    const group = makeGroup(0, 0, 0);
    const far = SNAP_THRESHOLD + 40;
    advanceSmoothedGroup(group, scratch(), {
      targetX: far, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5,
    });
    // Teleport: position is copied exactly, not lerped to the midpoint.
    expect(group.position.x).toBe(far);
  });

  it('snaps instantly when a server snapshot marks a short teleport', () => {
    const group = makeGroup(0, 0, 0);
    advanceSmoothedGroup(group, scratch(), {
      targetX: 4, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5, snap: true,
    });

    expect(group.position.x).toBe(4);
  });

  it('keeps lerping every frame toward an unchanged target (no freeze)', () => {
    const group = makeGroup(0, 0, 0);
    advanceSmoothedGroup(group, scratch(), { targetX: 3, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5 });
    const afterFirst = group.position.x;
    advanceSmoothedGroup(group, scratch(), { targetX: 3, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5 });
    const afterSecond = group.position.x;
    // Each frame continues to close the gap; it never parks short of target.
    expect(afterSecond).toBeGreaterThan(afterFirst);
    expect(afterSecond).toBeLessThanOrEqual(3);
  });

  it('converges arbitrarily close to the target over many frames', () => {
    const group = makeGroup(0, 0, 0);
    for (let i = 0; i < 200; i += 1) {
      advanceSmoothedGroup(group, scratch(), { targetX: 3, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.3 });
    }
    expect(group.position.x).toBeCloseTo(3, 4);
  });
});

describe('lerpAngle', () => {
  it('takes the short way around the +/-PI seam', () => {
    // From 3.0 rad toward -3.0 rad: shortest path crosses PI (wraps), so a
    // half-step should land near +/-PI, not near 0.
    const result = lerpAngle(3.0, -3.0, 0.5);
    expect(Math.abs(result)).toBeGreaterThan(3.0);
  });

  it('interpolates linearly within a single revolution', () => {
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25, 5);
  });
});
