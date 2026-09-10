/**
 * Mix discipline for one-shots. Two problems this solves, both audible the
 * moment a fight gets busy:
 *
 *  1. **Machine-gunning** — an AoE landing on eight mobs fires eight identical
 *     impacts inside a frame. They phase-add into one loud smear, and the
 *     twentieth hit is no more informative than the second.
 *  2. **Node churn** — every dropped voice is an AudioBufferSource + gain +
 *     panner we never had to build.
 *
 * So positional voices share a short rolling window: the more of them fired
 * recently, the quieter each new one comes in (a duck, not a gate — you still
 * hear the flurry, it just stops shouting), and past a hard cap they're dropped
 * outright. The window is 600ms, so a normal 1-2 hits/second rotation is
 * completely unaffected.
 */

const WINDOW_MS = 600;
const VOICE_CAP = 12; // beyond this in one window, drop — nothing is lost audibly
const DUCK_PER_VOICE = 0.3;
const MIN_DUCK = 0.32;

const recent: number[] = [];

function prune(now: number): void {
  while (recent.length > 0 && now - recent[0] > WINDOW_MS) recent.shift();
}

/** Pure: the gain multiplier for the Nth voice already playing in the window. */
export function duckFor(voicesInWindow: number): number {
  if (voicesInWindow >= VOICE_CAP) return 0;
  return Math.max(MIN_DUCK, 1 / (1 + DUCK_PER_VOICE * voicesInWindow));
}

/**
 * Claim a positional voice: returns its gain multiplier, or 0 when the window is
 * saturated and the caller should skip building the graph entirely.
 */
export function claimVoice(now = clock()): number {
  prune(now);
  const gain = duckFor(recent.length);
  if (gain > 0) recent.push(now);
  return gain;
}

/** Test seam — the module has no other source of time. */
export function resetVoiceWindow(): void {
  recent.length = 0;
}

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Per-key minimum interval, for sounds whose *trigger* can repeat far faster
 * than the ear wants (footsteps on a rubber-banding position stream, a gust
 * retriggered by a biome flicker on a border).
 */
const lastAt = new Map<string, number>();

export function rateLimit(key: string, minIntervalMs: number, now = clock()): boolean {
  const previous = lastAt.get(key);
  if (previous !== undefined && now - previous < minIntervalMs) return false;
  lastAt.set(key, now);
  return true;
}
