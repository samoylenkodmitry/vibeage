import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Two small white seagull silhouettes lazily orbiting the cozy
 * waterline at low altitude. Each gull is a tiny wedge (cone)
 * with subtle wing flap (z-rotation). Together with the global
 * BirdFlock at dawn/dusk and the fireflies at night, this fills
 * the daytime sky over the water.
 */
const GULL_COUNT = 2;
const ORBIT_HEIGHT = 18;
const ORBIT_RADIUS = 110;
const ORBIT_SPEED = 0.08; // rad/s
const GULL_SCALE = 1.8;
const GULL_COLOR = '#f6f4ec';
const FLAP_HZ = 4.0;

type Gull = {
  phaseOffset: number;
  flapSeed: number;
};

export function CozySeagulls({ scene }: { scene: WorldArtScene }) {
  const gulls = useMemo<Gull[]>(() => {
    return Array.from({ length: GULL_COUNT }, (_, i) => ({
      phaseOffset: (i / GULL_COUNT) * Math.PI * 2,
      flapSeed: i * 1.1,
    }));
  }, []);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const cx = scene.waterline.x;
  const cz = scene.waterline.z;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < gulls.length; i += 1) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const angle = t * ORBIT_SPEED + gulls[i].phaseOffset;
      g.position.set(
        cx + Math.cos(angle) * ORBIT_RADIUS,
        ORBIT_HEIGHT + Math.sin(t * 0.4 + gulls[i].flapSeed) * 1.2,
        cz + Math.sin(angle) * ORBIT_RADIUS,
      );
      g.rotation.y = -angle + Math.PI / 2;
      g.rotation.z = Math.sin(t * FLAP_HZ + gulls[i].flapSeed) * 0.35;
    }
  });
  return (
    <group raycast={() => null}>
      {gulls.map((_, i) => (
        <group
          key={`${scene.id}-gull-${i}`}
          ref={(g) => { groupRefs.current[i] = g; }}
          scale={GULL_SCALE}
        >
          <mesh>
            <coneGeometry args={[0.6, 0.16, 4, 1]} />
            <meshBasicMaterial color={GULL_COLOR} fog={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
