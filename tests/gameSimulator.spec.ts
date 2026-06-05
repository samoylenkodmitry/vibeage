import { describe, expect, it } from 'vitest';
import type { SkillId } from '../packages/content/skills';
import type { Enemy, PlayerState } from '../packages/sim/entities';
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

describe('game simulator teleport mechanics', () => {
  it('resolves Dimensional Swap through the real cast simulator and refreshes spatial cells', () => {
    const sim = createGameSimulator({ startMs: 1_000 });
    const caster = createSimulatedPlayer({
      id: 'swapper',
      className: 'mage',
      level: 40,
      specializationId: 'arcanist',
      unlockedSkills: ['dimensional_swap'],
      position: { x: 0, z: 0 },
    });
    const target = createSimulatedEnemy('goblin', 40, { id: 'target', position: { x: 8, z: 0 } });
    target.health = 10_000;
    target.maxHealth = 10_000;
    sim.addPlayer(caster);
    sim.addEnemy(target);

    sim.castSkill(caster.id, 'dimensional_swap', target.id);
    sim.step();

    expect(caster.position.x).toBeCloseTo(8, 4);
    expect(caster.position.z).toBeCloseTo(0, 4);
    expect(target.position.x).toBeCloseTo(0, 4);
    expect(target.position.z).toBeCloseTo(0, 4);
    expect(sim.spatial.queryCircle({ x: 8, z: 0 }, 0)).toContain(caster.id);
    expect(sim.spatial.queryCircle({ x: 8, z: 0 }, 0)).not.toContain(target.id);
    expect(sim.spatial.queryCircle({ x: 0, z: 0 }, 0)).toContain(target.id);
    expect(sim.spatial.queryCircle({ x: 0, z: 0 }, 0)).not.toContain(caster.id);
    expect(target.statusEffects.some((effect) => effect.type === 'stun')).toBe(true);
  });

  it('resolves advanced custom mechanics through the real cast simulator', () => {
    const sim = createGameSimulator({ startMs: 2_000 });
    const caster = advancedPlayer('advanced', ['gravity_well', 'soul_link', 'delayed_fate', 'phase_step']);
    const linkedA = durableEnemy('linked-a', { x: 10, z: 0 });
    const linkedB = durableEnemy('linked-b', { x: 14, z: 0 });
    sim.addPlayer(caster);
    sim.addEnemy(linkedA);
    sim.addEnemy(linkedB);

    sim.castSkill(caster.id, 'gravity_well', linkedA.id);
    sim.advance(850);
    expect(linkedB.position.x).toBeLessThan(14);
    expect(linkedB.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);

    ready(caster, 'soul_link');
    sim.castSkill(caster.id, 'soul_link', linkedA.id);
    sim.advance(550);
    expect(linkedA.statusEffects.some((effect) => effect.type === 'soulLink')).toBe(true);
    expect(linkedB.statusEffects.some((effect) => effect.type === 'soulLink')).toBe(true);

    ready(caster, 'delayed_fate');
    sim.castSkill(caster.id, 'delayed_fate', linkedA.id);
    sim.advance(450);
    const markedHealth = linkedA.health;
    expect(linkedA.statusEffects.some((effect) => effect.type === 'fateDebt')).toBe(true);
    sim.advance(2_500);
    expect(linkedA.health).toBeLessThan(markedHealth);

    ready(caster, 'phase_step');
    sim.castSkill(caster.id, 'phase_step', linkedA.id);
    sim.step();
    expect(caster.position.x).toBeGreaterThan(linkedA.position.x);
    expect(caster.statusEffects.some((effect) => effect.type === 'afterimage')).toBe(true);
  });

  it('moves portal groups and resolves telegraphed rings through simulator ticks', () => {
    const portalSim = createGameSimulator({ startMs: 6_000 });
    const portalCaster = advancedPlayer('portal-caster', ['portal_pair']);
    const ally = createSimulatedPlayer({ id: 'portal-ally', className: 'mage', level: 40, position: { x: 2, z: 0 } });
    portalSim.addPlayer(portalCaster);
    portalSim.addPlayer(ally);

    portalSim.castSkill(portalCaster.id, 'portal_pair', undefined, { x: 18, z: 5 });
    portalSim.advance(450);
    expect(portalCaster.position.x).toBeCloseTo(18, 4);
    expect(ally.position.x).toBeCloseTo(20, 4);
    expect(portalSim.spatial.queryCircle({ x: 20, z: 5 }, 0)).toContain(ally.id);

    const ringSim = createGameSimulator({ startMs: 9_000 });
    const ringCaster = advancedPlayer('ring-caster', ['cataclysm_rings']);
    const center = durableEnemy('ring-center', { x: 8, z: 0 });
    const outer = durableEnemy('ring-outer', { x: 13, z: 0 });
    rootInPlace(center, ringSim.now());
    rootInPlace(outer, ringSim.now());
    ringSim.addPlayer(ringCaster);
    ringSim.addEnemy(center);
    ringSim.addEnemy(outer);

    ringSim.castSkill(ringCaster.id, 'cataclysm_rings', center.id);
    ringSim.advance(1_700);
    expect(center.health).toBe(center.maxHealth);
    expect(outer.health).toBeLessThan(outer.maxHealth);
    expect(outer.statusEffects.some((effect) => effect.type === 'burn')).toBe(true);
  });
});

describe('game simulator progression and PvP scenarios', () => {
  it('tracks XP and level gains across multi-kill leveling scenarios', () => {
    const sim = createGameSimulator();
    const player = createSimulatedPlayer({ id: 'leveler', className: 'mage', level: 1, position: { x: 0, z: 0 } });
    sim.addPlayer(player, { policy: createClassCombatPolicy() });
    sim.addEnemy(createSimulatedEnemy('goblin', 1, { id: 'goblin-a', position: { x: 10, z: 0 } }));
    sim.addEnemy(createSimulatedEnemy('goblin', 1, { id: 'goblin-b', position: { x: 30, z: 0 } }));
    sim.addEnemy(createSimulatedEnemy('goblin', 1, { id: 'goblin-c', position: { x: 50, z: 0 } }));

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

function advancedPlayer(id: string, unlockedSkills: SkillId[]): PlayerState {
  const player = createSimulatedPlayer({
    id,
    className: 'mage',
    level: 40,
    specializationId: 'arcanist',
    unlockedSkills,
    mana: 10_000,
    position: { x: 0, z: 0 },
  });
  player.maxMana = 10_000;
  player.mana = 10_000;
  return player;
}

function durableEnemy(id: string, position: { x: number; z: number }): Enemy {
  const enemy = createSimulatedEnemy('goblin', 40, { id, position });
  enemy.health = 10_000;
  enemy.maxHealth = 10_000;
  return enemy;
}

function ready(player: PlayerState, skillId: SkillId): void {
  player.castingSkill = null;
  player.castingProgressMs = 0;
  player.skillCooldownEndTs[skillId] = 0;
  player.mana = player.maxMana;
}

function rootInPlace(enemy: Enemy, now: number): void {
  enemy.statusEffects.push({ id: `root-${enemy.id}`, type: 'root', value: 1, durationMs: 3_000, startTimeTs: now, sourceSkill: 'test' });
}
