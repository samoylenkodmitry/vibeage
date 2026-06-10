import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeNearbyLakes, LAKE_WATER_Y } from '../../../../packages/content/terrain';

/**
 * Streamed lake water. Lake positions are the analytic peaks of the terrain's
 * lake lattice (computeNearbyLakes) — pure functions of world position, so
 * discs never move or pop on player movement; the set only changes at the far
 * frontier (~2.8 km, deep in vista haze).
 *
 * Each lake is one oversized disc at the fixed waterline (LAKE_WATER_Y): the
 * terrain blends down to LAKE_BED_Y inside the lake mask and rises above the
 * waterline outside it, so the disc's rim is simply buried — the visible
 * shoreline is exactly where terrain crosses the waterline, no per-lake
 * fitting needed. Gentle ripple + radial deep→shallow gradient share ONE
 * material across all lakes (same uTime; depth read from the disc's own uv).
 *
 * raycast disabled so click-to-move falls through to the terrain, matching
 * the coast water.
 */
const LAKE_STREAM_RADIUS = 2800;
const LAKE_DISC_RADIUS = 540; // > max possible shoreline radius; rim hides under terrain
const SNAP = 512;             // re-derive the set on coarse steps, not every frame

export function LakeWaters({ focus }: { focus: { x: number; z: number } }) {
  const material = useMemo(() => makeLakeMaterial(), []);
  const materialRef = useRef(material);
  materialRef.current = material;

  const snapX = Math.round(focus.x / SNAP) * SNAP;
  const snapZ = Math.round(focus.z / SNAP) * SNAP;
  const lakes = useMemo(() => computeNearbyLakes(snapX, snapZ, LAKE_STREAM_RADIUS), [snapX, snapZ]);

  useFrame(({ clock }) => {
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {lakes.map((lake) => (
        <mesh
          key={`${lake.x.toFixed(0)}:${lake.z.toFixed(0)}`}
          position={[lake.x, LAKE_WATER_Y, lake.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={material}
          raycast={() => null}
        >
          <circleGeometry args={[LAKE_DISC_RADIUS, 48]} />
        </mesh>
      ))}
    </group>
  );
}

function makeLakeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#123e58') },
      uShallow: { value: new THREE.Color('#3f8d96') },
      fogColor: { value: new THREE.Color('#a4d2e3') },
      fogNear: { value: 500 },
      fogFar: { value: 2600 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFogDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFogDepth;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      void main() {
        // Radial depth: centre deep, edge shallow (the true shore is wherever
        // the terrain buries the disc, so this only needs to look right).
        float r = length(vUv - 0.5) * 2.0;
        float ripple = sin(r * 60.0 - uTime * 1.6) * 0.02
                     + sin((vUv.x + vUv.y) * 80.0 + uTime * 2.1) * 0.012;
        vec3 color = mix(uDeep, uShallow, clamp(r * 0.9 + ripple, 0.0, 1.0));
        float alpha = mix(0.88, 0.62, r);
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        color = mix(color, fogColor, fogFactor);
        gl_FragColor = vec4(color, alpha * (1.0 - fogFactor * 0.6));
      }
    `,
  });
}
