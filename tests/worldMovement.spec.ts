import { describe, expect, test } from 'vitest';
import type { Enemy, PlayerState } from '../packages/sim/entities';
import { createGameState } from '../server/gameState';
import {
  advanceAll,
  createPredictionKeyframes,
  getPlayerSpeed,
  isValidPosition,
  predictPosition,
} from '../server/movement/worldMovement';
import {
  collectDeltas,
  forgetPositionDelta,
} from '../server/movement/snapshotDeltas';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

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

const makeEnemy = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'enemy1',
  type: 'goblin',
  name: 'Goblin',
  level: 1,
  position: { x: 20, y: 0.5, z: 20 },
  spawnPosition: { x: 20, y: 0.5, z: 20 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  isAlive: true,
  attackDamage: 10,
  attackRange: 2,
  baseExperienceValue: 50,
  experienceValue: 50,
  statusEffects: [],
  aiState: 'idle',
  aggroRadius: 15,
  attackCooldownMs: 2000,
  lastAttackTime: 0,
  movementSpeed: 6,
  velocity: { x: 0, z: 0 },
  ...overrides,
});

describe('world movement helpers', () => {
  test('validates movement bounds and finite coordinates', () => {
    expect(isValidPosition({ x: 1000, z: -1000 })).toBe(true);
    expect(isValidPosition({ x: 1000.1, z: 0 })).toBe(false);
    expect(isValidPosition({ x: Number.NaN, z: 0 })).toBe(false);
    expect(isValidPosition({ x: 0, z: Number.POSITIVE_INFINITY })).toBe(false);
  });

  test('predicts player position toward a movement target', () => {
    const player = makePlayer({
      movement: {
        isMoving: true,
        targetPos: { x: 10, z: 0 },
        speed: 5,
        lastUpdateTime: 1000,
      },
    });

    expect(predictPosition(player, 1500)).toEqual({ x: 2.5, z: 0 });
    expect(predictPosition(player, 4000)).toEqual({ x: 10, z: 0 });
  });

  test('caps player speed after modifiers', () => {
    const player = makePlayer({
      stats: { dmgMult: 20 },
      statusEffects: [{ id: 'boost', type: 'speed_boost', value: 1, startTimeTs: 0, durationMs: 1000, sourceSkill: 'test' }],
    });

    expect(getPlayerSpeed(player)).toBe(40);
  });
});

describe('world movement advancement', () => {
  test('advances players, stops on destination, and refreshes spatial membership', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = makePlayer({
      movement: {
        isMoving: true,
        targetPos: { x: 8, z: 0 },
        speed: 20,
        lastUpdateTime: 1000,
      },
    });
    state.players[player.id] = player;
    spatial.insert(player.id, { x: 0, z: 0 });

    advanceAll(state, spatial, 500, 1500);

    expect(player.position).toMatchObject({ x: 8, z: 0 });
    expect(player.velocity).toEqual({ x: 0, z: 0 });
    expect(player.movement?.isMoving).toBe(false);
    expect(player.movement?.targetPos).toBeNull();
    expect(player.posHistory?.at(-1)).toMatchObject({ ts: 1500, x: 8, z: 0 });
    expect(spatial.queryCircle({ x: 0, z: 0 }, 0)).not.toContain(player.id);
    expect(spatial.queryCircle({ x: 8, z: 0 }, 0)).toContain(player.id);
  });

  test('advances enemies and prunes expired status effects', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const enemy = makeEnemy({
      velocity: { x: 6, z: 0 },
      statusEffects: [
        { id: 'old', type: 'slow', value: 1, startTimeTs: 100, durationMs: 50, sourceSkill: 'test' },
        { id: 'new', type: 'speed_boost', value: 1, startTimeTs: 100, durationMs: 1000, sourceSkill: 'test' },
      ],
    });
    state.enemies[enemy.id] = enemy;
    spatial.insert(enemy.id, { x: 20, z: 20 });

    advanceAll(state, spatial, 1000, 200);

    expect(enemy.position).toMatchObject({ x: 26, z: 20 });
    expect(enemy.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(enemy.statusEffects.map((effect) => effect.id)).toEqual(['new']);
    expect(enemy.posHistory?.at(-1)).toMatchObject({ ts: 200, x: 26, z: 20 });
    expect(spatial.queryCircle({ x: 20, z: 20 }, 0)).not.toContain(enemy.id);
    expect(spatial.queryCircle({ x: 26, z: 20 }, 0)).toContain(enemy.id);
  });
});

describe('world movement prediction keyframes', () => {
  test('creates bounded prediction keyframes for target-reaching players', () => {
    const state = createGameState();
    const player = makePlayer({
      movement: {
        isMoving: true,
        targetPos: { x: 1, z: 0 },
        speed: 20,
        lastUpdateTime: 1000,
      },
    });
    state.players[player.id] = player;

    const keyframes = createPredictionKeyframes({
      entity: player,
      currentPos: { x: 0, z: 0 },
      currentVel: { x: 20, z: 0 },
      currentRotY: 0,
      timestamp: 2000,
      offsetsMs: [100, 200],
      state,
    });

    expect(keyframes).toEqual([
      {
        pos: { x: 1, z: 0 },
        rotY: Math.PI / 2,
        ts: 2100,
      },
    ]);
  });
});

describe('world movement snapshot deltas', () => {
  test('can forget disconnected entities from the delta cache', () => {
    const state = createGameState();
    const player = makePlayer();
    state.players[player.id] = player;

    expect(collectDeltas(state, 1000, new Set())).toHaveLength(1);
    expect(collectDeltas(state, 1010, new Set())).toHaveLength(0);

    forgetPositionDelta(player.id);

    expect(collectDeltas(state, 1020, new Set())).toHaveLength(1);
  });
});
