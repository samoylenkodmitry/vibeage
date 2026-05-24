import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * A few small floating buoys further out on the cozy water — the
 * "this is fished" cue. Each buoy is a small red-and-white
 * cylinder that bobs gently. Cheap; one mesh per buoy so we get
 * per-buoy phase animation.
 */
const BUOY_COUNT = 4;
const BOB_AMPLITUDE = 0.07;
const BOB_HZ = 0.65;
const TOP_COLOR = '#d24a3b';
const BOT_COLOR = '#f7f4e3';

type Buoy = { x: number; z: number; phase: number };

export function CozyBuoys({ scene }: { scene: WorldArtScene }) {
  const buoys = useMemo<Buoy[]>(() => makeBuoys(scene), [scene]);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < buoys.length; i += 1) {
      const g = groupRefs.current[i];
      if (!g) continue;
      g.position.y = -0.05 + Math.sin(t * BOB_HZ + buoys[i].phase) * BOB_AMPLITUDE;
      g.rotation.z = Math.sin(t * BOB_HZ * 0.8 + buoys[i].phase) * 0.06;
    }
  });
  return (
    <group raycast={() => null}>
      {buoys.map((b, i) => (
        <group
          key={`${scene.id}-buoy-${i}`}
          ref={(g) => { groupRefs.current[i] = g; }}
          position={[b.x, -0.05, b.z]}
        >
          {/* Top (red) */}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.32, 10]} />
            <meshStandardMaterial color={TOP_COLOR} roughness={0.7} metalness={0} />
          </mesh>
          {/* Bottom (white) */}
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.2, 10]} />
            <meshStandardMaterial color={BOT_COLOR} roughness={0.8} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function makeBuoys(scene: WorldArtScene): Buoy[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 7841));
  const out: Buoy[] = [];
  for (let i = 0; i < BUOY_COUNT; i += 1) {
    // Out in the water (negative-X side of waterline), spread
    // along Z for variety.
    const u = 0.15 + rand() * 0.4;
    const v = 0.15 + rand() * 0.7;
    out.push({
      x: scene.waterline.x + (u - 0.5) * scene.waterline.width,
      z: scene.waterline.z + (v - 0.5) * scene.waterline.length,
      phase: rand() * Math.PI * 2,
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
