import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Reusable shader-driven spell visuals. The GLSL source is module-level, so
 * every ShaderMaterial built from it shares ONE compiled GL program (three's
 * program cache keys on source) — no per-cast shader recompile / frame hitch.
 * Materials are per-instance (own uniforms) but cheap; disposed on unmount.
 *
 *  - EnergyOrb     : fresnel-rimmed, pulsing energy core (cast / projectile).
 *  - GroundShockwave: an expanding ring of light on the floor (impact).
 */

const ORB_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const ORB_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 2.4);
    float pulse = 0.82 + 0.18 * sin(uTime * 9.0);
    vec3 col = mix(uCore, uGlow, fres) * pulse;
    float a = clamp(0.5 + fres * 0.6, 0.0, 1.0) * pulse;
    gl_FragColor = vec4(col, a);
  }
`;

const SHOCK_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHOCK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uProgress; // 0 → 1 over the impact lifetime
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0; // 0 centre .. 1 edge
    float ring = smoothstep(0.11, 0.0, abs(d - uProgress));   // bright expanding rim
    float core = smoothstep(0.45, 0.0, d) * (1.0 - smoothstep(0.0, 0.4, uProgress)); // early flash
    float fade = 1.0 - smoothstep(0.55, 1.0, uProgress);
    // step(d,1.0) clips to the disc without discard (keeps early-Z on tiled GPUs).
    float a = (ring + core * 0.5) * fade * step(d, 1.0);
    vec3 col = mix(uColor, uAccent, ring);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function makeOrbMaterial(core: string, glow: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(core) }, uGlow: { value: new THREE.Color(glow) }, uTime: { value: 0 } },
    vertexShader: ORB_VERT,
    fragmentShader: ORB_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

function makeShockMaterial(color: string, accent: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAccent: { value: new THREE.Color(accent) }, uProgress: { value: 0 } },
    vertexShader: SHOCK_VERT,
    fragmentShader: SHOCK_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // ground plane is only seen from above
    blending: THREE.AdditiveBlending,
  });
}

export function EnergyOrb({ core, glow, radius = 0.4, spin = 2.5 }: { core: string; glow: string; radius?: number; spin?: number }) {
  // Build the material once; update colour uniforms in place so a theme change
  // never recreates/recompiles the material.
  const mat = useMemo(() => makeOrbMaterial('#ffffff', '#ffffff'), []);
  useEffect(() => {
    mat.uniforms.uCore.value.set(core);
    mat.uniforms.uGlow.value.set(glow);
  }, [core, glow, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    const m = meshRef.current;
    if (m && spin) { m.rotation.y += dt * spin; m.rotation.x += dt * spin * 0.6; }
  });
  return (
    <mesh ref={meshRef} material={mat}>
      <icosahedronGeometry args={[radius, 3]} />
    </mesh>
  );
}

export function GroundShockwave({ color, accent, size = 3.2, durationMs = 750, y = -0.9 }: {
  color: string; accent: string; size?: number; durationMs?: number; y?: number;
}) {
  const mat = useMemo(() => makeShockMaterial('#ffffff', '#ffffff'), []);
  useEffect(() => {
    mat.uniforms.uColor.value.set(color);
    mat.uniforms.uAccent.value.set(accent);
  }, [color, accent, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    mat.uniforms.uProgress.value = Math.min(1, ((clock.elapsedTime - start.current) * 1000) / durationMs);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
