import * as THREE from 'three';
import type { Vec3 } from './gameTypes';

export const CAMERA_DISTANCE = 24;
export const CAMERA_MIN_DISTANCE = 6;
export const CAMERA_MAX_DISTANCE = 90;
const CAMERA_WHEEL_ZOOM_SPEED = 0.0028;
export const CAMERA_FOCUS_RESPONSE = 8;
export const CAMERA_POSITION_RESPONSE = 10;
export const CAMERA_MAX_FRAME_DELTA = 1 / 30;
const CAMERA_FOCUS_JITTER_EPSILON_SQ = 0.0004;
const CAMERA_DRAG_YAW_SPEED = 0.012;
const CAMERA_DRAG_PITCH_SPEED = 0.01;
export const CAMERA_MIN_PITCH = -1.5;
export const CAMERA_MAX_PITCH = 1.35;

export type CameraOrbit = {
  angle: number;
  pitch: number;
};

export type CameraPointer = {
  x: number;
  y: number;
};

export function smoothingAlpha(response: number, deltaSeconds: number): number {
  const boundedDelta = Math.min(Math.max(deltaSeconds, 0), CAMERA_MAX_FRAME_DELTA);
  return 1 - Math.exp(-response * boundedDelta);
}

export function applyCameraDragDelta(
  orbit: CameraOrbit,
  pointerDelta: { x: number; y: number },
): CameraOrbit {
  return {
    angle: orbit.angle - pointerDelta.x * CAMERA_DRAG_YAW_SPEED,
    pitch: THREE.MathUtils.clamp(
      orbit.pitch + pointerDelta.y * CAMERA_DRAG_PITCH_SPEED,
      CAMERA_MIN_PITCH,
      CAMERA_MAX_PITCH,
    ),
  };
}

export function shouldStartCameraDrag(
  pointer: { button: number; pointerType?: string },
  activeTouchCount: number,
): boolean {
  return pointer.button === 2 || (pointer.pointerType === 'touch' && activeTouchCount >= 2);
}

export function applyWheelZoom(
  currentDistance: number,
  wheelDeltaY: number,
  speed: number = CAMERA_WHEEL_ZOOM_SPEED,
): number {
  const next = currentDistance * Math.exp(wheelDeltaY * speed);
  return THREE.MathUtils.clamp(next, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
}

export function applyPinchZoom(
  currentDistance: number,
  previousPinchPx: number,
  currentPinchPx: number,
): number {
  if (previousPinchPx <= 0 || currentPinchPx <= 0) {
    return currentDistance;
  }
  const next = (currentDistance * previousPinchPx) / currentPinchPx;
  return THREE.MathUtils.clamp(next, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
}

export function pinchDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getTouchCentroid(points: readonly CameraPointer[]): CameraPointer | null {
  if (points.length < 2) {
    return null;
  }

  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

export function getCameraOrbitPosition(
  focus: Vec3,
  orbit: CameraOrbit,
  distance = CAMERA_DISTANCE,
): Vec3 {
  const horizontalDistance = Math.cos(orbit.pitch) * distance;

  return {
    x: focus.x - Math.sin(orbit.angle) * horizontalDistance,
    y: focus.y + Math.sin(orbit.pitch) * distance,
    z: focus.z - Math.cos(orbit.angle) * horizontalDistance,
  };
}

export function writeCameraOrbitPosition(
  target: THREE.Vector3,
  focus: Vec3,
  orbit: CameraOrbit,
  distance = CAMERA_DISTANCE,
): THREE.Vector3 {
  const horizontalDistance = Math.cos(orbit.pitch) * distance;

  return target.set(
    focus.x - Math.sin(orbit.angle) * horizontalDistance,
    focus.y + Math.sin(orbit.pitch) * distance,
    focus.z - Math.cos(orbit.angle) * horizontalDistance,
  );
}

export function hasMeaningfulCameraFocusDelta(
  current: THREE.Vector3,
  next: THREE.Vector3,
): boolean {
  return current.distanceToSquared(next) > CAMERA_FOCUS_JITTER_EPSILON_SQ;
}

/**
 * Impact camera kick.
 *
 * A hit displaces the EYE, not the subject: the rig keeps looking at the same
 * focus point, so the frame jolts without the player's orbit angle, pitch or
 * zoom changing by a single radian. That is what lets it be instantly
 * cancellable — dropping the kick returns the camera exactly where the player
 * left it, with nothing to unwind.
 */
export type CameraKick = {
  /** performance.now() when the kick started. */
  startedAt: number;
  /** Peak world-space displacement, already scaled by severity and motion gain. */
  amplitude: number;
  /** Unit XZ push direction (attacker → victim). 0,0 = no lateral push. */
  dirX: number;
  dirZ: number;
  /** Full cosine cycles across the kick — 1 is a shove, 2 a rattle. */
  oscillations: number;
  /** Milliseconds the follow freezes before resuming: the hit-stop. */
  holdMs: number;
};

/** What a kick may be built from — the game-feel bus's impact, structurally. */
type KickSource = { kind: string; severity: number; dirX: number; dirZ: number };

/**
 * Peak eye displacement in world units. The rig sits ~24 units out, so half a
 * unit is roughly a 2% frame shift: unmistakable as a jolt, far too small to
 * disorient or to swing the horizon.
 */
const CAMERA_KICK_MAX_OFFSET = 0.55;
/**
 * ~1/4 s. Long enough to read as weight, short enough that a fast attack chain
 * never has two kicks alive at once (each new one replaces the last).
 */
const CAMERA_KICK_DURATION_MS = 260;
/** Vertical share of the kick — a hit drops the eye as well as shoving it. */
const CAMERA_KICK_VERTICAL = 0.4;
/**
 * Per-kind weight. Landing a normal hit should barely register (it happens
 * every second); taking one, critting, and killing are the beats worth feeling.
 */
const CAMERA_KICK_WEIGHT: Record<string, number> = {
  outgoing: 0.3,
  crit: 1,
  kill: 0.85,
  incoming: 0.9,
  levelUp: 0.5,
};
/** Only the "event" hits rattle; a plain trade shoves once and settles. */
const CAMERA_KICK_OSCILLATIONS: Record<string, number> = { incoming: 2, crit: 1.5, kill: 1.5 };
/**
 * Hit-stop, crit/kill only. ~55 ms is the classic action-game window: the eye
 * reads it as impact, not as a dropped frame. Applying it to ordinary hits
 * would just make the camera feel like it stutters.
 */
const CAMERA_HIT_STOP_MS: Record<string, number> = { crit: 55, kill: 70 };

/**
 * Build a kick for an impact, or null when it would be invisible — a zero
 * motion budget (prefers-reduced-motion) or an unweighted kind.
 */
export function createCameraKick(impact: KickSource, gain: number, now: number): CameraKick | null {
  const weight = CAMERA_KICK_WEIGHT[impact.kind] ?? 0;
  const amplitude = CAMERA_KICK_MAX_OFFSET * weight * impact.severity * gain;
  if (amplitude <= 0) return null;
  return {
    startedAt: now,
    amplitude,
    dirX: impact.dirX,
    dirZ: impact.dirZ,
    oscillations: CAMERA_KICK_OSCILLATIONS[impact.kind] ?? 1,
    holdMs: (CAMERA_HIT_STOP_MS[impact.kind] ?? 0) * (gain > 0 ? 1 : 0),
  };
}

/**
 * Write the kick's current eye offset into `out`. Returns false once the kick
 * has expired, which is the caller's cue to drop it.
 *
 * Cosine-shaped so the displacement is at full amplitude on the very first
 * frame (the hit is now, not 40 ms from now), decaying quadratically.
 */
export function sampleCameraKick(kick: CameraKick | null, now: number, out: THREE.Vector3): boolean {
  if (!kick) return false;
  const t = (now - kick.startedAt) / CAMERA_KICK_DURATION_MS;
  if (t >= 1) return false;
  const decay = (1 - t) * (1 - t);
  const wave = Math.cos(t * Math.PI * 2 * kick.oscillations) * decay * kick.amplitude;
  out.set(kick.dirX * wave, -CAMERA_KICK_VERTICAL * wave, kick.dirZ * wave);
  return true;
}

/** True while the follow should hold still — the hit-stop window of a kick. */
export function isCameraHitStopped(kick: CameraKick | null, now: number): boolean {
  return !!kick && now - kick.startedAt < kick.holdMs;
}
