import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Occasional expanding ring "ripples" on the cozy water surface —
 * a stray fish, a falling petal, a dropped leaf. Each ring grows
 * outward and fades, then respawns at a random water-surface
 * position. 8 simultaneous ripples per scene, asynchronous so
 * there's no visible heartbeat.
 *
 * Implementation: 8 ringGeometry meshes; per-frame radial scale
 * + alpha update. raycast disabled.
 */
const RIPPLE_COUNT = 8;
const MAX_AGE = 3.2;
const MAX_RADIUS = 1.6;
const RIPPLE_COLOR = '#e8f6f4';

type Ripple = {
  x: number;
  z: number;
  age: number;
  maxAge: number;
};

export function CozyWaterRipples({ scene }: { scene: WorldArtScene }) {
  const rand = useMemo(() => mulberry32(scene.id.length * 6121 + 3), [scene]);
  const ripples = useMemo<Ripple[]>(() => {
    return Array.from({ length: RIPPLE_COUNT }, (_, i) => {
      const p = spawn(scene, rand);
      return { x: p.x, z: p.z, age: rand() * MAX_AGE, maxAge: MAX_AGE * (0.8 + rand() * 0.4 + i * 0.03) };
    });
  }, [scene, rand]);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    for (let i = 0; i < ripples.length; i += 1) {
      const r = ripples[i];
      r.age += dt;
      if (r.age >= r.maxAge) {
        const p = spawn(scene, rand);
        r.x = p.x;
        r.z = p.z;
        r.age = 0;
        r.maxAge = MAX_AGE * (0.8 + rand() * 0.4);
      }
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat) continue;
      const lifeT = r.age / r.maxAge;
      const radius = MAX_RADIUS * lifeT;
      mesh.position.set(r.x, -0.16, r.z);
      mesh.scale.set(radius, radius, 1);
      mat.opacity = (1 - lifeT) * 0.45;
    }
  });
  return (
    <group raycast={() => null}>
      {ripples.map((_, i) => (
        <mesh
          key={`${scene.id}-ripple-${i}`}
          ref={(m) => { meshRefs.current[i] = m; }}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[0.85, 1.0, 28]} />
          <meshBasicMaterial
            ref={(m) => { matRefs.current[i] = m; }}
            color={RIPPLE_COLOR}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function spawn(scene: WorldArtScene, rand: () => number): { x: number; z: number } {
  return {
    x: scene.waterline.x + (rand() - 0.5) * scene.waterline.width * 0.7,
    z: scene.waterline.z + (rand() - 0.5) * scene.waterline.length * 0.85,
  };
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
