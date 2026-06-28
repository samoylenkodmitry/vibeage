import { getAudioContext, getMasterGain, isMuted } from '../sfx';
import { playSpatial } from './spatial';

/**
 * Synthesized *windup* voices — the rising charge you hear as a spell is cast,
 * before it flies or lands. Tonal sweeps (not percussive hits) are exactly what
 * synthesis does cleanly, and a per-element base frequency + a per-skill pitch
 * shift make every cast distinct. The flight (whoosh) and landing (impact) are
 * real samples; only this build-up is synth. Routed through the spatial bus, so
 * a cast across the valley is faint and panned.
 */

export type WindupParams = {
  /** Base frequency the charge starts at. */
  f0: number;
  /** Multiplier the pitch glides up to over the windup (a charge "rises"). */
  rise: number;
  type: OscillatorType;
  /** A second osc detuned by this many cents for a shimmer (0 = none). */
  detune?: number;
  /** Seconds. */
  dur?: number;
  /** Peak voice gain (pre-spatial). Kept low — the windup sits *under* the cast. */
  gain?: number;
  /** Band-passed-noise shimmer amount, 0..1 of peak. */
  noise?: number;
};

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Deterministic 32-bit LCG, stable across runs (no Math.random). Math.imul
  // keeps the multiply exact — plain `*` would overflow 2^53 and lose low bits.
  let s = 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = (s / 0x80000000) - 1;
  }
  noiseBuf = buf;
  return buf;
}

function buildWindup(ctx: AudioContext, dest: AudioNode, p: WindupParams): void {
  const t0 = ctx.currentTime;
  const dur = p.dur ?? 0.38;
  const peak = p.gain ?? 0.18;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  env.connect(dest);

  const glide = (osc: OscillatorNode, cents: number) => {
    osc.type = p.type;
    if (cents) osc.detune.value = cents;
    osc.frequency.setValueAtTime(p.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(p.f0 * p.rise, t0 + dur);
    osc.connect(env);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => { try { osc.disconnect(); } catch { /* gone */ } };
  };
  glide(ctx.createOscillator(), 0);
  if (p.detune) glide(ctx.createOscillator(), p.detune);

  if (p.noise) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true; // the bed is 1s; loop so longer windups don't cut out
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(p.f0 * 2, t0);
    bp.frequency.exponentialRampToValueAtTime(p.f0 * p.rise * 2.4, t0 + dur);
    const ng = ctx.createGain();
    ng.gain.value = p.noise; // relative — it rides the shared envelope below
    // Through `env`, not straight to dest, so the shimmer fades with the charge
    // instead of clicking in/out at full volume.
    src.connect(bp).connect(ng).connect(env);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    src.onended = () => { try { src.disconnect(); bp.disconnect(); ng.disconnect(); } catch { /* gone */ } };
  }
}

/** Play an element-tinted, per-skill-pitched cast windup at a world point. */
export function playWindupAt(p: WindupParams, worldX: number, worldZ: number): void {
  playSpatial((ctx, dest) => buildWindup(ctx, dest, p), worldX, worldZ);
}

/** Play a windup straight under the master volume (no spatialization) — for previews (wiki Sounds page). */
export function playWindup(p: WindupParams): void {
  if (isMuted()) return;
  const ctx = getAudioContext(); // also kicks an opportunistic resume()
  const master = getMasterGain();
  // No `state === 'running'` guard here (unlike the gameplay buses): this is a
  // deliberate button press, and resume() after the first-ever gesture is async,
  // so the context may still read 'suspended' this tick. Web Audio schedules onto
  // a suspended context fine — it plays the instant it resumes — so don't bail.
  if (!ctx || !master) return;
  buildWindup(ctx, master, p);
}
