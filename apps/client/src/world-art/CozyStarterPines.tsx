import { useMemo } from 'react';
import * as THREE from 'three';
import { makeCozyTreeScatter, type PineTransform } from './cozyScatter';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Procedural pine silhouettes — the intentional starter slice for
 * PR 1. Each tree is a single InstancedMesh of dark-green cones
 * stacked on a darker trunk; the variants jitter scale/rotation so
 * the wall reads as a forest, not a row of identical clones.
 *
 * Why instanced primitives instead of cloned meshes:
 *   - one draw call per geometry (cone + trunk) regardless of
 *     tree count — mobile-friendly without GLB optimization.
 *   - PR 2 swaps these for real GLB pines reading the same
 *     scatter table (`cozyScatter.ts`); the rest of the layer
 *     doesn't change.
 *
 * The trees deliberately don't cast shadows in PR 1 — shadow
 * tuning belongs with the real assets in PR 2.
 */
export function CozyStarterPines({ scene, quality }: { scene: WorldArtScene; quality: WorldArtQuality }) {
  const trees = useMemo(() => makeCozyTreeScatter(scene, quality), [scene, quality]);
  const trunkMatrices = useMemo(() => trees.map((t) => trunkMatrix(t)), [trees]);
  const canopyMatrices = useMemo(() => trees.map((t) => canopyMatrix(t)), [trees]);
  return (
    <group>
      <Instanced matrices={trunkMatrices} color="#3b2415">
        <cylinderGeometry args={[0.4, 0.55, 4.0, 6]} />
      </Instanced>
      <Instanced matrices={canopyMatrices} color="#1f3a25">
        <coneGeometry args={[2.4, 7.5, 8]} />
      </Instanced>
    </group>
  );
}

function trunkMatrix(t: PineTransform): THREE.Matrix4 {
  const scale = 1.3 + t.scaleVariance * 1.25;
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(t.x, t.y + 2.0 * scale, t.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rotationY, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  return m;
}

function canopyMatrix(t: PineTransform): THREE.Matrix4 {
  const scale = 1.3 + t.scaleVariance * 1.25;
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(t.x, t.y + 4.0 * scale + 3.0 * scale, t.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rotationY, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  return m;
}

function Instanced({
  matrices, color, children,
}: {
  matrices: readonly THREE.Matrix4[];
  color: string;
  children: React.ReactNode;
}) {
  const meshRef = useMemo(() => ({ current: null as THREE.InstancedMesh | null }), []);
  const setRef = (m: THREE.InstancedMesh | null) => {
    meshRef.current = m;
    if (!m) return;
    for (let i = 0; i < matrices.length; i += 1) m.setMatrixAt(i, matrices[i]);
    m.instanceMatrix.needsUpdate = true;
    m.count = matrices.length;
  };
  return (
    <instancedMesh ref={setRef} args={[undefined, undefined, matrices.length]} castShadow={false} receiveShadow={false}>
      {children}
      <meshStandardMaterial color={color} roughness={1} metalness={0} />
    </instancedMesh>
  );
}
