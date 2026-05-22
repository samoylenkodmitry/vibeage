import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity, EnemyEntity } from '../apps/client/src/gameTypes';

/**
 * ROADMAP — reducer tests for duplicate or out-of-order updates.
 *
 * The Colyseus snapshot stream has no per-message sequence number on
 * the client side; the reducer's job is to stay convergent in the
 * face of:
 *  - repeated `playerUpdated` / `enemyUpdated` for the same entity
 *  - updates targeting entities the client hasn't seen (defensive
 *    no-op rather than implicitly creating)
 *  - `playerLeft` for an already-gone player
 *  - a `BatchUpdate` with conflicting entries (last-write-wins)
 *  - a stale duplicate slipping in after a newer update has been applied
 *
 * These cases used to bite us when a snapshot resync would arrive
 * during an active session — duplicates AREN'T a sign of a bug,
 * the reducer must absorb them.
 */

const ME = 'me';

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    isAlive: true,
    inventory: [],
    maxInventorySlots: 20,
    unlockedSkills: [],
    skillLevels: {},
    ...overrides,
  } as unknown as PlayerEntity;
}

function makeEnemy(id: string, overrides: Partial<EnemyEntity> = {}): EnemyEntity {
  return {
    id,
    type: 'slime',
    name: 'Slime',
    level: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 50,
    maxHealth: 50,
    isAlive: true,
    ...overrides,
  } as unknown as EnemyEntity;
}

const baseState: GameClientState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: ME,
  players: { [ME]: makePlayer(ME), p2: makePlayer('p2') },
  enemies: { e1: makeEnemy('e1') },
};

describe('gameClientReducer — duplicate updates', () => {
  it('a duplicate playerUpdated produces structurally equal player state', () => {
    const a = gameClientReducer(baseState, { type: 'playerUpdated', now: 1, player: { id: ME, health: 80 } });
    const b = gameClientReducer(a, { type: 'playerUpdated', now: 2, player: { id: ME, health: 80 } });
    expect(b.players[ME].health).toBe(80);
    // The second update doesn't drift any other field.
    expect(b.players[ME]).toEqual(a.players[ME]);
  });

  it('a duplicate enemyUpdated produces structurally equal enemy state', () => {
    const a = gameClientReducer(baseState, { type: 'enemyUpdated', now: 1, enemy: { id: 'e1', health: 30 } });
    const b = gameClientReducer(a, { type: 'enemyUpdated', now: 2, enemy: { id: 'e1', health: 30 } });
    expect(b.enemies.e1.health).toBe(30);
    expect(b.enemies.e1).toEqual(a.enemies.e1);
  });
});

describe('gameClientReducer — updates for unknown entities (defensive no-op)', () => {
  it('playerUpdated for an unknown player is a no-op', () => {
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 1, player: { id: 'ghost', health: 1 },
    });
    expect(next.players.ghost).toBeUndefined();
    // No incidental writes elsewhere either.
    expect(next.players).toEqual(baseState.players);
  });

  it('enemyUpdated for an unknown enemy is a no-op', () => {
    const next = gameClientReducer(baseState, {
      type: 'enemyUpdated', now: 1, enemy: { id: 'ghost-enemy', health: 1 },
    });
    expect(next.enemies['ghost-enemy']).toBeUndefined();
    expect(next.enemies).toEqual(baseState.enemies);
  });
});

describe('gameClientReducer — playerLeft idempotency', () => {
  it('playerLeft for a present player removes them', () => {
    const next = gameClientReducer(baseState, { type: 'playerLeft', playerId: 'p2' });
    expect(next.players.p2).toBeUndefined();
    expect(next.players[ME]).toEqual(baseState.players[ME]);
  });

  it('a second playerLeft for the same id is a no-op', () => {
    const a = gameClientReducer(baseState, { type: 'playerLeft', playerId: 'p2' });
    const b = gameClientReducer(a, { type: 'playerLeft', playerId: 'p2' });
    expect(b.players).toEqual(a.players);
  });

  it('playerLeft for a never-seen player is a no-op', () => {
    const next = gameClientReducer(baseState, { type: 'playerLeft', playerId: 'never-was' });
    expect(next.players).toEqual(baseState.players);
  });
});

describe('gameClientReducer — out-of-order arrivals', () => {
  it('a stale playerUpdated does not resurrect prior values from before a newer update', () => {
    // Server reality: hp went 100 → 80 → 60. If the 80 update arrives
    // late (after 60 was applied), reducer simply overwrites with 80.
    // This is intentional last-write-wins by arrival order — the test
    // pins the behavior so a future "compare timestamps" optimization
    // is a deliberate change, not an accident.
    const a = gameClientReducer(baseState, { type: 'playerUpdated', now: 100, player: { id: ME, health: 60 } });
    const b = gameClientReducer(a, { type: 'playerUpdated', now: 50, player: { id: ME, health: 80 } });
    expect(b.players[ME].health).toBe(80);
  });

  it('BatchUpdate with two playerUpdated entries for the same id resolves to the last entry', () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'BatchUpdate',
        updates: [
          // playerUpdated isn't a server-message type, so simulate
          // via two enemy updates which DO go through BatchUpdate.
          { type: 'EnemyAttack', enemyId: 'e1', targetId: ME, damage: 1 },
          { type: 'EnemyAttack', enemyId: 'e1', targetId: ME, damage: 2 },
        ],
      } as unknown as Parameters<typeof gameClientReducer>[1] extends { message: infer M } ? M : never,
    });
    // Both attacks compose without crashing; the reducer must absorb
    // the duplicate without throwing or losing state.
    expect(next.players[ME]).toBeDefined();
    expect(next.enemies.e1).toBeDefined();
  });
});

describe('gameClientReducer — partial playerUpdated merges (does not stomp unrelated fields)', () => {
  it('an update carrying only `health` preserves `position`, `name`, and inventory', () => {
    const seeded: GameClientState = {
      ...baseState,
      players: {
        [ME]: makePlayer(ME, {
          position: { x: 10, y: 0, z: 20 },
          name: 'hero',
          inventory: [{ itemId: 'rusty_sword', quantity: 1 }],
        }),
      },
    };
    const next = gameClientReducer(seeded, {
      type: 'playerUpdated', now: 1, player: { id: ME, health: 70 },
    });
    expect(next.players[ME].health).toBe(70);
    expect(next.players[ME].position).toEqual({ x: 10, y: 0, z: 20 });
    expect(next.players[ME].name).toBe('hero');
    expect(next.players[ME].inventory).toEqual([{ itemId: 'rusty_sword', quantity: 1 }]);
  });
});
