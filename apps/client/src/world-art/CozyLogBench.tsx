import { useMemo } from 'react';
import type { WorldArtScene } from './worldArtScenes';

/**
 * A single thick log laid horizontally near each bonfire — the
 * "pull up a seat" cue. Procedural cylinder rotated to lie on
 * its side; placed opposite the firewood stack so the bonfire
 * reads as a small gathering spot.
 */
const LOG_LENGTH = 3.2;
const LOG_RADIUS = 0.34;
const LOG_COLOR = '#8a6a45';
const BENCH_OFFSET = { x: -2.0, z: 1.4 };

export function CozyLogBench({ scene }: { scene: WorldArtScene }) {
  const positions = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'bonfire')
      .map((p) => ({
        x: scene.origin.x + p.position.x + BENCH_OFFSET.x,
        y: LOG_RADIUS,
        z: scene.origin.z + p.position.z + BENCH_OFFSET.z,
      }));
  }, [scene]);
  if (positions.length === 0) return null;
  return (
    <group raycast={() => null}>
      {positions.map((pos, i) => (
        <mesh
          key={`${scene.id}-bench-${i}`}
          position={[pos.x, pos.y, pos.z]}
          rotation={[0, Math.PI / 6, Math.PI / 2]}
          castShadow={false}
          receiveShadow={false}
        >
          <cylinderGeometry args={[LOG_RADIUS, LOG_RADIUS, LOG_LENGTH, 8]} />
          <meshStandardMaterial color={LOG_COLOR} roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
