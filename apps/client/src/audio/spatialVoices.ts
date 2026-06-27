import type { SpellElement } from '../vfx/spellFx';

/**
 * Synthesized positional "voices" for world SFX — each wires a short sound graph
 * into the distance-scaled + panned `dest` provided by playSpatial(). No asset
 * files. Kept punchy and layered so impacts land with weight, and tinted per
 * element so a fireball booms and crackles while an ice bolt shatters bright.
 */

let noiseBuffer: AudioBuffer | null = null;
function whiteNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate; // 1s, reused
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

type Filter = 'lowpass' | 'highpass' | 'bandpass';

/** A short filtered noise burst with an attack/decay envelope. */
function noiseBurst(
  ctx: AudioContext, dest: AudioNode,
  opts: { dur: number; gain: number; filter: Filter; freq: number; q?: number; delay?: number },
): void {
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter;
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(opts.gain, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + opts.dur);
  src.connect(filter).connect(env).connect(dest);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
  src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
}

/** A tone gliding from one frequency to another with an envelope. */
function sweepTone(
  ctx: AudioContext, dest: AudioNode,
  opts: { from: number; to: number; dur: number; type: OscillatorType; gain: number; delay?: number },
): void {
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(opts.gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + opts.dur);
  osc.connect(env).connect(dest);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/** Generic melee/damage tick — a small punchy thud. */
export function hitVoice(ctx: AudioContext, dest: AudioNode): void {
  sweepTone(ctx, dest, { from: 240, to: 120, dur: 0.08, type: 'sine', gain: 0.22 });
  noiseBurst(ctx, dest, { dur: 0.045, gain: 0.10, filter: 'highpass', freq: 2000 });
}

/** Enemy death — a heavier descending thud. */
export function killVoice(ctx: AudioContext, dest: AudioNode): void {
  sweepTone(ctx, dest, { from: 180, to: 65, dur: 0.3, type: 'sine', gain: 0.3 });
  noiseBurst(ctx, dest, { dur: 0.16, gain: 0.12, filter: 'lowpass', freq: 800 });
}

/** Soft windup as a spell charges — quiet, element-tinted rising shimmer. */
export function castVoice(element: SpellElement | undefined, ctx: AudioContext, dest: AudioNode): void {
  const high = element === 'ice' || element === 'holy' || element === 'arcane';
  const base = high ? 520 : 240;
  sweepTone(ctx, dest, { from: base, to: base * 2.2, dur: 0.26, type: high ? 'triangle' : 'sawtooth', gain: 0.07 });
  noiseBurst(ctx, dest, { dur: 0.24, gain: 0.05, filter: 'bandpass', freq: base * 3, q: 0.8 });
}

/**
 * Element-flavoured impact — the satisfying spell-landing. `undefined` (a
 * non-elemental skill: arrow, melee strike) falls to a physical thud.
 */
export function impactVoice(element: SpellElement | undefined, ctx: AudioContext, dest: AudioNode): void {
  switch (element) {
    case 'fire':
      sweepTone(ctx, dest, { from: 170, to: 48, dur: 0.34, type: 'sine', gain: 0.32 });
      noiseBurst(ctx, dest, { dur: 0.22, gain: 0.16, filter: 'lowpass', freq: 1400 });
      noiseBurst(ctx, dest, { dur: 0.10, gain: 0.08, filter: 'highpass', freq: 2600, delay: 0.03 });
      break;
    case 'ice':
      noiseBurst(ctx, dest, { dur: 0.12, gain: 0.16, filter: 'highpass', freq: 5200 });
      sweepTone(ctx, dest, { from: 2000, to: 620, dur: 0.26, type: 'triangle', gain: 0.16 });
      break;
    case 'holy':
      sweepTone(ctx, dest, { from: 1046, to: 1046, dur: 0.5, type: 'sine', gain: 0.16 });
      sweepTone(ctx, dest, { from: 1568, to: 1568, dur: 0.6, type: 'sine', gain: 0.11, delay: 0.02 });
      break;
    case 'poison':
      for (let i = 0; i < 4; i += 1) {
        noiseBurst(ctx, dest, { dur: 0.07, gain: 0.1, filter: 'lowpass', freq: 600 - i * 90, delay: i * 0.06 });
      }
      break;
    case 'arcane':
      sweepTone(ctx, dest, { from: 700, to: 1500, dur: 0.18, type: 'sawtooth', gain: 0.16 });
      sweepTone(ctx, dest, { from: 710, to: 1480, dur: 0.18, type: 'sawtooth', gain: 0.12 });
      noiseBurst(ctx, dest, { dur: 0.1, gain: 0.08, filter: 'highpass', freq: 4000, delay: 0.04 });
      break;
    default: // physical / non-elemental (arrow, melee)
      sweepTone(ctx, dest, { from: 220, to: 90, dur: 0.16, type: 'sine', gain: 0.26 });
      noiseBurst(ctx, dest, { dur: 0.1, gain: 0.13, filter: 'bandpass', freq: 1200, q: 0.7 });
  }
}
