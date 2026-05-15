import { describe, expect, test } from 'vitest';
import {
  getTravelLaneSegments,
  WORLD_LANDMARKS,
  WORLD_TRAVEL_LANES,
} from '../packages/content/worldFeatures';
import { GAME_ZONES } from '../packages/content/zones';

describe('world feature content', () => {
  test('defines server-readable travel lanes and landmarks for known zones', () => {
    const zoneIds = new Set(GAME_ZONES.map((zone) => zone.id));

    expect(WORLD_TRAVEL_LANES.length).toBeGreaterThanOrEqual(4);
    expect(WORLD_LANDMARKS.length).toBeGreaterThanOrEqual(4);
    for (const lane of WORLD_TRAVEL_LANES) {
      expect(lane.points.length).toBeGreaterThanOrEqual(2);
      expect(lane.zoneIds.every((zoneId) => zoneIds.has(zoneId))).toBe(true);
    }
    for (const landmark of WORLD_LANDMARKS) {
      expect(zoneIds.has(landmark.zoneId)).toBe(true);
    }
  });

  test('expands travel lanes into adjacent segments without losing lane metadata', () => {
    const expectedSegmentCount = WORLD_TRAVEL_LANES.reduce(
      (sum, lane) => sum + lane.points.length - 1,
      0,
    );
    const segments = getTravelLaneSegments();

    expect(segments).toHaveLength(expectedSegmentCount);
    expect(segments[0].lane.id).toBe(WORLD_TRAVEL_LANES[0].id);
    expect(segments[0].from).toBe(WORLD_TRAVEL_LANES[0].points[0]);
    expect(segments[0].to).toBe(WORLD_TRAVEL_LANES[0].points[1]);
  });
});
