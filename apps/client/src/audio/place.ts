import { rateLimit } from './mix';
import { playSampleLayersAt } from './samples';
import { onListenerMove } from './spatial';
import {
  gustLayers,
  lapLayers,
  placeProfileAt,
  shorelineAt,
  waterLevelAt,
  type PlaceProfile,
} from './surfaces';

/**
 * Sense of place: the two shipped ambient beds re-voiced per biome, plus the two
 * intermittent sounds that make somewhere feel outdoors — wind moving past you,
 * and water working at a shoreline.
 *
 * Both are one-shots on lazy timers rather than extra loops: a gust that arrives
 * every ten-odd seconds from a slightly different direction reads as weather,
 * where a permanent wind loop reads as tape hiss and gets tuned out in a minute.
 * Everything here is torn down by the returned stopper — no timer, and no audio
 * node, outlives the soundscape.
 */

const RESAMPLE_M = 10;      // re-read the terrain after this much travel
const RESAMPLE_MS = 4_000;  // …or this long standing still (day/night, drift)
const GUST_MIN_MS = 7_000;
const GUST_MAX_MS = 18_000;
const GUST_RADIUS = 30;     // gusts pass at a distance so they sweep the stereo field
const LAP_MIN_MS = 2_600;
const LAP_MAX_MS = 5_200;
const LAP_PROBE_M = 16;     // how far out we look for the water to place a lap
const LAP_PROBES = 8;

const CALM: PlaceProfile = { level: 1, lowpassHz: 16_000, gust: 0.5 };

let profile: PlaceProfile = CALM;
let shore = 0;
let here = { x: 0, z: 0 };
let sampledAt = 0;
let sampledX = Infinity;
let sampledZ = Infinity;
let gustTimer: ReturnType<typeof setTimeout> | null = null;
let lapTimer: ReturnType<typeof setTimeout> | null = null;

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Aim a lap at the water rather than at a random bearing: probe a ring around
 * the player and take the first wet bearing. Runs a few times a minute at most,
 * so the eight terrain samples are free.
 */
function lapPoint(x: number, z: number): { x: number; z: number } | null {
  const offset = Math.random() * Math.PI * 2;
  for (let i = 0; i < LAP_PROBES; i += 1) {
    const angle = offset + (i / LAP_PROBES) * Math.PI * 2;
    const px = x + Math.cos(angle) * LAP_PROBE_M;
    const pz = z + Math.sin(angle) * LAP_PROBE_M;
    if (waterLevelAt(px, pz) !== null && shorelineAt(px, pz) > 0.5) return { x: px, z: pz };
  }
  return null;
}

function scheduleGust(delay = between(GUST_MIN_MS, GUST_MAX_MS)): void {
  gustTimer = setTimeout(() => {
    // Quiet places stay quiet: a still meadow gets a breath, a bare ridge a rush.
    // The rate limit stops a biome flicker on a border from double-gusting.
    if (profile.gust > 0.15 && rateLimit('gust', GUST_MIN_MS - 500)) {
      const angle = Math.random() * Math.PI * 2;
      playSampleLayersAt(
        gustLayers(profile.gust),
        here.x + Math.cos(angle) * GUST_RADIUS,
        here.z + Math.sin(angle) * GUST_RADIUS,
      );
    }
    // Windier places gust more often, not just louder.
    scheduleGust(between(GUST_MIN_MS, GUST_MAX_MS) / (0.6 + profile.gust));
  }, delay);
}

function scheduleLap(): void {
  lapTimer = setTimeout(() => {
    if (shore > 0.05) {
      const point = lapPoint(here.x, here.z);
      if (point) playSampleLayersAt(lapLayers(shore), point.x, point.z);
    }
    scheduleLap();
  }, between(LAP_MIN_MS, LAP_MAX_MS));
}

/**
 * Start the place mix. `apply` receives the biome profile whenever it changes —
 * the soundscape owns the ambient bus, so it does the actual cross-fade.
 */
export function startPlaceAudio(apply: (p: PlaceProfile) => void): () => void {
  profile = CALM;
  shore = 0;
  sampledAt = 0;
  sampledX = Infinity;
  sampledZ = Infinity;
  apply(profile);

  const unsubscribe = onListenerMove((px, pz) => {
    here = { x: px, z: pz };
    const now = performance.now();
    const moved = Math.hypot(px - sampledX, pz - sampledZ);
    if (moved < RESAMPLE_M && now - sampledAt < RESAMPLE_MS) return;
    sampledAt = now;
    sampledX = px;
    sampledZ = pz;
    profile = placeProfileAt(px, pz);
    shore = shorelineAt(px, pz);
    apply(profile);
  });

  scheduleGust();
  scheduleLap();

  return () => {
    unsubscribe();
    if (gustTimer) { clearTimeout(gustTimer); gustTimer = null; }
    if (lapTimer) { clearTimeout(lapTimer); lapTimer = null; }
  };
}
