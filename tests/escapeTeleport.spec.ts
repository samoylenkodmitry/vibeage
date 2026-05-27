import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { SKILLS } from '../packages/content/skills';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { tryInterruptForNewAction } from '../server/combat/castInterrupt';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makeCaster(level = 1): PlayerState {
  return {
    id: 'p1', socketId: 'p1-s', name: 'Tester',
    position: { x: 500, y: 0.5, z: 500 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: ['escape'],
    availableSkillPoints: 0, skillCooldownEndTs: {},
    statusEffects: [],
    level, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
}

function makeWorld(caster: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [],
    onTargetDied: vi.fn(),
  };
}

function selfCast(casterId: string): Cast {
  return {
    castId: 'c-escape', casterId, skillId: 'escape',
    state: CastState.Impact,
    origin: { x: 500, z: 500 }, pos: { x: 500, z: 500 },
    startedAt: NOW, castTimeMs: 0,
  };
}

describe('PR WW — Escape teleport flow', () => {
  it('Escape resolution teleports the caster to the nearest village', () => {
    const caster = makeCaster();
    const before = { ...caster.position };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(selfCast(caster.id), outbound, makeWorld(caster), NOW);

    // Position must have changed away from (500, 500); the nearest
    // village (Talking Island, (0, 0, 0)) is the lvl 1 default.
    expect(caster.position).not.toEqual(before);
    expect(caster.position.x).toBe(0);
    expect(caster.position.z).toBe(0);
  });

  it('Escape is not interruptable — movement during channel cannot cancel it', () => {
    expect(SKILLS.escape.isInterruptable).toBe(false);
    const caster = makeCaster();
    caster.castingSkill = 'escape';
    caster.castingProgressMs = 5000;
    const activeCast: Cast = {
      castId: 'c-escape-channel', casterId: caster.id, skillId: 'escape',
      state: CastState.Casting,
      origin: { x: 500, z: 500 }, pos: { x: 500, z: 500 },
      startedAt: NOW, castTimeMs: 30_000,
    };
    const activeCasts = { [activeCast.castId]: activeCast };
    const outbound: OutboundEventSink = { publish: vi.fn() };
    const verdict = tryInterruptForNewAction(caster, activeCasts, outbound, 'movement', () => 0);
    // Locked recall channels block conflicting actions outright.
    expect(verdict).toBe('block');
    // Caster still casting; the cast wasn't dropped.
    expect(caster.castingSkill).toBe('escape');
    expect(activeCasts[activeCast.castId]).toBeTruthy();
  });
});
