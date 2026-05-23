import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Warm flickering point-light at every `bonfire`-tagged authored
 * prop in the scene. The bonfire GLB itself is static geometry —
 * adding a real light makes the campfire feel alive and pools
 * warm light onto the surrounding sand at night, which the
 * day/night palette in `WorldEnvironment` then modulates.
 *
 * No emissive billboard yet — the Quaternius bonfire model
 * already paints a flame mesh on top of the logs; doubling it
 * with a sprite would look stacked. The light alone is the
 * difference between "wood pile" and "you're invited".
 */
const FLICKER_BASE = 2.4;
const FLICKER_AMPLITUDE = 0.7;
// Angular frequencies in rad/s (multiplied directly with the
// elapsed-time seconds). ~6 rad/s ≈ 0.95 Hz reads as a calm
// campfire wobble; ~11.5 rad/s ≈ 1.83 Hz adds the small twitch
// on top.
const FLICKER_PRIMARY_RAD_PER_SEC = 6.0;
const FLICKER_SECONDARY_RAD_PER_SEC = 11.5;
const FLICKER_DISTANCE = 48;
const FLICKER_COLOR = '#ffb462';

export function CozyBonfireGlow({ scene }: { scene: WorldArtScene }) {
  const bonfirePositions = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'bonfire')
      .map((p) => ({
        x: scene.origin.x + p.position.x,
        y: p.position.y + 1.2,
        z: scene.origin.z + p.position.z,
      }));
  }, [scene]);
  if (bonfirePositions.length === 0) return null;
  return (
    <>
      {bonfirePositions.map((pos, i) => (
        <FlickerLight key={`${scene.id}-bonfire-${i}`} x={pos.x} y={pos.y} z={pos.z} seed={i} />
      ))}
    </>
  );
}

function FlickerLight({ x, y, z, seed }: { x: number; y: number; z: number; seed: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const light = lightRef.current;
    if (!light) return;
    const t = clock.elapsedTime + seed * 1.37;
    // Two unrelated frequencies summed gives a believable flame
    // wobble.
    const primary = Math.sin(t * FLICKER_PRIMARY_RAD_PER_SEC);
    const secondary = Math.sin(t * FLICKER_SECONDARY_RAD_PER_SEC + 1.8);
    const wobble = primary * 0.7 + secondary * 0.3;
    light.intensity = FLICKER_BASE + wobble * FLICKER_AMPLITUDE;
  });
  return (
    <pointLight
      ref={lightRef}
      position={[x, y, z]}
      color={FLICKER_COLOR}
      intensity={FLICKER_BASE}
      distance={FLICKER_DISTANCE}
      decay={1.6}
      castShadow={false}
    />
  );
}
