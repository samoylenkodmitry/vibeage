import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

function makeWarrior(): PlayerState {
  return {
    id: 'warrior-1', socketId: 'sock', name: 'warrior-1',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 200, maxHealth: 200, mana: 50, maxMana: 50,
    className: 'warrior', unlockedSkills: ['powerStrike'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
}

function makeWorld(caster: PlayerState, enemy: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id: string) => (id === enemy.id ? enemy : null),
    getPlayerById: (id: string) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [enemy],
    onTargetDied: vi.fn(),
  };
}

function powerStrikeCast(caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: 'c-knockback', casterId: caster.id, skillId: 'powerStrike',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

// §45.4 — powerStrike has `{ type: 'knockback', value: 6, durationMs: 200 }`
// in skills.ts. After resolveCastImpact, the enemy's position must be
// shifted 6 units along the caster→target vector, not parked in place
// with an inert status row.

describe('knockback effect', () => {
  it('pushes the enemy along the caster→target vector by the configured distance', () => {
    const caster = makeWarrior();
    const enemy = createEnemy('goblin', 1, { x: 3, y: 0, z: 4 }, Date.now());
    const before = { x: enemy.position.x, z: enemy.position.z };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(powerStrikeCast(caster, enemy), outbound, makeWorld(caster, enemy));

    // Vector from caster (0,0) to enemy (3,4) has length 5. After a
    // 6-unit push the enemy should sit on the same ray, 5+6=11 units
    // from caster.
    const dist = Math.hypot(enemy.position.x, enemy.position.z);
    expect(dist).toBeCloseTo(11, 4);
    // Direction preserved (same x:z ratio as before, scaled).
    expect(enemy.position.x / enemy.position.z).toBeCloseTo(before.x / before.z, 4);
  });

  it('is a no-op when the caster and target share a position (zero vector)', () => {
    const caster = makeWarrior();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, Date.now());
    const outbound: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(powerStrikeCast(caster, enemy), outbound, makeWorld(caster, enemy));

    expect(enemy.position.x).toBe(0);
    expect(enemy.position.z).toBe(0);
  });
});
