import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';

/**
 * A low-poly mountain silhouette ring on the far horizon that FOLLOWS the
 * player — the whole group re-centres on `focus` every frame (like the clouds
 * and sun in WorldEnvironment), so every location gets a mountainous backdrop
 * instead of a flat void edge, and the ring never mounts/unmounts at a scene
 * boundary (the old CozyDistantMountains was anchored to the cozy-coast origin,
 * so it was only a proper ring near spawn).
 *
 * Sits just past the foliage frontier (~960 m) and inside the scene fog band,
 * so it reads as a hazy distant range. fog stays enabled (default) on purpose.
 * 20 cones ≈ 20 draws — comfortably under budget.
 */
const RING_RADIUS = 780;
const BASE_Y = -8;
const COUNT = 20;
const COLOR = '#36475a';

type Mountain = { x: number; z: number; height: number; baseRadius: number; rotationY: number };

function makeRing(): Mountain[] {
  const rand = mulberry32(7919);
  const out: Mountain[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    // Even 360° spread + jitter so the ring surrounds the player from every
    // angle without reading as a regular comb.
    const angle = (i / COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.14;
    const radius = RING_RADIUS + (rand() - 0.5) * 130;
    out.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      height: 150 + rand() * 120,
      baseRadius: 70 + rand() * 55,
      rotationY: rand() * Math.PI * 2,
    });
  }
  return out;
}

export function WorldHorizonMountains({ focus }: { focus: Vec3D }) {
  const mountains = useMemo(makeRing, []);
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = groupRef.current;
    if (g) g.position.set(focus.x, 0, focus.z);
  });
  return (
    <group ref={groupRef} raycast={() => null}>
      {mountains.map((m, i) => (
        <mesh
          key={i}
          position={[m.x, BASE_Y + m.height / 2, m.z]}
          rotation={[0, m.rotationY, 0]}
          castShadow={false}
          receiveShadow={false}
        >
          <coneGeometry args={[m.baseRadius, m.height, 6, 1]} />
          <meshStandardMaterial color={COLOR} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
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
