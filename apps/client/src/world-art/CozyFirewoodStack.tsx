import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * A neat stack of split firewood next to each bonfire — the
 * "ready for tonight" cue. 6 short log cylinders laid in two
 * staggered rows of three. Cheap procedural; one InstancedMesh
 * per scene.
 */
const LOGS_PER_STACK = 6;
const LOG_LENGTH = 1.1;
const LOG_RADIUS = 0.12;
const LOG_COLOR = '#7c5635';
const STACK_OFFSET = { x: 2.4, z: 0 };

type Placement = { x: number; y: number; z: number; rotY: number };

export function CozyFirewoodStack({ scene }: { scene: WorldArtScene }) {
  const placements = useMemo<Placement[]>(() => makeStacks(scene), [scene]);
  if (placements.length === 0) return null;
  const setRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      pos.set(p.x, p.y, p.z);
      quat.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)).premultiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rotY, 0)),
      );
      scl.set(1, 1, 1);
      mat.compose(pos, quat, scl);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = placements.length;
  };
  return (
    <instancedMesh ref={setRef} args={[undefined, undefined, placements.length]} castShadow={false} receiveShadow={false} raycast={() => null}>
      <cylinderGeometry args={[LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 6]} />
      <meshStandardMaterial color={LOG_COLOR} roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

function makeStacks(scene: WorldArtScene): Placement[] {
  const bonfires = (scene.props ?? []).filter((p) => p.id === 'bonfire');
  const out: Placement[] = [];
  for (const bf of bonfires) {
    const cx = scene.origin.x + bf.position.x + STACK_OFFSET.x;
    const cz = scene.origin.z + bf.position.z + STACK_OFFSET.z;
    // Two rows of three logs, second row staggered up.
    for (let i = 0; i < LOGS_PER_STACK; i += 1) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      out.push({
        x: cx + (col - 1) * (LOG_RADIUS * 2.1),
        y: LOG_RADIUS + row * LOG_RADIUS * 1.8,
        z: cz + (row === 1 ? LOG_RADIUS * 0.4 : 0),
        rotY: 0,
      });
    }
  }
  return out;
}
