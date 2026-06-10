import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Stylized coast water — cheap, mobile-safe, anchored to the scene's
 * waterline (NOT the player's position; we don't want water sliding
 * around the world with the camera).
 *
 * The plane rides layered swells; the fragment shader lights them with
 * an animated surface normal so the water reacts to view angle: a
 * Fresnel rim brightens toward the sky at grazing angles, drifting
 * specular glints sparkle on the crests, and a living foam band breathes
 * along the shore. A deep→shallow gradient + depth-based alpha read as
 * real water depth rather than a flat translucent slab.
 *
 * raycast disabled so click-to-move always falls through to the terrain
 * (covered by the cozy-world-art e2e spec). `cameraPosition` is a
 * three.js built-in injected into both shader stages — no uniform needed.
 */
export function SimpleStylizedWater({ scene }: { scene: WorldArtScene }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0e4a68') },
      uShallow: { value: new THREE.Color('#74efd6') },
      uFoam: { value: new THREE.Color('#e6fff5') },
      uSky: { value: new THREE.Color('#cfeffb') },
    }),
    [],
  );
  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh
      position={[scene.waterline.x, -0.18, scene.waterline.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={false}
      raycast={() => null}
    >
      <planeGeometry args={[scene.waterline.width, scene.waterline.length, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
      />
    </mesh>
  );
}

// Wave field (planar x/y of the un-rotated plane; p.z = up after rotation).
// The fragment shader reconstructs the surface normal from the same partial
// derivatives, so lighting and displacement stay in sync.
const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  uniform float uTime;

  void main() {
    vUv = uv;
    float x = position.x;
    float y = position.y;
    float t = uTime;

    // Layered swells of decreasing wavelength.
    float w1 = sin(x * 0.045 + t * 1.10);
    float w2 = sin(y * 0.060 - t * 0.85);
    float w3 = sin((x + y) * 0.035 + t * 1.55);

    vec3 p = position;
    p.z += w1 * 0.10 + w2 * 0.07 + w3 * 0.05;

    // Analytic normal from the wave gradient (local plane space, +z up).
    // To WORLD space (not view) via modelMatrix — the fragment shader's
    // viewDir is world-space (cameraPosition - vWorld), so the normal must
    // match or the Fresnel/glints drift as the camera moves. The mesh has
    // no scale (size lives in the geometry), so mat3(modelMatrix) is a pure
    // rotation and correct for normals.
    float dx = cos(x * 0.045 + t * 1.10) * 0.045 * 0.10
             + cos((x + y) * 0.035 + t * 1.55) * 0.035 * 0.05;
    float dy = cos(y * 0.060 - t * 0.85) * 0.060 * 0.07
             + cos((x + y) * 0.035 + t * 1.55) * 0.035 * 0.05;
    vNormal = normalize(mat3(modelMatrix) * vec3(-dx, -dy, 1.0));

    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorld = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const waterFragmentShader = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;

  // Cheap hash for sparkle scatter.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Deep→shallow body colour, rippled so the gradient line isn't dead straight.
    float depth = smoothstep(0.16, 0.74, vUv.x);
    float ripple = sin(vUv.y * 55.0 + uTime * 1.8) * 0.022
                 + sin((vUv.x + vUv.y) * 90.0 - uTime * 2.4) * 0.014;
    vec3 color = mix(uShallow, uDeep, clamp(depth + ripple, 0.0, 1.0));

    // Fresnel: at grazing angles the surface mirrors the sky and brightens.
    float fres = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);
    color = mix(color, uSky, fres * 0.45);

    // Drifting specular glints riding the crests — a fake sun sparkle that
    // moves with the waves and the view, so the surface never looks static.
    vec2 gp = vUv * vec2(48.0, 26.0) + vec2(uTime * 0.6, -uTime * 0.4);
    float sparkle = hash(floor(gp));
    sparkle = step(0.985, sparkle) * (0.5 + 0.5 * sin(uTime * 6.0 + sparkle * 30.0));
    color += sparkle * (0.35 + fres * 0.4);

    // Breathing foam band hugging the shore edge.
    float foamEdge = abs(vUv.x - 0.14) - 0.018 * sin(vUv.y * 40.0 + uTime * 1.5);
    float foamLine = 1.0 - smoothstep(0.02, 0.075, foamEdge);
    color = mix(color, uFoam, foamLine * 0.4);

    // Depth-based alpha: clearer at the shore, more opaque further out;
    // the Fresnel rim adds a touch of body so the horizon edge reads.
    float alpha = clamp(mix(0.58, 0.9, depth) + fres * 0.16, 0.0, 0.96);
    gl_FragColor = vec4(color, alpha);
  }
`;
