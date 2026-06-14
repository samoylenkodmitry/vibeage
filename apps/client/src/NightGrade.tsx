import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HueSaturationEffect } from 'postprocessing';
import { computeDayPhase, nightFactorFromSunDir } from './timeOfDay';

/**
 * Night colour grade — drives a post `HueSaturationEffect`'s saturation down as
 * the sun sets so the world mutes to MOONLIGHT after dark instead of staying
 * daytime-vivid under the (already blue) night lighting.
 *
 * Kept GENTLE on purpose: the night lighting is already cool/blue, and the
 * "cool" the look wants comes from that blue. Over-desaturating just greys it
 * out (kills the cool), so we only take the daytime saturation lift away and
 * dip a little below neutral — enough to read as muted moonlight while the blue
 * lighting keeps it cool.
 *
 * Renders nothing: it just mutates the effect's `saturation` each tick (no JSX
 * change), so the EffectComposer never rebuilds its passes. Reads the day phase
 * from the same `computeDayPhase(Date.now())` the world's lighting uses, so the
 * grade tracks the sky exactly. Throttled — the phase shifts over minutes.
 */
const NIGHT_SATURATION = -0.2; // deep-night saturation target (muted, still cool-blue)

export function NightGrade({ hueSat, daySaturation }: {
  hueSat: RefObject<HueSaturationEffect | null>;
  daySaturation: number;
}) {
  const acc = useRef(0.2); // run on the first frame
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.1) return; // ~10 Hz; the day phase changes over minutes
    acc.current = 0;
    const effect = hueSat.current;
    if (!effect) return;
    const nf = nightFactorFromSunDir(computeDayPhase(Date.now()).sunDir.y);
    effect.saturation = daySaturation + (NIGHT_SATURATION - daySaturation) * nf;
  });
  return null;
}
