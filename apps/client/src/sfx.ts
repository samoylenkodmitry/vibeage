/**
 * Web Audio synth-based SFX. No asset files — each cue is a
 * short envelope-shaped sine/triangle burst built on demand.
 * Cheap, no network cost, ships with the bundle.
 *
 * The AudioContext is created lazily on first play to avoid the
 * "AudioContext was not allowed to start" Chrome warning before
 * the player interacts with the page.
 */

type CueId = 'hurt' | 'hit' | 'levelUp' | 'pickup' | 'kill';

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
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
  // Attack/decay envelope so the click doesn't pop.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}
