import { describe, expect, it } from 'vitest';
import { getPlayerSpeed } from '../server/movement/worldMovement';
import {
  createClassCombatPolicy,
  createGameSimulator,
  createPassivePolicy,
  createSimulatedEnemy,
  createSimulatedPlayer,
} from '../server/sim/gameSimulator';

describe('game simulator combat scenarios', () => {
  it('runs deterministic player-vs-mob fights through the real engine systems', () => {
    const run = () => {
      const sim = createGameSimulator();
      const player = createSimulatedPlayer({ id: 'mage', className: 'mage', level: 10, position: { x: 0, z: 0 } });
      const enemy = createSimulatedEnemy('goblin', 10, { id: 'goblin', position: { x: 10, z: 0 } });
      sim.addPlayer(player, { policy: createClassCombatPolicy() });
      sim.addEnemy(enemy);

      const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs: 60_000 });
      const summary = result.summary;
      return {
        reason: result.reason,
        durationMs: Math.round(result.durationMs),
        winnerTeamId: summary.winnerTeamId,
        playerAlive: summary.players[player.id].alive,
        enemyAlive: summary.enemies[enemy.id].alive,
        damageDone: Math.round(summary.damageDoneById[player.id] ?? 0),
        xpGained: summary.players[player.id].xpGained,
        castsBySkill: summary.castsBySkill,
      };
    };

    const first = run();
    const second = run();

    expect(first).toEqual(second);
    expect(first.reason).toBe('condition');
    expect(first.winnerTeamId).toBe('players');
    expect(first.enemyAlive).toBe(false);
    expect(first.damageDone).toBeGreaterThan(0);
  });

  it('uses mob AI and shared mob casts against passive players', () => {
    const sim = createGameSimulator();
    const player = createSimulatedPlayer({ id: 'dummy', className: 'warrior', level: 1, health: 25, position: { x: 0, z: 0 } });
    const enemy = createSimulatedEnemy('goblin', 5, { id: 'attacker', position: { x: 2, z: 0 } });
    sim.addPlayer(player, { policy: createPassivePolicy() });
    sim.addEnemy(enemy);

    const result = sim.runUntil(() => !player.isAlive, { timeoutMs: 20_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.winnerTeamId).toBe('enemies');
    expect(result.summary.castsBySkill.mobStrike).toBeGreaterThan(0);
    expect(result.summary.damageTakenById[player.id]).toBeGreaterThan(0);
  });

  it('measures walking time with virtual movement ticks', () => {
    const sim = createGameSimulator();
    const player = createSimulatedPlayer({ id: 'walker', className: 'ranger', level: 1, position: { x: 0, z: 0 } });
    sim.addPlayer(player);

    const target = { x: 30, z: 0 };
    const expectedMs = (30 / getPlayerSpeed(player)) * 1000;
    sim.movePlayerTo(player.id, target);
    const result = sim.runUntil(() => !player.movement?.isMoving, { timeoutMs: 5_000 });

    expect(result.reason).toBe('condition');
    expect(player.position.x).toBeCloseTo(target.x, 4);
    expect(player.position.z).toBeCloseTo(target.z, 4);
    expect(result.durationMs).toBeGreaterThanOrEqual(expectedMs - sim.tickMs);
    expect(result.durationMs).toBeLessThanOrEqual(expectedMs + sim.tickMs * 2);
  });

  it('lets class policies heal and reports healing metrics', () => {
    const sim = createGameSimulator();
    const healer = createSimulatedPlayer({ id: 'healer', className: 'healer', level: 5, position: { x: 0, z: 0 } });
    healer.health = Math.max(1, healer.maxHealth - 150);
    const before = healer.health;
    sim.addPlayer(healer, { policy: createClassCombatPolicy({ healAtHealthFraction: 0.99 }) });

    const result = sim.runUntil((s) => (s.summary().healingDoneById[healer.id] ?? 0) > 0, { timeoutMs: 5_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.healingDoneById[healer.id]).toBeGreaterThan(0);
    expect(healer.health).toBeGreaterThan(before);
  });
});

describe('game simulator progression and PvP scenarios', () => {
  it('tracks XP and level gains across multi-kill leveling scenarios', () => {
    const sim = createGameSimulator();
    const player = createSimulatedPlayer({ id: 'leveler', className: 'mage', level: 1, position: { x: 0, z: 0 } });
    sim.addPlayer(player, { policy: createClassCombatPolicy() });
    sim.addEnemy(createSimulatedEnemy('goblin', 1, { id: 'goblin-a', position: { x: 10, z: 0 } }));
    sim.addEnemy(createSimulatedEnemy('goblin', 1, { id: 'goblin-b', position: { x: 30, z: 0 } }));

    const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs: 60_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.winnerTeamId).toBe('players');
    expect(result.summary.players[player.id].levelsGained).toBeGreaterThanOrEqual(1);
    expect(result.summary.players[player.id].xpGained).toBeGreaterThanOrEqual(100);
  });

  it('supports player-vs-player simulations with explicit sim teams', () => {
    const sim = createGameSimulator();
    const red = createSimulatedPlayer({ id: 'red-mage', className: 'mage', level: 10, position: { x: 0, z: 0 } });
    const blue = createSimulatedPlayer({ id: 'blue-mage', className: 'mage', level: 1, position: { x: 10, z: 0 } });
    sim.addPlayer(red, { teamId: 'red', policy: createClassCombatPolicy() });
    sim.addPlayer(blue, { teamId: 'blue', policy: createPassivePolicy() });

    const result = sim.runUntil(() => !blue.isAlive, { timeoutMs: 30_000 });

    expect(result.reason).toBe('condition');
    expect(result.summary.winnerTeamId).toBe('red');
    expect(result.summary.damageTakenById[blue.id]).toBeGreaterThan(0);
  });
});
