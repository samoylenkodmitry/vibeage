import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from '../timeOfDay';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Wandering firefly Points around the cozy scene's interior.
 * Visible only at night (opacity tied to sun direction). Each
 * particle does a small random walk and pulses gently. The
 * bonfire + lantern lights already pull the eye to fixed spots;
 * fireflies add the "alive" cue for the empty space between
 * them.
 *
 * Implementation: a single Points buffer for all fireflies in the
 * scene; per-frame position + opacity attribute updates. Additive-
 * blended custom shader draws soft warm dots; opacity attribute
 * already multiplies the day fade so they disappear at noon
 * without renderer cost.
 */
const COUNT = 24;
const WANDER_SPEED = 0.8;
const PULSE_HZ = 1.4;
const HEIGHT_BAND = { min: 0.6, max: 2.4 };

type Firefly = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  pulsePhase: number;
};

export function CozyFireflies({ scene }: { scene: WorldArtScene }) {
  const fireflies = useMemo<Firefly[]>(() => makeFireflies(scene), [scene]);
  const positions = useMemo(() => new Float32Array(COUNT * 3), []);
  const opacities = useMemo(() => new Float32Array(COUNT), []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const rand = useMemo(() => mulberry32(scene.id.length * 7919 + 1), [scene]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const palette = computeDayPhase(Date.now());
    const nightness = clamp(1 - smoothstep(-0.05, 0.20, palette.sunDir.y), 0, 1);
    for (let i = 0; i < fireflies.length; i += 1) {
      const f = fireflies[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      if (rand() < 0.02) {
        const a = rand() * Math.PI * 2;
        f.vx = Math.cos(a) * WANDER_SPEED;
        f.vz = Math.sin(a) * WANDER_SPEED;
        f.vy = (rand() - 0.5) * 0.4;
      }
      const dx = f.x - scene.origin.x;
      const dz = f.z - scene.origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > scene.radius * 0.55) {
        f.vx = -dx / dist * WANDER_SPEED;
        f.vz = -dz / dist * WANDER_SPEED;
      }
      if (f.y < HEIGHT_BAND.min) f.vy = Math.abs(f.vy);
      if (f.y > HEIGHT_BAND.max) f.vy = -Math.abs(f.vy);
      positions[i * 3] = f.x;
      positions[i * 3 + 1] = f.y;
      positions[i * 3 + 2] = f.z;
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 1000 * PULSE_HZ + f.pulsePhase);
      opacities[i] = pulse * nightness;
    }
    const g = geometryRef.current;
    if (g) {
      g.attributes.position.needsUpdate = true;
      g.attributes.opacity.needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[opacities, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uColor: { value: new THREE.Color('#ffd089') } }}
        vertexShader={fireflyVertexShader}
        fragmentShader={fireflyFragmentShader}
      />
    </points>
  );
}

function makeFireflies(scene: WorldArtScene): Firefly[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 8191));
  const out: Firefly[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = rand() * scene.radius * 0.5;
    const a0 = rand() * Math.PI * 2;
    out.push({
      x: scene.origin.x + Math.cos(angle) * radius,
      y: HEIGHT_BAND.min + rand() * (HEIGHT_BAND.max - HEIGHT_BAND.min),
      z: scene.origin.z + Math.sin(angle) * radius,
      vx: Math.cos(a0) * WANDER_SPEED,
      vy: (rand() - 0.5) * 0.4,
      vz: Math.sin(a0) * WANDER_SPEED,
      pulsePhase: rand() * Math.PI * 2,
    });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fireflyVertexShader = `
  attribute float opacity;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 16.0 * (20.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fireflyFragmentShader = `
  varying float vOpacity;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float soft = 1.0 - smoothstep(0.10, 0.50, dist);
    if (soft <= 0.0) discard;
    gl_FragColor = vec4(uColor, soft * vOpacity);
  }
`;
