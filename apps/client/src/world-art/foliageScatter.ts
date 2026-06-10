import * as THREE from 'three';
import { sampleTerrain, TOWN_PLATEAUS, type TerrainBiome } from '../../../../packages/content/terrain';

/**
 * Position-stable foliage scatter. Every tree / rock / grass tuft is a
 * pure function of its own world cell — `seededRandom(absCellX, absCellZ)`
 * with NO dependency on the player's position and NO distance-from-centre
 * falloff. That is the whole point of the rewrite: the old field centred a
 * window on a quantised, jumping point and scaled density by distance to
 * that centre, so crossing a 128 m line re-shuffled the entire view. Here a
 * cell's contents never change, so chunks stream in/out at the frontier
 * without anything already on screen moving.
 */

export type FoliageInstance = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  color: string;
};

export const FOLIAGE_CELL_SIZE = 32; // world metres per scatter cell
// Foliage streams on its OWN chunk grid (decoupled from the 256 m terrain
// chunk). A larger foliage chunk lets the SAME chunk/draw-call count reach
// farther out — so the streaming frontier lands inside the fog band (~fogFar)
// where mounting/unmounting a frontier chunk is invisible, instead of popping
// against a clear distance. MUST be a whole multiple of FOLIAGE_CELL_SIZE
// (320 = 10×32): otherwise floor()/ceil() in scatterChunkFoliage makes adjacent
// chunks share a boundary cell → duplicated trees + z-fighting at every seam.
// 320 × radius 3 = 960 m, just under the terrain view edge (radius 4 = 1024 m)
// so trees always sit on detailed terrain, never the flat backdrop plane.
export const FOLIAGE_CHUNK_SIZE = 320;

/** The foliage chunk index containing a world position. */
export function foliageChunkOf(focusX: number, focusZ: number): { cx: number; cz: number } {
  return {
    cx: Math.floor(focusX / FOLIAGE_CHUNK_SIZE),
    cz: Math.floor(focusZ / FOLIAGE_CHUNK_SIZE),
  };
}

/** World origins of every foliage chunk within `radius` of a centre chunk. */
export function visibleFoliageChunks(centerCx: number, centerCz: number, radius: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      out.push({ x: (centerCx + dx) * FOLIAGE_CHUNK_SIZE, z: (centerCz + dz) * FOLIAGE_CHUNK_SIZE });
    }
  }
  return out;
}
// Trim raw biome densities so a uniform (no-falloff) field doesn't over-
// populate vs the old falloff-thinned window. Tune here if too sparse/dense.
// Two tree slots per cell (A slightly likelier than B) ≈ 1.6× the old single
// roll, and B landing near A reads as natural clustering instead of an even
// sprinkle — forests become forests, not savanna.
const TREE_DENSITY_SCALE_A = 0.55;
const TREE_DENSITY_SCALE_B = 0.45;
const GRASS_DENSITY_SCALE = 0.8;
const ROCK_DENSITY_SCALE = 0.08;
// Understory: bushes fill the gap between blade-grass and trees. Weighted by
// both tree and grass density so forests get thick undergrowth and meadows
// get scattered shrubs; bare biomes (volcanic) get none.
const BUSH_TREE_WEIGHT = 0.55;
const BUSH_GRASS_WEIGHT = 0.3;
// Nothing grows below the lake waterline (LAKE_WATER_Y -4, with a margin):
// lakebeds stay bare instead of growing drowned pines.
const DRY_MIN_Y = -3.5;

/** No trees/bushes inside a settlement plateau (houses live there). */
function insideSettlement(x: number, z: number): boolean {
  for (const p of TOWN_PLATEAUS) {
    if (Math.hypot(x - p.x, z - p.z) < p.r) return true;
  }
  return false;
}

export const BROADLEAF_GLB = '/models/trees/pine_b.glb';
export const CONIFER_GLB = '/models/trees/pine_a.glb';
export const TREE_GLB_ALT = '/models/trees/pine_c.glb';
export const ACCENT_GLB_SMALL = '/models/rocks/rock_round_small.glb';
export const ACCENT_GLB_MEDIUM = '/models/rocks/rock_medium_a.glb';
export const BUSH_GLB = '/models/foliage/grass_tuft.glb';
export const TREE_WIND = { amplitude: 0.14, speed: 0.85 } as const;
export const BUSH_WIND = { amplitude: 0.08, speed: 1.1 } as const;

export type ChunkFoliage = {
  trees: FoliageInstance[];
  conifers: FoliageInstance[];
  grass: FoliageInstance[];
  accents: FoliageInstance[];
  bushes: FoliageInstance[];
};

/**
 * Scatter foliage for one square chunk `[originX, originX+size) ×
 * [originZ, originZ+size)`. Deterministic by absolute cell, so the same
 * chunk always yields the identical set. `grassOn` lets low quality skip
 * the dense grass layer.
 */
export function scatterChunkFoliage(originX: number, originZ: number, size: number, grassOn: boolean): ChunkFoliage {
  const trees: FoliageInstance[] = [];
  const conifers: FoliageInstance[] = [];
  const grass: FoliageInstance[] = [];
  const accents: FoliageInstance[] = [];
  const bushes: FoliageInstance[] = [];
  const cell = FOLIAGE_CELL_SIZE;
  const cell0X = Math.floor(originX / cell);
  const cell0Z = Math.floor(originZ / cell);
  const cells = Math.ceil(size / cell);

  for (let iz = 0; iz < cells; iz += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const cellX = cell0X + ix;
      const cellZ = cell0Z + iz;
      const random = seededRandom(cellX, cellZ);
      const x = (cellX + random()) * cell;
      const z = (cellZ + random()) * cell;
      const sample = sampleTerrain(x, z);
      const coniferShare = getConiferShare(sample.biome);

      const pushTree = (tx: number, tz: number, height: number) => {
        // Consume the slot's randoms BEFORE the guard so a skipped (underwater)
        // slot advances the PRNG identically — neighbouring slots in the cell
        // keep the exact same values whether or not this one was dropped.
        const isConifer = random() < coniferShare;
        const inst = {
          x: tx, y: height, z: tz,
          scale: isConifer ? 0.72 + random() * 0.95 : 0.65 + random() * 1.1,
          rotation: random() * Math.PI * 2,
          color: jitterFoliageColor(isConifer ? darkenForConifer(sample.foliageColor) : sample.foliageColor, random),
        };
        if (height < DRY_MIN_Y || insideSettlement(tx, tz)) return; // lakebed/town
        (isConifer ? conifers : trees).push(inst);
      };
      if (random() < sample.treeDensity * TREE_DENSITY_SCALE_A) {
        pushTree(x, z, sample.height);
      }
      // Second slot lands near the first → pairs/clumps, like real stands.
      const bx = x + (random() - 0.5) * cell * 0.8;
      const bz = z + (random() - 0.5) * cell * 0.8;
      if (random() < sample.treeDensity * TREE_DENSITY_SCALE_B) {
        pushTree(bx, bz, sampleTerrain(bx, bz).height);
      }
      const bushChance = sample.treeDensity * BUSH_TREE_WEIGHT + sample.grassDensity * BUSH_GRASS_WEIGHT;
      for (let slot = 0; slot < 2; slot += 1) {
        if (random() < bushChance) {
          const ux = x + (random() - 0.5) * cell * 0.9;
          const uz = z + (random() - 0.5) * cell * 0.9;
          const uy = sampleTerrain(ux, uz).height;
          // Consume-then-guard, same PRNG discipline as pushTree.
          const inst = {
            x: ux, y: uy, z: uz,
            scale: 1.5 + random() * 1.6, rotation: random() * Math.PI * 2,
            color: jitterFoliageColor(darkenForConifer(sample.foliageColor), random),
          };
          if (uy < DRY_MIN_Y || insideSettlement(ux, uz)) continue;
          bushes.push(inst);
        }
      }
      if (grassOn && sample.height >= DRY_MIN_Y && random() < sample.grassDensity * GRASS_DENSITY_SCALE) {
        grass.push({
          x: x + (random() - 0.5) * cell * 0.5, y: sample.height, z: z + (random() - 0.5) * cell * 0.5,
          scale: 0.7 + random() * 0.8, rotation: random() * Math.PI * 2, color: sample.foliageColor,
        });
      }
      if (sample.height >= DRY_MIN_Y && random() < sample.roughness * ROCK_DENSITY_SCALE) {
        accents.push({
          x: x + (random() - 0.5) * cell * 0.34, y: sample.height, z: z + (random() - 0.5) * cell * 0.34,
          scale: 0.45 + random() * 0.9, rotation: random() * Math.PI * 2, color: sample.accentColor,
        });
      }
    }
  }
  return { trees, conifers, grass, accents, bushes };
}

/**
 * Per-instance tint variation so a forest isn't a wall of one green. The
 * jitter is QUANTIZED (5 lightness steps × 3 warmth steps) so the resulting
 * hex strings stay bounded for the instanceColor cache.
 */
function jitterFoliageColor(hex: string, random: () => number): string {
  const value = parseInt(hex.startsWith('#') ? hex.slice(1) : hex, 16);
  const light = 0.86 + Math.floor(random() * 5) * 0.07;  // 0.86 .. 1.14
  const warm = (Math.floor(random() * 3) - 1) * 0.06;    // -0.06, 0, +0.06
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((value >> 16) & 0xff) * (light + warm));
  const g = clamp(((value >> 8) & 0xff) * light);
  const b = clamp((value & 0xff) * (light - warm));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Split instances into two GLB pools by a POSITION-stable parity bit so a
 *  given tree always renders as the same model (never morphs as you move). */
export function splitByParity(insts: FoliageInstance[]): {
  evenMatrices: THREE.Matrix4[]; oddMatrices: THREE.Matrix4[]; evenColors: THREE.Color[]; oddColors: THREE.Color[];
} {
  const evenMatrices: THREE.Matrix4[] = [];
  const oddMatrices: THREE.Matrix4[] = [];
  const evenColors: THREE.Color[] = [];
  const oddColors: THREE.Color[] = [];
  for (const inst of insts) {
    const m = instanceMatrix(inst);
    const c = instanceColor(inst);
    if (hashPositionToBit(inst.x, inst.z) === 0) { evenMatrices.push(m); evenColors.push(c); }
    else { oddMatrices.push(m); oddColors.push(c); }
  }
  return { evenMatrices, oddMatrices, evenColors, oddColors };
}

export function hashPositionToBit(x: number, z: number): 0 | 1 {
  const ix = Math.round(x * 13);
  const iz = Math.round(z * 13);
  let h = Math.imul(ix, 374_761_393) ^ Math.imul(iz, 668_265_263);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h >>> 16) & 1) as 0 | 1;
}

export function instanceMatrix(instance: FoliageInstance): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(instance.x, instance.y, instance.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, instance.rotation, 0)),
    new THREE.Vector3(instance.scale, instance.scale, instance.scale),
  );
}

const FOLIAGE_COLOR_CACHE = new Map<string, THREE.Color>();
export function instanceColor(instance: FoliageInstance): THREE.Color {
  let cached = FOLIAGE_COLOR_CACHE.get(instance.color);
  if (!cached) {
    cached = new THREE.Color(instance.color);
    FOLIAGE_COLOR_CACHE.set(instance.color, cached);
  }
  return cached;
}

export function getConiferShare(biome: TerrainBiome): number {
  switch (biome) {
    case 'forest': case 'highland': case 'tundra': return 0.78;
    case 'wetland': case 'ethereal': return 0.34;
    case 'celestial': case 'temporal': return 0.4;
    case 'meadow': case 'ruins': return 0.18;
    case 'volcanic': case 'abyssal': return 0;
  }
}

const coniferColorCache = new Map<string, string>();
function darkenForConifer(hex: string): string {
  const cached = coniferColorCache.get(hex);
  if (cached !== undefined) return cached;
  const value = parseInt(hex.startsWith('#') ? hex.slice(1) : hex, 16);
  const r = Math.max(0, ((value >> 16) & 0xff) - 56);
  const g = Math.max(0, ((value >> 8) & 0xff) - 28);
  const b = Math.max(0, (value & 0xff) - 56);
  const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  coniferColorCache.set(hex, result);
  return result;
}

/** Position-seeded PRNG; same cell → same sequence forever. */
export function seededRandom(cellX: number, cellZ: number): () => number {
  let seed = Math.imul(cellX, 374_761_393) ^ Math.imul(cellZ, 668_265_263);
  seed = (seed ^ (seed >>> 13)) >>> 0;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2_246_822_519) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3_266_489_917) >>> 0;
    return ((seed ^= seed >>> 16) >>> 0) / 4_294_967_295;
  };
}
