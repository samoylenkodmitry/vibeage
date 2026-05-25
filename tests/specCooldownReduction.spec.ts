import { describe, expect, it } from 'vitest';
import { applySkillCostAndCooldown } from '../server/combat/cooldowns';
import { SKILLS } from '../packages/content/skills';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — `cooldownMultiplierBySkill` lets a spec
// passive shorten one skill's stored cooldown. Eva's Templar
// `Aegis` halves Divine Shield; Plains Walker `Shadow Step`
// halves Vanish.

function makePlayer(className: PlayerState['className'], specializationId: string | null): PlayerState {
  return {
    id: 'p1', socketId: 's', name: 'p1',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className, unlockedSkills: [],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: PROFICIENCY_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
  };
}

describe("per-skill cooldown reduction from spec passives", () => {
  it("Eva's Templar halves Divine Shield's cooldown via Aegis", () => {
    const NOW = 1_000_000;
    const baseline = makePlayer('paladin', null);
    const evas = makePlayer('paladin', 'evas_templar');
    const skill = SKILLS.divineShield;

    applySkillCostAndCooldown(baseline, 'divineShield', skill, NOW);
    applySkillCostAndCooldown(evas, 'divineShield', skill, NOW);

    const baseDur = (baseline.skillCooldownEndTs?.divineShield ?? 0) - NOW;
    const evasDur = (evas.skillCooldownEndTs?.divineShield ?? 0) - NOW;
    expect(baseDur).toBe(skill.cooldownMs);
    expect(evasDur).toBe(skill.cooldownMs * 0.5);
  });

  it('Plains Walker halves Vanish cooldown via Shadow Step', () => {
    const NOW = 2_000_000;
    const baseline = makePlayer('rogue', null);
    const plains = makePlayer('rogue', 'plains_walker');
    const skill = SKILLS.vanish;

    applySkillCostAndCooldown(baseline, 'vanish', skill, NOW);
    applySkillCostAndCooldown(plains, 'vanish', skill, NOW);

    const baseDur = (baseline.skillCooldownEndTs?.vanish ?? 0) - NOW;
    const plainsDur = (plains.skillCooldownEndTs?.vanish ?? 0) - NOW;
    expect(baseDur).toBe(skill.cooldownMs);
    expect(plainsDur).toBe(skill.cooldownMs * 0.5);
  });

  it("does NOT touch unrelated skills' cooldowns", () => {
    const NOW = 3_000_000;
    const plains = makePlayer('rogue', 'plains_walker');
    const skill = SKILLS.backstab;
    applySkillCostAndCooldown(plains, 'backstab', skill, NOW);
    const dur = (plains.skillCooldownEndTs?.backstab ?? 0) - NOW;
    expect(dur).toBe(skill.cooldownMs);
  });
});
