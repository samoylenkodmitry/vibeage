import {
  LAKE_WATER_Y,
  LUSH_VALE_WATER_Y,
  VALE_TARN_WATER_Y,
  computeNearbyLakes,
  getTerrainBiome,
  getTerrainHeight,
  glacialValeMask,
  lushValeMask,
  type TerrainBiome,
} from '../../../../packages/content/terrain';
import type { SampleLayer } from './samples';
import { HIT_SAMPLES, LOW_SWELL_SAMPLES, SOFT_CLOTH_SAMPLES, WET_SAMPLES } from './sampleMap';

/**
 * What the world sounds like *underfoot* and *around you*, derived from the same
 * terrain functions the ground mesh is built from — so the audio can never drift
 * from what you're looking at. Everything here is pure (no Web Audio), which is
 * what makes "the meadow and the canyon don't sound identical" testable.
 *
 * No new audio files: each surface is one of the already-shipped CC0 clips
 * pitched and levelled into character (cloth rustle → grass / leaf litter /
 * snow / sand, a light generic tap → stone, a wet slap → bog / wading).
 */

export type Surface = 'grass' | 'undergrowth' | 'stone' | 'snow' | 'sand' | 'bog' | 'water';

/** Every surface — used by the wiki Sounds library so footsteps can't ship unlisted. */
export const SURFACES: readonly Surface[] = ['grass', 'undergrowth', 'stone', 'snow', 'sand', 'bog', 'water'];

const BIOME_SURFACE: Record<TerrainBiome, Surface> = {
  meadow: 'grass',
  forest: 'undergrowth',
  highland: 'stone',
  wetland: 'bog',
  ruins: 'stone',
  volcanic: 'sand', // ash grit, not rock
  tundra: 'snow',
  ethereal: 'grass',
  abyssal: 'stone',
  celestial: 'stone',
  temporal: 'stone',
};

/**
 * Lakes sit on a wide analytic lattice (~4.8k units apart), so the nearest-centre
 * search is one or two cells — but it runs on every footstep, so memoise it on a
 * coarse grid. One slot is enough: a walking player stays in a cell for seconds.
 */
const LAKE_SHORE_RADIUS = 150;
const LAKE_CELL = 64;
let lakeCellKey = '';
let lakeCellDist = Infinity;

function nearestLakeDistance(x: number, z: number): number {
  const key = `${Math.round(x / LAKE_CELL)}:${Math.round(z / LAKE_CELL)}`;
  if (key !== lakeCellKey) {
    lakeCellKey = key;
    lakeCellDist = Infinity;
    for (const lake of computeNearbyLakes(x, z, LAKE_SHORE_RADIUS * 2)) {
      lakeCellDist = Math.min(lakeCellDist, Math.hypot(lake.x - x, lake.z - z));
    }
  }
  return lakeCellDist;
}

/** The water plane covering this spot, or null where no water body reaches it. */
export function waterLevelAt(x: number, z: number): number | null {
  if (glacialValeMask(x, z) > 0.05) return VALE_TARN_WATER_Y;
  if (lushValeMask(x, z) > 0.05) return LUSH_VALE_WATER_Y;
  // Only inside the lake lattice — canyon floors drop far below LAKE_WATER_Y
  // without being wet, and reading those as water would splash in a dry gorge.
  if (nearestLakeDistance(x, z) < LAKE_SHORE_RADIUS) return LAKE_WATER_Y;
  return null;
}

const WADE_DEPTH = 0.35; // ankle-deep before a step turns into a splash
const BEACH_MARGIN = 1.6; // metres of shoreline that read as wet sand/gravel

export function surfaceAt(x: number, z: number): Surface {
  const water = waterLevelAt(x, z);
  if (water !== null) {
    const height = getTerrainHeight(x, z);
    if (height < water - WADE_DEPTH) return 'water';
    if (height < water + BEACH_MARGIN) return 'sand';
  }
  return BIOME_SURFACE[getTerrainBiome(x, z)];
}

/**
 * Base footstep voice per surface. Kept deliberately quiet — feet are the sound
 * you hear most often in an MMO, so anything with presence turns into a
 * metronome within a minute.
 */
const SURFACE_STEP: Record<Surface, { urls: readonly string[]; gain: number; rate: number }> = {
  grass: { urls: SOFT_CLOTH_SAMPLES, gain: 0.16, rate: 0.85 },
  undergrowth: { urls: SOFT_CLOTH_SAMPLES, gain: 0.19, rate: 0.7 }, // deeper leaf litter
  snow: { urls: SOFT_CLOTH_SAMPLES, gain: 0.14, rate: 1.28 }, // tight, squeaky compression
  sand: { urls: SOFT_CLOTH_SAMPLES, gain: 0.13, rate: 0.6 }, // dull, no ring at all
  stone: { urls: HIT_SAMPLES, gain: 0.1, rate: 0.78 },
  bog: { urls: WET_SAMPLES, gain: 0.11, rate: 1.3 },
  water: { urls: WET_SAMPLES, gain: 0.17, rate: 0.95 },
};

/**
 * One step. `variance` in [-1,1] detunes the clip (the caller alternates it per
 * foot) and `effort` in [0,1] leans on the gain, so a sprint lands harder than a
 * stroll without ever becoming a new sound.
 */
export function footstepLayers(surface: Surface, variance: number, effort = 0.5): SampleLayer[] {
  const step = SURFACE_STEP[surface];
  const v = Math.max(-1, Math.min(1, variance));
  return [{
    urls: step.urls,
    gain: step.gain * (0.78 + 0.44 * Math.max(0, Math.min(1, effort))),
    rate: step.rate * (1 + v * 0.07),
  }];
}

/** How a place sounds: the ambient bed's level + tone, and how windy it is. */
export type PlaceProfile = { level: number; lowpassHz: number; gust: number };

/**
 * Per-biome ambience. `level`/`lowpassHz` reshape the two shipped nature beds
 * rather than adding new loops: a forest canopy muffles and thickens them, bare
 * highland and canyon rock leaves them thin and distant, and the wind takes over.
 */
const BIOME_PLACE: Record<TerrainBiome, PlaceProfile> = {
  meadow: { level: 1, lowpassHz: 16_000, gust: 0.5 },
  forest: { level: 1.15, lowpassHz: 8_500, gust: 0.25 },
  highland: { level: 0.5, lowpassHz: 5_000, gust: 1 },
  wetland: { level: 0.95, lowpassHz: 11_000, gust: 0.35 },
  ruins: { level: 0.45, lowpassHz: 5_500, gust: 0.85 },
  volcanic: { level: 0.3, lowpassHz: 3_200, gust: 0.7 },
  tundra: { level: 0.28, lowpassHz: 4_000, gust: 1 },
  ethereal: { level: 0.5, lowpassHz: 7_000, gust: 0.55 },
  abyssal: { level: 0.22, lowpassHz: 2_400, gust: 0.45 },
  celestial: { level: 0.5, lowpassHz: 12_000, gust: 0.7 },
  temporal: { level: 0.4, lowpassHz: 6_000, gust: 0.6 },
};

/** 0 inland → 1 standing at the water's edge. Drives shore lapping + sea breeze. */
export function shorelineAt(x: number, z: number): number {
  const water = waterLevelAt(x, z);
  if (water === null) return 0;
  const above = getTerrainHeight(x, z) - water;
  if (above > 14) return 0; // up on the valley wall, well clear of the water
  return Math.max(0, Math.min(1, 1 - above / 14));
}

const EXPOSED_START = 12; // metres above sea level where cover starts thinning
const EXPOSED_FULL = 70;

/**
 * The live profile at a spot: the biome's character, with the wind rising on
 * exposed high ground and again out on open water — a ridge and a lakeshore are
 * the two places a breeze should actually be audible.
 */
export function placeProfileAt(x: number, z: number): PlaceProfile {
  const base = BIOME_PLACE[getTerrainBiome(x, z)];
  const height = getTerrainHeight(x, z);
  const exposure = Math.max(0, Math.min(1, (height - EXPOSED_START) / (EXPOSED_FULL - EXPOSED_START)));
  const shore = shorelineAt(x, z);
  return {
    level: base.level,
    lowpassHz: base.lowpassHz,
    gust: Math.min(1.6, base.gust * (1 + 0.6 * exposure + 0.45 * shore)),
  };
}

/** A distant air rush: the low swell pitched right down so it reads as wind, not engine. */
export function gustLayers(strength: number): SampleLayer[] {
  const s = Math.max(0, Math.min(1.6, strength));
  return [{ urls: LOW_SWELL_SAMPLES, gain: 0.05 + 0.055 * s, rate: 0.3 + 0.06 * s }];
}

/** Water lapping at a shoreline — the wet slap, slowed until it's a swell not a splat. */
export function lapLayers(shore: number): SampleLayer[] {
  const s = Math.max(0, Math.min(1, shore));
  return [{ urls: WET_SAMPLES, gain: 0.05 + 0.1 * s, rate: 0.42 }];
}
