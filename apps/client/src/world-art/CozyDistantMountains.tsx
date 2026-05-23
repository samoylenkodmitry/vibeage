import { useMemo } from 'react';
import type { WorldArtScene } from './worldArtScenes';

/**
 * A ring of low-poly mountain silhouettes parked at the cozy
 * scene's far horizon. Cheap, static, fog-friendly — the dark
 * mass anchors the beach as "you're on a coast looking at distant
 * land" rather than "you're on the edge of a void".
 *
 * Geometry: 11 wide cones laid out in an arc on the water side
 * of the cozy scene (negative X across the waterline). Each cone
 * is a separate mesh so we keep the per-mountain rotation +
 * uneven scale — instancing would force uniform geometry and
 * read as comb-teeth.
 *
 * Performance: 11 cones × meshStandardMaterial is well under the
 * draw-call budget. fog=true is intentional so they fade into the
 * existing WorldEnvironment fog band at sunrise/sunset.
 */
const MOUNTAIN_RING_RADIUS = 720;
const MOUNTAIN_BASE_Y = -8;
const MOUNTAIN_COLOR = '#36475a';

type Mountain = {
  x: number;
  z: number;
  height: number;
  baseRadius: number;
  rotationY: number;
};

export function CozyDistantMountains({ scene }: { scene: WorldArtScene }) {
  const mountains = useMemo(() => makeMountains(scene), [scene]);
  return (
    <group raycast={() => null}>
      {mountains.map((m, i) => (
        <mesh
          key={`${scene.id}-mt-${i}`}
          position={[m.x, MOUNTAIN_BASE_Y + m.height / 2, m.z]}
          rotation={[0, m.rotationY, 0]}
          castShadow={false}
          receiveShadow={false}
        >
          <coneGeometry args={[m.baseRadius, m.height, 6, 1]} />
          <meshStandardMaterial color={MOUNTAIN_COLOR} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function makeMountains(scene: WorldArtScene): Mountain[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 7919));
  const mountains: Mountain[] = [];
  // Arc spans 200° centered on the negative-X horizon (the water
  // side, where the player's gaze rests). Land-side is left bare
  // so the forest silhouettes stay the dominant feature there.
  const arcStartDeg = 180 - 100;
  const arcEndDeg = 180 + 100;
  const count = 11;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const angleDeg = arcStartDeg + t * (arcEndDeg - arcStartDeg) + (rand() - 0.5) * 6;
    const angle = (angleDeg * Math.PI) / 180;
    const radius = MOUNTAIN_RING_RADIUS + (rand() - 0.5) * 90;
    mountains.push({
      x: scene.origin.x + Math.cos(angle) * radius,
      z: scene.origin.z + Math.sin(angle) * radius,
      height: 140 + rand() * 110,
      baseRadius: 60 + rand() * 50,
      rotationY: rand() * Math.PI * 2,
    });
  }
  return mountains;
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
