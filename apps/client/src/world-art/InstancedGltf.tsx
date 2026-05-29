import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
 *
 * Wind sway: pass `wind` and the material is cloned (always, even
 * without colors) with an onBeforeCompile patch that displaces
 * vertices by a sine-wave wobble. The displacement scales with
 * vertex Y so trunks stay still and canopies sway.
 */
type WindParams = {
  /** Peak XZ displacement at full height (world meters). */
  amplitude?: number;
  /** Angular frequency in rad/s. */
  speed?: number;
};

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
  /** Subtle wind sway on canopies. Trunks stay still because the
   * displacement scales with the vertex's Y coordinate. */
  wind?: WindParams;
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
  src, matrices, colors, baseScale = 1, castShadow = false, receiveShadow = false, wind,
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
          wind={wind}
        />
      ))}
    </>
  );
}

function InstancedSub({
  sub, matrices, colors, baseScale, castShadow, receiveShadow, wind,
}: {
  sub: SubMesh;
  matrices: readonly THREE.Matrix4[];
  colors?: readonly THREE.Color[];
  baseScale: number;
  castShadow: boolean;
  receiveShadow: boolean;
  wind?: WindParams;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Clone the material when we need to mutate it (per-instance
  // colors or wind sway shader patch). Gated on booleans so a
  // fresh scatter (new array, same shape) doesn't churn clones.
  const colorsEnabled = colors !== undefined;
  const windEnabled = wind !== undefined;
  const windUniformRef = useRef<{ uTime: { value: number }; uAmplitude: { value: number }; uSpeed: { value: number } } | null>(null);
  const material = useMemo(() => {
    if (!colorsEnabled && !windEnabled) return sub.material;
    const clone = sub.material.clone();
    if (colorsEnabled && 'vertexColors' in clone) {
      (clone as THREE.MeshStandardMaterial).vertexColors = true;
    }
    if (windEnabled) {
      const uniforms = {
        uTime: { value: 0 },
        uAmplitude: { value: wind!.amplitude ?? 0.18 },
        uSpeed: { value: wind!.speed ?? 1.4 },
      };
      windUniformRef.current = uniforms;
      patchWindShader(clone as THREE.MeshStandardMaterial, uniforms);
    }
    return clone;
  }, [sub.material, colorsEnabled, windEnabled, wind]);

  useFrame((_, delta) => {
    const u = windUniformRef.current;
    if (u) u.uTime.value += delta;
  });

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
    // CRITICAL: our instances carry ABSOLUTE world matrices while the mesh
    // object sits at the origin, so its default bounding sphere is the base
    // geometry's (centred on 0,0,0). Three.js then frustum-culls the ENTIRE
    // InstancedMesh the moment the origin leaves view — i.e. "all trees vanish
    // when I walk away from spawn". Recompute the sphere over the real
    // instance matrices so culling tracks where the trees actually are.
    mesh.computeBoundingSphere();
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

function patchWindShader(
  material: THREE.MeshStandardMaterial,
  uniforms: { uTime: { value: number }; uAmplitude: { value: number }; uSpeed: { value: number } },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAmplitude = uniforms.uAmplitude;
    shader.uniforms.uSpeed = uniforms.uSpeed;
    shader.vertexShader = `
      uniform float uTime;
      uniform float uAmplitude;
      uniform float uSpeed;
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
        #include <begin_vertex>
        // Each instance's world position seeds a phase so a forest
        // doesn't sway in lockstep. Vertical scale (transformed.y)
        // gates the displacement so trunks stay anchored — Quaternius
        // pines have trunk vertices near y=0 and canopy vertices
        // up to y≈5.
        vec3 worldOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float instancePhase = worldOrigin.x * 0.13 + worldOrigin.z * 0.11;
        float swayPrimary = sin(uTime * uSpeed + instancePhase);
        float swaySecondary = sin(uTime * uSpeed * 1.7 + instancePhase * 0.6) * 0.4;
        float heightWeight = clamp(transformed.y / 3.0, 0.0, 1.5);
        float swayAmount = uAmplitude * heightWeight;
        transformed.x += swayPrimary * swayAmount;
        transformed.z += swaySecondary * swayAmount;
      `,
    );
  };
  material.needsUpdate = true;
}
