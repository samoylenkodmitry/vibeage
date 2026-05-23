import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import type { Points, ShaderMaterial } from 'three';
import { computeDayPhase } from '../timeOfDay';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Drei `<Sparkles>` floating just above the cozy water surface,
 * fading in at dusk and brighter at deep night. Reads as moonlit
 * shimmer without a full reflective water shader — the cozy
 * water plane is solid color and won't reflect anyway, so the
 * "moon path" gets supplied by these particles instead.
 *
 * Like the firefly layer, the day/night fade is implemented by
 * patching the sparkle material's fragment shader once with a
 * `dayFade` uniform that multiplies the final alpha. Drei
 * doesn't expose an opacity prop strong enough to be visible-
 * vs-invisible.
 */
export function CozyWaterSparkles({ scene }: { scene: WorldArtScene }) {
  const pointsRef = useRef<Points>(null);
  useEffect(() => {
    const points = pointsRef.current;
    if (!points) return;
    patchSparkleMaterial(points.material as ShaderMaterial);
  }, []);
  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const material = points.material as ShaderMaterial;
    const palette = computeDayPhase(Date.now());
    const nightness = clamp(1 - smoothstep(-0.05, 0.20, palette.sunDir.y), 0, 1);
    if (material.uniforms?.dayFade) material.uniforms.dayFade.value = nightness;
    points.visible = nightness > 0.01;
  });
  const scale = useMemo<[number, number, number]>(
    () => [scene.waterline.width, 0.8, scene.waterline.length],
    [scene.waterline.width, scene.waterline.length],
  );
  return (
    <Sparkles
      ref={pointsRef}
      position={[scene.waterline.x, 0.4, scene.waterline.z]}
      count={120}
      scale={scale}
      size={2.2}
      speed={0.4}
      color="#fffacd"
      noise={0.18}
    />
  );
}

function patchSparkleMaterial(material: ShaderMaterial): void {
  if (material.uniforms?.dayFade) return;
  material.uniforms.dayFade = { value: 1 };
  material.fragmentShader = `uniform float dayFade;\n${material.fragmentShader}`.replace(
    /gl_FragColor\s*=\s*([^;]+);/,
    'gl_FragColor = $1; gl_FragColor.a *= dayFade;',
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
