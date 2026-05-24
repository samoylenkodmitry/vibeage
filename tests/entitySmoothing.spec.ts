import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceSmoothedGroup,
  lerpAngle,
  SNAP_THRESHOLD,
  SETTLE_POS_EPSILON,
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
    const settled = advanceSmoothedGroup(group, scratch(), {
      targetX: 4, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5, stationary: true,
    });
    // Half-way lerp (alpha 0.5) of a 4-unit gap → x ≈ 2, still far from target.
    expect(group.position.x).toBeCloseTo(2, 5);
    expect(settled).toBe(false);
  });

  it('snaps instantly (no lerp) when the gap exceeds SNAP_THRESHOLD', () => {
    const group = makeGroup(0, 0, 0);
    const far = SNAP_THRESHOLD + 40;
    advanceSmoothedGroup(group, scratch(), {
      targetX: far, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5, stationary: false,
    });
    // Teleport: position is copied exactly, not lerped to the midpoint.
    expect(group.position.x).toBe(far);
  });

  it('never settles while moving, even sitting exactly on target', () => {
    const group = makeGroup(5, 0, 5);
    const settled = advanceSmoothedGroup(group, scratch(), {
      targetX: 5, targetZ: 5, posY: 0, rotationY: 0, alpha: 0.5, stationary: false,
    });
    expect(settled).toBe(false);
  });

  it('settles a stationary entity once converged and snaps it exactly to target', () => {
    const group = makeGroup(SETTLE_POS_EPSILON / 4, 0, 0);
    const settled = advanceSmoothedGroup(group, scratch(), {
      targetX: 0, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.5, stationary: true,
    });
    expect(settled).toBe(true);
    expect(group.position.x).toBe(0);
    expect(group.position.z).toBe(0);
    expect(group.rotation.y).toBe(0);
  });

  it('converges to a settle over repeated stationary frames', () => {
    const group = makeGroup(0, 0, 0);
    let settled = false;
    let frames = 0;
    while (!settled && frames < 200) {
      settled = advanceSmoothedGroup(group, scratch(), {
        targetX: 3, targetZ: 0, posY: 0, rotationY: 0, alpha: 0.3, stationary: true,
      });
      frames += 1;
    }
    expect(settled).toBe(true);
    expect(group.position.x).toBe(3);
    expect(frames).toBeGreaterThan(1);
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
