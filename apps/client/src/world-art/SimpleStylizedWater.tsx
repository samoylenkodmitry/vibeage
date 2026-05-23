import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Stylized water plane — cheap, mobile-safe, anchored to the
 * scene's waterline (NOT the player's current position; we don't
 * want water following the camera around the world).
 *
 * raycast disabled so click-to-move targeting always falls through
 * to the underlying terrain (verified by the e2e cozy-world-art
 * spec). Verts ride a gentle sine wave; fragment shader blends a
 * deep/shallow gradient + a thin foam line at the shore edge.
 */
export function SimpleStylizedWater({ scene }: { scene: WorldArtScene }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#15516b') },
      uShallow: { value: new THREE.Color('#63e6d1') },
      uFoam: { value: new THREE.Color('#e6fff5') },
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
      <planeGeometry args={[scene.waterline.width, scene.waterline.length, 48, 48]} />
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

const waterVertexShader = `
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(position.x * 0.035 + uTime * 1.2) * 0.08;
    p.z += sin(position.y * 0.045 + uTime * 0.8) * 0.05;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const waterFragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;

  void main() {
    float depth = smoothstep(0.18, 0.72, vUv.x);
    float ripple = sin(vUv.y * 55.0 + uTime * 1.8) * 0.025;
    float smallRipple = sin((vUv.x + vUv.y) * 90.0 - uTime * 2.4) * 0.015;
    vec3 color = mix(uShallow, uDeep, clamp(depth + ripple + smallRipple, 0.0, 1.0));
    float foamLine = 1.0 - smoothstep(0.035, 0.08, abs(vUv.x - 0.18));
    color = mix(color, uFoam, foamLine * 0.35);
    gl_FragColor = vec4(color, 0.76);
  }
`;
