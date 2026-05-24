import { useMemo } from 'react';
import type { WorldArtScene } from './worldArtScenes';

/**
 * A handful of weathered driftwood logs scattered along the
 * cozy sand band. Cheap procedural cylinders (no GLB) with
 * a slight pitch + roll per log so they read as washed up.
 *
 * Deterministic per-scene seed so the same logs return after
 * a reload.
 */
const COUNT = 6;
const LOG_COLOR = '#7c5b3b';

type Log = {
  x: number;
  z: number;
  length: number;
  radius: number;
  yawRad: number;
  pitchRad: number;
};

export function CozyDriftwood({ scene }: { scene: WorldArtScene }) {
  const logs = useMemo<Log[]>(() => makeLogs(scene), [scene]);
  return (
    <group raycast={() => null}>
      {logs.map((log, i) => (
        <mesh
          key={`${scene.id}-drift-${i}`}
          position={[log.x, log.radius * 0.6, log.z]}
          rotation={[log.pitchRad, log.yawRad, Math.PI / 2]}
          castShadow={false}
          receiveShadow={false}
        >
          <cylinderGeometry args={[log.radius, log.radius * 0.85, log.length, 8]} />
          <meshStandardMaterial color={LOG_COLOR} roughness={0.92} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

function makeLogs(scene: WorldArtScene): Log[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 5077));
  const out: Log[] = [];
  const beachX = scene.waterline.x + scene.waterline.width / 2 + 16;
  for (let i = 0; i < COUNT; i += 1) {
    out.push({
      x: beachX + (rand() - 0.5) * 28,
      z: scene.waterline.z - scene.waterline.length / 2 + rand() * scene.waterline.length,
      length: 2.4 + rand() * 2.2,
      radius: 0.22 + rand() * 0.15,
      yawRad: rand() * Math.PI * 2,
      pitchRad: (rand() - 0.5) * 0.18,
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
