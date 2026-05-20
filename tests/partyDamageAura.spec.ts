import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Theurge `Patron Saint` (proficiency, L40)
// grants a +5% damage aura to allied players within 15m. Live
// eval at calculateDamage: scan nearby players for spec carriers
// and apply each contributing multiplier.

function makeAlly(specializationId: string | null, x: number): PlayerState {
  return {
    id: `ally-${specializationId ?? 'none'}-${x}`, socketId: 's', name: 'a',
    position: { x, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: ['fireball'],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: PROFICIENCY_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
  };
}

function fireball(caster: PlayerState, target: { id: string; position: { x: number; z: number } }): Cast {
  return {
    castId: 'c-fb', casterId: caster.id, skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function worldOf(players: PlayerState[], target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => players.find((p) => p.id === id) ?? null,
    getEntitiesInCircle: (pos, radius) => {
      const rr = radius * radius;
      const inRange: Array<typeof target | PlayerState> = [];
      for (const p of players) {
        const dx = p.position.x - pos.x;
        const dz = p.position.z - pos.z;
        if (dx * dx + dz * dz <= rr) inRange.push(p);
      }
      const dx = target.position.x - pos.x;
      const dz = target.position.z - pos.z;
      if (dx * dx + dz * dz <= rr) inRange.push(target);
      return inRange;
    },
    onTargetDied: vi.fn(),
  };
}

function damageFromLog(events: OutboundEvent[]): number {
  for (const e of events) {
    const w = e as { type?: string; message?: { type?: string; damages?: number[] } };
    if (w.type !== 'serverMessage') continue;
    if (w.message?.type !== 'CombatLog') continue;
    if (!w.message.damages?.length) continue;
    return w.message.damages.reduce((a, b) => a + b, 0);
  }
  return 0;
}

describe('Theurge Patron Saint — +5% party damage aura', () => {
  it('a Theurge ally within 15m boosts a teammate\'s cast by 5%', () => {
    const teammate = makeAlly(null, 0);
    const theurge = makeAlly('theurge', 5); // 5m away
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const eBase: OutboundEvent[] = [];
    resolveCastImpact(fireball(teammate, target), { publish: (e) => eBase.push(e) }, worldOf([teammate], target));
    const baseDmg = damageFromLog(eBase);

    target.health = target.maxHealth;
    const eAura: OutboundEvent[] = [];
    resolveCastImpact(fireball(teammate, target), { publish: (e) => eAura.push(e) }, worldOf([teammate, theurge], target));
    const auraDmg = damageFromLog(eAura);

    expect(baseDmg).toBeGreaterThan(0);
    expect(auraDmg / baseDmg).toBeCloseTo(1.05, 4);
  });

  it("a Theurge beyond 15m doesn't contribute", () => {
    const teammate = makeAlly(null, 0);
    const farTheurge = makeAlly('theurge', 25); // out of range
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());

    const e: OutboundEvent[] = [];
    resolveCastImpact(fireball(teammate, target), { publish: (e0) => e.push(e0) }, worldOf([teammate, farTheurge], target));
    target.health = target.maxHealth;
    const eBase: OutboundEvent[] = [];
    resolveCastImpact(fireball(teammate, target), { publish: (e0) => eBase.push(e0) }, worldOf([teammate], target));

    expect(damageFromLog(e)).toBe(damageFromLog(eBase));
  });
});
