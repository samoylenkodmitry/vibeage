import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import type { Points, ShaderMaterial } from 'three';
import { computeDayPhase } from './timeOfDay';

/**
 * Drei `<Stars>` faded against the day/night cycle. Stars hold
 * full intensity at night and fade out by midday. The vibe
 * complements the existing big moon without competing.
 *
 * Drei's StarfieldMaterial is a ShaderMaterial without an opacity
 * uniform — setting `material.opacity` directly does nothing
 * because the shader hardcodes `gl_FragColor = vec4(vColor,
 * opacity)` from a sigmoid. The first mount monkey-patches the
 * fragment shader to multiply the final alpha by a new `dayFade`
 * uniform; each frame we set that uniform from the sun direction.
 *
 * `computeDayPhase(Date.now())` is also called by `WorldEnvironment`
 * every frame; the cost is tiny (handful of lerps) so re-evaluating
 * here keeps `NightStars` self-contained without a context/ref
 * wire-up.
 */
export function NightStars() {
  const pointsRef = useRef<Points>(null);
  useEffect(() => {
    const points = pointsRef.current;
    if (!points) return;
    patchStarMaterial(points.material as ShaderMaterial);
  }, []);
  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const material = points.material as ShaderMaterial;
    const palette = computeDayPhase(Date.now());
    const nightness = clamp(1 - smoothstep(-0.05, 0.18, palette.sunDir.y), 0, 1);
    if (material.uniforms?.dayFade) material.uniforms.dayFade.value = nightness;
    points.visible = nightness > 0.01;
  });
  return (
    <Stars
      ref={pointsRef}
      radius={520}
      depth={120}
      count={6500}
      factor={6.0}
      saturation={0.55}
      fade
      speed={0.4}
    />
  );
}

function patchStarMaterial(material: ShaderMaterial): void {
  if (material.uniforms?.dayFade) return;
  material.uniforms.dayFade = { value: 1 };
  material.fragmentShader = `uniform float dayFade;\n${material.fragmentShader}`.replace(
    'gl_FragColor = vec4(vColor, opacity);',
    'gl_FragColor = vec4(vColor, opacity * dayFade);',
  );
  material.transparent = true;
  material.needsUpdate = true;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
