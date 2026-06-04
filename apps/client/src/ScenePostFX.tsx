import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast, SMAA } from '@react-three/postprocessing';
import type { WorldArtQuality } from './world-art/quality';

/**
 * Post-processing stack. Real bloom so every emissive thing (the sun halo,
 * moon, crystal/lava glows, telegraph rings, fireflies, emissive entities)
 * actually blooms, plus a gentle painterly colour grade — a touch more
 * saturation and contrast so the cozy palette reads richer — and a soft edge
 * vignette to seat the eye on the centre. The grade is kept subtle and
 * hue-neutral so it lifts the image without fighting WorldEnvironment's
 * day-phase tinting (warm dawn/dusk, cool moonlit night).
 *
 * Gated to the device quality tier (see world-art/quality.ts):
 *   high   → 4× MSAA + full mipmap bloom + grade + vignette
 *   medium → SMAA (no MSAA at this tier) + lighter bloom + grade
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
