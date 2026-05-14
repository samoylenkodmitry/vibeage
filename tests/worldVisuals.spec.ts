import { describe, expect, test } from 'vitest';
import { GAME_ZONES } from '../packages/content/zones';
import { WORLD_SETTINGS } from '../packages/content/world';
import { getZoneLandmarks } from '../apps/client/src/worldVisuals';

describe('world visuals', () => {
  test('creates one in-bounds landmark for every configured zone', () => {
    const landmarks = getZoneLandmarks();

    expect(landmarks.map((landmark) => landmark.id)).toEqual(GAME_ZONES.map((zone) => zone.id));

    for (const landmark of landmarks) {
      const zone = GAME_ZONES.find((candidate) => candidate.id === landmark.id);
      expect(zone).toBeDefined();
      expect(landmark.radius).toBe(zone?.radius);
      expect(landmark.ringColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(landmark.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(landmark.height).toBeGreaterThan(0);
      expect(landmark.beaconRadius).toBeGreaterThan(0);

      const outerEdge = Math.hypot(landmark.position.x, landmark.position.z) + landmark.radius;
      expect(outerEdge).toBeLessThanOrEqual(WORLD_SETTINGS.playableRadius);
    }
  });
});
