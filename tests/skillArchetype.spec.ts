import { describe, expect, test } from 'vitest';
import { skillArchetype } from '../apps/client/src/vfx/skillThemeConfig';

// The support-archetype classifier drives the heal/buff/curse VFX dispatch. It
// reads a skill's EFFECTS, so a heal looks restorative and a buff uplifting no
// matter how they're delivered — while damage skills keep the element/mechanic
// path. Pin the classification so a heal can never regress to an attack VFX.
describe('skill archetype (support VFX dispatch)', () => {
  test('heals classify as heal', () => {
    expect(skillArchetype('greater_heal')).toBe('heal');
    expect(skillArchetype('mass_heal')).toBe('heal');
  });

  test('self-buffs (shield/bless/evasion/...) classify as buff', () => {
    expect(skillArchetype('bless')).toBe('buff');
    expect(skillArchetype('divineShield')).toBe('buff');
    expect(skillArchetype('shieldWall')).toBe('buff');
  });

  test('pure debuffs classify as curse', () => {
    expect(skillArchetype('taunt')).toBe('curse');
  });

  test('damage skills are NOT support archetypes (keep element/mechanic VFX)', () => {
    expect(skillArchetype('fireball')).toBeNull();
    expect(skillArchetype('iceBolt')).toBeNull();
    // a damage skill with an incidental DoT (poison bolt) stays damage, not curse
    expect(skillArchetype('poisonBlade')).toBeNull();
    expect(skillArchetype('arrowShot')).toBeNull();
  });

  test('bespoke skills are NOT reclassified as support (keep their own VFX)', () => {
    // time_sphere is timeStop-only — must keep its dome, so timeStop is NOT a debuff.
    expect(skillArchetype('time_sphere')).toBeNull();
    // petrify is damage + stun → damage path (keeps its stone-erupt), not curse.
    expect(skillArchetype('petrify')).toBeNull();
  });

  test('unknown skill ids are null (no crash)', () => {
    expect(skillArchetype('not_a_real_skill')).toBeNull();
  });
});
