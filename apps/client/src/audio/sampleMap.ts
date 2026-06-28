import type { SpellElement } from '../vfx/spellFx';

/**
 * Maps game events to Kenney CC0 sample sets (random variant each play for
 * variety). Paths resolve to public/audio/sfx (see CREDITS.txt). Each entry's
 * gain balances the raw clip loudness against the rest.
 */
const BASE = '/audio/sfx';

export const HIT_SAMPLES = [
  `${BASE}/impactGeneric_light_000.ogg`,
  `${BASE}/impactGeneric_light_001.ogg`,
  `${BASE}/impactGeneric_light_002.ogg`,
];

// A heavy, low death "thud" — the metal clang read as toy-like. Layered with a
// soft body impact at the call site for weight.
export const KILL_SAMPLES = [
  `${BASE}/lowFrequency_explosion_000.ogg`,
  `${BASE}/lowFrequency_explosion_001.ogg`,
];
export const KILL_BODY_SAMPLES = [
  `${BASE}/impactSoft_heavy_000.ogg`,
  `${BASE}/impactSoft_heavy_001.ogg`,
];

export const LOOT_SAMPLES = [`${BASE}/handleCoins.ogg`, `${BASE}/handleCoins2.ogg`];
export const UI_SAMPLES = [`${BASE}/metalClick.ogg`];

/**
 * Single-shot clips for the HUD / status cues (Kenney *Interface Sounds*),
 * chosen by their semantic name (maximize = rising, minimize = falling,
 * confirmation = positive ding, error = negative buzz, …). The cue → layer
 * mapping lives in audio/cues.ts; these are just the raw files.
 */
export const CUE_CLIPS = {
  error: `${BASE}/error_002.ogg`,
  confirm: `${BASE}/confirmation_001.ogg`,
  maximizeBright: `${BASE}/maximize_004.ogg`,
  maximizeSoft: `${BASE}/maximize_002.ogg`,
  pluck: `${BASE}/pluck_002.ogg`,
  bong: `${BASE}/bong_001.ogg`,
  minimizeDown: `${BASE}/minimize_004.ogg`,
  minimizeShort: `${BASE}/minimize_001.ogg`,
  select: `${BASE}/select_005.ogg`,
} as const;

/** The cast "charge" — a sci-fi force-field energy swell, pitched per element + skill (see skillAudio). */
export const WINDUP_CHARGE_SAMPLES = [`${BASE}/forceField_002.ogg`, `${BASE}/forceField_003.ogg`];

/** Element → impact clip set. Non-elemental skills (undefined) use physical. */
const ELEMENT_IMPACT: Record<SpellElement | 'physical', string[]> = {
  fire: [`${BASE}/explosionCrunch_000.ogg`, `${BASE}/explosionCrunch_001.ogg`],
  ice: [`${BASE}/impactGlass_medium_000.ogg`, `${BASE}/impactGlass_medium_001.ogg`, `${BASE}/impactGlass_medium_002.ogg`],
  holy: [`${BASE}/impactBell_heavy_000.ogg`, `${BASE}/impactBell_heavy_001.ogg`, `${BASE}/impactBell_heavy_002.ogg`],
  poison: [`${BASE}/impactSoft_heavy_000.ogg`, `${BASE}/impactSoft_heavy_001.ogg`],
  arcane: [`${BASE}/laserLarge_000.ogg`, `${BASE}/laserLarge_001.ogg`],
  physical: [`${BASE}/impactPunch_medium_000.ogg`, `${BASE}/impactPunch_medium_001.ogg`, `${BASE}/impactPunch_medium_002.ogg`],
};

export function impactSamplesFor(element: SpellElement | 'physical' | undefined): string[] {
  return ELEMENT_IMPACT[element ?? 'physical'];
}

/** Per-element impact gain so the loud clips (explosion, laser) don't dwarf the rest. */
const IMPACT_GAIN: Record<SpellElement | 'physical', number> = {
  fire: 0.7,
  arcane: 0.55,
  ice: 0.85,
  holy: 0.85,
  poison: 0.85,
  physical: 0.85,
};

export function impactGainFor(element: SpellElement | 'physical' | undefined): number {
  return IMPACT_GAIN[element ?? 'physical'];
}

/**
 * Element → in-flight "whoosh" clip set, played while a projectile travels
 * (CastState.Traveling): fire roars, arcane zaps, ice/holy shimmer, poison
 * hisses, physical swings. Per-skill pitch is applied at the call site.
 */
const ELEMENT_TRAVEL: Record<SpellElement | 'physical', string[]> = {
  fire: [`${BASE}/thrusterFire_000.ogg`, `${BASE}/thrusterFire_001.ogg`],
  ice: [`${BASE}/forceField_000.ogg`, `${BASE}/forceField_001.ogg`],
  holy: [`${BASE}/forceField_000.ogg`, `${BASE}/forceField_001.ogg`],
  poison: [`${BASE}/slime_000.ogg`, `${BASE}/slime_001.ogg`],
  arcane: [`${BASE}/laserSmall_000.ogg`, `${BASE}/laserSmall_001.ogg`],
  physical: [`${BASE}/knifeSlice.ogg`, `${BASE}/knifeSlice2.ogg`],
};

export function travelSamplesFor(element: SpellElement | 'physical' | undefined): string[] {
  return ELEMENT_TRAVEL[element ?? 'physical'];
}

const TRAVEL_GAIN: Record<SpellElement | 'physical', number> = {
  fire: 0.4,
  ice: 0.45,
  holy: 0.45,
  poison: 0.5,
  arcane: 0.4,
  physical: 0.55,
};

export function travelGainFor(element: SpellElement | 'physical' | undefined): number {
  return TRAVEL_GAIN[element ?? 'physical'];
}

/** A deep sub-boom layered under heavy-skill impacts for weight (same deep boom as a kill). */
export const SUB_BOOM_SAMPLES = [
  `${BASE}/lowFrequency_explosion_000.ogg`,
  `${BASE}/lowFrequency_explosion_001.ogg`,
];

/**
 * A gentle high "sparkle" for support skills landing on an ally/self — a heal or
 * buff shouldn't slam down like a damage hit. Played quiet + pitched up.
 */
export const SUPPORT_SPARKLE_SAMPLES = [
  `${BASE}/impactGlass_medium_000.ogg`,
  `${BASE}/impactGlass_medium_001.ogg`,
  `${BASE}/impactGlass_medium_002.ogg`,
];

/** Gain for the generic combat clips (hit / kill). */
export const COMBAT_GAIN = 0.85;

const BASE_AMBIENT = '/audio/ambient';
/** Looping ambient beds (OpenGameArt CC0), cross-faded by day/night in soundscape.ts. */
export const AMBIENT_DAY = `${BASE_AMBIENT}/forest_ambience.ogg`; // calm forest + gentle wind, by day
export const AMBIENT_NIGHT = `${BASE_AMBIENT}/crickets.ogg`; // crickets, by night
export const AMBIENT_URLS: readonly string[] = [AMBIENT_DAY, AMBIENT_NIGHT];

/** Every one-shot sample url — preload on the first gesture so the first hit/cue isn't silent. */
export const ALL_SFX_URLS: readonly string[] = [
  ...HIT_SAMPLES, ...KILL_SAMPLES, ...KILL_BODY_SAMPLES, ...LOOT_SAMPLES, ...UI_SAMPLES,
  ...Object.values(ELEMENT_IMPACT).flat(),
  ...Object.values(ELEMENT_TRAVEL).flat(),
  ...Object.values(CUE_CLIPS),
  ...WINDUP_CHARGE_SAMPLES,
];

/** Every audio url the game ships (one-shots + ambient loops) — used by the wiki completeness test. */
export const ALL_AUDIO_URLS: readonly string[] = [...ALL_SFX_URLS, ...AMBIENT_URLS];
