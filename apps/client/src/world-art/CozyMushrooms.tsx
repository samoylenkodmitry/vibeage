import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Small red-cap mushroom clusters scattered in the inland half of
 * the cozy scene (away from the sand band). Cheap procedural —
 * a thin cylinder for the stem + a half-sphere cap. Two
 * InstancedMesh layers; deterministic per-scene scatter.
 */
const COUNT = 28;
const STEM_COLOR = '#f4e5c2';
const CAP_COLOR = '#c93d2a';

type Mushroom = { x: number; z: number; scale: number; rotY: number };

export function CozyMushrooms({ scene }: { scene: WorldArtScene }) {
  const mushrooms = useMemo<Mushroom[]>(() => makeMushrooms(scene), [scene]);
  return (
    <group raycast={() => null}>
      <Cluster mushrooms={mushrooms} kind="stem" />
      <Cluster mushrooms={mushrooms} kind="cap" />
    </group>
  );
}

function Cluster({ mushrooms, kind }: { mushrooms: Mushroom[]; kind: 'stem' | 'cap' }) {
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < mushrooms.length; i += 1) {
      const u = mushrooms[i];
      const y = kind === 'stem' ? 0.15 * u.scale : 0.32 * u.scale;
      pos.set(u.x, y, u.z);
      quat.setFromEuler(new THREE.Euler(0, u.rotY, 0));
      scl.set(u.scale, u.scale, u.scale);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = mushrooms.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, mushrooms.length]} castShadow={false} receiveShadow={false}>
      {kind === 'stem'
        ? <cylinderGeometry args={[0.05, 0.07, 0.3, 6]} />
        : <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />}
      <meshStandardMaterial color={kind === 'stem' ? STEM_COLOR : CAP_COLOR} roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}

function makeMushrooms(scene: WorldArtScene): Mushroom[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 4799));
  const out: Mushroom[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    // Inland half (positive X from scene origin); avoid the sand
    // band and water.
    const x = scene.origin.x + 30 + rand() * 160;
    const z = scene.origin.z - 220 + rand() * 440;
    out.push({
      x, z,
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
