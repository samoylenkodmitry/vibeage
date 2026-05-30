import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { WorldArtQuality } from './world-art/quality';

/**
 * Post-processing stack — real bloom so every emissive thing (the sun
 * halo, moon, crystal/lava glows, telegraph rings, fireflies, and the
 * emissive entities) actually blooms instead of being faked with extra
 * geometry, plus a gentle edge vignette to seat the eye on the centre.
 *
 * Gated to the device quality tier (see world-art/quality.ts):
 *   high   → full mipmap bloom + vignette
 *   medium → lighter, cheaper bloom, no vignette
 *   low    → nothing (composer not mounted; cheapest path)
 *
 * `luminanceThreshold` is high-ish so only genuinely bright/emissive
 * pixels bloom — lit terrain + props stay crisp, they don't smear.
 */
export function ScenePostFX({ quality }: { quality: WorldArtQuality }) {
  if (quality === 'low') return null;
  const high = quality === 'high';
  return (
    <EffectComposer enableNormalPass={false} multisampling={high ? 4 : 0}>
      <Bloom
        intensity={high ? 0.62 : 0.42}
        luminanceThreshold={0.62}
        luminanceSmoothing={0.16}
        mipmapBlur
      />
      {high ? (
        <Vignette offset={0.55} darkness={0.26} eskil={false} />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}
