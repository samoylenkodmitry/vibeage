import { describe, expect, it } from 'vitest';
import {
  elementOf,
  impactLayersFor,
  skillSemitone,
  travelLayersFor,
  windupLayersFor,
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

describe('windupLayersFor', () => {
  it('is one sampled energy charge (force-field), pitched per element', () => {
    const fire = windupLayersFor('fireball');
    expect(fire.length).toBe(1);
    expect(fire[0].urls.some((u) => u.includes('forceField'))).toBe(true);
    // Ice charges brighter (higher rate) than fire — the per-element character.
    expect(windupLayersFor('iceBolt')[0].rate).toBeGreaterThan(fire[0].rate as number);
  });

  it('gives heals/buffs a softer, quieter charge than a damage cast', () => {
    const heal = windupLayersFor('greater_heal')[0];
    const fire = windupLayersFor('fireball')[0];
    expect(heal.gain).toBeLessThan(fire.gain as number);
  });

  it('detunes the charge per skill so two same-element casts differ', () => {
    // Two fire skills share the palette but not the per-skill pitch → different rate.
    expect(windupLayersFor('fireball')[0].rate).not.toBe(windupLayersFor('meteor')[0].rate);
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
