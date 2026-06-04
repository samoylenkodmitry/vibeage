import { memo, useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import type { Vec3D } from '../../../packages/protocol/messages';
import type { WorldArtQuality } from './world-art/quality';
import { seededRandom } from './world-art/foliageScatter';
import { GRASS_GEOMETRY, GRASS_MATERIAL, GRASS_WIND } from './world-art/grassBlades';

/**
 * Dense near-field grass carpet. The old foliage grass rode the 32 m *tree*
 * scatter grid — one tuft per ~1000 m², so it read as lone slivers. This is a
 * separate system on a FINE grid (sub-metre slots) that only covers a small
 * radius around the player, where individual blades are actually visible.
 *
 * Streamed as its own chunk grid (mirrors WorldFoliage): each chunk's blades
 * are a pure function of its origin (seededRandom by absolute fine-cell), built
 * once + memoised + React-keyed by origin, so stable chunks never rebuild and
 * only the frontier ring re-tiles as you walk. Density follows terrain
 * `grassDensity` (boosted to a carpet where grass grows, sparse on rock/sand).
 * One instanced draw per chunk, all sharing the blade geometry + wind material.
 */
export const GRASS_CHUNK = 24; // metres per grass chunk
const CELLS = 30;                       // fine blade slots per chunk axis
const BLADE_CELL = GRASS_CHUNK / CELLS; // 0.8 m — divides the chunk EXACTLY, so the
                                        // fine grid tiles seamlessly across chunk
                                        // seams (a non-integer ratio leaves a ~1-cell
                                        // gap/overlap stripe at every boundary)
const DENSITY_BOOST = 0.85;   // grassDensity → fill probability; <1 leaves natural
                              // patchiness instead of a saturated flat sheet

type Blade = { x: number; y: number; z: number; scale: number; rot: number; r: number; g: number; b: number };

function fieldRadius(quality: WorldArtQuality): number {
  return quality === 'high' ? 2 : 1; // ~60 m / ~36 m; low mounts nothing
}

export function scatterGrass(originX: number, originZ: number): Blade[] {
  const out: Blade[] = [];
  const cell0X = Math.floor(originX / BLADE_CELL);
  const cell0Z = Math.floor(originZ / BLADE_CELL);
  const tint = new THREE.Color();
  for (let iz = 0; iz < CELLS; iz += 1) {
    for (let ix = 0; ix < CELLS; ix += 1) {
      const random = seededRandom(cell0X + ix, cell0Z + iz);
      const x = (cell0X + ix + random()) * BLADE_CELL;
      const z = (cell0Z + iz + random()) * BLADE_CELL;
      const sample = sampleTerrain(x, z);
      if (random() >= sample.grassDensity * DENSITY_BOOST) continue;
      // Per-blade brightness jitter so the carpet isn't a flat green sheet.
      tint.set(sample.foliageColor).multiplyScalar(0.82 + random() * 0.36);
      out.push({
        x, y: sample.height, z,
        scale: 0.3 + random() * 0.2, rot: random() * Math.PI * 2,
        r: tint.r, g: tint.g, b: tint.b,
      });
    }
  }
  return out;
}

export function WorldGrassField({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const radius = fieldRadius(quality);
  const cx = Math.floor(focus.x / GRASS_CHUNK);
  const cz = Math.floor(focus.z / GRASS_CHUNK);
  const chunks = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        out.push({ x: (cx + dx) * GRASS_CHUNK, z: (cz + dz) * GRASS_CHUNK });
      }
    }
    return out;
  }, [cx, cz, radius]);
  // One clock advances the shared tip sway for every chunk.
  useFrame((_, delta) => { GRASS_WIND.uTime.value += delta; });
  return (
    <group>
      {chunks.map((c) => <GrassChunk key={`${c.x}:${c.z}`} originX={c.x} originZ={c.z} />)}
    </group>
  );
}

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpRot = new THREE.Euler();
const tmpColor = new THREE.Color();

const GrassChunk = memo(function GrassChunk({ originX, originZ }: { originX: number; originZ: number }) {
  const blades = useMemo(() => scatterGrass(originX, originZ), [originX, originZ]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    blades.forEach((b, i) => {
      tmpPos.set(b.x, b.y, b.z);
      tmpRot.set(0, b.rot, 0);
      tmpQuat.setFromEuler(tmpRot);
      tmpScale.set(b.scale, b.scale * 1.2, b.scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, tmpColor.setRGB(b.r, b.g, b.b));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = blades.length;
    // Absolute world matrices on an origin-anchored mesh: recompute the sphere
    // over the real instances or the whole chunk frustum-culls when origin exits.
    mesh.computeBoundingSphere();
  }, [blades]);
  if (blades.length === 0) return null;
  return <instancedMesh ref={ref} args={[GRASS_GEOMETRY, GRASS_MATERIAL, blades.length]} receiveShadow />;
});
