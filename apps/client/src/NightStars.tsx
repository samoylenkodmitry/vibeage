import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import type { Points, ShaderMaterial } from 'three';
import { computeDayPhase } from './timeOfDay';

/**
 * Drei `<Stars>` faded against the day/night cycle. Stars hold
 * full intensity at night, dim as the sun rises, and disappear
 * by midday. The vibe is the same "MMO night sky" silhouettes
 * the player already gets from the big moon — stars add depth
 * without competing.
 *
 * Implementation: Drei's `Stars` doesn't expose an opacity prop,
 * so we ref the underlying `Points` and modulate its
 * ShaderMaterial's `opacity` uniform every frame (the material
 * is internally transparent already). When the sun is up the
 * stars are effectively invisible; the renderer still skips
 * them because of the alpha threshold.
 */
export function NightStars() {
  const pointsRef = useRef<Points>(null);
  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const material = points.material as ShaderMaterial;
    const palette = computeDayPhase(Date.now());
    // sunDir.y above 0 = sun up; below = sun down. Map to 0..1
    // with a small overlap window so the fade isn't a hard cut.
    const nightness = clamp(1 - smoothstep(-0.05, 0.18, palette.sunDir.y), 0, 1);
    if (material.opacity !== undefined) material.opacity = nightness;
    if (material.uniforms?.fade) material.uniforms.fade.value = nightness > 0.05;
  });
  return (
    <Stars
      ref={pointsRef}
      radius={520}
      depth={120}
      count={4000}
      factor={5.5}
      saturation={0.3}
      fade
      speed={0.4}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
