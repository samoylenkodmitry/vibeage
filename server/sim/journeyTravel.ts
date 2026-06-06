import { WORLD_TRAVEL_LANES } from '../../packages/content/worldFeatures.js';
import { distanceXZ } from '../../packages/sim/geometry.js';

type JourneyPoint = { x: number; z: number };

export type JourneyTravelMode = 'local' | 'regional';

export type JourneyTravelEstimate = {
  distance: number;
  durationMs: number;
  mode: JourneyTravelMode;
  label: string;
};

export const LOCAL_TRAVEL_DISTANCE_UNITS = 5_000;
export const REGIONAL_TRAVEL_SPEED_MPS = 73;
export const REGIONAL_TRAVEL_BOARDING_MS = 90_000;

export function estimateJourneyTravel(
  from: JourneyPoint,
  target: JourneyPoint,
  localSpeedMps: number,
): JourneyTravelEstimate {
  const distance = distanceXZ(from, target);
  const safeLocalSpeed = Math.max(1, localSpeedMps);
  const localDurationMs = (distance / safeLocalSpeed) * 1000;
  if (distance <= LOCAL_TRAVEL_DISTANCE_UNITS) {
    return {
      distance,
      durationMs: localDurationMs,
      mode: 'local',
      label: 'Route progress',
    };
  }

  const regionalSpeed = Math.max(safeLocalSpeed, REGIONAL_TRAVEL_SPEED_MPS);
  const regionalDurationMs = REGIONAL_TRAVEL_BOARDING_MS + (distance / regionalSpeed) * 1000;
  return {
    distance,
    durationMs: Math.min(localDurationMs, regionalDurationMs),
    mode: 'regional',
    label: regionalTravelLabel(from, target),
  };
}

function regionalTravelLabel(from: JourneyPoint, target: JourneyPoint): string {
  const lane = nearestTravelLane(from, target);
  if (!lane) return 'Regional transit progress';
  const prefix = lane.safe ? 'Safe road' : lane.kind === 'river' ? 'River route' : 'Frontier route';
  return `${prefix}: ${lane.name}`;
}

function nearestTravelLane(from: JourneyPoint, target: JourneyPoint) {
  return WORLD_TRAVEL_LANES
    .map((lane) => ({
      lane,
      distance: Math.min(pointToLaneDistance(from, lane.points), pointToLaneDistance(target, lane.points)),
    }))
    .sort((a, b) => (a.distance === b.distance ? a.lane.id.localeCompare(b.lane.id) : a.distance - b.distance))[0]?.lane;
}

function pointToLaneDistance(point: JourneyPoint, lanePoints: readonly JourneyPoint[]): number {
  return lanePoints.reduce((best, lanePoint) => Math.min(best, distanceXZ(point, lanePoint)), Infinity);
}
