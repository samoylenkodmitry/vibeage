import type { SpellElement } from '../vfx/spellFx';
import { skillArchetype, skillThemeFor } from '../vfx/skillThemeConfig';
import type { SampleLayer } from './samples';
import type { WindupParams } from './spellVoices';
import {
  impactGainFor,
  impactSamplesFor,
  SUB_BOOM_SAMPLES,
  SUPPORT_SPARKLE_SAMPLES,
  travelGainFor,
  travelSamplesFor,
} from './sampleMap';

/**
 * Per-skill audio profiles, in three phases — cast (windup), travel (in-flight),
 * impact (landing). Two things make every one of the ~150 skills sound distinct
 * without hand-authoring 150 clips:
 *
 *  1. a per-ELEMENT palette (fire roars, ice rings, holy chimes, …), and
 *  2. a deterministic per-SKILL pitch shift hashed from the skill id, so two
 *     fire skills never sound identical.
 *
 * Heals/buffs (skillArchetype) get an uplifting windup + a soft sparkle instead
 * of a damage slam. A few signature skills get bespoke tweaks on top.
 */

export type Elem = SpellElement | 'physical';

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

// --- Element windup palette (synth charge). --------------------------------
const WINDUP: Record<Elem, WindupParams> = {
  fire: { f0: 140, rise: 1.5, type: 'sawtooth', noise: 0.5 },
  ice: { f0: 520, rise: 1.7, type: 'triangle', noise: 0.35 },
  holy: { f0: 330, rise: 1.5, type: 'sine', detune: 8, noise: 0.2 },
  poison: { f0: 110, rise: 1.35, type: 'sawtooth', noise: 0.55 },
  arcane: { f0: 280, rise: 1.9, type: 'sine', detune: 14, noise: 0.4 },
  physical: { f0: 190, rise: 1.3, type: 'triangle', noise: 0.25, dur: 0.24, gain: 0.14 },
};

// An uplifting, soft swell for heals/buffs — no harsh charge.
export const SUPPORT_WINDUP: WindupParams = { f0: 392, rise: 1.5, type: 'sine', detune: 10, noise: 0.12, gain: 0.16, dur: 0.5 };

/** The elements that have a sound palette, derived from the windup table (kept in sync by its Record type). */
export const SPELL_ELEMENTS = Object.keys(WINDUP) as Elem[];

/** Base (un-pitched) cast windup for an element — the wiki Sounds page previews these. */
export function elementWindup(e: Elem): WindupParams {
  return WINDUP[e];
}

// Bespoke windup tweaks for signature skills (merged over the element base).
const WINDUP_OVERRIDE: Record<string, Partial<WindupParams>> = {
  meteor: { f0: 90, rise: 1.4, dur: 0.7, noise: 0.6 },
  arcane_supremacy: { dur: 0.6, detune: 22 },
  cataclysm_rings: { f0: 80, rise: 1.6, dur: 0.6 },
  escape: { f0: 240, rise: 2.2, dur: 0.6 },
};

export function windupFor(skillId: string): WindupParams {
  const arch = skillArchetype(skillId);
  const base = arch === 'heal' || arch === 'buff' ? SUPPORT_WINDUP : WINDUP[elementOf(skillId)];
  const semis = skillSemitone(skillId);
  const merged = { ...base, ...WINDUP_OVERRIDE[skillId] };
  return { ...merged, f0: merged.f0 * semitoneToRate(semis) };
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
