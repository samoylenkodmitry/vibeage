import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from './timeOfDay';
import type { Vec3D } from '../../../packages/protocol/messages';

/**
 * Distant bird silhouettes crossing the sky at dawn and dusk.
 * Each bird is a tiny wedge mesh; the flock translates as a
 * group across a wide arc with subtle V formation offsets.
 * Visible only when `sunDir.y` is near the horizon — the cue is
 * "morning has come" / "evening is closing in".
 *
 * Cheap: ~7 small meshes per flock; geometry is a flat wedge.
 * The whole thing lives outside the cozy hero scene so it shows
 * up in every biome.
 */
const FLOCK_SIZE = 7;
const FLY_SPEED = 20;
const ALTITUDE = 110;
const FLY_RADIUS = 460;
const BIRD_SCALE = 2.2;
const BIRD_COLOR = '#262830';
const WING_FLAP_HZ = 3.4;

type Bird = {
  offsetX: number;
  offsetZ: number;
  offsetY: number;
  flapPhase: number;
};

export function BirdFlock({ focus }: { focus: Vec3D }) {
  const birds = useMemo<Bird[]>(() => makeFlock(), []);
  const groupRef = useRef<THREE.Group>(null);
  const birdRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const palette = computeDayPhase(Date.now());
    // Visible only at horizon-crossing phases. Smoothstep keeps
    // the fade graceful.
    const horizonNess = 1 - smoothstep(0.05, 0.32, Math.abs(palette.sunDir.y));
    const group = groupRef.current;
    if (!group) return;
    group.visible = horizonNess > 0.02;
    if (!group.visible) return;

    // The flock orbits the focus slowly at altitude.
    const t = clock.elapsedTime;
    const angle = (t * FLY_SPEED) / FLY_RADIUS;
    group.position.set(
      focus.x + Math.cos(angle) * FLY_RADIUS,
      ALTITUDE + Math.sin(t * 0.2) * 6,
      focus.z + Math.sin(angle) * FLY_RADIUS,
    );
    // Yaw tangent to the orbit.
    group.rotation.y = -angle + Math.PI / 2;

    for (let i = 0; i < birds.length; i += 1) {
      const mesh = birdRefs.current[i];
      if (!mesh) continue;
      const flap = Math.sin(t * WING_FLAP_HZ + birds[i].flapPhase);
      // Tilt the wedge slightly to simulate wing flap.
      mesh.rotation.z = flap * 0.35;
    }
  });

  return (
    <group ref={groupRef} visible={false} raycast={() => null}>
      {birds.map((b, i) => (
        <mesh
          key={`bird-${i}`}
          ref={(m) => { birdRefs.current[i] = m; }}
          position={[b.offsetX, b.offsetY, b.offsetZ]}
          scale={BIRD_SCALE}
        >
          {/* Flat wedge: a stretched triangular plane reads as a
             tiny bird silhouette at altitude. */}
          <coneGeometry args={[0.6, 0.18, 4, 1]} />
          <meshBasicMaterial color={BIRD_COLOR} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

function makeFlock(): Bird[] {
  const out: Bird[] = [];
  // Simple V formation: lead bird at index 0, two wings receding.
  for (let i = 0; i < FLOCK_SIZE; i += 1) {
    const side = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1);
    const rank = Math.ceil(i / 2);
    out.push({
      offsetX: rank * 1.6,
      offsetZ: side * rank * 1.4,
      offsetY: -rank * 0.2,
      flapPhase: (i * 0.7) % (Math.PI * 2),
    });
  }
  return out;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
