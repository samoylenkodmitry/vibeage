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

export type WorldLandmarkKind = 'spire' | 'ruin' | 'tree' | 'gate' | 'crystal' | 'keep' | 'ancient_tree';

export type WorldLandmark = {
  id: string;
  name: string;
  kind: WorldLandmarkKind;
  zoneId: string;
  position: WorldPoint;
  radius: number;
  height: number;
  /** Mega landmarks render with fog disabled and stay visible at huge range. */
  mega?: boolean;
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
    id: 'ancient-gnarled-tree',
    name: 'The Ancient Gnarled Tree',
    kind: 'ancient_tree',
    zoneId: 'starter_meadow',
    position: { x: 80, z: 60 },
    radius: 14,
    height: 24,
  },
  {
    id: 'starter-watchtower',
    name: 'Watchtower of the First Dawn',
    kind: 'spire',
    zoneId: 'starter_meadow',
    position: { x: 380, z: 240 },
    radius: 12,
    height: 88,
  },
  {
    id: 'starter-ancient-arch',
    name: 'Ancient Arch',
    kind: 'gate',
    zoneId: 'starter_meadow',
    position: { x: -260, z: 320 },
    radius: 18,
    height: 64,
  },
  {
    id: 'starter-whisper-grove',
    name: 'Whisperleaf Grove',
    kind: 'tree',
    zoneId: 'starter_meadow',
    position: { x: -180, z: -340 },
    radius: 22,
    height: 68,
  },
  {
    id: 'starter-distant-keep',
    name: 'Dawnfall Keep',
    kind: 'keep',
    zoneId: 'starter_meadow',
    position: { x: 640, z: -480 },
    radius: 36,
    height: 130,
  },
  {
    id: 'mega-skyspire-of-aetheris',
    name: 'Skyspire of Aetheris',
    kind: 'spire',
    zoneId: 'starter_meadow',
    position: { x: 4_800, z: 5_400 },
    radius: 220,
    height: 1_200,
    mega: true,
  },
  {
    id: 'mega-worldroot-tree',
    name: 'Worldroot',
    kind: 'tree',
    zoneId: 'starter_meadow',
    position: { x: -5_600, z: 4_800 },
    radius: 360,
    height: 1_400,
    mega: true,
  },
  {
    id: 'mega-forgotten-colossus',
    name: 'The Forgotten Colossus',
    kind: 'keep',
    zoneId: 'starter_meadow',
    position: { x: 6_400, z: -5_200 },
    radius: 280,
    height: 1_600,
    mega: true,
  },
  {
    id: 'mega-crystal-heart',
    name: 'Crystal Heart',
    kind: 'crystal',
    zoneId: 'starter_meadow',
    position: { x: -6_200, z: -5_800 },
    radius: 240,
    height: 1_350,
    mega: true,
  },
  {
    id: 'mega-sunward-gate',
    name: 'Sunward Gate',
    kind: 'gate',
    zoneId: 'starter_meadow',
    position: { x: 8_400, z: 1_200 },
    radius: 320,
    height: 1_000,
    mega: true,
  },
  {
    id: 'mega-twin-spires',
    name: 'Twin Spires of Auros',
    kind: 'spire',
    zoneId: 'starter_meadow',
    position: { x: -1_400, z: 7_600 },
    radius: 180,
    height: 1_500,
    mega: true,
  },
  {
    id: 'mega-iron-keep',
    name: 'Iron Keep of Kalt',
    kind: 'keep',
    zoneId: 'starter_meadow',
    position: { x: 2_400, z: -7_800 },
    radius: 300,
    height: 1_280,
    mega: true,
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
