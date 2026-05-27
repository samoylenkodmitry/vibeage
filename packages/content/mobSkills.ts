import type { SkillDef } from './skills.js';

/**
 * Mob abilities. Owned only by enemy templates (EnemyTemplate.skills) —
 * never in a class/tree, so players can't learn them — but cast through
 * the SAME pipeline players use. All weapon-scaled, so a mob's output
 * stays its spec'd `attackPower`; the skill adds element / effects /
 * cadence for flavour. `mobStrike` is the universal basic attack.
 */
export const MOB_SKILLS: Record<string, SkillDef> = {
  mobStrike: {
    id: 'mobStrike', name: 'Strike', description: 'A basic melee strike scaled by the attacker\'s power.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'physical',
    manaCost: 0, castMs: 0, cooldownMs: 0, weaponScaled: true,
    range: 2, levelRequired: 1, requiresTarget: true, autoRepeat: true, isBlocking: false,
    // Damage comes from `weaponScaled` (caster.attackPower); the effect
    // row marks it a damage skill (value is illustrative, not the source).
    effects: [{ type: 'damage', value: 1 }],
  },
  mobPoisonBite: {
    id: 'mobPoisonBite', name: 'Venomous Bite', description: 'A bite that leaves the target poisoned.',
    icon: '/game/skills/skill_stealth.svg', cat: 'instant', kind: 'physical', damageElement: 'poison',
    manaCost: 0, castMs: 0, cooldownMs: 6000, weaponScaled: true, isBlocking: false,
    range: 2, levelRequired: 1, requiresTarget: true,
    effects: [{ type: 'damage', value: 1 }, { type: 'poison', value: 4, durationMs: 8000 }],
  },
  mobFirebolt: {
    id: 'mobFirebolt', name: 'Fire Bolt', description: 'Sears the target with fire, leaving it burning.',
    icon: '/game/skills/skill_fireball.png', cat: 'instant', kind: 'magical', damageElement: 'fire',
    manaCost: 0, castMs: 0, cooldownMs: 4000, weaponScaled: true, isBlocking: false,
    range: 14, levelRequired: 1, requiresTarget: true,
    effects: [{ type: 'damage', value: 1 }, { type: 'burn', value: 1, durationMs: 4000 }],
  },
  mobFrostbolt: {
    id: 'mobFrostbolt', name: 'Frost Bolt', description: 'Strikes the target with ice, slowing it.',
    icon: '/game/skills/skill_icebolt.png', cat: 'instant', kind: 'magical', damageElement: 'ice',
    manaCost: 0, castMs: 0, cooldownMs: 4000, weaponScaled: true, isBlocking: false,
    range: 14, levelRequired: 1, requiresTarget: true,
    effects: [{ type: 'damage', value: 1 }, { type: 'slow', value: 30, durationMs: 3000 }],
  },
};
