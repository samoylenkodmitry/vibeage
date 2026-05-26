import { describe, expect, it } from 'vitest';
import { applyEnemyAttack } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

/**
 * Regression net for the unified defensive pipeline: shield absorb,
 * Templar Last Stand mitigation, and Evade-style dodge buffs used to
 * apply only to player casts (PvP). Mob melee subtracted attackDamage
 * straight off HP, so the buffs silently did nothing against the
 * common case. These pin that mob swings now run the same math.
 */

const NOW = 1_700_000_000_000;

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1', socketId: 's', name: 'p1',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 100, maxMana: 100,
    className: 'knight', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    ...over,
  };
}

function effect(over: Partial<StatusEffect> & Pick<StatusEffect, 'type' | 'value'>): StatusEffect {
  return {
    id: `e-${over.type}`, durationMs: 60_000, startTimeTs: NOW, sourceSkill: 'test',
    ...over,
  } as StatusEffect;
}

function readyEnemy(attackDamage: number) {
  const enemy = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, NOW);
  // Fixed id so the seeded miss roll (`${enemy.id}:${player.id}:${now}`)
  // is deterministic run-to-run instead of riding createEnemy's random id.
  enemy.id = 'goblin-test';
  enemy.attackDamage = attackDamage;
  enemy.attackCooldownMs = 1_000;
  enemy.lastAttackTime = 0; // off cooldown at NOW
  return enemy;
}

describe('enemy attacks run the shared defensive pipeline', () => {
  it('a shield buff absorbs mob damage before it reaches HP', () => {
    const player = makePlayer({ statusEffects: [effect({ type: 'shield', value: 250 })] });
    const enemy = readyEnemy(100);

    const result = applyEnemyAttack(enemy, player, NOW)!;

    // Fully absorbed → no HP lost, shield pool drained by the hit.
    expect(player.health).toBe(1000);
    expect(result.miss).toBe(false);
    const shield = player.statusEffects.find((e) => e.type === 'shield');
    expect(shield?.value).toBe(150);
  });

  it('overflow past a depleted shield lands on HP and removes the shield', () => {
    const player = makePlayer({ statusEffects: [effect({ type: 'shield', value: 30 })] });
    const enemy = readyEnemy(100);

    applyEnemyAttack(enemy, player, NOW);

    expect(player.health).toBe(930); // 100 - 30 absorbed
    expect(player.statusEffects.find((e) => e.type === 'shield')).toBeUndefined();
  });

  it('an Evade-style evasion buff dodges mob swings (0 damage on a miss)', () => {
    // 100 → 0.95 dodge (the buff cap). Scan a handful of deterministic
    // ticks; with a fixed seed at least one is a miss (P(no miss in 12
    // ticks) = 0.05^12 ≈ 0), and every miss leaves HP untouched.
    const player = makePlayer({ statusEffects: [effect({ type: 'evasion', value: 100 })] });
    const enemy = readyEnemy(100);

    let sawMiss = false;
    for (let i = 0; i < 12; i += 1) {
      const hpBefore = player.health;
      const result = applyEnemyAttack(enemy, player, NOW + i * 2_000);
      if (result?.miss) {
        sawMiss = true;
        expect(result.damage).toBe(0);
        expect(player.health).toBe(hpBefore);
      }
    }
    expect(sawMiss).toBe(true);
  });

  it('no buffs → mob damage lands in full (no regression)', () => {
    const player = makePlayer();
    const enemy = readyEnemy(100);

    const result = applyEnemyAttack(enemy, player, NOW)!;

    expect(result.miss).toBe(false);
    expect(result.damage).toBe(100);
    expect(player.health).toBe(900);
  });
});
