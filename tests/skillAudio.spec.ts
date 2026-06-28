import { describe, expect, it } from 'vitest';
import {
  elementOf,
  impactLayersFor,
  skillSemitone,
  travelLayersFor,
  windupFor,
} from '../apps/client/src/audio/skillAudio';

// The per-skill 3-phase audio is ear-verified, but the profile logic — element
// dispatch, deterministic per-skill pitch, layering — is pure and locked here.

describe('skillSemitone', () => {
  it('is deterministic and within the intended octave-ish range', () => {
    for (const id of ['fireball', 'iceBolt', 'smite', 'meteor', 'arcane_blast']) {
      const a = skillSemitone(id);
      expect(a).toBe(skillSemitone(id));
      expect(a).toBeGreaterThanOrEqual(-4);
      expect(a).toBeLessThanOrEqual(6);
    }
  });

  it('gives different skills distinct pitches (so same-element skills differ)', () => {
    const fireSkills = ['fireball', 'meteor', 'combustion_bloom', 'inferno_aura'];
    const pitches = new Set(fireSkills.map(skillSemitone));
    expect(pitches.size).toBeGreaterThan(1);
  });
});

describe('windupFor', () => {
  it('tints by element — fire growls (sawtooth), ice rings (triangle)', () => {
    expect(windupFor('fireball').type).toBe('sawtooth');
    expect(windupFor('iceBolt').type).toBe('triangle');
  });

  it('gives heals/buffs the soft sine swell instead of a damage charge', () => {
    const w = windupFor('greater_heal');
    expect(w.type).toBe('sine');
  });

  it('shifts the base frequency by the per-skill pitch', () => {
    // Two fire skills share the palette but not the pitch → different f0.
    expect(windupFor('fireball').f0).not.toBe(windupFor('meteor').f0);
  });
});

describe('travelLayersFor', () => {
  it('maps the element to its in-flight whoosh', () => {
    expect(elementOf('fireball')).toBe('fire');
    expect(travelLayersFor('fireball')[0].urls.some((u) => u.includes('thruster'))).toBe(true);
    expect(travelLayersFor('arcane_blast')[0].urls.some((u) => u.includes('laser'))).toBe(true);
  });
});

describe('impactLayersFor', () => {
  it('layers a deep sub-boom under heavy + fire impacts', () => {
    expect(impactLayersFor('meteor').length).toBe(2);   // heavy
    expect(impactLayersFor('fireball').length).toBe(2); // fire always gets weight
    expect(impactLayersFor('iceBolt').length).toBe(1);  // light, single layer
  });

  it('lands heals as a soft high sparkle, not a hit', () => {
    const layers = impactLayersFor('greater_heal');
    expect(layers.length).toBe(1);
    expect(layers[0].urls.some((u) => u.includes('Glass'))).toBe(true);
    expect(layers[0].gain).toBeLessThan(0.6);
  });
});
