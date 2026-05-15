export type WorldPoint = {
  x: number;
  z: number;
};

export type WorldTravelLaneKind = 'road' | 'river' | 'pass';

export type WorldTravelLane = {
  id: string;
  name: string;
  kind: WorldTravelLaneKind;
  zoneIds: string[];
  width: number;
  safe: boolean;
  points: WorldPoint[];
};

export type WorldLandmarkKind = 'spire' | 'ruin' | 'tree' | 'gate' | 'crystal' | 'keep';

export type WorldLandmark = {
  id: string;
  name: string;
  kind: WorldLandmarkKind;
  zoneId: string;
  position: WorldPoint;
  radius: number;
  height: number;
};

export const WORLD_TRAVEL_LANES: WorldTravelLane[] = [
  {
    id: 'starter-ring-road',
    name: 'Meadow Ring Road',
    kind: 'road',
    zoneIds: ['starter_meadow', 'dark_forest', 'misty_lake', 'rocky_highlands'],
    width: 4.8,
    safe: true,
    points: [
      { x: -85, z: -70 },
      { x: 20, z: -58 },
      { x: 120, z: 24 },
      { x: 205, z: 180 },
      { x: 80, z: 268 },
      { x: -128, z: 238 },
      { x: -226, z: -170 },
      { x: -85, z: -70 },
    ],
  },
  {
    id: 'greenway-to-emerald',
    name: 'Greenway to the Emerald Expanse',
    kind: 'road',
    zoneIds: ['starter_meadow', 'emerald_expanse'],
    width: 9,
    safe: true,
    points: [
      { x: 80, z: 84 },
      { x: 4_800, z: 8_600 },
      { x: 18_000, z: 34_000 },
      { x: 52_000, z: 88_000 },
      { x: 90_000, z: 150_000 },
    ],
  },
  {
    id: 'silverwood-river',
    name: 'Silverwood River',
    kind: 'river',
    zoneIds: ['misty_lake', 'silverwood_ocean'],
    width: 18,
    safe: false,
    points: [
      { x: -150, z: 250 },
      { x: -8_000, z: 9_000 },
      { x: -48_000, z: 42_000 },
      { x: -116_000, z: 86_000 },
      { x: -190_000, z: 120_000 },
    ],
  },
  {
    id: 'sunspire-caravan-road',
    name: 'Sunspire Caravan Road',
    kind: 'road',
    zoneIds: ['cursed_ruins', 'sunspire_steppe'],
    width: 10,
    safe: false,
    points: [
      { x: 400, z: -100 },
      { x: 18_000, z: -9_000 },
      { x: 66_000, z: -38_000 },
      { x: 150_000, z: -82_000 },
      { x: 260_000, z: -120_000 },
    ],
  },
  {
    id: 'moonfall-pass',
    name: 'Moonfall Pass',
    kind: 'pass',
    zoneIds: ['frozen_tundra', 'moonfall_highlands'],
    width: 12,
    safe: false,
    points: [
      { x: -500, z: 500 },
      { x: -28_000, z: -24_000 },
      { x: -92_000, z: -88_000 },
      { x: -198_000, z: -174_000 },
      { x: -320_000, z: -260_000 },
    ],
  },
  {
    id: 'chronoglass-mirage-way',
    name: 'Chronoglass Mirage Way',
    kind: 'pass',
    zoneIds: ['temporal_rifts', 'chronoglass_desert'],
    width: 14,
    safe: false,
    points: [
      { x: -700, z: 700 },
      { x: -48_000, z: 44_000 },
      { x: -132_000, z: 122_000 },
      { x: -264_000, z: 248_000 },
      { x: -420_000, z: 360_000 },
    ],
  },
];

export const WORLD_LANDMARKS: WorldLandmark[] = [
  {
    id: 'meadow-heart-tree',
    name: 'Heart Tree',
    kind: 'tree',
    zoneId: 'starter_meadow',
    position: { x: 18, z: -24 },
    radius: 5,
    height: 18,
  },
  {
    id: 'emerald-horizon-gate',
    name: 'Emerald Horizon Gate',
    kind: 'gate',
    zoneId: 'emerald_expanse',
    position: { x: 61_000, z: 103_000 },
    radius: 26,
    height: 58,
  },
  {
    id: 'silverwood-elder-crown',
    name: 'Elder Crown',
    kind: 'tree',
    zoneId: 'silverwood_ocean',
    position: { x: -150_000, z: 96_000 },
    radius: 34,
    height: 92,
  },
  {
    id: 'sunspire-needle',
    name: 'Sunspire Needle',
    kind: 'spire',
    zoneId: 'sunspire_steppe',
    position: { x: 222_000, z: -104_000 },
    radius: 28,
    height: 118,
  },
  {
    id: 'moonfall-keep',
    name: 'Moonfall Keep',
    kind: 'keep',
    zoneId: 'moonfall_highlands',
    position: { x: -286_000, z: -226_000 },
    radius: 42,
    height: 86,
  },
  {
    id: 'chronoglass-needle-field',
    name: 'Needle Field',
    kind: 'crystal',
    zoneId: 'chronoglass_desert',
    position: { x: -374_000, z: 318_000 },
    radius: 32,
    height: 76,
  },
];

export function getTravelLaneSegments(lanes: readonly WorldTravelLane[] = WORLD_TRAVEL_LANES): Array<{
  lane: WorldTravelLane;
  from: WorldPoint;
  to: WorldPoint;
}> {
  const segments: Array<{ lane: WorldTravelLane; from: WorldPoint; to: WorldPoint }> = [];
  for (const lane of lanes) {
    for (let index = 1; index < lane.points.length; index += 1) {
      segments.push({ lane, from: lane.points[index - 1], to: lane.points[index] });
    }
  }
  return segments;
}
