import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Drifting smoke column above every `bonfire`-tagged authored
 * prop. Implementation is a single `Points` per scene (one
 * buffer-attribute update per frame, no React state churn).
 * Each particle ages, rises with a small wobble, fades out, and
 * respawns at the fire's base when it reaches max age.
 *
 * Sits on top of the existing bonfire visual + CozyBonfireGlow's
 * flicker light — the smoke is the "this fire is alive" cue at
 * range; the flicker is the cue when you stand near it.
 */
const PARTICLES_PER_FIRE = 14;
const MAX_AGE_SECONDS = 6.5;
const RISE_SPEED = 1.2;
const SPAWN_RADIUS = 0.45;
const SMOKE_COLOR = '#dcdcdc';

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
};

export function CozyBonfireSmoke({ scene }: { scene: WorldArtScene }) {
  const bonfires = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'bonfire')
      .map((p) => ({
        x: scene.origin.x + p.position.x,
        y: p.position.y + 1.0,
        z: scene.origin.z + p.position.z,
      }));
  }, [scene]);
  if (bonfires.length === 0) return null;
  return (
    <>
      {bonfires.map((b, i) => (
        <SmokeColumn key={`${scene.id}-smoke-${i}`} originX={b.x} originY={b.y} originZ={b.z} seed={i} />
      ))}
    </>
  );
}

function SmokeColumn({ originX, originY, originZ, seed }: { originX: number; originY: number; originZ: number; seed: number }) {
  // mulberry32 for deterministic per-particle initial state.
  const rand = useMemo(() => mulberry32(seed * 1031 + 173), [seed]);
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLES_PER_FIRE }, () => spawnParticle(originX, originY, originZ, rand, rand() * MAX_AGE_SECONDS));
  }, [originX, originY, originZ, rand]);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const positions = useMemo(() => new Float32Array(PARTICLES_PER_FIRE * 3), []);
  const opacities = useMemo(() => new Float32Array(PARTICLES_PER_FIRE), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        respawnParticle(p, originX, originY, originZ, rand);
      } else {
        p.y += RISE_SPEED * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
      }
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const lifeT = p.age / p.maxAge;
      // Fade in fast (first 15%), fade out slowly (rest). Keeps
      // a column shape rather than puffs.
      opacities[i] = lifeT < 0.15 ? lifeT / 0.15 * 0.35 : (1 - lifeT) * 0.4;
    }
    const geometry = geometryRef.current;
    if (geometry) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.opacity.needsUpdate = true;
    }
  });

  return (
    <points raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[opacities, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color(SMOKE_COLOR) } }}
        vertexShader={smokeVertexShader}
        fragmentShader={smokeFragmentShader}
      />
    </points>
  );
}

function spawnParticle(originX: number, originY: number, originZ: number, rand: () => number, age: number): Particle {
  const angle = rand() * Math.PI * 2;
  const radius = rand() * SPAWN_RADIUS;
  return {
    x: originX + Math.cos(angle) * radius,
    y: originY,
    z: originZ + Math.sin(angle) * radius,
    vx: (rand() - 0.5) * 0.2,
    vz: (rand() - 0.5) * 0.2,
    age,
    maxAge: MAX_AGE_SECONDS * (0.7 + rand() * 0.6),
  };
}

function respawnParticle(p: Particle, originX: number, originY: number, originZ: number, rand: () => number): void {
  const fresh = spawnParticle(originX, originY, originZ, rand, 0);
  p.x = fresh.x;
  p.y = fresh.y;
  p.z = fresh.z;
  p.vx = fresh.vx;
  p.vz = fresh.vz;
  p.age = 0;
  p.maxAge = fresh.maxAge;
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

const smokeVertexShader = `
  attribute float opacity;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 28.0 * (24.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const smokeFragmentShader = `
  varying float vOpacity;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float soft = 1.0 - smoothstep(0.30, 0.50, dist);
    if (soft <= 0.0) discard;
    gl_FragColor = vec4(uColor, soft * vOpacity);
  }
`;
