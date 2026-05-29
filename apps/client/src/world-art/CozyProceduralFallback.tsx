import { useMemo } from 'react';
import * as THREE from 'three';
import { CozyStarterPines } from './CozyStarterPines';
import { getAssetsByKind } from './assetRegistry';
import {
  makeCozyGrassScatter,
  makeCozyRockScatter,
  type PineTransform,
} from './cozyScatter';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Procedural-only foliage layer for when the GLB pipeline either
 * hasn't loaded yet (Suspense fallback) or threw at runtime
 * (AssetErrorBoundary fallback). Paints all three kinds so the
 * scene composition reads as designed even when the real assets
 * are missing — pines on the inland band, rocks along the
 * waterline, grass tufts in between.
 *
 * Colors come from each kind's `fallback` recipe in
 * `assetRegistry.ts`, which means a designer can tweak the
 * fallback palette without touching this file.
 */
const ROCK_FALLBACK_COLOR = getRockFallbackColor();
const GRASS_FALLBACK_COLOR = getGrassFallbackColor();

function getRockFallbackColor(): string {
  const recipe = getAssetsByKind('rock')[0]?.fallback;
  return recipe?.kind === 'rock' ? recipe.color : '#7a7872';
}
function getGrassFallbackColor(): string {
  const recipe = getAssetsByKind('grass')[0]?.fallback;
  return recipe?.kind === 'grass' ? recipe.color : '#618a4a';
}

export function CozyProceduralFallback({
  scene, quality,
}: {
  scene: WorldArtScene;
  quality: WorldArtQuality;
}) {
  return (
    <>
      <CozyStarterPines scene={scene} quality={quality} />
      <ProceduralRocks scene={scene} quality={quality} />
      <ProceduralGrass scene={scene} quality={quality} />
    </>
  );
}

function ProceduralRocks({ scene, quality }: { scene: WorldArtScene; quality: WorldArtQuality }) {
  const rocks = useMemo(() => makeCozyRockScatter(scene, quality), [scene, quality]);
  const matrices = useMemo(() => rocks.map((r) => rockMatrix(r)), [rocks]);
  return <Instanced matrices={matrices} color={ROCK_FALLBACK_COLOR} geometry="rock" />;
}

function ProceduralGrass({ scene, quality }: { scene: WorldArtScene; quality: WorldArtQuality }) {
  const grass = useMemo(() => makeCozyGrassScatter(scene, quality), [scene, quality]);
  const matrices = useMemo(() => grass.map((g) => grassMatrix(g)), [grass]);
  return <Instanced matrices={matrices} color={GRASS_FALLBACK_COLOR} geometry="grass" />;
}

function rockMatrix(r: PineTransform): THREE.Matrix4 {
  const scale = 0.7 + r.scaleVariance * 0.9;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(r.x, scale * 0.4, r.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rotationY, 0)),
    new THREE.Vector3(scale * 1.1, scale * 0.7, scale * 1.0),
  );
}

function grassMatrix(g: PineTransform): THREE.Matrix4 {
  const scale = 0.4 + g.scaleVariance * 0.5;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(g.x, scale * 0.3, g.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rotationY, 0)),
    new THREE.Vector3(scale, scale * 1.2, scale),
  );
}

function Instanced({
  matrices, color, geometry,
}: {
  matrices: readonly THREE.Matrix4[];
  color: string;
  geometry: 'rock' | 'grass';
}) {
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    for (let i = 0; i < matrices.length; i += 1) m.setMatrixAt(i, matrices[i]);
    m.instanceMatrix.needsUpdate = true;
    m.count = matrices.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, matrices.length]} castShadow={false} receiveShadow={false}>
      {geometry === 'rock'
        ? <dodecahedronGeometry args={[1, 0]} />
        : <coneGeometry args={[0.35, 0.6, 5]} />}
      <meshStandardMaterial color={color} roughness={1} metalness={0} />
    </instancedMesh>
  );
}
