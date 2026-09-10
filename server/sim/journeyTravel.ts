import { WORLD_TRAVEL_LANES } from '../../packages/content/worldFeatures.js';
import { SKILLS } from '../../packages/content/skills.js';
import { VILLAGES, getNearestVillage } from '../../packages/content/villages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';

type JourneyPoint = { x: number; z: number };

export type JourneyTravelMode = 'local' | 'regional' | 'recall';

export type JourneyTravelEstimate = {
  distance: number;
  durationMs: number;
  mode: JourneyTravelMode;
  label: string;
  /** Where the player actually ends up. Recall lands them at the target too, just via a hub. */
  usedRecall: boolean;
};

/** Options describing what the simulated player can actually do right now. */
export type JourneyTravelOptions = {
  /** Units/sec. Real world speed, resolved from `player.stats.runSpeed`. */
  speedMps: number;
  /** Gates which villages Escape may route to (`village.minLevel`). */
  level: number;
  /** Journey clock, ms. Used only against `recallReadyAtMs`; never a wall clock. */
  nowMs: number;
  /** Journey-clock ms at which the Escape channel comes off cooldown. */
  recallReadyAtMs: number;
};

export const LOCAL_TRAVEL_DISTANCE_UNITS = 5_000;
export const REGIONAL_TRAVEL_SPEED_MPS = 73;
export const REGIONAL_TRAVEL_BOARDING_MS = 90_000;

// The Escape recall is a real universal skill (`SKILLS.escape`), not a sim
// affordance: a 30 s locked channel on a 30 min cooldown that teleports the
// caster to the nearest level-appropriate safe village. Reading its numbers
// from the skill data keeps the sim honest if the skill is ever retuned.
const RECALL_CHANNEL_MS = SKILLS.escape.castMs ?? 30_000;
const RECALL_COOLDOWN_MS = SKILLS.escape.cooldownMs ?? 30 * 60 * 1000;

export function estimateJourneyTravel(
  from: JourneyPoint,
  target: JourneyPoint,
  options: JourneyTravelOptions,
): JourneyTravelEstimate {
  const overland = estimateOverland(from, target, options.speedMps);
  const recall = estimateRecall(target, options);
  // A player takes the recall only when it actually saves time — same rule
  // they apply by eye: "is town closer to where I'm going than I am?"
  if (recall && recall.durationMs < overland.durationMs) return recall;
  return overland;
}

/** Journey-clock time the recall is next available after one is spent at `nowMs`. */
export function recallCooldownEndsAt(nowMs: number): number {
  return nowMs + RECALL_COOLDOWN_MS;
}

function estimateOverland(
  from: JourneyPoint,
  target: JourneyPoint,
  speedMps: number,
): JourneyTravelEstimate {
  const distance = distanceXZ(from, target);
  const safeSpeed = Math.max(1, speedMps);
  const localDurationMs = (distance / safeSpeed) * 1000;
  if (distance <= LOCAL_TRAVEL_DISTANCE_UNITS) {
    return { distance, durationMs: localDurationMs, mode: 'local', label: 'Route progress', usedRecall: false };
  }

  const regionalSpeed = Math.max(safeSpeed, REGIONAL_TRAVEL_SPEED_MPS);
  const regionalDurationMs = REGIONAL_TRAVEL_BOARDING_MS + (distance / regionalSpeed) * 1000;
  return {
    distance,
    durationMs: Math.min(localDurationMs, regionalDurationMs),
    mode: 'regional',
    label: regionalTravelLabel(from, target),
    usedRecall: false,
  };
}

/**
 * Escape lands the caster at the hub nearest *them*, so the play that saves
 * time is: recall, then run out from whichever hub sits closest to the
 * destination. Only hubs the player's level unlocks are candidates, matching
 * `getNearestVillage`'s own gate.
 */
function estimateRecall(
  target: JourneyPoint,
  options: JourneyTravelOptions,
): JourneyTravelEstimate | null {
  if (options.nowMs < options.recallReadyAtMs) return null;
  const hub = getNearestVillage(target, options.level);
  // The hub Escape would pick from the destination must be one the player can
  // reach by recalling from near it — that is exactly `getNearestVillage`
  // evaluated at the target, so the two agree by construction.
  if (!VILLAGES.some((village) => village.id === hub.id)) return null;
  const safeSpeed = Math.max(1, options.speedMps);
  const legDistance = distanceXZ(hub.position, target);
  return {
    distance: legDistance,
    durationMs: RECALL_CHANNEL_MS + (legDistance / safeSpeed) * 1000,
    mode: 'recall',
    label: `Escape recall: ${hub.name}`,
    usedRecall: true,
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
