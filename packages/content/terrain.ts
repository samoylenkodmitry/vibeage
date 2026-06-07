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
  return {
    groundColor: rgbHex(gr, gg, gb),
    foliageColor: rgbHex(fr, fg, fb),
    accentColor: rgbHex(ar, ag, ab),
    grassDensity: grass,
    treeDensity: tree,
    roughness: rough,
    biome,
    height: getTerrainHeight(x, z),
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
  return grass;
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function getTerrainHeight(x: number, z: number): number {
  const distanceFromSpawn = Math.hypot(x, z);
  const spawnFade = smoothstep(80, 520, distanceFromSpawn);
  const broad = Math.sin(x * 0.0017 + z * 0.0009) * 10;
  const ridges = Math.sin((x - z) * 0.0042) * Math.cos((x + z) * 0.0024) * 5;
  const farRelief = Math.sin(distanceFromSpawn * 0.00016) * 18 * smoothstep(12_000, 90_000, distanceFromSpawn);
  return (broad + ridges) * spawnFade + farRelief;
}

export function getTerrainBiome(x: number, z: number): TerrainBiome {
  // The named zones (Volcanic Wastes, Frozen Tundra, …) sit within ±700
  // of spawn; map the terrain there to each zone's theme so a sector
  // looks like its name. Beyond the zones, fall back to the large-scale
  // climate field below. (The old thresholds were ~1000× the content
  // scale, so the whole playable area read as meadow + a ruins ring.)
  const zoneBiome = biomeAtZone(x, z);
  if (zoneBiome) return zoneBiome;

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
