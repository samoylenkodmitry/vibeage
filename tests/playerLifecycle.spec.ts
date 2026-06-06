import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  awardPlayerXP,
  handleResourceRegeneration,
  onRespawnRequest,
  respawnPlayer,
} from '../server/players/playerLifecycle';
import { ENEMY_BASE_SCALING } from '../packages/content/enemies';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { getExperienceToNextLevel } from '../server/players/playerProgression';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'player1',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],

  availableSkillPoints: 1,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  maxInventorySlots: 20,
  ...overrides,
});

describe('player xp lifecycle', () => {
  test('awards xp and applies one level-up worth of progression', () => {
    const player = makePlayer({ experience: 90 });

    const update = awardPlayerXP(player, 25, 'test kill');

    expect(player).toMatchObject({
      level: 2,
      experience: 15,
      experienceToNextLevel: getExperienceToNextLevel(2),
      availableSkillPoints: 2,
    });
    expect(player.health).toBe(player.maxHealth);
    expect(player.mana).toBe(player.maxMana);
    expect(player.maxHealth).toBeGreaterThan(100);
    expect(player.maxMana).toBeGreaterThan(100);
    expect(update).toMatchObject({
      id: 'player1',
      level: 2,
      experience: 15,
      experienceToNextLevel: getExperienceToNextLevel(2),
      maxHealth: player.maxHealth,
      maxMana: player.maxMana,
      availableSkillPoints: 2,
    });
  });

  test('does not skip a level from one ordinary mob kill at the level boundary', () => {
    for (let level = 1; level < 60; level += 1) {
      const player = makePlayer({
        level,
        experience: getExperienceToNextLevel(level) - 1,
        experienceToNextLevel: getExperienceToNextLevel(level),
      });
      const ordinaryMobXp = ENEMY_BASE_SCALING.experience.flat + (ENEMY_BASE_SCALING.experience.perLevel * level);

      awardPlayerXP(player, ordinaryMobXp, 'ordinary mob test kill');

      expect(player.level, `level ${level} ordinary mob xp ${ordinaryMobXp}`).toBe(level + 1);
      expect(player.experience).toBe(ordinaryMobXp - 1);
      expect(player.experience).toBeLessThan(player.experienceToNextLevel);
    }
  });

  test('caps a huge combat XP award before it can skip a second level', () => {
    const level = 40;
    const player = makePlayer({
      level,
      experience: getExperienceToNextLevel(level) - 1,
      experienceToNextLevel: getExperienceToNextLevel(level),
    });

    awardPlayerXP(player, 1_000_000, 'oversized boss test kill');

    expect(player.level).toBe(level + 1);
    expect(player.experience).toBe(getExperienceToNextLevel(level + 1) - 1);
    expect(player.experience).toBeLessThan(player.experienceToNextLevel);
  });

  test('records XP cap telemetry with enemy level context', () => {
    runtimeMetrics.resetForTests();
    const level = 40;
    const player = makePlayer({
      level,
      experience: getExperienceToNextLevel(level) - 1,
      experienceToNextLevel: getExperienceToNextLevel(level),
    });

    awardPlayerXP(player, 1_000_000, 'oversized boss test kill', {
      kind: 'boss',
      enemy: {
        id: 'boss-audit',
        type: 'dragon',
        name: 'Audit Dragon',
        level: 95,
        baseExperienceValue: 1_000_000,
        experienceValue: 1_000_000,
        isMiniBoss: true,
        bossId: 'vorthax_ember_wyrm',
      },
    });

    const metrics = runtimeMetrics.snapshot();
    expect(metrics.counters['xp.award.total']).toBe(1);
    expect(metrics.counters['xp.award.source.boss']).toBe(1);
    expect(metrics.counters['xp.award.capped']).toBe(1);
    expect(metrics.counters['xp.award.capped.boss']).toBe(1);
    expect(metrics.counters['xp.award.enemyLevelDelta.suspicious']).toBe(1);
    expect(metrics.histograms['xp.award.raw']?.max).toBe(1_000_000);
    expect(metrics.histograms['xp.award.capDelta']?.max).toBeGreaterThan(0);
    expect(metrics.histograms['xp.award.enemyLevel']?.max).toBe(95);
    expect(metrics.histograms['xp.award.enemyLevelDelta']?.max).toBe(55);
  });
});

describe('player resource lifecycle', () => {
  test('regenerates HP + mana for alive players over real seconds', () => {
    // PR L: regen is now time-based + scaled from player.stats.{hp,mp}Regen
    // instead of a fixed per-tick increment. Pass an explicit clock so
    // the test is hermetic.
    const state = createGameState();
    state.players.player1 = makePlayer({
      health: 80,
      maxHealth: 100,
      mana: 90,
      maxMana: 100,
      stats: { hpRegen: 4, mpRegen: 2 },
    });
    const outbound = { publish: vi.fn() };

    // First call seeds lastRegenTimeMs; no actual regen happens.
    handleResourceRegeneration(state, outbound, 1_000_000);
    // 2 real seconds later → +8 hp (4 * 2), +4 mp (2 * 2).
    handleResourceRegeneration(state, outbound, 1_002_000);

    expect(state.players.player1.health).toBeCloseTo(88, 5);
    expect(state.players.player1.mana).toBeCloseTo(94, 5);
    expect(outbound.publish).toHaveBeenCalled();
  });
});

describe('player respawn lifecycle', () => {
  test('respawns a dead player at spawn and refreshes spatial membership', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    state.players.player1 = makePlayer({
      isAlive: false,
      health: 0,
      mana: 0,
      maxHealth: 140,
      maxMana: 120,
      position: { x: 96, y: 0.5, z: 96 },
      deathTimeTs: 123,
      velocity: { x: 5, z: 5 },
    });
    spatial.insert('player1', { x: 96, z: 96 });

    const update = respawnPlayer(state, spatial, 'player1');

    expect(update).toMatchObject({
      id: 'player1',
      health: 70,
      mana: 60,
      position: { x: 0, y: 0.5, z: 0 },
      isAlive: true,
    });
    expect(state.players.player1.deathTimeTs).toBeUndefined();
    expect(state.players.player1.velocity).toEqual({ x: 0, z: 0 });
    expect(spatial.queryCircle({ x: 96, z: 96 }, 1)).not.toContain('player1');
    expect(spatial.queryCircle({ x: 0, z: 0 }, 1)).toContain('player1');
  });

  test('emits respawn updates for respawn requests', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const outbound = { publish: vi.fn() };
    state.players.player1 = makePlayer({ isAlive: false, health: 0, mana: 0 });

    onRespawnRequest(state, { type: 'RespawnRequest', id: 'player1', clientTs: 1 }, outbound, spatial, 'socket1');

    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'playerUpdated',
      update: expect.objectContaining({
        id: 'player1',
        isAlive: true,
        health: 50,
        mana: 50,
      }),
    });
  });
});
