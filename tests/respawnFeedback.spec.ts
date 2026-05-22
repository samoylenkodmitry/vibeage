import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * Respawn combat-log feedback.
 *
 * After `RespawnRequest`, the server's `respawnPlayer` flips
 * `isAlive` back to true. Without a textual signal, the player gets
 * a position teleport and refilled bars but no record of "you came
 * back" — the death pop-up handles the immediate UX but the combat
 * log was silent. The respawn line completes the death-respawn
 * arc so a player scrolling back can see when they died and when
 * they returned.
 *
 * Symmetric with `applyPlayerDeathFeedback`. Only the dead→alive
 * transition matters; snapshot resync re-asserting alive=true is
 * silent.
 */

const ME = 'me';

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    isAlive: true,
    level: 1,
    unlockedSkills: [],
    skillLevels: {},
    ...overrides,
  } as unknown as PlayerEntity;
}

describe('player respawn combat-log feedback', () => {
  it('appends "You\'re back." when the local player transitions dead → alive', () => {
    const state: GameClientState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      myPlayerId: ME,
      players: { [ME]: makePlayer(ME, { isAlive: false }) },
    };
    const next = gameClientReducer(state, {
      type: 'playerUpdated', now: 100, player: { id: ME, isAlive: true },
    });
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe("You're back.");
  });

  it('appends "X respawned." for another player\'s revival', () => {
    const state: GameClientState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      myPlayerId: ME,
      players: {
        [ME]: makePlayer(ME),
        other: makePlayer('other', { name: 'Alyx', isAlive: false }),
      },
    };
    const next = gameClientReducer(state, {
      type: 'playerUpdated', now: 100, player: { id: 'other', isAlive: true },
    });
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('Alyx respawned.');
  });

  it('silent on alive → alive (snapshot re-assertion)', () => {
    const state: GameClientState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      myPlayerId: ME,
      players: { [ME]: makePlayer(ME, { isAlive: true }) },
    };
    const next = gameClientReducer(state, {
      type: 'playerUpdated', now: 100, player: { id: ME, isAlive: true },
    });
    expect(next.combatLog).toHaveLength(0);
  });

  it('silent on dead → dead (multiple death-emits for the same death)', () => {
    const state: GameClientState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      myPlayerId: ME,
      players: { [ME]: makePlayer(ME, { isAlive: false }) },
    };
    const next = gameClientReducer(state, {
      type: 'playerUpdated', now: 100, player: { id: ME, isAlive: false },
    });
    expect(next.combatLog).toHaveLength(0);
  });

  it('falls back to "A player respawned." when name is empty', () => {
    const state: GameClientState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      myPlayerId: ME,
      players: {
        [ME]: makePlayer(ME),
        other: makePlayer('other', { name: '', isAlive: false }),
      },
    };
    const next = gameClientReducer(state, {
      type: 'playerUpdated', now: 100, player: { id: 'other', isAlive: true },
    });
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('A player respawned.');
  });
});
