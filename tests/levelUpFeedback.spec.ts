import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * Level-up combat-log feedback for the local player.
 *
 * Server emits `playerUpdated` carrying the new `level` after
 * `awardPlayerXP` carries the player past `experienceToNextLevel`.
 * The HUD has the bar; the combat log needs a discrete row so the
 * player has a textual record (and a mid-fight level-up isn't
 * drowned by damage numbers).
 *
 * Pin:
 *  - "You reached level X!" line appears for the local player on
 *    strict-increase
 *  - other-player level-ups don't pollute my combat log
 *  - snapshot resync that re-asserts the same level is silent
 *    (no spam on every minute snapshot)
 *  - a level-up arriving with no prior level (rare edge: server
 *    sends a sparse playerUpdated with only `level`) doesn't crash
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

const baseState: GameClientState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: ME,
  players: { [ME]: makePlayer(ME, { level: 3 }) },
};

describe('player level-up combat-log feedback', () => {
  it('appends "You reached level X!" when my level strictly increases', () => {
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 100, player: { id: ME, level: 4 },
    });
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('You reached level 4!');
  });

  it('handles a multi-level jump (XP overflow from one big reward)', () => {
    // One reward gave enough XP to skip from L3 → L5. The server's
    // awardPlayerXP loop handles the math; the client emits a single
    // line for the final level since playerUpdated carries the
    // resolved level. Bumping the test pins behavior, not contract.
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 100, player: { id: ME, level: 5 },
    });
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('You reached level 5!');
  });

  it('does NOT emit when another player levels up (not news to me)', () => {
    const seeded: GameClientState = {
      ...baseState,
      players: {
        [ME]: makePlayer(ME, { level: 3 }),
        other: makePlayer('other', { level: 7 }),
      },
    };
    const next = gameClientReducer(seeded, {
      type: 'playerUpdated', now: 100, player: { id: 'other', level: 8 },
    });
    expect(next.combatLog).toHaveLength(0);
  });

  it('silent on a re-assertion (snapshot resync re-emits the same level)', () => {
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 100, player: { id: ME, level: 3 },
    });
    expect(next.combatLog).toHaveLength(0);
  });

  it('silent when the playerUpdated has no level field at all', () => {
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 100, player: { id: ME, health: 50 },
    });
    expect(next.combatLog).toHaveLength(0);
  });

  it('silent on a downward level (defensive — server should never send this)', () => {
    const next = gameClientReducer(baseState, {
      type: 'playerUpdated', now: 100, player: { id: ME, level: 1 },
    });
    expect(next.combatLog).toHaveLength(0);
  });
});
