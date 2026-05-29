import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Tiny wildflower dots scattered across the cozy inland grass —
 * the splashes of color the grass-textured ground needs to read
 * as alive. Mixed pinks + yellows + whites; three small
 * InstancedMesh layers (one per color) so the total stays at
 * three draw calls regardless of count.
 */
const COUNT_PER_COLOR = 60;
const COLORS = ['#f7a4c9', '#fff37a', '#fff3f3'];

type Placement = { x: number; z: number; scale: number };

export function CozyWildflowers({ scene }: { scene: WorldArtScene }) {
  const placements = useMemo<Placement[][]>(() => {
    return COLORS.map((_, i) => makePlacements(scene, i));
  }, [scene]);
  return (
    <group raycast={() => null}>
      {COLORS.map((color, i) => (
        <Patch key={`${scene.id}-flower-${i}`} placements={placements[i]} color={color} />
      ))}
    </group>
  );
}

function Patch({ placements, color }: { placements: Placement[]; color: string }) {
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      pos.set(p.x, 0.12, p.z);
      quat.identity();
      scl.set(p.scale, p.scale * 0.55, p.scale);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = placements.length;
  };
  return (
    <instancedMesh frustumCulled={false} ref={setRef} args={[undefined, undefined, placements.length]} castShadow={false} receiveShadow={false}>
      <sphereGeometry args={[0.07, 6, 4]} />
      <meshBasicMaterial color={color} fog={false} />
    </instancedMesh>
  );
}

function makePlacements(scene: WorldArtScene, salt: number): Placement[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 9013 + salt * 311));
  const out: Placement[] = [];
  // Inland grass band: positive X from origin, modest Z range.
  for (let i = 0; i < COUNT_PER_COLOR; i += 1) {
    out.push({
      x: scene.origin.x + 25 + rand() * 170,
      z: scene.origin.z - 240 + rand() * 480,
      scale: 0.7 + rand() * 0.9,
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
