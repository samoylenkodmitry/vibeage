import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Renders many copies of a GLB as `InstancedMesh`es — one per
 * (geometry, material) leaf inside the GLB scene. This is the
 * difference between cloning a 1300-tree forest as 1300
 * draw-calls (frame-killer) and rendering it as ~2 calls.
 *
 * Per-instance tinting: pass `colors` and the material is cloned
 * with `vertexColors=true` so `instanceColor` modulates the base
 * texture. The Quaternius pines we ship are green canopy + brown
 * trunk; per-biome tints shift the whole tree subtly without
 * losing the texture detail.
 */
type InstancedGltfProps = {
  /** Path of the GLB inside `public/`. */
  src: string;
  /** Per-instance world-space matrices. Length == instance count. */
  matrices: readonly THREE.Matrix4[];
  /** Optional per-instance tint (multiplied with the GLB material).
   * Must match `matrices.length` if provided. */
  colors?: readonly THREE.Color[];
  /** Optional uniform scale baked on top of every matrix. */
  baseScale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

type SubMesh = { geometry: THREE.BufferGeometry; material: THREE.Material; localMatrix: THREE.Matrix4 };

function collectSubMeshes(root: THREE.Object3D): SubMesh[] {
  const out: SubMesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    const material = child.material as THREE.Material | THREE.Material[];
    const localMatrix = new THREE.Matrix4().copy(child.matrixWorld);
    const mat = Array.isArray(material) ? material[0] : material;
    out.push({ geometry, material: mat, localMatrix });
  });
  return out;
}

export function InstancedGltf({
  src, matrices, colors, baseScale = 1, castShadow = false, receiveShadow = false,
}: InstancedGltfProps) {
  const gltf = useGLTF(src);
  const subMeshes = useMemo(() => collectSubMeshes(gltf.scene), [gltf]);
  if (matrices.length === 0 || subMeshes.length === 0) return null;
  return (
    <>
      {subMeshes.map((sub, idx) => (
        <InstancedSub
          key={`${src}#${idx}`}
          sub={sub}
          matrices={matrices}
          colors={colors}
          baseScale={baseScale}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  );
}

function InstancedSub({
  sub, matrices, colors, baseScale, castShadow, receiveShadow,
}: {
  sub: SubMesh;
  matrices: readonly THREE.Matrix4[];
  colors?: readonly THREE.Color[];
  baseScale: number;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Clone the material once per consumer-with-colors, gated on a
  // boolean — not on the `colors` array reference — so a fresh
  // scatter (new array, same shape) doesn't churn material
  // clones every regeneration.
  const colorsEnabled = colors !== undefined;
  const material = useMemo(() => {
    if (!colorsEnabled) return sub.material;
    const clone = sub.material.clone();
    if ('vertexColors' in clone) {
      (clone as THREE.MeshStandardMaterial).vertexColors = true;
    }
    return clone;
  }, [sub.material, colorsEnabled]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const tmp = new THREE.Matrix4();
    const scaleMat = new THREE.Matrix4().makeScale(baseScale, baseScale, baseScale);
    for (let i = 0; i < matrices.length; i += 1) {
      tmp.copy(matrices[i]).multiply(scaleMat).multiply(sub.localMatrix);
      mesh.setMatrixAt(i, tmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && colors.length === matrices.length) {
      for (let i = 0; i < colors.length; i += 1) {
        mesh.setColorAt(i, colors[i]);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = matrices.length;
  }, [matrices, colors, baseScale, sub.localMatrix]);

  return (
    <instancedMesh
      ref={ref}
      args={[sub.geometry, material, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
