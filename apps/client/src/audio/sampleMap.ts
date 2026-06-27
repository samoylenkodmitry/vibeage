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

export const KILL_SAMPLES = [
  `${BASE}/impactMetal_heavy_000.ogg`,
  `${BASE}/impactMetal_heavy_001.ogg`,
  `${BASE}/impactMetal_heavy_002.ogg`,
];

export const LOOT_SAMPLES = [`${BASE}/handleCoins.ogg`, `${BASE}/handleCoins2.ogg`];
export const UI_SAMPLES = [`${BASE}/metalClick.ogg`];

/** Element → impact clip set. Non-elemental skills (undefined) use physical. */
const ELEMENT_IMPACT: Record<SpellElement | 'physical', string[]> = {
  fire: [`${BASE}/explosionCrunch_000.ogg`, `${BASE}/explosionCrunch_001.ogg`],
  ice: [`${BASE}/impactGlass_medium_000.ogg`, `${BASE}/impactGlass_medium_001.ogg`, `${BASE}/impactGlass_medium_002.ogg`],
  holy: [`${BASE}/impactBell_heavy_000.ogg`, `${BASE}/impactBell_heavy_001.ogg`, `${BASE}/impactBell_heavy_002.ogg`],
  poison: [`${BASE}/impactSoft_heavy_000.ogg`, `${BASE}/impactSoft_heavy_001.ogg`],
  arcane: [`${BASE}/laserLarge_000.ogg`, `${BASE}/laserLarge_001.ogg`],
  physical: [`${BASE}/impactPunch_medium_000.ogg`, `${BASE}/impactPunch_medium_001.ogg`, `${BASE}/impactPunch_medium_002.ogg`],
};

export function impactSamplesFor(element: SpellElement | undefined): string[] {
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

export function impactGainFor(element: SpellElement | undefined): number {
  return IMPACT_GAIN[element ?? 'physical'];
}

/** Gain for the generic combat clips (hit / kill). */
export const COMBAT_GAIN = 0.85;

/** Every sample url — preload on the first gesture so the first hit isn't silent. */
export const ALL_SFX_URLS: readonly string[] = [
  ...HIT_SAMPLES, ...KILL_SAMPLES, ...LOOT_SAMPLES, ...UI_SAMPLES,
  ...Object.values(ELEMENT_IMPACT).flat(),
];
