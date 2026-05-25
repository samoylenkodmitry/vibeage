import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { ASSET_REGISTRY, getAssetsByKind, type WorldArtAsset } from './assetRegistry';
import { AssetErrorBoundary } from './AssetErrorBoundary';
import { InstancedGltf } from './InstancedGltf';
import { CozyProceduralFallback } from './CozyProceduralFallback';
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
 * with real stylized Quaternius (CC0) trees, rocks, and grass
 * tufts read from `assetRegistry.ts`.
 *
 * Loading + failure model:
 *   1. `useGLTF.preload` is fired at module init for every
 *      registered asset so the first frame already has the
 *      binary in flight.
 *   2. `Suspense` paints `CozyProceduralFallback` (pines + rocks
 *      + grass primitives) while GLBs stream in.
 *   3. `AssetErrorBoundary` paints the same procedural fallback
 *      if anything in the GLB pipeline throws (parse failure,
 *      asset 404, GPU upload error). Suspense alone doesn't
 *      catch render-time errors — boundary is required.
 *
 * Scatter:
 *   one scatter table per kind (`cozyScatter.ts`), seeded off
 *   the scene id so layout is stable across reloads. Each
 *   row picks an asset by `variant` and Drei `Clone`s the loaded
 *   GLB at that transform. `Clone` is acceptable for PR 2;
 *   draw-call budget hardening lives in PR 5.
 */
ASSET_REGISTRY.forEach((a) => useGLTF.preload(a.path));

const TREE_POOL = getAssetsByKind('tree');
const ROCK_POOL = getAssetsByKind('rock');
const GRASS_POOL = getAssetsByKind('grass');

type ForestProps = { scene: WorldArtScene; quality: WorldArtQuality };

export function CozyPineForest({ scene, quality }: ForestProps) {
  const fallback = <CozyProceduralFallback scene={scene} quality={quality} />;
  return (
    <AssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CozyGltfLayer scene={scene} quality={quality} pool={TREE_POOL} scatterFn={makeCozyTreeScatter} baseScale={1.6} />
        <CozyGltfLayer scene={scene} quality={quality} pool={ROCK_POOL} scatterFn={makeCozyRockScatter} baseScale={0.9} />
        <CozyGltfLayer scene={scene} quality={quality} pool={GRASS_POOL} scatterFn={makeCozyGrassScatter} baseScale={0.7} />
      </Suspense>
    </AssetErrorBoundary>
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
  // Group scatter rows into one InstancedGltf draw per pool asset. Per-instance
  // position / yaw / scale (layer baseScale × asset.baseScale × variance) bake
  // into the matrix. This renders the whole layer as a few InstancedMeshes
  // instead of a deep <Clone> per row — the old approach froze the main thread
  // for seconds when a scene mounted (~310 GLB scene-graph copies).
  const matricesByAsset = useMemo(() => {
    const groups: THREE.Matrix4[][] = pool.map(() => []);
    if (pool.length === 0) return groups;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scaleVec = new THREE.Vector3();
    for (const row of rows) {
      const idx = row.variant % pool.length;
      const asset = pool[idx];
      const s = baseScale * asset.baseScale * (0.85 + row.scaleVariance * 0.5);
      position.set(row.x, row.y + asset.yOffset, row.z);
      euler.set(0, row.rotationY, 0);
      quaternion.setFromEuler(euler);
      scaleVec.set(s, s, s);
      groups[idx].push(new THREE.Matrix4().compose(position, quaternion, scaleVec));
    }
    return groups;
  }, [rows, pool, baseScale]);

  return (
    <>
      {pool.map((asset, i) => (
        <InstancedGltf key={asset.path} src={asset.path} matrices={matricesByAsset[i]} />
      ))}
    </>
  );
}
