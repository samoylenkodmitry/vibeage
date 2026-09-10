import { getGraphicsSettings, resolveGraphics } from './graphicsSettings';

/**
 * Combat game-feel bus — the side channel between "a hit resolved" (the message
 * reducers, which are the only place that sees per-target crit / lethal / heal
 * flags) and the presentation layers that make a hit *land*: the camera kick in
 * <CameraRig>, the screen flash / danger vignette / payoff beat in
 * <CombatFeelLayer>, and the impact punch in <CombatImpactVfx>.
 *
 * Deliberately a module store rather than client state: these are sub-second
 * kinesthetic pulses, not game state. Routing them through the React reducer
 * would re-render the whole world tree for a 200 ms wobble, and the r3f frame
 * loop has to read them without a re-render at all.
 *
 * Presentation only — nothing here changes what the server decided.
 */

export type CombatImpactKind =
  | 'outgoing' // we hit something
  | 'crit' // we hit something *hard*
  | 'incoming' // something hit us
  | 'kill' // our blow finished an enemy
  | 'levelUp';

export type CombatImpact = {
  kind: CombatImpactKind;
  /** 0..1 — the hit's weight relative to the receiver's pool. Drives amplitude. */
  severity: number;
  /** Unit XZ direction the blow travelled (attacker → victim). 0,0 when unknown. */
  dirX: number;
  dirZ: number;
  /** performance.now()-domain timestamp. */
  at: number;
};

type Listener = (impact: CombatImpact) => void;

const listeners = new Set<Listener>();

/**
 * An AoE landing on eight targets resolves as eight CombatLog entries in the
 * same tick. Without coalescing that is eight camera kicks and eight screen
 * flashes stacked on one frame — a seizure, not a punch. Inside this window a
 * same-kind impact only gets through if it is *heavier* than the one already
 * playing, so a volley reads as one hit sized by its biggest component.
 */
const IMPACT_COALESCE_MS = 120;

/**
 * Phones (the `low` tier) still get the feedback, at a little over half
 * amplitude: the effects are cheap, but a 400 px viewport magnifies screen
 * motion and the same kick that reads as weighty on a monitor reads as a
 * glitch in the hand.
 */
const LOW_TIER_MOTION_GAIN = 0.55;

const lastByKind = new Map<CombatImpactKind, CombatImpact>();

export function subscribeCombatImpacts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publish a resolved hit to every feel layer. `at` defaults to now. */
export function emitCombatImpact(impact: Omit<CombatImpact, 'at'> & { at?: number }): void {
  const at = impact.at ?? nowMs();
  const previous = lastByKind.get(impact.kind);
  if (previous && at - previous.at < IMPACT_COALESCE_MS && impact.severity <= previous.severity) {
    return;
  }
  const resolved: CombatImpact = { ...impact, at };
  lastByKind.set(impact.kind, resolved);
  for (const listener of listeners) listener(resolved);
}

/** Test seam: the coalescer holds state across emits, so specs reset it. */
export function resetCombatImpacts(): void {
  lastByKind.clear();
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// matchMedia is stable for the session apart from an OS-level toggle, and the
// frame loop asks every impact — cache the query object, listen for the flip.
let reducedMotionQuery: MediaQueryList | null | undefined;

function reducedMotionMedia(): MediaQueryList | null {
  if (reducedMotionQuery !== undefined) return reducedMotionQuery;
  reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  return reducedMotionQuery;
}

/** True when the player asked the OS for less motion — all shake/pulse off. */
export function prefersReducedMotion(): boolean {
  return reducedMotionMedia()?.matches ?? false;
}

/**
 * Amplitude multiplier for anything that MOVES (camera kick, hit-stop, pulse).
 * Zero under prefers-reduced-motion so those layers no-op entirely; scaled down
 * on the low graphics tier. Colour-only feedback (damage numbers, the danger
 * vignette's steady tint) ignores this and stays readable for everyone.
 */
export function motionGain(): number {
  if (prefersReducedMotion()) return 0;
  return resolveGraphics(getGraphicsSettings()).tier === 'low' ? LOW_TIER_MOTION_GAIN : 1;
}

/**
 * Normalise a hit into the 0..1 "how much did that hurt" severity the feel
 * layers scale against: the fraction of the receiver's max pool it removed,
 * with a floor so a chip hit still registers as *something*.
 */
export function severityFromDamage(damage: number, maxHealth: number | undefined): number {
  if (!maxHealth || maxHealth <= 0) return SEVERITY_FLOOR;
  const fraction = damage / maxHealth;
  return Math.min(1, Math.max(SEVERITY_FLOOR, fraction * SEVERITY_GAIN));
}

/** A 1-damage tick on a boss is still a connection — never a dead-zero pulse. */
const SEVERITY_FLOOR = 0.18;
/**
 * A hit for a third of a health bar is already a "big one" in this game's
 * pacing (see packages/sim balance runs), so 3× maps that to full amplitude
 * instead of reserving the top of the range for one-shots nobody survives.
 */
const SEVERITY_GAIN = 3;
