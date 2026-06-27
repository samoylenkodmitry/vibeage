import { getAudioContext, getMasterGain } from '../sfx';

/**
 * Procedural ambient soundscape — no asset files, all synthesized via Web Audio
 * and mixed under the master volume bus. Three layers, cross-faded by the
 * day/night factor (0 = full day, 1 = full night):
 *
 *  - wind: a continuous brown-noise bed, band-passed with a slow drifting
 *    centre so it breathes like a breeze.
 *  - crickets: short high tremolo "chirp-chirp" bursts, scheduled densely at
 *    night and silent by day.
 *  - birds: sparse little FM tweets, by day only.
 *
 * Everything is gated on the AudioContext actually running (a user gesture
 * unlocks it), so nothing is scheduled while suspended/headless.
 */

const AMBIENT_LEVEL = 0.55; // ambient mix under the master volume

type Densities = { cricket: number; bird: number; windLevel: number };

/**
 * Per-tick spawn probabilities + wind level from the night factor. Pure so the
 * day↔night curve is unit-testable without Web Audio.
 */
export function ambientDensities(nightFactor: number): Densities {
  const n = Math.max(0, Math.min(1, nightFactor));
  return {
    // Crickets ramp in after dusk (none until it's getting dark), peaking at night.
    cricket: Math.max(0, (n - 0.25) / 0.75),
    // Birds are a daytime thing, and sparse even then.
    bird: 0.5 * (1 - n),
    // Wind is always there, a touch stronger and brighter by day.
    windLevel: 0.6 + 0.4 * (1 - n),
  };
}

let running = false;
let enabled = true;
let nightFactor = 0;
// Held only once started (on a user gesture), so the setters below never create
// an AudioContext eagerly — that would trip Chrome's autoplay warning on load.
let audioCtx: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let windAmp: GainNode | null = null;
const liveNodes: AudioNode[] = []; // continuous sources to stop on teardown
let tickTimer: ReturnType<typeof setTimeout> | null = null;

let brownNoiseBuffer: AudioBuffer | null = null;
function brownNoise(ctx: AudioContext): AudioBuffer {
  if (brownNoiseBuffer && brownNoiseBuffer.sampleRate === ctx.sampleRate) return brownNoiseBuffer;
  const len = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2; // compensate for the integrator's low amplitude
  }
  brownNoiseBuffer = buffer;
  return buffer;
}

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
  if (windAmp && audioCtx) {
    windAmp.gain.setTargetAtTime(0.05 + 0.05 * ambientDensities(nightFactor).windLevel, audioCtx.currentTime, 1.5);
  }
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

  buildWind(ctx, ambientGain);
  scheduleTick();
}

export function stopSoundscape(): void {
  running = false;
  if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
  for (const node of liveNodes) {
    try {
      if (node instanceof AudioScheduledSourceNode) node.stop();
      node.disconnect();
    } catch { /* already stopped */ }
  }
  liveNodes.length = 0;
  ambientGain?.disconnect();
  ambientGain = null;
  windAmp = null;
  audioCtx = null;
}

function buildWind(ctx: AudioContext, dest: AudioNode): void {
  const noise = ctx.createBufferSource();
  noise.buffer = brownNoise(ctx);
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 480;
  filter.Q.value = 0.6;

  // Slow drift of the filter centre → the breeze rises and falls.
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.06;
  const driftDepth = ctx.createGain();
  driftDepth.gain.value = 240;
  drift.connect(driftDepth).connect(filter.frequency);

  windAmp = ctx.createGain();
  windAmp.gain.value = 0.08;

  noise.connect(filter).connect(windAmp).connect(dest);
  noise.start();
  drift.start();
  liveNodes.push(noise, drift);
}

function scheduleTick(): void {
  const ctx = audioCtx;
  if (!running || !ctx || !ambientGain) return;
  if (ctx.state === 'running') {
    const { cricket, bird } = ambientDensities(nightFactor);
    if (Math.random() < cricket) spawnCricket(ctx, ambientGain, 0.6 + 0.4 * cricket);
    if (Math.random() < cricket * 0.5) spawnCricket(ctx, ambientGain, 0.5);
    if (Math.random() < bird * 0.4) spawnBird(ctx, ambientGain);
  }
  tickTimer = setTimeout(scheduleTick, 280 + Math.random() * 520);
}

/** One cricket: a short "chirp-chirp" of a high tremolo'd tone, panned. */
function spawnCricket(ctx: AudioContext, dest: AudioNode, intensity: number): void {
  const t0 = ctx.currentTime + 0.02;
  const carrier = ctx.createOscillator();
  carrier.type = 'triangle';
  carrier.frequency.value = 4100 + Math.random() * 900;

  const trem = ctx.createGain(); // raspy buzz: amplitude modulated fast
  trem.gain.value = 0.5;
  const tremLfo = ctx.createOscillator();
  tremLfo.type = 'sine';
  tremLfo.frequency.value = 46 + Math.random() * 12;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.5;
  tremLfo.connect(tremDepth).connect(trem.gain);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = carrier.frequency.value;
  band.Q.value = 6;

  const env = ctx.createGain();
  env.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;

  // 2–4 short pulses, ~0.13s apart → the chirp.
  const pulses = 2 + Math.floor(Math.random() * 3);
  const peak = 0.06 * intensity;
  let t = t0;
  for (let i = 0; i < pulses; i += 1) {
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.07);
    t += 0.12 + Math.random() * 0.03;
  }
  const end = t + 0.05;

  carrier.connect(trem).connect(env).connect(band).connect(pan).connect(dest);
  carrier.start(t0);
  tremLfo.start(t0);
  carrier.stop(end);
  tremLfo.stop(end);
  carrier.onended = () => {
    carrier.disconnect(); trem.disconnect(); tremLfo.disconnect();
    tremDepth.disconnect(); band.disconnect(); env.disconnect(); pan.disconnect();
  };
}

/** One bird: a quick up-down whistle, twice, panned. */
function spawnBird(ctx: AudioContext, dest: AudioNode): void {
  const t0 = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const base = 2200 + Math.random() * 1200;
  const env = ctx.createGain();
  env.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.4 - 0.7;

  let t = t0;
  const tweets = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < tweets; i += 1) {
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.14);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    t += 0.22 + Math.random() * 0.1;
  }
  const end = t + 0.05;

  osc.connect(env).connect(pan).connect(dest);
  osc.start(t0);
  osc.stop(end);
  osc.onended = () => { osc.disconnect(); env.disconnect(); pan.disconnect(); };
}
