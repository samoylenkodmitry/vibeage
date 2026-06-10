import { Suspense, memo, useMemo } from 'react';
import type { Vec3D } from '../../../packages/protocol/messages';
import { InstancedGltf } from './world-art/InstancedGltf';
import type { WorldArtQuality } from './world-art/quality';
import {
  scatterChunkFoliage, splitByParity, foliageChunkOf, visibleFoliageChunks, FOLIAGE_CHUNK_SIZE,
  BROADLEAF_GLB, CONIFER_GLB, TREE_GLB_ALT, ACCENT_GLB_SMALL, ACCENT_GLB_MEDIUM, BUSH_GLB, TREE_WIND, BUSH_WIND,
  instanceMatrix, instanceColor,
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
        <FoliageChunk key={`${chunk.x}:${chunk.z}`} originX={chunk.x} originZ={chunk.z} />
      ))}
    </group>
  );
}

const FoliageChunk = memo(function FoliageChunk({ originX, originZ }: { originX: number; originZ: number }) {
  const { trees, conifers, accents, bushes } = useMemo(
    () => scatterChunkFoliage(originX, originZ, CHUNK, false),
    [originX, originZ],
  );
  const t = useMemo(() => splitByParity(trees), [trees]);
  const co = useMemo(() => splitByParity(conifers), [conifers]);
  const ac = useMemo(() => splitByParity(accents), [accents]);
  // Bushes are one model — no parity split, just matrices + tints.
  const bu = useMemo(() => ({
    matrices: bushes.map(instanceMatrix),
    colors: bushes.map(instanceColor),
  }), [bushes]);
  return (
    <Suspense fallback={null}>
      {t.evenMatrices.length > 0 && <InstancedGltf src={BROADLEAF_GLB} matrices={t.evenMatrices} colors={t.evenColors} baseScale={1.4} wind={TREE_WIND} castShadow />}
      {t.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={t.oddMatrices} colors={t.oddColors} baseScale={1.4} wind={TREE_WIND} castShadow />}
      {co.evenMatrices.length > 0 && <InstancedGltf src={CONIFER_GLB} matrices={co.evenMatrices} colors={co.evenColors} baseScale={1.6} wind={TREE_WIND} castShadow />}
      {co.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={co.oddMatrices} colors={co.oddColors} baseScale={1.6} wind={TREE_WIND} castShadow />}
      {ac.evenMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_SMALL} matrices={ac.evenMatrices} colors={ac.evenColors} baseScale={0.8} />}
      {ac.oddMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_MEDIUM} matrices={ac.oddMatrices} colors={ac.oddColors} baseScale={0.6} />}
      {/* recenter: the tuft GLB bakes a ~63 m world offset into its vertices
          (FBX2glTF export) — without it every bush renders far from its
          matrix position and "flies" over slopes. */}
      {bu.matrices.length > 0 && <InstancedGltf src={BUSH_GLB} matrices={bu.matrices} colors={bu.colors} baseScale={1.0} wind={BUSH_WIND} recenter />}
    </Suspense>
  );
});
