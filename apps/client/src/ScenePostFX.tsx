import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, FXAA, GodRays, Vignette, HueSaturation, BrightnessContrast, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type * as THREE from 'three';
import type { WorldArtQuality } from './world-art/quality';

/**
 * Post-processing stack. Real bloom so every emissive thing (the sun halo,
 * moon, crystal/lava glows, telegraph rings, fireflies, emissive entities)
 * actually blooms, then ADAPTIVE tone mapping (eye adaptation), then a gentle
 * painterly colour grade — a touch more saturation and contrast so the cozy
 * palette reads richer — and a soft edge vignette to seat the eye on the centre.
 * The grade is kept subtle and hue-neutral so it lifts the image without
 * fighting WorldEnvironment's day-phase tinting (warm dawn/dusk, cool night).
 *
 * Eye adaptation: the EffectComposer disables the renderer's tone mapping while
 * mounted, so without an explicit operator the HDR sky just clips to white.
 * `ToneMappingMode.REINHARD2_ADAPTIVE` tracks the scene's average luminance in a
 * downsampled texture and eases exposure toward it over time — so looking up at
 * a bright sky tones the frame down and a dark cave/night brightens up, like
 * eyes adjusting. Runs AFTER bloom (bloom still pulls true HDR highlights) and
 * BEFORE the LDR grade. `minLuminance` caps how far the night brightens so it
 * keeps its mood; `whitePoint` gives the bright sky headroom before it whites
 * out. Bloom sits in front, so it works on the HDR highlights pre-exposure.
 *
 * Gated to the device quality tier (see world-art/quality.ts):
 *   high   → 4× MSAA + full mipmap bloom + adaptive tone map + grade + vignette
 *   medium → SMAA (no MSAA at this tier) + lighter bloom + adaptive tone map + grade
 *   low    → nothing (composer not mounted; cheapest path)
 *
 * `luminanceThreshold` is high-ish so only genuinely bright/emissive pixels
 * bloom — lit terrain + props stay crisp, they don't smear.
 */
export function ScenePostFX({ quality, sunMesh }: { quality: WorldArtQuality; sunMesh?: THREE.Mesh | null }) {
  // GPU CONTEXT-LOSS GUARD: when the WebGL context dies, the postprocessing
  // EffectComposer reads `gl.getContextAttributes()` (null on a dead context)
  // during construction — `.alpha` then crashed the whole client behind the
  // GameErrorBoundary on remount. Unmount the composer while the context is
  // lost; remount when the browser restores it.
  const gl = useThree((state) => state.gl);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    const el = gl.domElement;
    const onLost = () => setContextLost(true);
    const onRestored = () => setContextLost(false);
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', onRestored);
    return () => {
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl]);
  if (contextLost || gl.getContext()?.getContextAttributes?.() == null) return null;
  // Low (phones): a composer-LITE — FXAA (one cheap pass; the canvas has no
  // MSAA anymore, so without it phone edges staircase) + a fixed Reinhard2
  // tone map (the composer disables renderer tone mapping, and low otherwise
  // renders the HDR-ish sky raw — the washed-out giant sun). No bloom, no
  // adaptive exposure, no god rays: one full-res FBO + two fragment passes.
  if (quality === 'low') {
    return (
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <FXAA />
        {/* ADAPTIVE, like med/high — the fixed operator rendered night at true
            scene luminance ≈ black ("at night nothing is visible"); adaptation
            is what lifts dark scenes into legibility. 128px luminance chain
            keeps it phone-cheap. */}
        <ToneMapping
          mode={ToneMappingMode.REINHARD2_ADAPTIVE}
          resolution={128}
          adaptationRate={1.5}
          middleGrey={0.6}
          whitePoint={8.0}
          minLuminance={0.08}
        />
      </EffectComposer>
    );
  }
  const high = quality === 'high';
  return (
    <EffectComposer enableNormalPass={false} multisampling={high ? 4 : 0}>
      {/* Medium has no MSAA — SMAA cleans the silhouettes (grass blades, tree
          edges) for cheap. High already has 4× MSAA, so skip the extra pass. */}
      {high ? <></> : <SMAA />}
      {/* Crysis-style crepuscular shafts radiating from the sun disc. The mesh
          arrives via state one frame after WorldEnvironment mounts (the effect
          needs the real mesh at construction), so the composer rebuilds once.
          Subtle weight/exposure: shafts read through trees and over ridges at
          low sun without washing out midday. Below the horizon the disc is
          fully occluded → the rays vanish on their own at night. */}
      {sunMesh && (
        <GodRays
          sun={sunMesh}
          samples={high ? 44 : 26}
          density={0.92}
          decay={0.94}
          weight={0.24}
          exposure={0.3}
          clampMax={0.95}
          blur
        />
      )}
      <Bloom
        intensity={high ? 0.62 : 0.42}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.16}
        mipmapBlur
      />
      <ToneMapping
        mode={ToneMappingMode.REINHARD2_ADAPTIVE}
        resolution={256}
        adaptationRate={1.5}
        middleGrey={0.6}
        whitePoint={8.0}
        minLuminance={0.08}
      />
      <HueSaturation hue={0} saturation={high ? 0.12 : 0.09} />
      <BrightnessContrast brightness={0.0} contrast={high ? 0.08 : 0.06} />
      {high ? (
        <Vignette offset={0.55} darkness={0.26} eskil={false} />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}
