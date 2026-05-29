import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Brown pinecone clusters scattered on the cozy forest floor.
 * Cheap procedural cones (small + slightly elongated) in one
 * InstancedMesh. Deterministic per-scene seed.
 */
const COUNT = 50;
const CONE_COLOR = '#5b3a1d';

type Placement = { x: number; z: number; scale: number; rotY: number; tilt: number };

export function CozyPineCones({ scene }: { scene: WorldArtScene }) {
  const placements = useMemo<Placement[]>(() => makeCones(scene), [scene]);
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      pos.set(p.x, 0.08 * p.scale, p.z);
      quat.setFromEuler(new THREE.Euler(p.tilt, p.rotY, 0));
      scl.set(p.scale, p.scale, p.scale);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = placements.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, placements.length]} castShadow={false} receiveShadow={false} raycast={() => null}>
      <coneGeometry args={[0.07, 0.2, 6, 1]} />
      <meshStandardMaterial color={CONE_COLOR} roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

function makeCones(scene: WorldArtScene): Placement[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 4567));
  const out: Placement[] = [];
  // Forest floor — inland of the sand band.
  for (let i = 0; i < COUNT; i += 1) {
    out.push({
      x: scene.origin.x + 70 + rand() * 250,
      z: scene.origin.z - 280 + rand() * 560,
      scale: 0.8 + rand() * 0.8,
      rotY: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.3,
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
