import { biomeAtZone, biomeWeights } from './zoneBiomes.js';

export type TerrainBiome =
  | 'meadow'
  | 'forest'
  | 'highland'
  | 'wetland'
  | 'ruins'
  | 'volcanic'
  | 'tundra'
  | 'ethereal'
  | 'abyssal'
  | 'celestial'
  | 'temporal';

type TerrainVisual = {
  groundColor: string;
  foliageColor: string;
  accentColor: string;
  grassDensity: number;
  treeDensity: number;
  roughness: number;
};

export type TerrainSample = TerrainVisual & {
  height: number;
  biome: TerrainBiome;
};

const TERRAIN_BIOME_VISUALS: Record<TerrainBiome, TerrainVisual> = {
  meadow: {
    groundColor: '#2f6f45',
    foliageColor: '#4ade80',
    accentColor: '#fde68a',
    grassDensity: 0.9,
    treeDensity: 0.32,
    roughness: 0.35,
  },
  forest: {
    groundColor: '#24513a',
    foliageColor: '#2f9e5b',
    accentColor: '#86efac',
    grassDensity: 0.7,
    treeDensity: 0.68,
    roughness: 0.48,
  },
  highland: {
    groundColor: '#66715a',
    foliageColor: '#8fb56b',
    accentColor: '#d6d3d1',
    grassDensity: 0.52,
    treeDensity: 0.34,
    roughness: 0.86,
  },
  wetland: {
    groundColor: '#2e5b5d',
    foliageColor: '#7dd3a4',
    accentColor: '#93c5fd',
    grassDensity: 0.72,
    treeDensity: 0.34,
    roughness: 0.28,
  },
  ruins: {
    groundColor: '#4b4a3f',
    foliageColor: '#5f8f62',
    accentColor: '#c4b5fd',
    grassDensity: 0.52,
    treeDensity: 0.24,
    roughness: 0.62,
  },
  volcanic: {
    groundColor: '#4a2e2a',
    foliageColor: '#9a3412',
    accentColor: '#fb923c',
    grassDensity: 0.1,
    treeDensity: 0.04,
    roughness: 0.92,
  },
  tundra: {
    groundColor: '#8fb2bc',
    foliageColor: '#c7d2fe',
    accentColor: '#e0f2fe',
    grassDensity: 0.42,
    treeDensity: 0.3,
    roughness: 0.58,
  },
  ethereal: {
    groundColor: '#496b6a',
    foliageColor: '#99f6e4',
    accentColor: '#f0abfc',
    grassDensity: 0.62,
    treeDensity: 0.26,
    roughness: 0.42,
  },
  abyssal: {
    groundColor: '#253044',
    foliageColor: '#38bdf8',
    accentColor: '#818cf8',
    grassDensity: 0.42,
    treeDensity: 0.2,
    roughness: 0.72,
  },
  celestial: {
    groundColor: '#7c7590',
    foliageColor: '#fde68a',
    accentColor: '#fef3c7',
    grassDensity: 0.48,
    treeDensity: 0.28,
    roughness: 0.66,
  },
  temporal: {
    groundColor: '#51446d',
    foliageColor: '#d8b4fe',
    accentColor: '#67e8f9',
    grassDensity: 0.5,
    treeDensity: 0.2,
    roughness: 0.52,
  },
};

export function sampleTerrain(x: number, z: number): TerrainSample {
  const biome = getTerrainBiome(x, z);
  // Blend the neighbouring zone biomes' colours + densities by soft
  // distance weights so sectors transition smoothly instead of snapping
  // at a hard Voronoi edge (which read as an ugly seam on the ground).
  // `biome` stays the dominant one for discrete logic (conifer share).
  const weights = biomeWeights(x, z);
  let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, ar = 0, ag = 0, ab = 0;
  let grass = 0, tree = 0, rough = 0;
  for (const [b, w] of weights) {
    const v = TERRAIN_BIOME_VISUALS[b];
    const g = hexRgb(v.groundColor), f = hexRgb(v.foliageColor), a = hexRgb(v.accentColor);
    gr += g.r * w; gg += g.g * w; gb += g.b * w;
    fr += f.r * w; fg += f.g * w; fb += f.b * w;
    ar += a.r * w; ag += a.g * w; ab += a.b * w;
    grass += v.grassDensity * w; tree += v.treeDensity * w; rough += v.roughness * w;
  }
  const height = getTerrainHeight(x, z);
  // Glacial Vale grading: snow above the (height-driven) snowline, scree
  // below; bare rock-and-ice floor — blade grass doesn't grow here.
  const vale = glacialValeMask(x, z);
  if (vale > 0.01) {
    const snow = vale * smoothstep(35, 95, height);
    const scree = vale * (1 - snow) * 0.45;
    const mixTo = (c: number, target: number, t: number) => c + (target - c) * t;
    gr = mixTo(mixTo(gr, 230, snow), 148, scree);
    gg = mixTo(mixTo(gg, 235, snow), 143, scree);
    gb = mixTo(mixTo(gb, 245, snow), 135, scree);
    fr = mixTo(fr, 94, vale); fg = mixTo(fg, 122, vale); fb = mixTo(fb, 99, vale);
    rough = mixTo(rough, 0.85, vale); // snow/scree is matte, not forest-glossy
    grass *= 1 - vale;
    tree = tree * (1 - vale) + 0.05 * vale;
  }
  return {
    groundColor: rgbHex(gr, gg, gb),
    foliageColor: rgbHex(fr, fg, fb),
    accentColor: rgbHex(ar, ag, ab),
    grassDensity: grass,
    treeDensity: tree,
    roughness: rough,
    biome,
    height,
  };
}

/**
 * Just the blended per-biome grass density at a point (no colour parsing) — a
 * lean version of `sampleTerrain` cheap enough to sample on a grid, used to
 * build the grass-density map so blades thin out / clear over low-grass biomes
 * (sand, scorched, dirt) instead of rendering patchily over their brown ground.
 */
export function sampleGrassDensity(x: number, z: number): number {
  let grass = 0;
  for (const [b, w] of biomeWeights(x, z)) grass += TERRAIN_BIOME_VISUALS[b].grassDensity * w;
  // Bare rock and snow in the Glacial Vale — also keeps the expensive vale
  // branch of the grass shader's terrainH on culled (skipped) blades.
  return grass * (1 - glacialValeMask(x, z));
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * World relief. Purely cosmetic — the server never reads height; entities,
 * camera, VFX, foliage, landmarks and the grass shader all derive their Y
 * from this one function, so reshaping it reshapes the whole world
 * consistently. MUST stay in sync with the GLSL port `terrainH()` in
 * `apps/client/src/WorldShaderGrass.tsx` (the grass evaluates it per blade
 * on the GPU) — change both together or blades float/sink.
 *
 * Composition (everything sin/cos so the GLSL mirror is exact):
 * - rolling hills: three octaves, ~700 m / ~350 m / ~125 m wavelengths, so
 *   meadows roll like L2's plains instead of reading as a billiard table;
 * - mountain ridges: sharpened crests (1-|sin|)² with a slow phase warp so
 *   ridgelines bend naturally, gated by a ~4 km mask field so distinct
 *   mountainous belts rise between rolling regions;
 * - valleys: broad gated dips below the base level for river-valley relief;
 * - canyons: winding dry gorges (~300 m wide, ~55 m deep) carved where a
 *   meandering path field crosses zero, gated to canyon regions;
 * - lakes: terrain eases toward a fixed bed level (LAKE_BED_Y) inside small
 *   round masks at the peaks of a slow lattice field — the fixed bed makes a
 *   fixed water level (LAKE_WATER_Y) work everywhere: the shore is wherever
 *   the blend crosses the waterline, and the oversized water disc hides
 *   under the terrain beyond it (see computeNearbyLakes + LakeWaters).
 *
 * The cozy coast's authored waterline reaches ~410 m from origin (corners of
 * the water plane), so the spawn flat zone extends past it — relief ramps in
 * from 430 m and is full strength by 900 m (lakes start at 900 m so the
 * authored zones stay dry). Slopes peak around 25 % on ridge flanks:
 * dramatic on screen, still smooth across the 256 m / 24-segment terrain
 * mesh (~10.7 m per quad).
 */
// Lake lattice: sin(x·KX+PX)·sin(z·KZ+PZ) peaks (+1) where both sines are +1
// or both are −1 — those peak positions are computable analytically, which is
// what lets LakeWaters place water discs without searching the height field.
const LAKE_KX = 0.0013;
const LAKE_KZ = 0.00117;
const LAKE_PX = 0.9;
const LAKE_PZ = -1.6;
const LAKE_MIN_DIST = 900;   // lakes only past the authored zones
const LAKE_FULL_DIST = 1300;
export const LAKE_BED_Y = -11;
export const LAKE_WATER_Y = -4;

/**
 * Settlement plateaus — small flat discs blended into the relief so towns and
 * castles sit on level ground instead of a 20 % hillside. `y` is chosen near
 * the natural terrain height at the spot so the blend reads as terracing, not
 * a floating pedestal. MIRRORED in the grass GLSL terrainH — keep ≤ a handful
 * and update both together. Settlement structures themselves are landmarks
 * (kind 'town' / 'castle' in worldFeatures.ts) rendered by WorldFeatures.
 */
export const TOWN_PLATEAUS = [
  { id: 'lakeshire', x: -1450, z: 80, y: 16, r: 120 },   // rise overlooking the west lake
  { id: 'southmere', x: 560, z: -2080, y: 3, r: 110 },   // lakefront deck, ~7 m above the water
  { id: 'crestfall', x: 3600, z: -2520, y: 26, r: 80 },  // castle crest on the mountain belt
] as const;

// ── Glacial Vale ────────────────────────────────────────────────────────────
// A hand-carved alpine pocket NW of spawn (after deedy/glacial-valley): a
// U-shaped valley holding a turquoise tarn between ridged snow walls. Pure
// sines + smoothsteps so the grass GLSL terrainH mirrors it 1:1 (the #857
// discipline). The ridge math is a 2-term cut-down of the reference's ridged
// multifractal — (1-|sin|)² crests with a sine domain warp.
// MIRRORED in apps/client/src/WorldShaderGrass.tsx terrainH() ("Glacial
// Vale" block) — change both together or blades float/sink.
export const GLACIAL_VALE = {
  x: -2_650, z: -2_350,
  cos: Math.cos(0.65), sin: Math.sin(0.65), // valley axis heading
  L: 620, W: 420,                            // ellipse half-extents
} as const;
export const VALE_TARN_WATER_Y = LAKE_WATER_Y; // shares the lattice waterline

/** 1 inside the vale, 0 outside; soft edge blends override into base relief. */
export function glacialValeMask(x: number, z: number): number {
  const dx = x - GLACIAL_VALE.x;
  const dz = z - GLACIAL_VALE.z;
  // Fast reject: outside the ellipse's bounding square the mask is 0 —
  // skips the rotation/ellipse math for almost every call in the world.
  if (Math.abs(dx) > GLACIAL_VALE.L || Math.abs(dz) > GLACIAL_VALE.L) return 0;
  const u = dx * GLACIAL_VALE.cos + dz * GLACIAL_VALE.sin;
  const v = -dx * GLACIAL_VALE.sin + dz * GLACIAL_VALE.cos;
  const e = (u / GLACIAL_VALE.L) ** 2 + (v / GLACIAL_VALE.W) ** 2;
  return 1 - smoothstep(0.55, 1, e);
}

function glacialValeHeight(x: number, z: number): number {
  const dx = x - GLACIAL_VALE.x;
  const dz = z - GLACIAL_VALE.z;
  const u = dx * GLACIAL_VALE.cos + dz * GLACIAL_VALE.sin;
  const v = -dx * GLACIAL_VALE.sin + dz * GLACIAL_VALE.cos;
  // Valley floor with a gentle moraine ripple; the tarn dips below the
  // waterline so the water disc reads as a real glacial lake.
  let floorY = 2.5 + Math.sin(u * 0.05) * Math.sin(v * 0.047) * 0.8;
  const tarnE = (u / 190) ** 2 + (v / 75) ** 2;
  const tarn = 1 - smoothstep(0.45, 1, tarnE);
  floorY = floorY * (1 - tarn) + (-9) * tarn;
  // Ridged walls: domain-warped crest lines, squared for sharp alpine spines.
  const r1 = 1 - Math.abs(Math.sin(u * 0.006 + Math.sin(v * 0.004) * 1.3));
  const r2 = 1 - Math.abs(Math.sin((u + v) * 0.011 + 0.9));
  const wSide = smoothstep(85, 360, Math.abs(v));
  const wEnd = smoothstep(380, 600, Math.abs(u));
  const wallRamp = Math.max(wSide, wEnd * 0.85);
  const wall = Math.pow(wallRamp, 1.6) * (80 + 120 * r1 * r1 + 50 * r2 * r2)
    + Math.sin(u * 0.03) * Math.sin(v * 0.027) * 6 * wallRamp;
  return floorY + wall;
}

export function getTerrainHeight(x: number, z: number): number {
  const distanceFromSpawn = Math.hypot(x, z);
  // Flat spawn zone: spawnFade and farRelief are both exactly 0 here, so skip
  // the trig entirely (same early-out in the GLSL mirror).
  if (distanceFromSpawn <= 430) return 0;
  const spawnFade = smoothstep(430, 900, distanceFromSpawn);

  const hills =
    Math.sin(x * 0.009 + z * 0.006) * 9 +
    Math.sin(x * 0.0042 - z * 0.0051 + 1.7) * 14 +
    Math.sin((x + z) * 0.017 + 0.6) * 2.5;

  const ridgePhase = x * 0.0014 + z * 0.0011 + Math.sin(z * 0.0008 - x * 0.0005) * 1.4;
  const ridgeShape = 1 - Math.abs(Math.sin(ridgePhase));
  const mountainMask = smoothstep(0.3, 0.8, Math.sin(x * 0.00093 + 1.3) * Math.cos(z * 0.00078 - 0.7));
  const mountains = ridgeShape * ridgeShape * 48 * mountainMask;

  const valleys = -smoothstep(0.55, 0.95, Math.sin(x * 0.0011 - 0.4) * Math.sin(z * 0.0013 + 2.0)) * 16;

  const canyonPath =
    Math.sin(x * 0.00037 + Math.sin(z * 0.00022) * 2.1) +
    Math.cos(z * 0.00031 + Math.sin(x * 0.00018) * 1.7);
  const canyonRegion = smoothstep(0.25, 0.75, Math.sin(x * 0.00011 - 2.0) * Math.sin(z * 0.00009 + 1.1));
  const canyonWall = 1 - smoothstep(0, 0.22, Math.abs(canyonPath));
  const canyons = -canyonWall * canyonWall * 55 * canyonRegion;

  const farRelief = Math.sin(distanceFromSpawn * 0.00016) * 18 * smoothstep(12_000, 90_000, distanceFromSpawn);
  const base = (hills + mountains + valleys + canyons) * spawnFade + farRelief;

  const lakeField = Math.sin(x * LAKE_KX + LAKE_PX) * Math.sin(z * LAKE_KZ + LAKE_PZ);
  const lakeMask = smoothstep(0.93, 0.985, lakeField) * smoothstep(LAKE_MIN_DIST, LAKE_FULL_DIST, distanceFromSpawn);
  let height = base * (1 - lakeMask) + LAKE_BED_Y * lakeMask;

  for (const plateau of TOWN_PLATEAUS) {
    const m = 1 - smoothstep(plateau.r * 0.7, plateau.r * 1.4, Math.hypot(x - plateau.x, z - plateau.z));
    if (m > 0) height = height * (1 - m) + plateau.y * m;
  }
  const vale = glacialValeMask(x, z);
  if (vale > 0) height = height * (1 - vale) + glacialValeHeight(x, z) * vale;
  return height;
}

/**
 * Lake centres within `radius` of a point — the analytic +1 peaks of the lake
 * lattice (both sines +1, or both −1), filtered to where lakes actually carve
 * (past LAKE_MIN_DIST). Used by LakeWaters to stream water discs; the disc is
 * oversized and the terrain simply occludes it beyond the actual shoreline.
 */
export function computeNearbyLakes(cx: number, cz: number, radius: number): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const stepX = (2 * Math.PI) / LAKE_KX;
  const stepZ = (2 * Math.PI) / LAKE_KZ;
  // Family A: sin = +1 at (π/2 − P)/K + n·2π/K; family B: sin = −1 (offset π/K).
  for (const fam of [0, 1] as const) {
    const baseX = ((Math.PI / 2) * (fam === 0 ? 1 : -1) - LAKE_PX) / LAKE_KX;
    const baseZ = ((Math.PI / 2) * (fam === 0 ? 1 : -1) - LAKE_PZ) / LAKE_KZ;
    const nx0 = Math.floor((cx - radius - baseX) / stepX);
    const nx1 = Math.ceil((cx + radius - baseX) / stepX);
    const nz0 = Math.floor((cz - radius - baseZ) / stepZ);
    const nz1 = Math.ceil((cz + radius - baseZ) / stepZ);
    for (let nx = nx0; nx <= nx1; nx += 1) {
      for (let nz = nz0; nz <= nz1; nz += 1) {
        const x = baseX + nx * stepX;
        const z = baseZ + nz * stepZ;
        if (Math.hypot(x - cx, z - cz) > radius) continue;
        if (Math.hypot(x, z) < LAKE_MIN_DIST) continue;
        out.push({ x, z });
      }
    }
  }
  return out;
}

export function getTerrainBiome(x: number, z: number): TerrainBiome {
  // The named zones (Volcanic Wastes, Frozen Tundra, …) sit within ±700
  // of spawn; map the terrain there to each zone's theme so a sector
  // looks like its name. Beyond the zones, fall back to the large-scale
  // climate field below. (The old thresholds were ~1000× the content
  // scale, so the whole playable area read as meadow + a ruins ring.)
  const zoneBiome = biomeAtZone(x, z);
  if (zoneBiome) return zoneBiome;

  // The Glacial Vale is alpine regardless of the surrounding climate field.
  if (glacialValeMask(x, z) > 0.4) return 'tundra';

  const distance = Math.hypot(x, z);
  if (distance < 420) {
    return 'meadow';
  }

  const climate = Math.sin(x * 0.000031) + Math.cos(z * 0.000027);
  const magic = Math.sin((x + z) * 0.000019);

  if (distance > 420_000 && magic > 0.45) {
    return 'temporal';
  }

  if (z < -260_000 && climate > 0.3) {
    return 'celestial';
  }

  if (x > 260_000 && z < -80_000) {
    return 'volcanic';
  }

  if (x < -280_000 || z > 320_000) {
    return 'tundra';
  }

  if (magic > 0.55) {
    return 'ethereal';
  }

  if (climate < -0.75) {
    return 'abyssal';
  }

  if (climate > 0.78) {
    return 'forest';
  }

  if (Math.abs(x - z) > 180_000) {
    return 'highland';
  }

  return distance > 120_000 ? 'wetland' : 'ruins';
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
