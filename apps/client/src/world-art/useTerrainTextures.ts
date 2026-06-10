import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';

/**
 * Loads the terrain ground textures and returns them ready to use as
 * `map` / `normalMap` on a Three.js material.
 *
 * grass + sand are PBR pairs (ambientCG CC0). forest / rock / ash / snow are
 * the procedural painterly set from `scripts/generate-world-textures.mjs`
 * (colour-only — the painterly style doesn't want normal detail), giving each
 * biome family its own ground instead of one grass texture planet-wide.
 *
 * - Color maps are flagged `SRGBColorSpace` so the renderer
 *   doesn't apply gamma twice; normal maps stay linear.
 * - All maps wrap so a single texture tiles across the whole
 *   terrain chunk. Caller picks the repeat count by world tile
 *   size — see `TERRAIN_TEXTURE_TILES_PER_CHUNK`.
 */
export type TerrainTextures = {
  sandColor: Texture;
  sandNormal: Texture;
  grassColor: Texture;
  grassNormal: Texture;
  forestColor: Texture;
  rockColor: Texture;
  ashColor: Texture;
  snowColor: Texture;
};

/**
 * Repeat count for a 256m chunk. Originally 80 (≈3m per tile),
 * which aliased into a checkerboard pattern at MMO camera height.
 * 16 tiles ≈ 16m per tile reads as broad sandy patches without
 * the visible grid.
 */
export const TERRAIN_TEXTURE_TILES_PER_CHUNK = 16;

const SAND_COLOR = '/textures/sand_color.jpg';
const SAND_NORMAL = '/textures/sand_normal.jpg';
const GRASS_COLOR = '/textures/grass_color.jpg';
const GRASS_NORMAL = '/textures/grass_normal.jpg';
const FOREST_COLOR = '/textures/forest_floor_color.jpg';
const ROCK_COLOR = '/textures/rock_ground_color.jpg';
const ASH_COLOR = '/textures/ash_ground_color.jpg';
const SNOW_COLOR = '/textures/snow_ground_color.jpg';

export const TERRAIN_TEXTURE_PATHS = [
  SAND_COLOR, SAND_NORMAL, GRASS_COLOR, GRASS_NORMAL,
  FOREST_COLOR, ROCK_COLOR, ASH_COLOR, SNOW_COLOR,
] as const;

export function useTerrainTextures(): TerrainTextures {
  const [sandColor, sandNormal, grassColor, grassNormal, forestColor, rockColor, ashColor, snowColor] =
    useLoader(TextureLoader, TERRAIN_TEXTURE_PATHS as unknown as string[]);
  return useMemo(() => {
    const all = [sandColor, sandNormal, grassColor, grassNormal, forestColor, rockColor, ashColor, snowColor];
    for (const t of [sandColor, grassColor, forestColor, rockColor, ashColor, snowColor]) {
      t.colorSpace = SRGBColorSpace;
    }
    for (const t of all) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(TERRAIN_TEXTURE_TILES_PER_CHUNK, TERRAIN_TEXTURE_TILES_PER_CHUNK);
      t.anisotropy = 8;
    }
    return { sandColor, sandNormal, grassColor, grassNormal, forestColor, rockColor, ashColor, snowColor };
  }, [sandColor, sandNormal, grassColor, grassNormal, forestColor, rockColor, ashColor, snowColor]);
}
