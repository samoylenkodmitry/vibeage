import type { SpellElement } from '../vfx/spellFx';
import { skillArchetype, skillThemeFor } from '../vfx/skillThemeConfig';
import type { SampleLayer } from './samples';
import {
  impactGainFor,
  impactSamplesFor,
  SUB_BOOM_SAMPLES,
  SUPPORT_SPARKLE_SAMPLES,
  travelGainFor,
  travelSamplesFor,
  WINDUP_CHARGE_SAMPLES,
} from './sampleMap';

/**
 * Per-skill audio profiles, in three phases — cast (windup), travel (in-flight),
 * impact (landing) — all real CC0 samples. Two things make every one of the ~150
 * skills sound distinct without hand-authoring 150 clips:
 *
 *  1. a per-ELEMENT palette (fire roars, ice rings, holy chimes, …), and
 *  2. a deterministic per-SKILL pitch shift hashed from the skill id, so two
 *     fire skills never sound identical.
 *
 * Heals/buffs (skillArchetype) get a softer, higher charge + a sparkle instead
 * of a damage slam. A few signature skills get bespoke weight on impact.
 */

export type Elem = SpellElement | 'physical';

export const SPELL_ELEMENTS: readonly Elem[] = ['fire', 'ice', 'holy', 'poison', 'arcane', 'physical'];

export function elementOf(skillId: string): Elem {
  return skillThemeFor(skillId).element ?? 'physical';
}

/** Stable string hash → [0,1). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Per-skill pitch offset in semitones, deterministic from the id. Spread across
 * roughly an octave so same-element skills are clearly distinct, but never so
 * far that the element's character is lost.
 */
export function skillSemitone(skillId: string): number {
  return Math.round((hash01(skillId) * 10 - 4) * 2) / 2; // [-4, +6], half-steps
}

const semitoneToRate = (semis: number): number => Math.pow(2, semis / 12);

// --- Cast windup (sampled charge). -----------------------------------------
// One energy "charge" sample (sci-fi force-field swell), pitched per element so
// each school keeps its character — the same idea the old synth used (per-element
// base frequency), now applied as a sample playbackRate. Higher = brighter/icier,
// lower = heavier/firier. Heals/buffs get a softer, higher charge.
const WINDUP_RATE: Record<Elem, number> = {
  poison: 0.66,
  fire: 0.74,
  physical: 0.9,
  arcane: 1.16,
  holy: 1.3,
  ice: 1.5,
};
const SUPPORT_WINDUP_RATE = 1.25;

export function windupLayersFor(skillId: string): SampleLayer[] {
  const arch = skillArchetype(skillId);
  const support = arch === 'heal' || arch === 'buff';
  const baseRate = support ? SUPPORT_WINDUP_RATE : WINDUP_RATE[elementOf(skillId)];
  // Gentle per-skill detune so two same-element casts aren't identical.
  const rate = baseRate * semitoneToRate(skillSemitone(skillId) / 3);
  return [{ urls: WINDUP_CHARGE_SAMPLES, gain: support ? 0.22 : 0.3, rate }];
}

// --- Travel (in-flight whoosh). --------------------------------------------
export function travelLayersFor(skillId: string): SampleLayer[] {
  const e = elementOf(skillId);
  // Half-strength pitch on travel so the whoosh tracks the skill's character.
  const rate = semitoneToRate(skillSemitone(skillId) / 2);
  return [{ urls: travelSamplesFor(e), gain: travelGainFor(e), rate }];
}

// --- Impact (landing). ------------------------------------------------------
// Heavy skills get a deep sub-boom layered under their element impact.
const HEAVY = new Set([
  'meteor', 'cataclysm_rings', 'combustion_bloom', 'execute', 'killing_strike',
  'seismic_rend', 'powerStrike', 'bash', 'arcane_supremacy', 'sunbreak_charge',
]);

export function impactLayersFor(skillId: string): SampleLayer[] {
  const arch = skillArchetype(skillId);
  const rate = semitoneToRate(skillSemitone(skillId) / 2);
  if (arch === 'heal' || arch === 'buff') {
    // A soft, bright sparkle — a heal/buff settling, not a hit.
    return [{ urls: SUPPORT_SPARKLE_SAMPLES, gain: 0.4, rate: rate * 1.4 }];
  }
  const e = elementOf(skillId);
  const layers: SampleLayer[] = [{ urls: impactSamplesFor(e), gain: impactGainFor(e), rate }];
  if (HEAVY.has(skillId) || e === 'fire') {
    layers.push({ urls: SUB_BOOM_SAMPLES, gain: HEAVY.has(skillId) ? 0.5 : 0.3, rate });
  }
  return layers;
}
