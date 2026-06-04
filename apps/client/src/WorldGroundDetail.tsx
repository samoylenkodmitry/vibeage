import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import type { Vec3D } from '../../../packages/protocol/messages';
import type { WorldArtQuality } from './world-art/quality';
import { seededRandom } from './world-art/foliageScatter';

/**
 * Near-field ground detail — the splashes of life the bare ground needs, where
 * the (downward-tilted) camera actually looks. Scatters tiny wildflower dots and
 * the odd red-cap mushroom on grassy terrain within a small radius of the player.
 *
 * Position-stable: every prop is seeded by its absolute world cell, so walking
 * away and back shows the identical scatter (no jumping). Rendered as a single
 * re-centring window rebuilt only when the player crosses a coarse step — cheap
 * because props are sparse — with one InstancedMesh per flower colour + the
 * mushroom cap/stem, so the whole layer is ~6 draw calls regardless of count.
 * Discrete props (not a carpet), so the window edge doesn't read as a ring.
 */
const STEP = 16;             // re-centre granularity (m)
const CELL = 4;              // candidate slot spacing (m)
const FLOWER_COLORS = ['#f7a4c9', '#fff37a', '#fbfbf0', '#c9a4f7'];
const CAP_COLOR = '#c93d2a';
const STEM_COLOR = '#efe3c4';

type Prop = { x: number; y: number; z: number; scale: number; rot: number };

const MAX_RADIUS_CELLS = 16;
// Upper bound on props in one layer = cells in the largest (high) circular window.
// Fixed so each InstancedMesh allocates its buffer ONCE; we only vary `count`.
const MAX_COUNT = (() => {
  let n = 0;
  for (let dz = -MAX_RADIUS_CELLS; dz <= MAX_RADIUS_CELLS; dz += 1) {
    for (let dx = -MAX_RADIUS_CELLS; dx <= MAX_RADIUS_CELLS; dx += 1) {
      if (dx * dx + dz * dz <= MAX_RADIUS_CELLS * MAX_RADIUS_CELLS) n += 1;
    }
  }
  return n;
})();

function radiusCells(quality: WorldArtQuality): number {
  return quality === 'high' ? MAX_RADIUS_CELLS : 11; // ~64 m / ~44 m
}

function scatter(centerX: number, centerZ: number, cells: number) {
  const flowers: Prop[][] = FLOWER_COLORS.map(() => []);
  const mushrooms: Prop[] = [];
  const fx0 = Math.round(centerX / CELL);
  const fz0 = Math.round(centerZ / CELL);
  for (let dz = -cells; dz <= cells; dz += 1) {
    for (let dx = -cells; dx <= cells; dx += 1) {
      if (dx * dx + dz * dz > cells * cells) continue; // circular window
      const cellX = fx0 + dx, cellZ = fz0 + dz;
      const random = seededRandom(cellX, cellZ);
      const x = (cellX + random()) * CELL;
      const z = (cellZ + random()) * CELL;
      const sample = sampleTerrain(x, z);
      if (sample.grassDensity < 0.25) continue; // flowers only on grass
      const roll = random();
      if (roll < 0.34 * sample.grassDensity) {
        const ci = Math.floor(random() * FLOWER_COLORS.length);
        flowers[ci].push({ x, y: sample.height + 0.12, z, scale: 0.7 + random() * 0.9, rot: 0 });
      } else if (roll < 0.34 * sample.grassDensity + 0.02) {
        mushrooms.push({ x, y: sample.height, z, scale: 0.7 + random() * 0.7, rot: random() * Math.PI * 2 });
      }
    }
  }
  return { flowers, mushrooms };
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

/** One instanced prop layer. Matrices are (re)written only when `props` changes
 *  (i.e. when the window re-centres), not every frame, even though the parent
 *  re-renders each tick as the player moves. */
function PropLayer({ props, yScale = 1, children }: { props: Prop[]; yScale?: number; children: ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    props.forEach((p, i) => {
      tmpP.set(p.x, p.y, p.z);
      tmpE.set(0, p.rot, 0); tmpQ.setFromEuler(tmpE);
      tmpS.set(p.scale, p.scale * yScale, p.scale);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = props.length; // buffer is fixed at MAX_COUNT; only the draw count varies
    mesh.computeBoundingSphere();
  }, [props, yScale]);
  return (
    <instancedMesh ref={ref} frustumCulled={false} args={[undefined, undefined, MAX_COUNT]}>
      {children}
    </instancedMesh>
  );
}

export function WorldGroundDetail({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const cells = radiusCells(quality);
  const sx = Math.floor(focus.x / STEP);
  const sz = Math.floor(focus.z / STEP);
  const { flowers, mushrooms } = useMemo(
    () => scatter(sx * STEP, sz * STEP, cells),
    [sx, sz, cells],
  );
  const caps = useMemo(() => mushrooms.map((mu) => ({ ...mu, y: mu.y + 0.15 * mu.scale })), [mushrooms]);
  return (
    <group raycast={() => null}>
      {FLOWER_COLORS.map((color, i) => (
        <PropLayer key={color} props={flowers[i]} yScale={0.6}>
          <sphereGeometry args={[0.085, 6, 4]} />
          <meshStandardMaterial color={color} roughness={0.8} emissive={color} emissiveIntensity={0.12} />
        </PropLayer>
      ))}
      <PropLayer props={mushrooms} yScale={1}>
        <cylinderGeometry args={[0.03, 0.045, 0.16, 5]} />
        <meshStandardMaterial color={STEM_COLOR} roughness={0.9} />
      </PropLayer>
      <PropLayer props={caps} yScale={0.7}>
        <sphereGeometry args={[0.11, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={CAP_COLOR} roughness={0.7} />
      </PropLayer>
    </group>
  );
}
