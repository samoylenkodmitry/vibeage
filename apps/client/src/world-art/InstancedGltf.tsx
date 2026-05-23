import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Renders many copies of a GLB as `InstancedMesh`es — one per
 * (geometry, material) leaf inside the GLB scene. This is the
 * difference between cloning a 1300-tree forest as 1300
 * draw-calls (frame-killer) and rendering it as ~2 calls.
 *
 * Caveat: the GLB's existing material is reused as-is. Per-
 * instance tinting (the procedural foliage colored each cone by
 * biome) isn't supported here — Quaternius pines ship with a
 * flat green canopy + brown trunk material and we accept that
 * baseline. A future PR can re-introduce per-instance color via
 * `instanceColor` if biome tinting matters.
 */
type InstancedGltfProps = {
  /** Path of the GLB inside `public/`. */
  src: string;
  /** Per-instance world-space matrices. Length == instance count. */
  matrices: readonly THREE.Matrix4[];
  /** Optional uniform scale baked on top of every matrix (handy for
   * making a Quaternius pine taller without re-authoring matrices). */
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
    // Single-material case is the common one. If we ever hit a
    // multi-material mesh, fall through with the first material —
    // Quaternius GLBs don't use them so this is defensive.
    const mat = Array.isArray(material) ? material[0] : material;
    out.push({ geometry, material: mat, localMatrix });
  });
  return out;
}

export function InstancedGltf({ src, matrices, baseScale = 1, castShadow = false, receiveShadow = false }: InstancedGltfProps) {
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
          baseScale={baseScale}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  );
}

function InstancedSub({
  sub, matrices, baseScale, castShadow, receiveShadow,
}: {
  sub: SubMesh;
  matrices: readonly THREE.Matrix4[];
  baseScale: number;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
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
    mesh.count = matrices.length;
  }, [matrices, baseScale, sub.localMatrix]);
  return (
    <instancedMesh
      ref={ref}
      args={[sub.geometry, sub.material, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
