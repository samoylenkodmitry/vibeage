import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Emissive flame cones above each bonfire — the visible "fire"
 * a player sees from a distance. CozyBonfireGlow already paints
 * the warm light; this is the wedge of orange in the middle of
 * the campfire pit.
 *
 * Two stacked cones (taller inner + shorter outer) pulse + lean
 * with the same two-frequency flicker as the glow light. fog
 * disabled so the flame stays bright through distance fog.
 */
const FLAME_BASE_HEIGHT = 1.3;
const FLAME_AMPLITUDE = 0.18;
const FLAME_PRIMARY_RAD_PER_SEC = 6.0;
const FLAME_SECONDARY_RAD_PER_SEC = 11.5;
const FLAME_OUTER_COLOR = '#ffb255';
const FLAME_INNER_COLOR = '#fff4c4';

export function CozyBonfireFlame({ scene }: { scene: WorldArtScene }) {
  const positions = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'bonfire')
      .map((p) => ({
        x: scene.origin.x + p.position.x,
        y: p.position.y + 0.5,
        z: scene.origin.z + p.position.z,
      }));
  }, [scene]);
  if (positions.length === 0) return null;
  return (
    <>
      {positions.map((pos, i) => (
        <FlameStack key={`${scene.id}-flame-${i}`} pos={pos} seed={i} />
      ))}
    </>
  );
}

function FlameStack({ pos, seed }: { pos: { x: number; y: number; z: number }; seed: number }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed * 0.81;
    const primary = Math.sin(t * FLAME_PRIMARY_RAD_PER_SEC);
    const secondary = Math.sin(t * FLAME_SECONDARY_RAD_PER_SEC + 1.2);
    const wobble = primary * 0.7 + secondary * 0.3;
    const stretch = 1 + wobble * FLAME_AMPLITUDE;
    if (outerRef.current) {
      outerRef.current.scale.set(1, stretch, 1);
      outerRef.current.rotation.z = primary * 0.06;
    }
    if (innerRef.current) {
      innerRef.current.scale.set(1, stretch * 1.05, 1);
      innerRef.current.rotation.z = secondary * 0.04;
    }
  });
  return (
    <group position={[pos.x, pos.y, pos.z]} raycast={() => null}>
      <mesh ref={outerRef}>
        <coneGeometry args={[0.42, FLAME_BASE_HEIGHT, 8, 1, true]} />
        <meshBasicMaterial color={FLAME_OUTER_COLOR} transparent opacity={0.92} fog={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={innerRef} position={[0, 0.05, 0]}>
        <coneGeometry args={[0.22, FLAME_BASE_HEIGHT * 0.75, 6, 1, true]} />
        <meshBasicMaterial color={FLAME_INNER_COLOR} transparent opacity={0.95} fog={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
