import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Animated foam line at the water edge of the cozy scene. Reads
 * as gentle waves crashing onto the sand — the static water plane
 * + static shore band were too dead at low tide.
 *
 * Implementation: a thin plane positioned exactly at the
 * sand/water seam with a shader that paints two animated foam
 * crests rolling toward the shore. Width tunes how far up the
 * sand the foam reaches.
 *
 * Performance: one extra mesh + custom ShaderMaterial. Cheap.
 * raycast disabled so it doesn't intercept click-to-move.
 */
const FOAM_WIDTH = 18;
const FOAM_COLOR_LIGHT = '#fbfff5';
const FOAM_COLOR_FADE = '#cfeaf2';

export function CozyShoreFoam({ scene }: { scene: WorldArtScene }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFoamLight: { value: new THREE.Color(FOAM_COLOR_LIGHT) },
      uFoamFade: { value: new THREE.Color(FOAM_COLOR_FADE) },
    }),
    [],
  );
  useFrame(({ clock }) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const { waterline } = scene;
  // Sits at the water-edge of the shore band (positive-X edge of
  // the waterline). Tuned to read just above sand without z-fight.
  const foamX = waterline.x + waterline.width / 2 - 4;
  return (
    <mesh
      position={[foamX, 0.04, waterline.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
      receiveShadow={false}
    >
      <planeGeometry args={[FOAM_WIDTH, waterline.length * 0.95, 32, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={foamVertexShader}
        fragmentShader={foamFragmentShader}
      />
    </mesh>
  );
}

const foamVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const foamFragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uFoamLight;
  uniform vec3 uFoamFade;

  void main() {
    // u axis runs water → sand. Two slow-rolling foam crests at
    // different speeds give the visual of waves washing in.
    float crest1 = smoothstep(0.18, 0.32, vUv.x + sin(vUv.y * 14.0 + uTime * 0.7) * 0.04);
    float crest2 = smoothstep(0.34, 0.50, vUv.x + sin(vUv.y * 11.0 - uTime * 0.5 + 1.2) * 0.05);
    crest1 *= 1.0 - smoothstep(0.32, 0.48, vUv.x);
    crest2 *= 1.0 - smoothstep(0.50, 0.66, vUv.x);
    float foam = crest1 + crest2 * 0.7;
    if (foam < 0.02) discard;
    vec3 color = mix(uFoamFade, uFoamLight, clamp(foam, 0.0, 1.0));
    gl_FragColor = vec4(color, foam * 0.85);
  }
`;
