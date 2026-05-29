import { Suspense, memo, useMemo } from 'react';
import { useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { InstancedGltf } from './world-art/InstancedGltf';
import { getTerrainChunk, getVisibleTerrainChunks } from './WorldGround';
import type { WorldArtQuality } from './world-art/quality';
import {
  scatterChunkFoliage, splitByParity,
  BROADLEAF_GLB, CONIFER_GLB, TREE_GLB_ALT, ACCENT_GLB_SMALL, ACCENT_GLB_MEDIUM, TREE_WIND,
  type FoliageInstance,
} from './world-art/foliageScatter';

/**
 * Position-stable foliage, streamed on the SAME chunk grid as the terrain
 * (WorldGround). Each chunk's trees/rocks/grass are a pure function of its
 * origin (see foliageScatter), built once + memoised + React-keyed by
 * origin — so stable chunks never re-render and only frontier chunks
 * mount/unmount as the player moves. This replaces the old FoliageField,
 * whose quantised jumping window + distance falloff re-shuffled the whole
 * view whenever the player crossed a cell line.
 */
const CHUNK = WORLD_SETTINGS.terrainChunkSize;

function foliageRadius(quality: WorldArtQuality): number {
  return quality === 'high' ? 3 : quality === 'medium' ? 2 : 1;
}

export function WorldFoliage({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const c = getTerrainChunk(focus.x, focus.z);
  const radius = foliageRadius(quality);
  const chunks = useMemo(() => getVisibleTerrainChunks(c.x, c.z, radius), [c.x, c.z, radius]);
  const grassOn = quality !== 'low';
  return (
    <group>
      {chunks.map((chunk) => (
        <FoliageChunk key={`${chunk.x}:${chunk.z}`} originX={chunk.x} originZ={chunk.z} grassOn={grassOn} />
      ))}
    </group>
  );
}

const FoliageChunk = memo(function FoliageChunk({ originX, originZ, grassOn }: { originX: number; originZ: number; grassOn: boolean }) {
  const { trees, conifers, accents, grass } = useMemo(
    () => scatterChunkFoliage(originX, originZ, CHUNK, grassOn),
    [originX, originZ, grassOn],
  );
  const t = useMemo(() => splitByParity(trees), [trees]);
  const co = useMemo(() => splitByParity(conifers), [conifers]);
  const ac = useMemo(() => splitByParity(accents), [accents]);
  return (
    <>
      <Suspense fallback={null}>
        <InstancedGltf src={BROADLEAF_GLB} matrices={t.evenMatrices} colors={t.evenColors} baseScale={1.4} wind={TREE_WIND} />
        <InstancedGltf src={TREE_GLB_ALT} matrices={t.oddMatrices} colors={t.oddColors} baseScale={1.4} wind={TREE_WIND} />
        <InstancedGltf src={CONIFER_GLB} matrices={co.evenMatrices} colors={co.evenColors} baseScale={1.6} wind={TREE_WIND} />
        <InstancedGltf src={TREE_GLB_ALT} matrices={co.oddMatrices} colors={co.oddColors} baseScale={1.6} wind={TREE_WIND} />
        <InstancedGltf src={ACCENT_GLB_SMALL} matrices={ac.evenMatrices} colors={ac.evenColors} baseScale={0.8} />
        <InstancedGltf src={ACCENT_GLB_MEDIUM} matrices={ac.oddMatrices} colors={ac.oddColors} baseScale={0.6} />
      </Suspense>
      {grassOn && <GrassClumps instances={grass} />}
    </>
  );
});

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpRot = new THREE.Euler();
const tmpColor = new THREE.Color();

/** Cheap procedural grass cones for one chunk (one instanced draw). */
function GrassClumps({ instances }: { instances: FoliageInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((inst, i) => {
      tmpPos.set(inst.x, inst.y + 0.45 * inst.scale, inst.z);
      tmpRot.set(0, inst.rotation, 0);
      tmpQuat.setFromEuler(tmpRot);
      tmpScale.set(inst.scale, inst.scale, inst.scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, tmpColor.set(inst.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, instances.length)]} castShadow receiveShadow>
      <coneGeometry args={[0.22, 0.9, 6]} />
      <meshStandardMaterial roughness={0.88} vertexColors />
    </instancedMesh>
  );
}
