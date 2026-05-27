import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import type { PlayerState, StatusEffect } from '../packages/sim/entities';

function makeMage(): PlayerState {
  return {
    id: 'mage-1', socketId: 's', name: 'mage-1',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: ['waterSplash', 'fireball'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function makeWorld(caster: PlayerState, enemy: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === enemy.id ? enemy : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [enemy],
    onTargetDied: vi.fn(),
  };
}

function cast(skillId: 'waterSplash' | 'fireball', caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: `c-${skillId}`, casterId: caster.id, skillId,
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function applyWaterWeakness(enemy: ReturnType<typeof createEnemy>, value: number, ms: number): void {
  const effect: StatusEffect = {
    id: 'ww-1', type: 'waterWeakness', value, durationMs: ms,
    startTimeTs: Date.now(), sourceSkill: 'waterSplash',
  };
  enemy.statusEffects = [effect];
}

function damageFromCombatLog(events: OutboundEvent[]): number {
  for (const e of events) {
    const wrapped = e as { type?: string; message?: { type?: string; damages?: number[] } };
    if (wrapped.type !== 'serverMessage') continue;
    if (wrapped.message?.type !== 'CombatLog') continue;
    const damages = wrapped.message.damages;
    if (damages?.length) return damages.reduce((a, b) => a + b, 0);
  }
  return 0;
}

// §45.4 — waterSplash carries `damageElement: 'water'`. A target
// with an active `waterWeakness` effect takes amplified damage on
// subsequent water casts. Other elements (fireball is neutral
// today) ignore the effect.

// `getDamage` uses `${castId}:${targetId}` as the variance seed,
// so two casts on the same target with the same castId produce
// identical pre-amplifier damage rolls — letting us isolate the
// amplifier as the only variable.

describe('water-weakness damage amplifier', () => {
  it('amplifies a water cast by 1 + value/100 when the target has waterWeakness', () => {
    const caster = makeMage();
    const enemy = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const eBase: OutboundEvent[] = [];
    resolveCastImpact(cast('waterSplash', caster, enemy), { publish: (e) => eBase.push(e) }, makeWorld(caster, enemy), Date.now());
    const base = damageFromCombatLog(eBase);
    expect(base).toBeGreaterThan(0);

    // Reset target HP + apply weakness; same castId + targetId → same RNG roll.
    enemy.health = enemy.maxHealth;
    applyWaterWeakness(enemy, 30, 5_000);
    const eAmp: OutboundEvent[] = [];
    resolveCastImpact(cast('waterSplash', caster, enemy), { publish: (e) => eAmp.push(e) }, makeWorld(caster, enemy), Date.now());
    const amped = damageFromCombatLog(eAmp);

    expect(amped / base).toBeCloseTo(1.3, 4);
  });

  it('does NOT amplify a non-water cast on a waterWeakness target', () => {
    const caster = makeMage();
    const enemy = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const eBase: OutboundEvent[] = [];
    resolveCastImpact(cast('fireball', caster, enemy), { publish: (e) => eBase.push(e) }, makeWorld(caster, enemy), Date.now());
    const base = damageFromCombatLog(eBase);

    enemy.health = enemy.maxHealth;
    applyWaterWeakness(enemy, 30, 5_000);
    const eWithEffect: OutboundEvent[] = [];
    resolveCastImpact(cast('fireball', caster, enemy), { publish: (e) => eWithEffect.push(e) }, makeWorld(caster, enemy), Date.now());
    const dmg = damageFromCombatLog(eWithEffect);

    expect(dmg).toBe(base);
  });
});
