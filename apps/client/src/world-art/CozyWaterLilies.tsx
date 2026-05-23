import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Drifting lily pads (and the occasional lotus center) floating on
 * the cozy water surface. Cheap discs that bob and slowly rotate;
 * deterministic seed off the scene id so placements are stable.
 *
 * Each pad is its own small mesh so we can apply per-pad rotation
 * and a tiny vertical bob; instancing would force shared transforms
 * and lose the rocking animation that makes the scene feel alive.
 */
const COUNT = 9;
const BOB_AMPLITUDE = 0.06;
const BOB_HZ = 0.55;
const SPIN_RAD_PER_SEC = 0.08;
const LILY_COLOR = '#3e7a3a';
const LOTUS_CENTER_COLOR = '#f5b8d0';

type Lily = {
  x: number;
  z: number;
  baseY: number;
  radius: number;
  rotationY: number;
  bobPhase: number;
  hasLotus: boolean;
};

export function CozyWaterLilies({ scene }: { scene: WorldArtScene }) {
  const lilies = useMemo<Lily[]>(() => makeLilies(scene), [scene]);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < lilies.length; i += 1) {
      const group = groupRefs.current[i];
      if (!group) continue;
      const lily = lilies[i];
      group.position.y = lily.baseY + Math.sin(t * BOB_HZ + lily.bobPhase) * BOB_AMPLITUDE;
      group.rotation.y = lily.rotationY + t * SPIN_RAD_PER_SEC * (i % 2 === 0 ? 1 : -1);
    }
  });
  return (
    <group raycast={() => null}>
      {lilies.map((lily, i) => (
        <group
          key={`${scene.id}-lily-${i}`}
          ref={(g) => { groupRefs.current[i] = g; }}
          position={[lily.x, lily.baseY, lily.z]}
          rotation={[0, lily.rotationY, 0]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow={false} receiveShadow={false}>
            <circleGeometry args={[lily.radius, 10]} />
            <meshStandardMaterial color={LILY_COLOR} roughness={0.92} metalness={0.04} transparent depthWrite={false} opacity={0.92} />
          </mesh>
          {lily.hasLotus && (
            <mesh position={[lily.radius * 0.2, 0.05, 0]} castShadow={false} receiveShadow={false}>
              <sphereGeometry args={[lily.radius * 0.18, 8, 6]} />
              <meshStandardMaterial color={LOTUS_CENTER_COLOR} roughness={0.6} metalness={0} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function makeLilies(scene: WorldArtScene): Lily[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 6151));
  const out: Lily[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    // Cluster in the inner half of the waterline, away from the
    // shore foam strip so they don't z-fight with it.
    const u = 0.3 + rand() * 0.55;
    const v = 0.05 + rand() * 0.9;
    const x = scene.waterline.x + (u - 0.5) * scene.waterline.width;
    const z = scene.waterline.z + (v - 0.5) * scene.waterline.length;
    out.push({
      x,
      z,
      baseY: -0.05,
      radius: 0.85 + rand() * 0.7,
      rotationY: rand() * Math.PI * 2,
      bobPhase: rand() * Math.PI * 2,
      hasLotus: rand() < 0.3,
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
