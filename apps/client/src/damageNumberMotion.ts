import type { DamageNumberVariant } from './damageNumberTexture';

/**
 * Motion curves for floating combat numbers — how each variant travels, pops
 * and fades. Split from the component so the shape of the arc can be tuned (and
 * unit-tested) without touching the three.js plumbing that plays it.
 */

type VariantMotion = {
  /** Seconds on screen. Crits linger — they are the number you want read. */
  duration: number;
  /** Extra glyph scale on top of the size-by-amount curve. */
  sizeBoost: number;
  /** Spawn overshoot: how hard the glyph punches out of the impact. */
  punch: number;
  /** Share of the lifetime the punch takes to settle. */
  punchWindow: number;
  /** Fraction of `rise` this variant actually travels. */
  riseScale: number;
  /** Peak tilt in radians, easing back to level — a crit lands crooked. */
  tilt: number;
};

// Tuned against the read, not the maths: outgoing damage is the background hum
// of a fight and stays quick and small; a crit is an event, so it is bigger,
// punchier, tilted and on screen ~30% longer; incoming damage is a warning, so
// it hangs low and heavy near the player instead of flying away.
export const VARIANT_MOTION: Record<DamageNumberVariant, VariantMotion> = {
  outgoing: { duration: 0.95, sizeBoost: 1, punch: 0.28, punchWindow: 0.18, riseScale: 1, tilt: 0 },
  incoming: { duration: 1.1, sizeBoost: 1.1, punch: 0.45, punchWindow: 0.16, riseScale: 0.62, tilt: 0.05 },
  heal: { duration: 1.2, sizeBoost: 0.92, punch: 0.2, punchWindow: 0.22, riseScale: 0.9, tilt: 0 },
  crit: { duration: 1.25, sizeBoost: 1.45, punch: 0.75, punchWindow: 0.26, riseScale: 1.35, tilt: -0.16 },
};

export type NumberMotionSample = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  /** Eased 0..1 progress — callers use it for lane drift. */
  ease: number;
};

/**
 * Pure motion curve for one variant at normalised lifetime `t`.
 *
 * `gain` is the global motion budget (0 under prefers-reduced-motion, reduced
 * on phones): it scales only the parts that JUMP — the spawn punch and the
 * tilt. Rise, fade and size stay untouched, because a number that doesn't move
 * or fade isn't calmer, it's unreadable.
 */
export function sampleNumberMotion(variant: DamageNumberVariant, t: number, gain: number): NumberMotionSample {
  const style = VARIANT_MOTION[variant];
  const ease = 1 - (1 - t) * (1 - t); // ease-out: fast off the impact, then hangs
  const punchPhase = t < style.punchWindow ? 1 - t / style.punchWindow : 0;
  const scale = 1 + style.punch * gain * punchPhase;
  // Crits arc outward as they climb instead of tracking straight up, so they
  // separate from the plain numbers even in a colour-blind read.
  const arc = variant === 'crit' ? Math.sin(t * Math.PI) * CRIT_ARC_X * gain : 0;
  const rise = variant === 'incoming'
    // Incoming dips a beat before it lifts — the glyph gets shoved, like you did.
    ? ease * style.riseScale - INCOMING_DIP * (1 - ease)
    : ease * style.riseScale;
  return {
    scale,
    offsetX: arc,
    offsetY: rise,
    rotation: style.tilt * gain * punchPhase,
    opacity: sampleOpacity(variant, t),
    ease,
  };
}

/** Crits hold at full opacity through the middle of their life; others fade throughout. */
function sampleOpacity(variant: DamageNumberVariant, t: number): number {
  if (t < FADE_IN_T) return t / FADE_IN_T;
  if (variant === 'crit') {
    return t < CRIT_HOLD_T ? 1 : 1 - (t - CRIT_HOLD_T) / (1 - CRIT_HOLD_T);
  }
  return 1 - (t - FADE_IN_T) / (1 - FADE_IN_T);
}

/** Pop in over the first tenth of the life — anything slower feels detached from the hit. */
const FADE_IN_T = 0.1;
/** Crits stay solid until well past halfway, then fall off fast. */
const CRIT_HOLD_T = 0.55;
/** World units a crit swings sideways at the top of its arc. */
const CRIT_ARC_X = 0.22;
/** World units an incoming number is knocked down before it recovers. */
const INCOMING_DIP = 0.3;
