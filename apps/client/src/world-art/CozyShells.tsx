import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Tiny shells + pebbles scattered along the cozy sand band.
 * Cheap procedural meshes — half-spheres for shells (pink-cream),
 * tiny dodecahedrons for pebbles (slate). Deterministic seed so
 * the same scatter returns each session.
 *
 * Rendered as one InstancedMesh per shape so the count is cheap
 * — 40 shells + 40 pebbles = 2 draw calls.
 */
const SHELL_COUNT = 40;
const PEBBLE_COUNT = 40;
const SHELL_COLOR = '#f4d2c0';
const PEBBLE_COLOR = '#5a6168';

type Placement = { x: number; z: number; scale: number; rotY: number };

export function CozyShells({ scene }: { scene: WorldArtScene }) {
  const shells = useMemo(() => placeOnSand(scene, SHELL_COUNT, 6991), [scene]);
  const pebbles = useMemo(() => placeOnSand(scene, PEBBLE_COUNT, 7507), [scene]);
  return (
    <group raycast={() => null}>
      <Cluster placements={shells} color={SHELL_COLOR} kind="shell" />
      <Cluster placements={pebbles} color={PEBBLE_COLOR} kind="pebble" />
    </group>
  );
}

function Cluster({
  placements, color, kind,
}: {
  placements: Placement[];
  color: string;
  kind: 'shell' | 'pebble';
}) {
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      pos.set(p.x, kind === 'shell' ? 0.08 : 0.05, p.z);
      quat.setFromEuler(new THREE.Euler(0, p.rotY, kind === 'shell' ? -Math.PI / 2 : 0));
      scl.set(p.scale, p.scale * (kind === 'shell' ? 0.55 : 1), p.scale);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = placements.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, placements.length]} castShadow={false} receiveShadow={false}>
      {kind === 'shell'
        ? <sphereGeometry args={[0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        : <dodecahedronGeometry args={[0.09, 0]} />}
      <meshStandardMaterial color={color} roughness={kind === 'shell' ? 0.6 : 0.95} metalness={0} />
    </instancedMesh>
  );
}

function placeOnSand(scene: WorldArtScene, count: number, seed: number): Placement[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), seed));
  const out: Placement[] = [];
  const sandX = scene.waterline.x + scene.waterline.width / 2 + 18;
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: sandX + (rand() - 0.5) * 36,
      z: scene.waterline.z - scene.waterline.length / 2 + rand() * scene.waterline.length,
      scale: 0.7 + rand() * 0.9,
      rotY: rand() * Math.PI * 2,
    });
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
