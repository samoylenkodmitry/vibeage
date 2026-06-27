import { getAudioContext, getMasterGain, isMuted } from '../sfx';
import { playSpatial } from './spatial';

/**
 * Plays real recorded SFX (Kenney, CC0) — fetched, decoded once, cached, and
 * routed through the spatial bus so they attenuate + pan with the world. Asset
 * files live in public/audio/sfx (see CREDITS.txt). Decoding needs an unlocked
 * AudioContext, so preload after the first user gesture; until a clip is ready
 * a play is skipped silently (it'll be loaded by the next one).
 */
const buffers = new Map<string, AudioBuffer>();
const inflight = new Set<string>();

function decode(url: string): void {
  if (buffers.has(url) || inflight.has(url)) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  inflight.add(url);
  fetch(url)
    .then((res) => res.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => { buffers.set(url, buf); inflight.delete(url); })
    .catch(() => { inflight.delete(url); });
}

export function preloadSamples(urls: readonly string[]): void {
  for (const url of urls) decode(url);
}

function pickReady(urls: readonly string[]): AudioBuffer | null {
  const url = urls[Math.floor(Math.random() * urls.length)] ?? urls[0];
  if (!url) return null;
  const buf = buffers.get(url);
  if (!buf) { decode(url); return null; }
  return buf;
}

function source(ctx: AudioContext, buf: AudioBuffer, dest: AudioNode, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (gain === 1) {
    src.connect(dest);
    src.onended = () => src.disconnect();
  } else {
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.onended = () => { src.disconnect(); g.disconnect(); };
  }
  src.start();
}

/** Positional one-shot — picks a random variant from `urls` and plays it at (x,z). */
export function playSampleAt(urls: readonly string[], worldX: number, worldZ: number, gain = 1): void {
  const buf = pickReady(urls);
  if (!buf) return;
  playSpatial((ctx, dest) => source(ctx, buf, dest, gain), worldX, worldZ);
}

/** Non-positional one-shot (UI / "you" events) under the master volume. */
export function playSample(urls: readonly string[], gain = 0.7): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master || ctx.state !== 'running') return;
  const buf = pickReady(urls);
  if (!buf) return;
  source(ctx, buf, master, gain);
}
