import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Constant gentle "cherry blossom" petal drift across the cozy
 * scene. Adds a perpetual sense of motion to the air without the
 * heavy weather feeling of rain or snow. Each petal falls and
 * sways laterally; respawns at the top of the column when it
 * lands.
 *
 * Implementation: one Points buffer, per-frame attribute updates.
 * Custom shader draws soft pink-cream dots with per-petal opacity.
 */
const COUNT = 50;
const FALL_SPEED = 0.6;
const SWAY_AMPLITUDE = 0.5;
const SWAY_HZ = 0.45;
const SPAWN_HEIGHT = 24;
const GROUND_Y = 0.3;

type Petal = {
  x: number;
  z: number;
  y: number;
  driftSeed: number;
  fallScale: number;
  size: number;
};

export function CozyPetals({ scene }: { scene: WorldArtScene }) {
  const petals = useMemo<Petal[]>(() => makePetals(scene), [scene]);
  const positions = useMemo(() => new Float32Array(COUNT * 3), []);
  const sizes = useMemo(() => new Float32Array(COUNT), []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const baseRand = useMemo(() => mulberry32(scene.id.length * 4093 + 19), [scene]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    for (let i = 0; i < petals.length; i += 1) {
      const p = petals[i];
      p.y -= FALL_SPEED * p.fallScale * dt;
      if (p.y < GROUND_Y) {
        // Respawn at the top with a fresh lateral seed so the
        // column doesn't repeat a path.
        p.y = SPAWN_HEIGHT + baseRand() * 6;
        p.x = scene.origin.x + (baseRand() - 0.5) * scene.radius * 0.95;
        p.z = scene.origin.z + (baseRand() - 0.5) * scene.radius * 0.95;
        p.driftSeed = baseRand() * 100;
      }
      const swayX = Math.sin(t * SWAY_HZ + p.driftSeed) * SWAY_AMPLITUDE;
      positions[i * 3] = p.x + swayX;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z + Math.cos(t * SWAY_HZ * 0.7 + p.driftSeed) * SWAY_AMPLITUDE * 0.6;
      sizes[i] = p.size;
    }
    const g = geometryRef.current;
    if (g) {
      g.attributes.position.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color('#ffd6e5') } }}
        vertexShader={petalVertexShader}
        fragmentShader={petalFragmentShader}
      />
    </points>
  );
}

function makePetals(scene: WorldArtScene): Petal[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 4091));
  const out: Petal[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    out.push({
      x: scene.origin.x + (rand() - 0.5) * scene.radius * 0.95,
      z: scene.origin.z + (rand() - 0.5) * scene.radius * 0.95,
      y: GROUND_Y + rand() * SPAWN_HEIGHT,
      driftSeed: rand() * 100,
      fallScale: 0.7 + rand() * 0.8,
      size: 0.85 + rand() * 0.7,
    });
  }
  return out;
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

const petalVertexShader = `
  attribute float size;
  varying float vSize;
  void main() {
    vSize = size;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * 14.0 * (24.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const petalFragmentShader = `
  varying float vSize;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    // Petal-ish soft round, slightly elongated.
    float falloff = 1.0 - smoothstep(0.18, 0.50, dist);
    if (falloff <= 0.0) discard;
    gl_FragColor = vec4(uColor, falloff * 0.78);
  }
`;
