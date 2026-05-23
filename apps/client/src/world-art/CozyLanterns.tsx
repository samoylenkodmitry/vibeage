import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Procedural lanterns at every `lantern`-tagged authored prop.
 * Each lantern is a small emissive sphere (the visible glow) +
 * a point-light with gentle two-frequency flicker — the same
 * recipe as CozyBonfireGlow but smaller, cooler, more refined,
 * since lanterns aren't bonfires.
 *
 * No GLB: the lantern reads from a long distance as a single
 * warm dot of light, so geometry detail doesn't help. The
 * emissive sphere bypasses lighting (fog-independent) and the
 * point light pools warmth onto the surrounding wood.
 */
const FLICKER_BASE = 1.0;
const FLICKER_AMPLITUDE = 0.18;
const FLICKER_HZ_PRIMARY = 4.2;
const FLICKER_HZ_SECONDARY = 7.7;
const FLICKER_DISTANCE = 18;
const LANTERN_COLOR = '#ffd896';
const GLOW_COLOR = '#fff1c8';

export function CozyLanterns({ scene }: { scene: WorldArtScene }) {
  const lanterns = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'lantern')
      .map((p) => ({
        x: scene.origin.x + p.position.x,
        y: p.position.y,
        z: scene.origin.z + p.position.z,
        scale: p.scale,
      }));
  }, [scene]);
  if (lanterns.length === 0) return null;
  return (
    <>
      {lanterns.map((l, i) => (
        <Lantern key={`${scene.id}-lantern-${i}`} x={l.x} y={l.y} z={l.z} scale={l.scale} seed={i} />
      ))}
    </>
  );
}

function Lantern({ x, y, z, scale, seed }: { x: number; y: number; z: number; scale: number; seed: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed * 0.91;
    const primary = Math.sin(t * FLICKER_HZ_PRIMARY);
    const secondary = Math.sin(t * FLICKER_HZ_SECONDARY + 0.6);
    const wobble = primary * 0.65 + secondary * 0.35;
    const intensity = FLICKER_BASE + wobble * FLICKER_AMPLITUDE;
    if (lightRef.current) lightRef.current.intensity = intensity;
    if (glowMatRef.current) glowMatRef.current.opacity = 0.55 + wobble * 0.12;
  });
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.18, 12, 8]} />
        <meshBasicMaterial
          ref={glowMatRef}
          color={GLOW_COLOR}
          transparent
          opacity={0.6}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color={LANTERN_COLOR}
        intensity={FLICKER_BASE}
        distance={FLICKER_DISTANCE}
        decay={1.8}
        castShadow={false}
      />
    </group>
  );
}
