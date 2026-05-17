import { beforeEach, describe, expect, it } from 'vitest';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { createTransientPlayer } from '../server/playerFactory';
import { recordWorldGauges } from '../server/world/tickPipeline';
import { CastState } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

describe('recordWorldGauges (Section 14 L709-L713)', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('sets players.active to the number of player entries', () => {
    const state = createGameState();
    state.players.p1 = createTransientPlayer('s1', 'p1');
    state.players.p2 = createTransientPlayer('s2', 'p2');

    recordWorldGauges(state);

    expect(runtimeMetrics.snapshot().gauges['players.active']).toBe(2);
  });

  it('sets enemies.total and enemies.alive separately', () => {
    const state = createGameState();
    const alive = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    const dead = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, NOW);
    dead.isAlive = false;
    state.enemies[alive.id] = alive;
    state.enemies[dead.id] = dead;

    recordWorldGauges(state);

    const g = runtimeMetrics.snapshot().gauges;
    expect(g['enemies.total']).toBe(2);
    expect(g['enemies.alive']).toBe(1);
  });

  it('sets casts.active from state.activeCasts', () => {
    const state = createGameState();
    state.activeCasts.c1 = { castId: 'c1', casterId: 'p1', skillId: 'fireball', state: CastState.Casting, origin: { x: 0, z: 0 }, startedAt: NOW, castTimeMs: 300 };
    state.activeCasts.c2 = { castId: 'c2', casterId: 'p2', skillId: 'iceBolt', state: CastState.Casting, origin: { x: 0, z: 0 }, startedAt: NOW, castTimeMs: 300 };

    recordWorldGauges(state);

    expect(runtimeMetrics.snapshot().gauges['casts.active']).toBe(2);
  });

  it('sets loot.groundStacks from state.groundLoot', () => {
    const state = createGameState();
    state.groundLoot['stack1'] = { lootId: 'stack1', items: [], position: { x: 0, z: 0 } } as never;
    state.groundLoot['stack2'] = { lootId: 'stack2', items: [], position: { x: 5, z: 0 } } as never;

    recordWorldGauges(state);

    expect(runtimeMetrics.snapshot().gauges['loot.groundStacks']).toBe(2);
  });

  it('sets zones.active and zones.playersTracked', () => {
    const state = createGameState();
    state.zones.activeZoneIds = ['zone-a', 'zone-b', 'zone-c'];
    state.zones.playerZoneIds = { p1: 'zone-a', p2: 'zone-b' };

    recordWorldGauges(state);

    const g = runtimeMetrics.snapshot().gauges;
    expect(g['zones.active']).toBe(3);
    expect(g['zones.playersTracked']).toBe(2);
  });
});
