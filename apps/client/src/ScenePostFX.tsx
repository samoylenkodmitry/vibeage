import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
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
export function ScenePostFX({ quality }: { quality: WorldArtQuality }) {
  if (quality === 'low') return null;
  const high = quality === 'high';
  return (
    <EffectComposer enableNormalPass={false} multisampling={high ? 4 : 0}>
      {/* Medium has no MSAA — SMAA cleans the silhouettes (grass blades, tree
          edges) for cheap. High already has 4× MSAA, so skip the extra pass. */}
      {high ? <></> : <SMAA />}
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
