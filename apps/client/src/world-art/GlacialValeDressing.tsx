import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLACIAL_VALE } from '../../../../packages/content/terrain';
import { seededRandom } from './foliageScatter';
import { GlacialValeTerrain } from './GlacialValeTerrain';

/**
 * Glacial Vale mount gate + snowfall. The terrain/water/grass/pebbles/
 * boulders are the ported deedy/glacial-valley pipeline (GlacialValeTerrain);
 * this wrapper mounts it when the player is near and adds drifting snow.
 */
const MOUNT_DISTANCE = 1_600;
const SNOW_COUNT = 340;
const SNOW_TOP = 60;

export function GlacialValeDressing({ focus }: { focus: { x: number; z: number } }) {
  const inRange = Math.hypot(focus.x - GLACIAL_VALE.x, focus.z - GLACIAL_VALE.z) < MOUNT_DISTANCE;
  if (!inRange) return null;
  return <ValeInner />;
}

function ValeInner() {
  return (
    <group>
      {/* per-pixel ground/water/boulders ported from the reference */}
      <GlacialValeTerrain />
      <Snowfall />
    </group>
  );
}


/** Slow drifting snowfall over the valley floor. */
function Snowfall() {
  const sim = useMemo(() => {
    const random = seededRandom(0x50, 0xfa11);
    const flakes = Array.from({ length: SNOW_COUNT }, () => ({
      u: (random() - 0.5) * 760,
      v: (random() - 0.5) * 480,
      y: random() * SNOW_TOP,
      speed: 0.9 + random() * 1.3,
      phase: random() * Math.PI * 2,
    }));
    return { flakes, positions: new Float32Array(SNOW_COUNT * 3) };
  }, []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    for (let i = 0; i < sim.flakes.length; i += 1) {
      const f = sim.flakes[i];
      f.y -= f.speed * dt;
      if (f.y < 0) f.y += SNOW_TOP;
      const sway = Math.sin(t * 0.7 + f.phase) * 2.2;
      const x = GLACIAL_VALE.x + (f.u + sway) * GLACIAL_VALE.cos - f.v * GLACIAL_VALE.sin;
      const z = GLACIAL_VALE.z + (f.u + sway) * GLACIAL_VALE.sin + f.v * GLACIAL_VALE.cos;
      sim.positions[i * 3] = x;
      // Absolute world Y: the valley floor sits near 0, so flakes span the
      // 0..SNOW_TOP air column above it (walls are dressed by the snowline).
      sim.positions[i * 3 + 1] = f.y;
      sim.positions[i * 3 + 2] = z;
    }
    const g = geometryRef.current;
    if (g) g.attributes.position.needsUpdate = true;
  });
  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[sim.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f4f8ff" size={0.22} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

