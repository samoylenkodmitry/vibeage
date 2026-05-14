import { describe, expect, test } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { applySkillCostAndCooldown, hasEnoughMana, isSkillOnCooldown } from '../server/combat/cooldowns';
import { canCast, validateCastRequest } from '../server/combat/castRules';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'CooldownTester',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],
  skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  inventory: [],
  maxInventorySlots: 20,
  ...overrides,
});

describe('combat cooldown resources', () => {
  test('applies mana cost and cooldown in one resource update', () => {
    const now = 1_746_316_800_000;
    const player = makePlayer();

    const update = applySkillCostAndCooldown(player, 'fireball', SKILLS.fireball, now);

    expect(player.mana).toBe(80);
    expect(player.skillCooldownEndTs.fireball).toBe(now + SKILLS.fireball.cooldownMs);
    expect(update).toEqual({
      mana: 80,
      skillCooldownEndTs: { fireball: now + SKILLS.fireball.cooldownMs },
    });
  });

  test('reports mana and cooldown cast blockers through canCast', () => {
    const now = 1_746_316_800_000;
    const noMana = makePlayer({ mana: 0 });
    const onCooldown = makePlayer({
      skillCooldownEndTs: { fireball: now + 500 },
    });

    expect(hasEnoughMana(noMana, SKILLS.fireball)).toBe(false);
    expect(canCast(noMana, { id: 'fireball', range: SKILLS.fireball.range ?? 0 }, null, { x: 1, z: 0 }, now)).toEqual({
      canCast: false,
      reason: 'nomana',
    });
    expect(isSkillOnCooldown(onCooldown, 'fireball', now)).toBe(true);
    expect(canCast(onCooldown, { id: 'fireball', range: SKILLS.fireball.range ?? 0 }, null, { x: 1, z: 0 }, now)).toEqual({
      canCast: false,
      reason: 'cooldown',
    });
  });

  test('validates skill existence, ownership, and target range in one cast rule pass', () => {
    const player = makePlayer({ unlockedSkills: [] });

    expect(validateCastRequest(player, 'fireball', null, { x: 1, z: 0 })).toEqual({
      ok: false,
      reason: 'invalid',
    });

    player.unlockedSkills = ['fireball'];
    expect(validateCastRequest(player, 'fireball', null, { x: SKILLS.fireball.range + 1, z: 0 })).toEqual({
      ok: false,
      reason: 'outofrange',
    });

    const valid = validateCastRequest(player, 'fireball', null, { x: 1, z: 0 });
    expect(valid).toEqual({
      ok: true,
      skillId: 'fireball',
      skill: SKILLS.fireball,
    });
  });
});
