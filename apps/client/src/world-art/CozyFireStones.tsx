import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Small ring of border stones around each bonfire — the
 * traditional "this is a campfire, not just kindling" cue. Cheap
 * one-InstancedMesh per scene; placements derived from each
 * bonfire anchor with deterministic jitter.
 */
const STONES_PER_RING = 9;
const RING_RADIUS = 1.45;
const STONE_COLOR = '#5e564f';

export function CozyFireStones({ scene }: { scene: WorldArtScene }) {
  const placements = useMemo(() => makeStones(scene), [scene]);
  if (placements.length === 0) return null;
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      pos.set(p.x, 0.1, p.z);
      quat.setFromEuler(new THREE.Euler(0, p.rotY, 0));
      scl.set(p.scale, p.scale * 0.7, p.scale);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = placements.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, placements.length]} castShadow={false} receiveShadow={false} raycast={() => null}>
      <dodecahedronGeometry args={[0.28, 0]} />
      <meshStandardMaterial color={STONE_COLOR} roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

type Placement = { x: number; z: number; scale: number; rotY: number };

function makeStones(scene: WorldArtScene): Placement[] {
  const bonfires = (scene.props ?? []).filter((p) => p.id === 'bonfire');
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 8237));
  const out: Placement[] = [];
  for (const bf of bonfires) {
    const cx = scene.origin.x + bf.position.x;
    const cz = scene.origin.z + bf.position.z;
    for (let i = 0; i < STONES_PER_RING; i += 1) {
      const angle = (i / STONES_PER_RING) * Math.PI * 2 + (rand() - 0.5) * 0.18;
      const r = RING_RADIUS + (rand() - 0.5) * 0.18;
      out.push({
        x: cx + Math.cos(angle) * r,
        z: cz + Math.sin(angle) * r,
        scale: 0.9 + rand() * 0.5,
        rotY: rand() * Math.PI * 2,
      });
    }
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
