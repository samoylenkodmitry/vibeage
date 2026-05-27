import { describe, expect, test } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { advanceAll } from '../server/movement/worldMovement';
import { applyMoveIntent } from '../server/movement/moveIntent';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

/**
 * Polish bug fix — a dead player's corpse must not keep running.
 *
 * Pre-fix path:
 *  - `applyMoveIntent` gated on stunned but NOT on `isAlive`, so a
 *    dead player (or a hostile client driving a dead player) could
 *    start fresh motion on a corpse.
 *  - `advanceAll` only skipped dead *enemies*; dead players with an
 *    in-flight `movement.isMoving = true` (because they died mid-run)
 *    kept advancing toward their old target every tick until the
 *    target was reached or the player respawned.
 *
 * The user-visible symptom: a corpse glides across the field after
 * the player dies mid-sprint. Cosmetic in isolation but a real
 * server-authority leak — the corpse can drift into other regions,
 * dirty the snapshot delta stream, and confuse spatial queries.
 *
 * Pin: a dead player neither (a) starts new movement via MoveIntent
 * nor (b) continues advancing in `advanceAll`.
 */

function makeDeadRunner() {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const player = createTransientPlayer('socket-runner', 'GhostRunner');
  player.position = { x: 0, y: 0.5, z: 0 };
  // Player was running northeast when they died mid-tick.
  player.movement = { isMoving: true, targetPos: { x: 100, z: 0 }, lastUpdateTime: 0, speed: 10 };
  player.velocity = { x: 10, z: 0 };
  player.isAlive = false;
  player.health = 0;
  state.players[player.id] = player;
  spatial.insert(player.id, { x: 0, z: 0 });
  return { state, spatial, player };
}

describe('dead player cannot continue moving (advanceAll)', () => {
  test('advanceAll skips a dead player whose movement.isMoving was true at death', () => {
    const { state, spatial, player } = makeDeadRunner();

    advanceAll(state, spatial, 500, Date.now()); // half a second of physics

    // Position must NOT have changed. The corpse stays where it died.
    expect(player.position.x).toBe(0);
    expect(player.position.z).toBe(0);
  });
});

describe('dead player cannot start new movement (applyMoveIntent)', () => {
  test('applyMoveIntent rejects a dead player with reason="dead"', () => {
    const { state, spatial, player } = makeDeadRunner();
    // Reset movement to "stationary" so the only path that could
    // re-arm motion is applyMoveIntent.
    player.movement = { isMoving: false, lastUpdateTime: 0, speed: 0 };
    player.velocity = { x: 0, z: 0 };

    const result = applyMoveIntent(state, 'socket-runner', {
      type: 'MoveIntent', id: player.id, clientTs: 0, targetPos: { x: 50, z: 0 },
    }, 1_000);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('dead');
    // Movement state must NOT have been mutated by the dead-MoveIntent.
    expect(player.movement?.isMoving).toBe(false);
    expect(spatial.queryCircle({ x: 0, z: 0 }, 1)).toContain(player.id);
  });
});

describe('alive player still moves (regression net for over-correction)', () => {
  test('a living player advances normally — the new gate must not block the alive path', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('socket-alive', 'LiveRunner');
    player.position = { x: 0, y: 0.5, z: 0 };
    player.movement = { isMoving: true, targetPos: { x: 100, z: 0 }, lastUpdateTime: 0, speed: 10 };
    player.velocity = { x: 10, z: 0 };
    player.isAlive = true;
    state.players[player.id] = player;
    spatial.insert(player.id, { x: 0, z: 0 });

    advanceAll(state, spatial, 500, Date.now());

    // 500ms * 10units/s = 5 units traveled.
    expect(player.position.x).toBeCloseTo(5, 1);
  });

  test('applyMoveIntent succeeds for a living player (regression net)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('socket-alive', 'LiveRunner');
    player.position = { x: 0, y: 0.5, z: 0 };
    player.isAlive = true;
    state.players[player.id] = player;
    spatial.insert(player.id, { x: 0, z: 0 });

    const result = applyMoveIntent(state, 'socket-alive', {
      type: 'MoveIntent', id: player.id, clientTs: 0, targetPos: { x: 50, z: 0 },
    }, 1_000);

    expect(result.ok).toBe(true);
  });
});
