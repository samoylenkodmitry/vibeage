import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { handleTargetDeath } from '../server/combat/targetDeath';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

/**
 * ROADMAP L624 + L625 — loot generation on death + XP rewards on death.
 *
 * `handleTargetDeath(caster, target, ctx)` is the single death seam.
 * For an enemy kill credited to a player, it must:
 *
 *  - flip `target.isAlive=false`, set `deathTimeTs`, health→0
 *  - remove the corpse from spatial
 *  - call `spawnLoot(state, outbound, enemy, caster)` when the enemy
 *    carries a `lootTableId`
 *  - award `baseExperienceValue` XP to the caster
 *  - emit a `playerUpdated` carrying the XP delta + skill points
 *
 * Each leg is exercised separately by other suites
 * (lootRateMultiplier.spec.ts, playerProgression.spec.ts) but the
 * *fan-out from a death* — that loot + XP both happen, in that
 * order, gated by `isEnemy` — wasn't directly pinned. This is the
 * narrow regression net for "did the kill reward the player?".
 */

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

function setup() {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const caster = createTransientPlayer('socket-killer', 'KillerPlayer');
  caster.level = 5;
  caster.experience = 0;
  state.players[caster.id] = caster;
  return { state, spatial, caster };
}

describe('handleTargetDeath — enemy kill rewards', () => {
  it('awards baseExperienceValue XP to the caster on enemy kill', () => {
    const { state, spatial, caster } = setup();
    const enemy = createEnemy('goblin', 2, { x: 0, y: 0.5, z: 0 }, 1);
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });
    const { events, sink } = captureOutbound();

    const result = handleTargetDeath(caster, enemy, {
      state, spatial, outbound: sink,
      // Stub spawnLoot to keep this case focused on the XP leg.
      spawnLoot: vi.fn(),
    });

    expect(result).toBe(true);
    expect(enemy.isAlive).toBe(false);
    expect(caster.experience).toBeGreaterThan(0);
    expect(caster.experience).toBe(enemy.baseExperienceValue);
    // Emits a `playerUpdated` with the XP delta + skill points (the
    // SkillTreePanel reads availableSkillPoints to enable / disable
    // buttons; emitting it on every level-up tick keeps the UI live).
    const playerUpdate = events.find((e) => e.type === 'playerUpdated');
    expect(playerUpdate).toBeDefined();
  });

  it('calls spawnLoot for an enemy carrying a lootTableId', () => {
    const { state, spatial, caster } = setup();
    const enemy = createEnemy('goblin', 2, { x: 0, y: 0.5, z: 0 }, 2);
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });
    // Sanity: createEnemy already wires a loot table for goblins.
    expect(enemy.lootTableId).toBeDefined();
    const spawnLoot = vi.fn();
    const { sink } = captureOutbound();

    handleTargetDeath(caster, enemy, { state, spatial, outbound: sink, spawnLoot });

    expect(spawnLoot).toHaveBeenCalledTimes(1);
    const [stateArg, outboundArg, enemyArg, killerArg] = spawnLoot.mock.calls[0];
    expect(stateArg).toBe(state);
    expect(outboundArg).toBe(sink);
    expect(enemyArg).toBe(enemy);
    // §45.3 follow-up — killer must be threaded so loot-rate spec
    // passives (Treasure Hunter Lucky Find) can scale drop chances.
    expect(killerArg).toBe(caster);
  });

  it('does NOT spawn loot when the enemy has no lootTableId (graceful no-op)', () => {
    const { state, spatial, caster } = setup();
    const enemy = createEnemy('goblin', 2, { x: 0, y: 0.5, z: 0 }, 3);
    enemy.lootTableId = undefined;
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });
    const spawnLoot = vi.fn();
    const { sink } = captureOutbound();

    handleTargetDeath(caster, enemy, { state, spatial, outbound: sink, spawnLoot });

    expect(spawnLoot).not.toHaveBeenCalled();
    // XP still awarded — loot and XP are independent paths.
    expect(caster.experience).toBe(enemy.baseExperienceValue);
  });
});

describe('handleTargetDeath — non-kill cases', () => {
  it('returns false (no double-credit) when called on an already-dead target', () => {
    const { state, spatial, caster } = setup();
    const enemy = createEnemy('goblin', 2, { x: 0, y: 0.5, z: 0 }, 4);
    enemy.isAlive = false;
    state.enemies[enemy.id] = enemy;
    const spawnLoot = vi.fn();
    const { sink } = captureOutbound();

    const result = handleTargetDeath(caster, enemy, { state, spatial, outbound: sink, spawnLoot });

    expect(result).toBe(false);
    expect(spawnLoot).not.toHaveBeenCalled();
    expect(caster.experience).toBe(0);
  });

  it('does NOT award XP when the caster is dead (post-mortem credit guard)', () => {
    const { state, spatial, caster } = setup();
    caster.isAlive = false;
    const enemy = createEnemy('goblin', 2, { x: 0, y: 0.5, z: 0 }, 5);
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 0, z: 0 });
    const spawnLoot = vi.fn();
    const { sink } = captureOutbound();

    handleTargetDeath(caster, enemy, { state, spatial, outbound: sink, spawnLoot });

    expect(caster.experience).toBe(0);
    expect(spawnLoot).not.toHaveBeenCalled();
    // The target still died and was de-spatialised; the reward leg
    // is the only thing the caster's death suppresses.
    expect(enemy.isAlive).toBe(false);
  });

  it('PvP kill (player kills player) is mortal but does NOT award XP or spawn loot', () => {
    const { state, spatial, caster } = setup();
    const victim = createTransientPlayer('socket-victim', 'VictimPlayer');
    state.players[victim.id] = victim;
    spatial.insert(victim.id, { x: 0, z: 0 });
    const spawnLoot = vi.fn();
    const { sink } = captureOutbound();

    handleTargetDeath(caster, victim, { state, spatial, outbound: sink, spawnLoot });

    expect(victim.isAlive).toBe(false);
    expect(caster.experience).toBe(0);
    expect(spawnLoot).not.toHaveBeenCalled();
  });
});
