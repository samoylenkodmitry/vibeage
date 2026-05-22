import { describe, expect, it, vi } from 'vitest';
import {
  ENEMY_RESPAWN_DELAY_MS,
  MINI_BOSS_RESPAWN_DELAY_MS,
  createEnemy,
  respawnDeadEnemies,
} from '../server/enemies/enemyLifecycle';
import { handleTargetDeath } from '../server/combat/targetDeath';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createTransientPlayer } from '../server/playerFactory';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import type { GameState } from '../server/gameState';

/**
 * §11 — mini-boss named encounter tracking.
 *
 * Pins three properties that turn a boss kill from a 30-second
 * farming loop into a meaningful zone event:
 *  1. MINI_BOSS_RESPAWN_DELAY_MS is much longer than the regular
 *     ENEMY_RESPAWN_DELAY_MS.
 *  2. When a mini-boss falls, the server broadcasts to all players.
 *  3. When a mini-boss respawns, the server broadcasts the comeback
 *     line referencing the zone hint from MINI_BOSSES content.
 */

function captureOutbound() {
  const events: OutboundEvent[] = [];
  return {
    sink: { publish: (e: OutboundEvent) => { events.push(e); } },
    events,
  };
}

function makeState(): GameState {
  return {
    players: {},
    enemies: {},
    groundLoot: {},
    zones: { activeZoneIds: [], enemyZoneIds: {} },
  } as unknown as GameState;
}

const noopSpawnLoot = () => { /* loot spawning is out of scope for this spec */ };

describe('§11 mini-boss respawn delay', () => {
  it('MINI_BOSS_RESPAWN_DELAY_MS is much longer than ENEMY_RESPAWN_DELAY_MS', () => {
    expect(MINI_BOSS_RESPAWN_DELAY_MS).toBeGreaterThan(ENEMY_RESPAWN_DELAY_MS * 10);
    // 10-minute floor — feel-of-a-real-boss target.
    expect(MINI_BOSS_RESPAWN_DELAY_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });
});

describe('§11 mini-boss death broadcast', () => {
  it('handleTargetDeath emits a ChatBroadcast when the target was a mini-boss', () => {
    const boss = createEnemy('goblin', 5, { x: 100, y: 0.5, z: 100 }, 1, {
      isMiniBoss: true,
      bossId: 'grakk',
      nameOverride: 'Grakk the Goblin Chief',
    });
    const caster = createTransientPlayer('s1', 'TestSlayer');
    caster.id = 'p1';
    const state = makeState();
    state.enemies[boss.id] = boss;
    const spatial = new SpatialHashGrid();
    spatial.insert(boss.id, boss.position);
    const { sink, events } = captureOutbound();

    handleTargetDeath(caster, boss, { state, spatial, outbound: sink, now: 1_000_000, spawnLoot: noopSpawnLoot });

    const broadcast = events.find((e) =>
      e.type === 'serverMessage'
      && e.message.type === 'ChatBroadcast'
      && e.message.text.includes('Grakk the Goblin Chief has fallen'),
    );
    expect(broadcast, 'expected a ChatBroadcast announcing the boss kill').toBeDefined();
  });

  it('regular mob deaths do NOT broadcast (low signal-to-noise floor)', () => {
    const mob = createEnemy('goblin', 3, { x: 100, y: 0.5, z: 100 }, 1);
    const caster = createTransientPlayer('s1', 'TestSlayer');
    caster.id = 'p1';
    const state = makeState();
    state.enemies[mob.id] = mob;
    const spatial = new SpatialHashGrid();
    spatial.insert(mob.id, mob.position);
    const { sink, events } = captureOutbound();

    handleTargetDeath(caster, mob, { state: state as GameState, spatial, outbound: sink, now: 1_000_000 });

    const chatBroadcasts = events.filter((e) =>
      e.type === 'serverMessage' && e.message.type === 'ChatBroadcast',
    );
    expect(chatBroadcasts).toHaveLength(0);
  });
});

describe('§11 mini-boss respawn broadcast', () => {
  it('respawnDeadEnemies emits a ChatBroadcast when a mini-boss returns', () => {
    const boss = createEnemy('goblin', 5, { x: 100, y: 0.5, z: 100 }, 1, {
      isMiniBoss: true,
      bossId: 'grakk',
      nameOverride: 'Grakk the Goblin Chief',
    });
    boss.isAlive = false;
    boss.deathTimeTs = 0;
    const state = makeState();
    state.enemies[boss.id] = boss;
    const spatial = new SpatialHashGrid();
    const { sink, events } = captureOutbound();

    // Just after the mini-boss respawn delay.
    const now = MINI_BOSS_RESPAWN_DELAY_MS + 1_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    respawnDeadEnemies(state, spatial, sink, now);
    vi.useRealTimers();

    expect(boss.isAlive).toBe(true);
    const broadcast = events.find((e) =>
      e.type === 'serverMessage'
      && e.message.type === 'ChatBroadcast'
      && e.message.text.includes('Wildgrass Meadow'),
    );
    expect(broadcast, 'expected a ChatBroadcast announcing the boss respawn with zone hint').toBeDefined();
  });
});
