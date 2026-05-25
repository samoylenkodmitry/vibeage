import { describe, expect, it } from 'vitest';
import { validateCastRequest } from '../server/combat/castRules';
import { SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Templar Knight `Bulwark` carries
// `rangeMultiplierBySkill: { taunt: 1.5 }`. `validateCastRequest`
// multiplies the cast's effective range by the spec's per-skill
// modifier so a Templar can land Taunt from 50% further away.

function makeKnight(specializationId: string | null): PlayerState {
  return {
    id: 'knight', socketId: 's', name: 'knight',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'knight', unlockedSkills: ['taunt'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: SPECIALIZATION_UNLOCK_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
  };
}

describe("Templar Knight Bulwark — Taunt range +50%", () => {
  it("rejects an unspecced taunt at 14m (>12m baseline range)", () => {
    const caster = makeKnight(null);
    const target = createEnemy('goblin', 1, { x: 14, y: 0, z: 0 }, Date.now());
    const result = validateCastRequest(caster, 'taunt', target, undefined, Date.now());
    expect(result).toEqual({ ok: false, reason: 'outofrange' });
  });

  it("lets a Templar Knight taunt at 14m (within 12 × 1.5 = 18m)", () => {
    const caster = makeKnight('templar_knight');
    const target = createEnemy('goblin', 1, { x: 14, y: 0, z: 0 }, Date.now());
    const result = validateCastRequest(caster, 'taunt', target, undefined, Date.now());
    expect(result.ok).toBe(true);
  });

  it("still rejects a Templar Knight taunt past the extended range (>18m)", () => {
    const caster = makeKnight('templar_knight');
    const target = createEnemy('goblin', 1, { x: 19, y: 0, z: 0 }, Date.now());
    const result = validateCastRequest(caster, 'taunt', target, undefined, Date.now());
    expect(result).toEqual({ ok: false, reason: 'outofrange' });
  });
});
