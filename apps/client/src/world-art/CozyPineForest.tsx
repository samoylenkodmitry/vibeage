import { Suspense, useMemo } from 'react';
import { Clone, useGLTF } from '@react-three/drei';
import type { Group } from 'three';
import { ASSET_REGISTRY, getAssetsByKind, type WorldArtAsset } from './assetRegistry';
import { CozyStarterPines } from './CozyStarterPines';
import {
  makeCozyGrassScatter,
  makeCozyRockScatter,
  makeCozyTreeScatter,
  type PineTransform,
} from './cozyScatter';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * GLB-backed cozy foliage layer. Replaces PR 1's primitive pines
 * with real stylized Quaternius (CC0) pines, rocks, and grass
 * tufts read from `assetRegistry.ts`.
 *
 * Architecture:
 *   - one scatter table per kind (`cozyScatter.ts`), seeded off
 *     the scene id so layout is stable across reloads.
 *   - each scatter row picks an asset by `variant` and clones the
 *     loaded GLB at its transform. `Clone` keeps draw-calls
 *     reasonable for PR 2; PR 5 will measure and decide whether
 *     to merge them into instanced meshes.
 *   - `Suspense` falls back to the procedural `CozyStarterPines`
 *     while GLBs load (and stays as fallback if loading fails).
 *     The scene is never blank.
 */
ASSET_REGISTRY.forEach((a) => useGLTF.preload(a.path));

const TREE_POOL = getAssetsByKind('tree');
const ROCK_POOL = getAssetsByKind('rock');
const GRASS_POOL = getAssetsByKind('grass');

type ForestProps = { scene: WorldArtScene; quality: WorldArtQuality };

export function CozyPineForest({ scene, quality }: ForestProps) {
  return (
    <Suspense fallback={<CozyStarterPines scene={scene} quality={quality} />}>
      <CozyGltfLayer
        scene={scene}
        quality={quality}
        pool={TREE_POOL}
        scatterFn={makeCozyTreeScatter}
        baseScale={1.6}
      />
      <CozyGltfLayer
        scene={scene}
        quality={quality}
        pool={ROCK_POOL}
        scatterFn={makeCozyRockScatter}
        baseScale={0.9}
      />
      <CozyGltfLayer
        scene={scene}
        quality={quality}
        pool={GRASS_POOL}
        scatterFn={makeCozyGrassScatter}
        baseScale={0.7}
      />
    </Suspense>
  );
}

type LayerProps = {
  scene: WorldArtScene;
  quality: WorldArtQuality;
  pool: readonly WorldArtAsset[];
  scatterFn: (scene: WorldArtScene, q: WorldArtQuality) => PineTransform[];
  baseScale: number;
};

function CozyGltfLayer({ scene, quality, pool, scatterFn, baseScale }: LayerProps) {
  const rows = useMemo(() => scatterFn(scene, quality), [scene, quality, scatterFn]);
  // Load every pool entry up front. Pool sizes are module-level
  // constants (≤3 per kind), so the hook order is stable.
  const loaded = pool.map((asset) => ({ asset, scene: useGLTF(asset.path).scene as Group }));
  if (loaded.length === 0) return null;
  return (
    <group>
      {rows.map((row) => {
        const idx = row.variant % loaded.length;
        const { asset, scene: gltfScene } = loaded[idx];
        const scale = baseScale * asset.baseScale * (0.85 + row.scaleVariance * 0.5);
        return (
          <group key={row.id} position={[row.x, row.y + asset.yOffset, row.z]} rotation={[0, row.rotationY, 0]} scale={scale}>
            <Clone object={gltfScene} />
          </group>
        );
      })}
    </group>
  );
}
