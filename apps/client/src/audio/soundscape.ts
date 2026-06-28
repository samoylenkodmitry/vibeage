import { getAudioContext, getMasterGain } from '../sfx';
import { getSampleBuffer, hasSampleFailed, preloadSamples } from './samples';
import { AMBIENT_DAY, AMBIENT_NIGHT, AMBIENT_URLS } from './sampleMap';

/**
 * Ambient soundscape — two looping CC0 nature beds (OpenGameArt) cross-faded by
 * the day/night factor (0 = full day, 1 = full night):
 *
 *  - day:   a calm forest ambience (gentle wind through trees + birds)
 *  - night: crickets
 *
 * No synthesis: both are real recorded loops, decoded once and looped under the
 * master volume. Everything is gated on a running AudioContext (a user gesture
 * unlocks it), so nothing plays while suspended/headless.
 */

const AMBIENT_LEVEL = 0.4; // ambient mix under the master volume

/**
 * Day/night gain weights for the two beds. Pure, so the cross-fade curve is
 * unit-testable without Web Audio. Linear so dawn/dusk blends both beds.
 */
export function ambientMix(nightFactor: number): { day: number; night: number } {
  const n = Math.max(0, Math.min(1, nightFactor));
  return { day: 1 - n, night: n };
}

let running = false;
let enabled = true;
let nightFactor = 0;
// Held only once started (on a user gesture), so the setters below never create
// an AudioContext eagerly — that would trip Chrome's autoplay warning on load.
let audioCtx: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let dayGain: GainNode | null = null;
let nightGain: GainNode | null = null;
const liveSources: AudioBufferSourceNode[] = [];
let wireTimer: ReturnType<typeof setTimeout> | null = null;
let wireAttempts = 0;
const MAX_WIRE_ATTEMPTS = 40; // ~10s at 250ms — backstop if a fetch hangs without resolving

export function setAmbientEnabled(on: boolean): void {
  enabled = on;
  if (ambientGain && audioCtx) {
    ambientGain.gain.setTargetAtTime(on ? AMBIENT_LEVEL : 0, audioCtx.currentTime, 0.4);
  }
}

export function isAmbientEnabled(): boolean {
  return enabled;
}

export function setSoundscapeNightFactor(nf: number): void {
  nightFactor = Math.max(0, Math.min(1, nf));
  applyMix();
}

function applyMix(): void {
  if (!audioCtx) return;
  const { day, night } = ambientMix(nightFactor);
  dayGain?.gain.setTargetAtTime(day, audioCtx.currentTime, 1.5);
  nightGain?.gain.setTargetAtTime(night, audioCtx.currentTime, 1.5);
}

export function startSoundscape(): void {
  if (running) return;
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;
  running = true;
  audioCtx = ctx;

  ambientGain = ctx.createGain();
  ambientGain.gain.value = enabled ? AMBIENT_LEVEL : 0;
  ambientGain.connect(master);

  preloadSamples(AMBIENT_URLS);
  wireAttempts = 0;
  wireBeds();
}

/**
 * Start the loops once their buffers decode. Retries only while a bed is still
 * genuinely loading — a permanently failed bed (hasSampleFailed) or a hung fetch
 * (the attempt cap) stops the retry so there's no infinite background loop. Wires
 * whichever bed(s) did decode, so one bad file doesn't silence the other.
 */
function wireBeds(): void {
  const ctx = audioCtx;
  if (!running || !ctx || !ambientGain) return;
  const dayBuf = getSampleBuffer(AMBIENT_DAY);
  const nightBuf = getSampleBuffer(AMBIENT_NIGHT);
  const stillLoading =
    (!dayBuf && !hasSampleFailed(AMBIENT_DAY)) || (!nightBuf && !hasSampleFailed(AMBIENT_NIGHT));
  if (stillLoading && wireAttempts < MAX_WIRE_ATTEMPTS) {
    wireAttempts += 1;
    wireTimer = setTimeout(wireBeds, 250);
    return;
  }
  const { day, night } = ambientMix(nightFactor);
  if (dayBuf) dayGain = loopBed(ctx, dayBuf, ambientGain, day);
  if (nightBuf) nightGain = loopBed(ctx, nightBuf, ambientGain, night);
}

function loopBed(ctx: AudioContext, buf: AudioBuffer, dest: AudioNode, gain0: number): GainNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = gain0;
  src.connect(g).connect(dest);
  src.start();
  liveSources.push(src);
  return g;
}

export function stopSoundscape(): void {
  running = false;
  if (wireTimer) { clearTimeout(wireTimer); wireTimer = null; }
  for (const src of liveSources) {
    try { src.stop(); src.disconnect(); } catch { /* already stopped */ }
  }
  liveSources.length = 0;
  dayGain?.disconnect();
  nightGain?.disconnect();
  ambientGain?.disconnect();
  dayGain = null;
  nightGain = null;
  ambientGain = null;
  audioCtx = null;
}
