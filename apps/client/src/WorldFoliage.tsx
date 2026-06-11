import { Suspense, memo, useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { scheduleChunkBuild } from './world-art/chunkBuildQueue';
import type { Vec3D } from '../../../packages/protocol/messages';
import { InstancedGltf } from './world-art/InstancedGltf';
import type { WorldArtQuality } from './world-art/quality';
import {
  scatterChunkFoliage, splitByParity, foliageChunkOf, visibleFoliageChunks, FOLIAGE_CHUNK_SIZE,
  BROADLEAF_GLB, CONIFER_GLB, TREE_GLB_ALT, ACCENT_GLB_SMALL, ACCENT_GLB_MEDIUM, BUSH_GLB, TREE_WIND, BUSH_WIND,
  instanceMatrix, instanceColor, type FoliageInstance,
} from './world-art/foliageScatter';

/**
 * Position-stable foliage (trees, conifers, rocks), streamed on its OWN chunk
 * grid (foliageScatter, larger than the terrain chunk so the same draw budget
 * reaches the fog band). Each chunk's contents are a pure function of its origin,
 * built once + memoised + React-keyed by origin — so stable chunks never
 * re-render and only frontier chunks mount/unmount as the player moves. The
 * frontier sits deep in scene fog (WorldEnvironment), so those mounts/unmounts
 * are invisible.
 *
 * Ground grass is NOT here — the textured ground covers it. This layer's
 * `grassOn=false` so the scatter skips the old sparse tree-grid grass entirely.
 */
const CHUNK = FOLIAGE_CHUNK_SIZE;

const EMPTY_SPLIT = { evenMatrices: [], oddMatrices: [], evenColors: [], oddColors: [] } as ReturnType<typeof splitByParity>;
const EMPTY_POOL = { matrices: [], colors: [] } as { matrices: THREE.Matrix4[]; colors: THREE.Color[] };

function foliageRadius(quality: WorldArtQuality): number {
  // Frontier MUST land in the fog band, else crossing a chunk line pops a
  // whole row of trees in plain view. Retina Macs report quality 'medium'
  // (devicePixelRatio > 1.5), so medium gets the same far frontier as high
  // (3 × 320 = 960 m, fogged). Low still reaches 640 m (2 × 320) — partly
  // fogged — rather than the old 1-ring 256 m that toggled in your face.
  return quality === 'low' ? 2 : 3;
}

export function WorldFoliage({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const c = foliageChunkOf(focus.x, focus.z);
  const radius = foliageRadius(quality);
  const chunks = useMemo(() => visibleFoliageChunks(c.cx, c.cz, radius), [c.cx, c.cz, radius]);
  return (
    <group>
      {chunks.map((chunk) => (
        <FoliageChunk key={`${chunk.x}:${chunk.z}`} originX={chunk.x} originZ={chunk.z} lean={quality === 'low'} />
      ))}
    </group>
  );
}

const EMPTY_CHUNK = { trees: [], conifers: [], grass: [], accents: [], bushes: [], flowers: [], reeds: [] } as ReturnType<typeof scatterChunkFoliage>;

// Procedural geometry for the tiny scatter layers — no GLB payload at all.
// Flower head: a squashed pastel bead the shader grass nestles around.
const FLOWER_GEOMETRY = new THREE.SphereGeometry(0.085, 6, 4);
FLOWER_GEOMETRY.scale(1, 0.55, 1);
// Reed: a thin tall 4-sided blade, origin at its base so y = ground height.
const REED_GEOMETRY = new THREE.ConeGeometry(0.05, 1.7, 4);
REED_GEOMETRY.translate(0, 0.85, 0);

/**
 * One instanced draw for a chunk's worth of small scatter (flowers/reeds).
 * `raw` keeps the authored colors (pastel flower heads must NOT go through
 * the luminance normalization the vegetation tints use).
 */
const InstancedScatter = memo(function InstancedScatter({ instances, geometry, raw }: {
  instances: FoliageInstance[];
  geometry: THREE.BufferGeometry;
  raw?: boolean;
}) {
  const setRef = useCallback((mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const rawColor = new THREE.Color();
    for (let i = 0; i < instances.length; i += 1) {
      mesh.setMatrixAt(i, instanceMatrix(instances[i]));
      mesh.setColorAt(i, raw ? rawColor.set(instances[i].color) : instanceColor(instances[i]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = instances.length;
  }, [instances, raw]);
  return (
    <instancedMesh ref={setRef} args={[geometry, undefined, instances.length]} frustumCulled={false} raycast={() => null}>
      <meshStandardMaterial roughness={0.92} metalness={0} />
    </instancedMesh>
  );
});

const FoliageChunk = memo(function FoliageChunk({ originX, originZ, lean }: { originX: number; originZ: number; lean: boolean }) {
  // Scattered through the shared queue — see chunkBuildQueue: a teleport
  // mounts every visible chunk at once and the synchronous scatter froze
  // the main thread.
  const [scattered, setScattered] = useState<ReturnType<typeof scatterChunkFoliage> | null>(null);
  useEffect(() => {
    const cancel = scheduleChunkBuild(() => setScattered(scatterChunkFoliage(originX, originZ, CHUNK, false)));
    return cancel;
  }, [originX, originZ]);
  const { trees, conifers, accents, bushes, flowers, reeds } = scattered ?? EMPTY_CHUNK;
  const t = useMemo(() => splitByParity(trees), [trees]);
  const co = useMemo(() => splitByParity(conifers), [conifers]);
  // lean (phones) never renders rocks/bushes — skip building their
  // matrices/colors too, not just the draws (saves per-chunk allocations).
  const ac = useMemo(() => (lean ? EMPTY_SPLIT : splitByParity(accents)), [accents, lean]);
  // Bushes are one model — no parity split, just matrices + tints.
  const bu = useMemo(() => (lean ? EMPTY_POOL : {
    matrices: bushes.map(instanceMatrix),
    colors: bushes.map(instanceColor),
  }), [bushes, lean]);
  return (
    <Suspense fallback={null}>
      {t.evenMatrices.length > 0 && <InstancedGltf src={BROADLEAF_GLB} matrices={t.evenMatrices} colors={t.evenColors} baseScale={1.4} wind={TREE_WIND} castShadow />}
      {t.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={t.oddMatrices} colors={t.oddColors} baseScale={1.4} wind={TREE_WIND} castShadow />}
      {co.evenMatrices.length > 0 && <InstancedGltf src={CONIFER_GLB} matrices={co.evenMatrices} colors={co.evenColors} baseScale={1.6} wind={TREE_WIND} castShadow />}
      {co.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={co.oddMatrices} colors={co.oddColors} baseScale={1.6} wind={TREE_WIND} castShadow />}
      {/* lean (phones): trees only — rocks + bushes cost ~5 extra instanced
          draws per chunk, which adds up across 25 chunks on mobile GPUs. */}
      {!lean && ac.evenMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_SMALL} matrices={ac.evenMatrices} colors={ac.evenColors} baseScale={0.8} />}
      {!lean && ac.oddMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_MEDIUM} matrices={ac.oddMatrices} colors={ac.oddColors} baseScale={0.6} />}
      {/* recenter: the tuft GLB bakes a ~63 m world offset into its vertices
          (FBX2glTF export) — without it every bush renders far from its
          matrix position and "flies" over slopes. */}
      {!lean && bu.matrices.length > 0 && <InstancedGltf src={BUSH_GLB} matrices={bu.matrices} colors={bu.colors} baseScale={1.0} wind={BUSH_WIND} recenter />}
      {/* small scatter: wildflower drifts + water-edge reeds, one draw each */}
      {!lean && flowers.length > 0 && <InstancedScatter instances={flowers} geometry={FLOWER_GEOMETRY} raw />}
      {!lean && reeds.length > 0 && <InstancedScatter instances={reeds} geometry={REED_GEOMETRY} />}
    </Suspense>
  );
});
