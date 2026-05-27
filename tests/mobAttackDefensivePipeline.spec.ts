import { describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { castMobSkill, tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';
import type { StatusEffect } from '../packages/protocol/messages';

/**
 * Mob swings run the SAME defensive pipeline as player casts — shield
 * absorb, evasion dodge, and P.Def mitigation. Mobs attack through the
 * shared cast path now (`mobStrike` → tickCasts → damageResolution), so
 * these drive that live path end-to-end rather than a bespoke helper.
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
  return { id: `e-${over.type}`, durationMs: 60_000, startTimeTs: NOW, sourceSkill: 'test', ...over } as StatusEffect;
}

function setup(player: PlayerState, attackPower: number) {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const enemy = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, NOW);
  enemy.id = 'goblin-test'; // fixed id → deterministic miss seed
  enemy.stats = { ...enemy.stats, attackPower };
  state.enemies[enemy.id] = enemy; spatial.insert(enemy.id, { x: 1, z: 0 });
  state.players[player.id] = player; spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  const events: OutboundEvent[] = [];
  const outbound: OutboundEventSink = { publish: (e) => events.push(e) };
  const world = createWorldCombatBridge(state, outbound, spatial);
  const swing = (now: number) => {
    castMobSkill(enemy, player, 'mobStrike', now, { world, activeCasts: state.activeCasts, outbound });
    tickCasts(state.activeCasts, 50, outbound, world, now);
  };
  return { enemy, swing };
}

describe('mob swings run the shared defensive pipeline', () => {
  it('a shield buff absorbs mob damage before it reaches HP', () => {
    const player = makePlayer({ statusEffects: [effect({ type: 'shield', value: 250 })] });
    setup(player, 100).swing(NOW);
    expect(player.health, 'a ~100 hit is fully absorbed by a 250 shield').toBe(1000);
    const shield = player.statusEffects.find((e) => e.type === 'shield');
    expect(shield && shield.value < 250, 'shield pool drained by the hit').toBe(true);
  });

  it('overflow past a depleted shield lands on HP and removes the shield', () => {
    const player = makePlayer({ statusEffects: [effect({ type: 'shield', value: 30 })] });
    setup(player, 100).swing(NOW);
    expect(player.health, 'overflow past the 30-pt shield reaches HP').toBeLessThan(1000);
    expect(player.statusEffects.find((e) => e.type === 'shield'), 'depleted shield removed').toBeUndefined();
  });

  it('an Evade-style evasion buff dodges mob swings (0 damage on a miss)', () => {
    const player = makePlayer({ statusEffects: [effect({ type: 'evasion', value: 100 })] });
    const { swing } = setup(player, 100);
    let sawMiss = false;
    for (let i = 0; i < 12; i += 1) {
      const hpBefore = player.health;
      swing(NOW + i * 2_000);
      if (player.health === hpBefore) sawMiss = true; // unchanged HP = dodged
    }
    expect(sawMiss).toBe(true);
  });

  it('a lethal mob swing kills the player (canonical death state)', () => {
    const player = makePlayer({ health: 10, targetId: 'mob-1', castingSkill: 'fireball', castingProgressMs: 80 });
    const { enemy, swing } = setup(player, 100);
    enemy.stats!.accuracy = 10_000; // never dodged
    swing(NOW);
    expect(player.health).toBeLessThanOrEqual(0);
    expect(player.isAlive).toBe(false);
    expect(player.targetId).toBeNull();
    expect(player.castingSkill).toBeNull();
    expect(player.castingProgressMs).toBe(0);
  });

  it('P.Def mitigates mob damage — armored takes less than unarmored', () => {
    const armored = makePlayer({ id: 'armored', stats: { pDef: 200 } });
    const unarmored = makePlayer({ id: 'unarmored' });
    const a = setup(armored, 200); a.enemy.stats!.accuracy = 10_000; a.swing(NOW); // huge accuracy → never dodged, isolate mitigation
    const u = setup(unarmored, 200); u.enemy.stats!.accuracy = 10_000; u.swing(NOW);
    expect(1000 - armored.health, 'P.Def reduces the hit').toBeLessThan(1000 - unarmored.health);
    expect(unarmored.health, 'unbuffed mob damage still lands').toBeLessThan(1000);
  });
});
