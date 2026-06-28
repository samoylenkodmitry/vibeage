/**
 * Low-level Web Audio plumbing shared by every sound source: the lazily-created,
 * gesture-unlocked AudioContext, the master volume/mute bus, and the helpers the
 * sample players + soundscape route through. No sound is generated here anymore —
 * all SFX/cues/ambient are real CC0 samples (see audio/samples, audio/cues,
 * audio/soundscape).
 *
 * The AudioContext is created lazily on first play to avoid the
 * "AudioContext was not allowed to start" Chrome warning before
 * the player interacts with the page.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let volume = 1;
let unlockHandlersInstalled = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    // Shared bus for *continuous* sources (the ambient soundscape) so the
    // volume slider / mute act on them live. One-shot cues below keep their
    // own per-note scaling and route straight to destination — unchanged.
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(ctx.destination);
    installUnlockHandlers();
  }
  // Chrome/Safari autoplay policy: contexts start 'suspended' until
  // a user gesture resumes them. Try resuming opportunistically; the
  // gesture-bound listeners below cover the case where resume() is
  // still rejected here.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** The AudioContext (created lazily), or null when audio is unavailable. */
export function getAudioContext(): AudioContext | null {
  return getCtx();
}

/** Shared gain bus under the volume slider — continuous sources connect here. */
export function getMasterGain(): GainNode | null {
  getCtx();
  return masterGain;
}

function applyMasterGain(): void {
  if (masterGain && ctx) {
    masterGain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  }
}

function installUnlockHandlers(): void {
  if (unlockHandlersInstalled || typeof window === 'undefined') return;
  unlockHandlersInstalled = true;
  const resume = (): void => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  };
  window.addEventListener('pointerdown', resume, { capture: true, once: true });
  window.addEventListener('keydown', resume, { capture: true, once: true });
}

export function setMuted(value: boolean): void {
  muted = value;
  applyMasterGain();
}

export function isMuted(): boolean {
  return muted;
}

/** Master SFX volume, 0–1. Multiplies every cue's gain envelope. */
export function setVolume(value: number): void {
  volume = Math.min(1, Math.max(0, value));
  applyMasterGain();
}

export function getVolume(): number {
  return volume;
}
