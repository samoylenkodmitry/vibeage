/**
 * Web Audio synth-based SFX. No asset files — each cue is a
 * short envelope-shaped sine/triangle burst built on demand.
 * Cheap, no network cost, ships with the bundle.
 *
 * The AudioContext is created lazily on first play to avoid the
 * "AudioContext was not allowed to start" Chrome warning before
 * the player interacts with the page.
 */

type CueId = 'hurt' | 'hit' | 'levelUp' | 'pickup' | 'kill' | 'respawn' | 'death' | 'lowHealth' | 'lowMana' | 'bossTelegraph' | 'chat';

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

export function playCue(cue: CueId): void {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  switch (cue) {
    case 'hurt':
      tone(audio, 130, 0.18, 'sine', 0.32);
      break;
    case 'hit':
      tone(audio, 320, 0.08, 'triangle', 0.16);
      break;
    case 'kill':
      tone(audio, 220, 0.16, 'square', 0.20);
      tone(audio, 110, 0.22, 'sine', 0.18, 0.08);
      break;
    case 'levelUp':
      // Arpeggio: C5 → E5 → G5
      tone(audio, 523, 0.18, 'triangle', 0.22);
      tone(audio, 659, 0.18, 'triangle', 0.22, 0.12);
      tone(audio, 784, 0.32, 'triangle', 0.26, 0.24);
      break;
    case 'pickup':
      tone(audio, 880, 0.10, 'sine', 0.18);
      tone(audio, 1320, 0.14, 'sine', 0.18, 0.06);
      break;
    case 'respawn':
      // Soft uplift: G4 → C5 → E5 — gentler than levelUp so it
      // reads as "you're back" rather than "achievement".
      tone(audio, 392, 0.22, 'sine', 0.20);
      tone(audio, 523, 0.22, 'sine', 0.20, 0.14);
      tone(audio, 659, 0.34, 'sine', 0.20, 0.28);
      break;
    case 'death':
      // Descending thud: A3 → E3 — short and heavy.
      tone(audio, 220, 0.22, 'sine', 0.30);
      tone(audio, 165, 0.36, 'sine', 0.26, 0.14);
      break;
    case 'lowHealth':
      // Quiet "heartbeat" double-thump — diegetic urgency that
      // stays under the music. Short attack, fast decay.
      tone(audio, 90, 0.12, 'sine', 0.14);
      tone(audio, 110, 0.10, 'sine', 0.12, 0.10);
      break;
    case 'lowMana':
      // Short descending click — quiet, casters-only nudge.
      tone(audio, 660, 0.06, 'triangle', 0.12);
      tone(audio, 440, 0.08, 'triangle', 0.10, 0.05);
      break;
    case 'bossTelegraph':
      // Tense low-pitched swell — "something dangerous is winding up"
      // without overpowering the music. Two layered sine tones.
      tone(audio, 130, 0.45, 'sine', 0.22);
      tone(audio, 170, 0.35, 'sine', 0.18, 0.06);
      break;
    case 'chat':
      // Soft, friendly blip — one mid sine + a faint higher tail.
      // Quieter than any combat cue so it doesn't compete.
      tone(audio, 740, 0.08, 'sine', 0.10);
      tone(audio, 980, 0.06, 'sine', 0.07, 0.05);
      break;
    default: {
      // Exhaustive: if a new CueId is added to the union without a
      // case above, this assignment fails typecheck. Cheap safety
      // net for a synth-by-cue table that's easy to forget about.
      const _exhaustive: never = cue;
      return _exhaustive;
    }
  }
}

function tone(
  audio: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  startOffset = 0,
): void {
  const now = audio.currentTime + startOffset;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  // Attack/decay envelope so the click doesn't pop. Master volume
  // scales the peak so the slider acts on every cue uniformly.
  const scaledPeak = gainPeak * volume;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(scaledPeak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
  // Tear down explicitly when the note ends so the audio graph
  // doesn't wait for GC to release Web Audio resources.
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
