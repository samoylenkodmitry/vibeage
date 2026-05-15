import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import {
  awardPlayerXP,
  handleManaRegeneration,
  onRespawnRequest,
  respawnPlayer,
} from '../server/players/playerLifecycle';
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
  skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
  availableSkillPoints: 1,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  inventory: [],
  maxInventorySlots: 20,
  ...overrides,
});

describe('player lifecycle', () => {
  test('awards xp and applies one level-up worth of progression', () => {
    const player = makePlayer({ experience: 90 });

    const update = awardPlayerXP(player, 25, 'test kill');

    expect(player).toMatchObject({
      level: 2,
      experience: 15,
      experienceToNextLevel: 150,
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
      experienceToNextLevel: 150,
      maxHealth: player.maxHealth,
      maxMana: player.maxMana,
      availableSkillPoints: 2,
    });
  });

  test('regenerates mana for alive players and emits compact updates', () => {
    const state = createGameState();
    state.players.player1 = makePlayer({ mana: 95 });
    const outbound = { publish: vi.fn() };

    handleManaRegeneration(state, outbound);

    expect(state.players.player1.mana).toBe(97);
    expect(outbound.publish).toHaveBeenCalledWith({
      type: 'playerUpdated',
      update: { id: 'player1', mana: 97 },
    });
  });

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

    onRespawnRequest(state, { type: 'RespawnRequest', id: 'player1', clientTs: 1 }, outbound, spatial);

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
