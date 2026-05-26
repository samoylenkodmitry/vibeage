import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * Roadmap C14 — beneficial auras (Sacred Pulse, Mass Heal, Sacred
 * Aura, Group Bless) used to run getTargetsInArea, which excludes the
 * caster and collects enemies → they healed/buffed nearby *mobs* and
 * never the caster. They now land on the caster + allied players only.
 */

const NOW = 1_700_000_000_000;

function makePlayer(id: string, over: Partial<PlayerState> = {}): PlayerState {
  return {
    id, socketId: `${id}-s`, name: id,
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'healer', unlockedSkills: ['sacred_pulse'],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 20, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { healMult: 1 },
    ...over,
  };
}

function sacredPulseCast(casterId: string): Cast {
  return {
    castId: 'c-sp', casterId, skillId: 'sacred_pulse',
    state: CastState.Impact,
    origin: { x: 0, z: 0 }, pos: { x: 0, z: 0 },
    startedAt: NOW, castTimeMs: 0,
  };
}

describe('beneficial aura targeting (C14)', () => {
  it('heals the caster + a nearby ally, never the enemy in radius', () => {
    const caster = makePlayer('caster');
    const ally = makePlayer('ally', { position: { x: 2, y: 0.5, z: 0 } });
    const enemy = createEnemy('goblin', 18, { x: 1, y: 0, z: 0 }, NOW);
    enemy.health = 500;
    enemy.maxHealth = 500;

    const world: CombatWorld = {
      getEnemyById: (id) => (id === enemy.id ? enemy : null),
      getPlayerById: (id) => (id === caster.id ? caster : id === ally.id ? ally : null),
      // The area sweep returns everyone nearby — caster, ally, AND the mob.
      getEntitiesInCircle: () => [caster, ally, enemy],
      onTargetDied: vi.fn(),
    };
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(sacredPulseCast(caster.id), out, world);

    expect(caster.health).toBe(260); // 100 + 160 heal
    expect(ally.health).toBe(260);
    expect(enemy.health).toBe(500);  // untouched — auras don't heal enemies
  });
});
