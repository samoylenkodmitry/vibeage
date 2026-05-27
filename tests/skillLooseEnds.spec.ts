import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SKILLS } from '../packages/content/skills';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makeCaster(): PlayerState {
  return {
    id: 'atk', socketId: 's', name: 'atk',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 40, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

describe('C15 harmful self-auras sweep nearby enemies', () => {
  it('inferno_aura applies burn to an enemy near the caster (no explicit target)', () => {
    const caster = makeCaster();
    const enemy = createEnemy('goblin', 40, { x: 2, y: 0, z: 0 }, NOW);
    const world: CombatWorld = {
      getEnemyById: (id) => (id === enemy.id ? enemy : null),
      getPlayerById: (id) => (id === caster.id ? caster : null),
      getEntitiesInCircle: () => [enemy],
      onTargetDied: vi.fn(),
    };
    const cast: Cast = {
      castId: 'c', casterId: caster.id, skillId: 'inferno_aura',
      state: CastState.Impact, origin: { x: 0, z: 0 }, pos: { x: 0, z: 0 },
      startedAt: NOW, castTimeMs: 0,
    };
    resolveCastImpact(cast, { publish: vi.fn() } as OutboundEventSink, world, NOW);
    expect(enemy.statusEffects.some((e) => e.type === 'burn')).toBe(true);
  });
});

describe('C16 silent_step drops chasers', () => {
  it('emits invisibility + aggroReset and self-targets', () => {
    expect(SKILLS.silent_step.effects.map((e) => e.type).sort()).toEqual(['aggroReset', 'invisible']);
    // selfTarget guards the with-an-enemy-selected cast path (like Vanish).
    expect(SKILLS.silent_step.selfTarget).toBe(true);
  });
});

describe('D18 iceBolt poison is a real (flat) DoT', () => {
  it('poison value is a meaningful flat amount, not the 0.5 no-op', () => {
    const poison = SKILLS.iceBolt.effects.find((e) => e.type === 'poison');
    expect(poison?.value).toBe(3);
  });
});

describe('B8 treasure_sense reveals loot', () => {
  it('emits a reveal_loot buff, not the old evasion buff', () => {
    expect(SKILLS.treasure_sense.effects.map((e) => e.type)).toEqual(['reveal_loot']);
  });
});
