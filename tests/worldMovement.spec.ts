import { describe, expect, test } from 'vitest';
import { WORLD_SETTINGS } from '../packages/content/world';
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
    expect(isValidPosition({ x: WORLD_SETTINGS.playableRadius, z: -WORLD_SETTINGS.playableRadius })).toBe(true);
    expect(isValidPosition({ x: WORLD_SETTINGS.playableRadius + 0.1, z: 0 })).toBe(false);
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

  test('reads units/sec straight from player.stats.runSpeed, capped at MAX_PLAYER_SPEED', () => {
    // PR TT — movement is no longer assembled from DEFAULT_PLAYER_SPEED
    // + dmgMult kludge + per-effect multipliers. The stat already
    // includes slow / speed_boost contributions; we just cap at MAX.
    const slowPlayer = makePlayer({ stats: { runSpeed: 14 } });
    expect(getPlayerSpeed(slowPlayer)).toBe(14);

    const fastPlayer = makePlayer({ stats: { runSpeed: 80 } });
    expect(getPlayerSpeed(fastPlayer)).toBe(40);

    const noStats = makePlayer({});
    expect(getPlayerSpeed(noStats)).toBe(20);
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

  test('does not emit enemy snapshots outside server-active regions', () => {
    const state = createGameState();
    const activeEnemy = makeEnemy({ id: 'enemy-active', position: { x: 20, y: 0.5, z: 20 } });
    const inactiveEnemy = makeEnemy({ id: 'enemy-inactive', position: { x: 40, y: 0.5, z: 40 } });
    state.enemies[activeEnemy.id] = activeEnemy;
    state.enemies[inactiveEnemy.id] = inactiveEnemy;
    state.zones.activeZoneIds = ['zone-a'];
    state.zones.enemyZoneIds[activeEnemy.id] = 'zone-a';
    state.zones.enemyZoneIds[inactiveEnemy.id] = 'zone-b';
    forgetPositionDelta(activeEnemy.id);
    forgetPositionDelta(inactiveEnemy.id);

    const deltas = collectDeltas(state, 1000, new Set());

    expect(deltas.map((delta) => delta.id)).toEqual(['enemy-active']);
  });
});
