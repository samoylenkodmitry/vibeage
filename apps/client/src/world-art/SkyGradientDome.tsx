import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DayPhasePalette } from '../timeOfDay';

/**
 * Gradient sky dome. WorldEnvironment keeps `scene.background` as the solid
 * fallback sky; this draws a big inward-facing sphere OVER it (depthTest off,
 * renderOrder far negative) so the visible sky becomes a real gradient — deeper
 * overhead, luminous at the horizon — plus a soft bloom toward the sun. It is
 * driven entirely by the existing day-phase palette (zenith = backgroundColor,
 * horizon = fogColor, glow = sunColor toward sunDir), so day/night/dawn/dusk all
 * follow the lighting system unchanged. The dome follows the player so its
 * horizon always sits at eye level. No postprocessing; fog disabled on the dome.
 */
const VERT = /* glsl */`
  varying vec3 vDir;
  void main(){
    vDir = position;                 // local sphere pos = direction from centre
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main(){
    vec3 dir = normalize(vDir);
    float h = dir.y;                                  // -1 down .. 1 up
    float t = smoothstep(-0.04, 0.62, h);             // horizon -> zenith
    vec3 col = mix(uHorizon, uZenith * 0.82, t);      // deepen the overhead a touch
    // Soft sun bloom, only while the sun is up; widens near the horizon.
    // uSunDir is already unit-length (timeOfDay), so no normalize here.
    float sd  = max(dot(dir, uSunDir), 0.0);
    float up  = smoothstep(-0.12, 0.18, uSunDir.y);
    col += uSunColor * (pow(sd, 9.0) * 0.55 + pow(sd, 2.2) * 0.10) * up;
    // Gentle brightening right along the horizon band.
    col += uHorizon * (1.0 - smoothstep(0.0, 0.10, abs(h))) * 0.10;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SkyGradientDome({ focus, palette }: { focus: { x: number; y: number; z: number }; palette: MutableRefObject<DayPhasePalette> }) {
  const geometry = useMemo(() => new THREE.SphereGeometry(4000, 32, 16), []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide,
    depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color('#7fb6dd') },
      uHorizon: { value: new THREE.Color('#a4d2e3') },
      uSunColor: { value: new THREE.Color('#fff1a6') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
  }), []);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const p = palette.current;
    const u = material.uniforms;
    u.uZenith.value.set(p.backgroundColor);
    u.uHorizon.value.set(p.fogColor);
    u.uSunColor.value.set(p.sunColor);
    u.uSunDir.value.set(p.sunDir.x, p.sunDir.y, p.sunDir.z);
    if (meshRef.current) meshRef.current.position.set(focus.x, focus.y, focus.z);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={-10000} frustumCulled={false} />;
}
