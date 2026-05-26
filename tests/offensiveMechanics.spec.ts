import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState } from '../packages/protocol/messages';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { mitigatedDamage } from '../packages/sim/combatMath';
import type { SkillId } from '../packages/content/skills';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * Roadmap B9/B11/B12 — offensive skill flags that used to be flavour
 * text only: execute (wounded-target bonus), soul_eater (lifesteal),
 * shadow_strike (armor-pen). (B10 crit is RNG; covered by the flag
 * plumbing + statistical feel rather than a brittle unit assertion.)
 */

const NOW = 1_700_000_000_000;

function caster(over: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'atk', socketId: 's', name: 'atk',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 500, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'rogue', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 40, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2 },
    ...over,
  };
}

function cast(skillId: SkillId, casterId: string, targetId: string): Cast {
  return {
    castId: `c-${skillId}`, casterId, skillId,
    state: CastState.Impact, origin: { x: 0, z: 0 }, pos: { x: 1, z: 0 },
    startedAt: NOW, castTimeMs: 0, targetId,
  };
}

function worldFor(atk: PlayerState, enemy: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === enemy.id ? enemy : null),
    getPlayerById: (id) => (id === atk.id ? atk : null),
    getEntitiesInCircle: () => [enemy],
    onTargetDied: vi.fn(),
  };
}

function damageDealt(skillId: SkillId, enemyHpFraction: number): number {
  const atk = caster();
  const enemy = createEnemy('goblin', 40, { x: 1, y: 0, z: 0 }, NOW);
  // Huge pool so even a 95%-wounded target survives the hit and the
  // full execute damage shows up (not capped by remaining HP).
  enemy.maxHealth = 1_000_000;
  enemy.health = Math.round(1_000_000 * enemyHpFraction);
  const before = enemy.health;
  const out: OutboundEventSink = { publish: vi.fn() };
  resolveCastImpact(cast(skillId, atk.id, enemy.id), out, worldFor(atk, enemy));
  return before - enemy.health;
}

describe('B9 execute scales with the target wound', () => {
  it('hits much harder at low HP than at full HP', () => {
    const atFull = damageDealt('execute', 1.0);
    const atLow = damageDealt('execute', 0.05); // ~95% wounded
    // executeBonus 1.5 → ~+143% at 5% HP. Allow for the ±10% variance roll.
    expect(atLow).toBeGreaterThan(atFull * 1.8);
  });
});

describe('B11 soul_eater drains life to the caster', () => {
  it('heals the caster for ~50% of the damage dealt', () => {
    const atk = caster({ health: 100 });
    const enemy = createEnemy('goblin', 40, { x: 1, y: 0, z: 0 }, NOW);
    enemy.maxHealth = 10_000; enemy.health = 10_000;
    const out: OutboundEventSink = { publish: vi.fn() };
    resolveCastImpact(cast('soul_eater', atk.id, enemy.id), out, worldFor(atk, enemy));
    const dealt = 10_000 - enemy.health;
    expect(atk.health).toBeCloseTo(100 + dealt * 0.5, 0);
  });
});

describe('B12 shadow_strike pierces armor', () => {
  it('a defended target takes more from an armor-pen hit than a normal one', () => {
    // Compare the mitigation an armored target would suffer: with 500
    // penetration vs 500 P.Def, the hit is fully un-mitigated.
    const raw = 240;
    expect(mitigatedDamage(raw, 500, 500)).toBe(raw);          // pierced → full
    expect(mitigatedDamage(raw, 500, 0)).toBeLessThan(raw);    // unpierced → reduced
  });
});
