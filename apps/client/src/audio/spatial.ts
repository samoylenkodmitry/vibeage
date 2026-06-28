import { getAudioContext, getMasterGain, isMuted } from '../sfx';

/**
 * Coordinate-aware SFX for the open world. A shared "listener" tracks the
 * player's world position + camera yaw; every positional sound is attenuated by
 * distance and stereo-panned to where it actually is on screen — a fireball
 * across the valley is faint and off to one side, a hit at your feet is loud and
 * centred. All synthesized (no asset files), routed under the master volume.
 */

const NEAR = 7;   // within this radius → full volume
const FAR = 75;   // beyond this → inaudible

/** Distance attenuation, 1 (near) → 0 (far), with a gentle curve. Pure. */
export function spatialGainFor(distance: number): number {
  if (distance <= NEAR) return 1;
  if (distance >= FAR) return 0;
  const t = 1 - (distance - NEAR) / (FAR - NEAR);
  return t * t;
}

/**
 * Stereo pan, -1 (left) → 1 (right), for a sound at (dx,dz) relative to the
 * listener, given the camera yaw. Projects onto the camera's right vector so
 * panning matches the screen, not the world. Pure.
 */
export function spatialPanFor(dx: number, dz: number, cameraYaw: number): number {
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return 0;
  // The orbit camera sits at focus - (sin yaw, ., cos yaw)*dist, so it looks
  // along (sin yaw, cos yaw); its screen-right is cross(forward, up) =
  // (-cos yaw, sin yaw). pan = the direction's component along that right.
  const right = (dz * Math.sin(cameraYaw) - dx * Math.cos(cameraYaw)) / dist;
  return Math.max(-1, Math.min(1, right));
}

const listener = { px: 0, pz: 0, yaw: 0 };

export function setSpatialListener(px: number, pz: number, cameraYaw: number): void {
  listener.px = px;
  listener.pz = pz;
  listener.yaw = cameraYaw;
}

/**
 * Play a synthesized voice at a world (x,z). `build(ctx, dest)` wires its sound
 * graph into `dest` (already distance-scaled + panned + under master volume).
 * Skips entirely when muted, suspended, or too far to hear — so a battle across
 * the map costs nothing.
 */
export function playSpatial(
  build: (ctx: AudioContext, dest: AudioNode) => void,
  worldX: number,
  worldZ: number,
): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master || ctx.state !== 'running') return;

  const dx = worldX - listener.px;
  const dz = worldZ - listener.pz;
  const gainValue = spatialGainFor(Math.hypot(dx, dz));
  if (gainValue <= 0.02) return;

  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  const panner = ctx.createStereoPanner();
  panner.pan.value = spatialPanFor(dx, dz, listener.yaw);
  gain.connect(panner).connect(master);
  build(ctx, gain);
  // The per-voice sources tear themselves down on `ended`, but these wrapper
  // nodes stay connected to the master bus (and thus alive) until we drop them.
  // Every voice is well under a second; disconnect a beat after the longest one.
  setTimeout(() => {
    try { gain.disconnect(); panner.disconnect(); } catch { /* already gone */ }
  }, VOICE_TEARDOWN_MS);
}

const VOICE_TEARDOWN_MS = 1500;
