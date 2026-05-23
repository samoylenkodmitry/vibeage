import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';

/**
 * Loads the cozy-coast sand + grass PBR textures (ambientCG CC0)
 * and returns them ready to use as `map` / `normalMap` on a
 * Three.js material.
 *
 * - Color maps are flagged `SRGBColorSpace` so the renderer
 *   doesn't apply gamma twice; normal maps stay linear.
 * - Both maps wrap so a single 1K texture tiles across the
 *   whole terrain chunk. Caller picks the repeat count by world
 *   tile size — see `TERRAIN_TEXTURE_TILES_PER_CHUNK`.
 */
export type TerrainTextures = {
  sandColor: Texture;
  sandNormal: Texture;
  grassColor: Texture;
  grassNormal: Texture;
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

export const TERRAIN_TEXTURE_PATHS = [SAND_COLOR, SAND_NORMAL, GRASS_COLOR, GRASS_NORMAL] as const;

export function useTerrainTextures(): TerrainTextures {
  const [sandColor, sandNormal, grassColor, grassNormal] = useLoader(TextureLoader, TERRAIN_TEXTURE_PATHS as unknown as string[]);
  return useMemo(() => {
    sandColor.colorSpace = SRGBColorSpace;
    grassColor.colorSpace = SRGBColorSpace;
    for (const t of [sandColor, sandNormal, grassColor, grassNormal]) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(TERRAIN_TEXTURE_TILES_PER_CHUNK, TERRAIN_TEXTURE_TILES_PER_CHUNK);
      t.anisotropy = 8;
    }
    return { sandColor, sandNormal, grassColor, grassNormal };
  }, [sandColor, sandNormal, grassColor, grassNormal]);
}
