import { rateLimit } from './mix';
import { playSampleLayers } from './samples';
import { onListenerMove } from './spatial';
import { footstepLayers, surfaceAt } from './surfaces';

/**
 * Your own footsteps. Driven by *distance travelled*, not a timer, so the
 * cadence follows the character instead of drifting against it: cross a stride's
 * worth of ground and a foot lands, whatever the frame rate or the server tick.
 *
 * Steps play non-positionally — your feet are always exactly at the listener, so
 * routing them through the panner would only smear them. They're the sound you
 * hear most in a session, so they're mixed low and pitched per-foot; anything
 * with presence becomes a metronome within a minute.
 */

const MIN_SPEED = 1.2;   // m/s — below this you're drifting/idling, not walking
const RUN_SPEED = 6;     // at/above this the stride shortens into a jog cadence
const WALK_STRIDE = 2.2; // metres of ground per footfall at a walk
const RUN_STRIDE = 1.5;
const MIN_STEP_MS = 165; // hard cadence floor, whatever the position stream does
const TELEPORT_M = 12;   // a jump this big is a respawn/rubber-band, not running

export type StrideState = { accum: number; lastStepAt: number; index: number };

export function newStrideState(): StrideState {
  return { accum: 0, lastStepAt: 0, index: 0 };
}

/** Metres per footfall at a given speed — shorter as you speed up. */
export function strideFor(speed: number): number {
  const t = Math.max(0, Math.min(1, (speed - MIN_SPEED) / (RUN_SPEED - MIN_SPEED)));
  return WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * t;
}

/** 0 at a walk → 1 at a run; leans on the step's gain. */
export function effortFor(speed: number): number {
  return Math.max(0, Math.min(1, (speed - MIN_SPEED) / (RUN_SPEED - MIN_SPEED)));
}

/**
 * Pure stride accumulator: fold one position delta in and say whether a foot
 * lands. Keeping this separate from Web Audio is what makes the cadence — and
 * its teleport / idle guards — testable.
 */
export function advanceStride(
  state: StrideState,
  distance: number,
  speed: number,
  now: number,
): { state: StrideState; step: boolean } {
  // A respawn or a rubber-band snap covers ground you never walked.
  if (distance > TELEPORT_M) return { state: { ...state, accum: 0 }, step: false };
  // Bleed the accumulator away when idle so a stop-start shuffle can't bank a step.
  if (speed < MIN_SPEED) return { state: { ...state, accum: state.accum * 0.6 }, step: false };

  const accum = state.accum + distance;
  const stride = strideFor(speed);
  if (accum < stride || now - state.lastStepAt < MIN_STEP_MS) {
    return { state: { ...state, accum }, step: false };
  }
  return { state: { accum: accum - stride, lastStepAt: now, index: state.index + 1 }, step: true };
}

let stride = newStrideState();
let lastX = 0;
let lastZ = 0;
let primed = false;

/** Subscribe footsteps to the listener stream. Returns the unsubscribe. */
export function startFootsteps(): () => void {
  stride = newStrideState();
  primed = false;
  return onListenerMove((px, pz, dtMs) => {
    if (!primed) {
      primed = true;
      lastX = px;
      lastZ = pz;
      return;
    }
    const distance = Math.hypot(px - lastX, pz - lastZ);
    lastX = px;
    lastZ = pz;
    const speed = distance / (dtMs / 1000);
    const now = performance.now();
    const next = advanceStride(stride, distance, speed, now);
    stride = next.state;
    if (!next.step) return;
    // Belt-and-braces against a burst of position updates arriving at once.
    if (!rateLimit('footstep', MIN_STEP_MS, now)) return;
    const variance = stride.index % 2 === 0 ? 1 : -1; // left foot / right foot
    playSampleLayers(footstepLayers(surfaceAt(px, pz), variance, effortFor(speed)));
  });
}
