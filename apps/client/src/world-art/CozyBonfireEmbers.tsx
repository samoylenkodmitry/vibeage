import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Hot embers (small orange/yellow points) rising from each
 * bonfire. Faster + smaller than the smoke column, and they
 * fade much sooner so they read as glowing motes rather than
 * particles. Adds the "fire is alive" cue at close range.
 */
const EMBERS_PER_FIRE = 14;
const MAX_AGE_SECONDS = 2.6;
const RISE_SPEED = 3.0;
const SPAWN_RADIUS = 0.3;
const EMBER_COLOR = '#ffa54a';

type Ember = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  maxAge: number;
};

export function CozyBonfireEmbers({ scene }: { scene: WorldArtScene }) {
  const bonfires = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'bonfire')
      .map((p) => ({
        x: scene.origin.x + p.position.x,
        y: p.position.y + 0.5,
        z: scene.origin.z + p.position.z,
      }));
  }, [scene]);
  if (bonfires.length === 0) return null;
  return (
    <>
      {bonfires.map((b, i) => (
        <EmberColumn key={`${scene.id}-ember-${i}`} originX={b.x} originY={b.y} originZ={b.z} seed={i} />
      ))}
    </>
  );
}

function EmberColumn({ originX, originY, originZ, seed }: { originX: number; originY: number; originZ: number; seed: number }) {
  const rand = useMemo(() => mulberry32(seed * 1789 + 13), [seed]);
  const embers = useMemo<Ember[]>(() => {
    return Array.from({ length: EMBERS_PER_FIRE }, () => spawnEmber(originX, originY, originZ, rand, rand() * MAX_AGE_SECONDS));
  }, [originX, originY, originZ, rand]);
  const positions = useMemo(() => new Float32Array(EMBERS_PER_FIRE * 3), []);
  const opacities = useMemo(() => new Float32Array(EMBERS_PER_FIRE), []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    for (let i = 0; i < embers.length; i += 1) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.maxAge) {
        respawnEmber(e, originX, originY, originZ, rand);
      } else {
        e.y += RISE_SPEED * dt;
        e.x += e.vx * dt;
        e.z += e.vz * dt;
      }
      positions[i * 3] = e.x;
      positions[i * 3 + 1] = e.y;
      positions[i * 3 + 2] = e.z;
      const lifeT = e.age / e.maxAge;
      // Bright on spawn, dim quickly toward end.
      opacities[i] = (1 - lifeT) * 0.95;
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
        uniforms={{ uColor: { value: new THREE.Color(EMBER_COLOR) } }}
        vertexShader={emberVertexShader}
        fragmentShader={emberFragmentShader}
      />
    </points>
  );
}

function spawnEmber(originX: number, originY: number, originZ: number, rand: () => number, age: number): Ember {
  const a = rand() * Math.PI * 2;
  const r = rand() * SPAWN_RADIUS;
  return {
    x: originX + Math.cos(a) * r,
    y: originY,
    z: originZ + Math.sin(a) * r,
    vx: (rand() - 0.5) * 0.6,
    vz: (rand() - 0.5) * 0.6,
    age,
    maxAge: MAX_AGE_SECONDS * (0.7 + rand() * 0.6),
  };
}

function respawnEmber(e: Ember, originX: number, originY: number, originZ: number, rand: () => number): void {
  const fresh = spawnEmber(originX, originY, originZ, rand, 0);
  e.x = fresh.x;
  e.y = fresh.y;
  e.z = fresh.z;
  e.vx = fresh.vx;
  e.vz = fresh.vz;
  e.age = 0;
  e.maxAge = fresh.maxAge;
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

const emberVertexShader = `
  attribute float opacity;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 6.0 * (24.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const emberFragmentShader = `
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
