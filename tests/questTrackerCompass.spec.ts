import { describe, expect, it } from 'vitest';
import { bearingToMarkerDeg } from '../apps/client/src/hud/QuestTrackerStrip';

/**
 * PR 626 — the QuestTrackerStrip compass arrow rotates by the
 * camera-relative bearing to the active marker. The trig lives in
 * bearingToMarkerDeg so it can be tested without React. World-yaw
 * convention: forward = -Z, right = +X, atan2(dx, -dz) → 0° when
 * the marker is straight ahead.
 *
 * These tests freeze the convention so a future refactor that
 * accidentally flips a sign (and rotates every player's arrow 180°
 * away from their quest) gets caught at PR time.
 */

const TOL = 1e-6;
const PLAYER = { x: 0, z: 0 };

describe('bearingToMarkerDeg', () => {
  describe('with camera facing forward (yaw 0)', () => {
    it('returns 0° for a marker straight ahead (-Z)', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: 0, z: -10 }, 0)).toBeCloseTo(0, 6);
    });

    it('returns 90° for a marker to the right (+X)', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: 10, z: 0 }, 0)).toBeCloseTo(90, 6);
    });

    it('returns 180° for a marker behind (+Z)', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: 0, z: 10 }, 0)).toBeCloseTo(180, 6);
    });

    it('returns -90° for a marker to the left (-X)', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: -10, z: 0 }, 0)).toBeCloseTo(-90, 6);
    });
  });

  describe('with camera rotated', () => {
    it('a forward marker becomes -90° when camera turns 90° right', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: 0, z: -10 }, Math.PI / 2)).toBeCloseTo(-90, 6);
    });

    it('a forward marker becomes 90° when camera turns 90° left', () => {
      expect(bearingToMarkerDeg(PLAYER, { x: 0, z: -10 }, -Math.PI / 2)).toBeCloseTo(90, 6);
    });
  });

  describe('normalization', () => {
    it('wraps results into (-180, 180]', () => {
      // Marker behind, camera spun all the way around → still 180°.
      const deg = bearingToMarkerDeg(PLAYER, { x: 0, z: 10 }, 2 * Math.PI);
      expect(deg).toBeGreaterThan(-180);
      expect(deg).toBeLessThanOrEqual(180);
      expect(Math.abs(Math.abs(deg) - 180)).toBeLessThan(TOL);
    });
  });
});
