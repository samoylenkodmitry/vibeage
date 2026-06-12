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

export type WorldLandmarkKind =
  | 'spire' | 'ruin' | 'tree' | 'gate' | 'crystal' | 'keep' | 'ancient_tree' | 'town' | 'castle'
  | 'shrine' | 'stones' | 'camp' | 'obelisk' | 'vista';

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
  // Settlement roads — the towns/castle shipped without any path leading to
  // them; these connect the spawn ring to each plateau. Grass and trees are
  // cleared along every lane automatically (distanceBeyondNearestLane).
  {
    id: 'lakeshire-road',
    name: 'Lakeshire Road',
    kind: 'road',
    zoneIds: ['starter_meadow'],
    width: 5,
    safe: true,
    points: [
      { x: -260, z: 320 },
      { x: -640, z: 290 },
      { x: -1_050, z: 190 },
      { x: -1_330, z: 110 },
      { x: -1_445, z: 82 },
    ],
  },
  {
    id: 'southmere-road',
    name: 'Southmere Track',
    kind: 'road',
    zoneIds: ['starter_meadow'],
    width: 5,
    safe: true,
    points: [
      { x: 120, z: 24 },
      { x: 300, z: -620 },
      { x: 450, z: -1_320 },
      { x: 545, z: -1_960 },
      { x: 558, z: -2_070 },
    ],
  },
  {
    id: 'crestfall-spur',
    name: 'Crestfall Ascent',
    kind: 'road',
    zoneIds: ['starter_meadow'],
    width: 4.5,
    safe: false,
    points: [
      { x: 3_550, z: -1_700 },
      { x: 3_590, z: -2_080 },
      { x: 3_600, z: -2_360 },
      { x: 3_600, z: -2_500 },
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
  // Settlements — each sits on a TOWN_PLATEAUS flat disc (terrain.ts) so the
  // houses/walls stand on level ground; WorldFeatures renders them as seeded
  // procedural structures (renderTownLandmark / renderCastleLandmark).
  {
    id: 'lakeshire-town',
    name: 'Lakeshire',
    kind: 'town',
    zoneId: 'starter_meadow',
    position: { x: -1_450, z: 80 },
    radius: 110,
    height: 14,
  },
  {
    id: 'southmere-town',
    name: 'Southmere',
    kind: 'town',
    zoneId: 'starter_meadow',
    position: { x: 560, z: -2_080 },
    radius: 100,
    height: 14,
  },
  {
    id: 'crestfall-castle',
    name: 'Crestfall Castle',
    kind: 'castle',
    zoneId: 'starter_meadow',
    position: { x: 3_600, z: -2_520 },
    radius: 78,
    height: 96,
  },
  // Wilderness POIs — small named places dotting the explorable band so the
  // walk between spawn and the settlements is worth taking. Placement was
  // terrain-checked (dry, slope ≤3 m across the footprint, off the lanes);
  // they appear as named dots on the map, so each one is a destination.
  {
    id: 'poi-mossgate-colonnade',
    name: 'Mossgate Colonnade',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: 240, z: 150 },
    radius: 12,
    height: 11,
  },
  {
    id: 'poi-dawnstone-circle',
    name: 'Dawnstone Circle',
    kind: 'stones',
    zoneId: 'starter_meadow',
    position: { x: -340, z: -60 },
    radius: 10,
    height: 7,
  },
  {
    id: 'poi-brookside-shrine',
    name: 'Brookside Shrine',
    kind: 'shrine',
    zoneId: 'starter_meadow',
    position: { x: -120, z: 480 },
    radius: 4,
    height: 6,
  },
  {
    id: 'poi-ring-road-waycamp',
    name: 'Ring Road Waycamp',
    kind: 'camp',
    zoneId: 'starter_meadow',
    position: { x: 246, z: 355 },
    radius: 8,
    height: 5,
  },
  {
    id: 'poi-eldan-colonnade',
    name: 'Eldan Colonnade',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: -700, z: 300 },
    radius: 14,
    height: 12,
  },
  {
    id: 'poi-wayfarers-shrine',
    name: "Wayfarer's Shrine",
    kind: 'shrine',
    zoneId: 'starter_meadow',
    position: { x: -1_060, z: 225 },
    radius: 4,
    height: 6,
  },
  {
    id: 'poi-lakeshire-milestone',
    name: 'Lakeshire Milestone',
    kind: 'obelisk',
    zoneId: 'starter_meadow',
    position: { x: -1_320, z: 140 },
    radius: 3,
    height: 13,
  },
  {
    id: 'poi-sleeping-sisters',
    name: 'The Sleeping Sisters',
    kind: 'stones',
    zoneId: 'starter_meadow',
    position: { x: 370, z: -680 },
    radius: 12,
    height: 8.5,
  },
  {
    id: 'poi-southmere-waycamp',
    name: 'Southmere Waycamp',
    kind: 'camp',
    zoneId: 'starter_meadow',
    position: { x: 508, z: -1_534 },
    radius: 9,
    height: 5,
  },
  {
    id: 'poi-broken-watch',
    name: 'The Broken Watch',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: 600, z: -1_800 },
    radius: 12,
    height: 14,
  },
  {
    id: 'poi-crestfall-gate-ruins',
    name: 'Crestfall Gate Ruins',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: 3_573, z: -2_026 },
    radius: 13,
    height: 13,
  },
  {
    id: 'poi-pilgrims-overlook',
    name: "Pilgrim's Overlook",
    kind: 'shrine',
    zoneId: 'starter_meadow',
    position: { x: 3_650, z: -1_900 },
    radius: 4,
    height: 6,
  },
  {
    id: 'poi-sunken-amphitheatre',
    name: 'Sunken Amphitheatre',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: 1_850, z: 620 },
    radius: 16,
    height: 9,
  },
  {
    id: 'poi-giants-teeth',
    name: "Giants' Teeth",
    kind: 'stones',
    zoneId: 'starter_meadow',
    position: { x: -1_025, z: -1_200 },
    radius: 14,
    height: 10,
  },
  {
    id: 'poi-hunters-bluff-camp',
    name: "Hunter's Bluff Camp",
    kind: 'camp',
    zoneId: 'starter_meadow',
    position: { x: 1_061, z: -581 },
    radius: 8,
    height: 5,
  },
  {
    id: 'poi-quiet-star-glade',
    name: 'Glade of the Quiet Star',
    kind: 'shrine',
    zoneId: 'starter_meadow',
    position: { x: -1_636, z: -537 },
    radius: 5,
    height: 6.5,
  },
  {
    id: 'poi-fallen-star-marker',
    name: 'Fallen Star Marker',
    kind: 'obelisk',
    zoneId: 'starter_meadow',
    position: { x: 2_255, z: 399 },
    radius: 3,
    height: 15,
  },
  {
    id: 'poi-old-bastion',
    name: 'The Old Bastion',
    kind: 'ruin',
    zoneId: 'starter_meadow',
    position: { x: -2_143, z: 852 },
    radius: 18,
    height: 16,
  },
  {
    id: 'poi-whisperwind-ring',
    name: 'Whisperwind Ring',
    kind: 'stones',
    zoneId: 'starter_meadow',
    position: { x: 2_800, z: -900 },
    radius: 11,
    height: 7.5,
  },
  // Vistas — places where the TERRAIN is the landmark; rendered by the
  // height field itself (kind 'vista' draws nothing, it's map + teleport).
  {
    id: 'glacial-vale',
    name: 'Glacial Vale',
    kind: 'vista',
    zoneId: 'starter_meadow',
    position: { x: -2_650, z: -2_350 },
    radius: 420,
    height: 250,
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

const ALL_LANE_SEGMENTS = getTravelLaneSegments();
const RIVER_LANE_SEGMENTS = ALL_LANE_SEGMENTS.filter((segment) => segment.lane.kind === 'river');

/**
 * Distance from a point to the EDGE of the nearest travel lane (0 = on the
 * lane surface). Used to keep grass/foliage off roads and rivers — blades
 * used to grow straight through the lane slabs.
 */
export function distanceBeyondNearestLane(x: number, z: number): number {
  return distanceBeyondSegments(x, z, ALL_LANE_SEGMENTS);
}

/** Same, but rivers only — reed banks hug water, never roads. */
export function distanceBeyondNearestRiver(x: number, z: number): number {
  return distanceBeyondSegments(x, z, RIVER_LANE_SEGMENTS);
}

function distanceBeyondSegments(
  x: number,
  z: number,
  segments: ReadonlyArray<{ lane: WorldTravelLane; from: WorldPoint; to: WorldPoint }>,
): number {
  let best = Infinity;
  for (const { lane, from, to } of segments) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lenSq)) : 0;
    const d = Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t)) - lane.width / 2;
    if (d < best) best = d;
  }
  return Math.max(0, best);
}
