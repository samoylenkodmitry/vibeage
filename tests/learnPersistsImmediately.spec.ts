import { describe, expect, test, vi } from 'vitest';

/**
 * Regression: learning a skill must persist IMMEDIATELY, not wait for the 30s
 * periodic sweep or a clean disconnect. On mobile the app is frequently
 * backgrounded/killed (an unclean disconnect that skips the on-disconnect save)
 * seconds after learning — which otherwise loses the just-spent skill point and
 * forces the player to re-learn every login. Partial-mock so only persistPlayer
 * is observed (no real DB); everything else in persistence stays real.
 */
const persistPlayer = vi.fn();
vi.mock('../server/persistence', async (importActual) => ({
  ...(await importActual<typeof import('../server/persistence')>()),
  persistPlayer,
}));

const { createGameState } = await import('../server/gameState');
const { createTransientPlayer } = await import('../server/playerFactory');
const { onLearnSkill } = await import('../server/players/playerSkills');

describe('learning a skill persists immediately', () => {
  test('onLearnSkill calls persistPlayer with the player after a successful learn', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket-mage', 'Mageling');
    player.className = 'mage';
    player.level = 5;
    player.availableSkillPoints = 1;
    player.unlockedSkills = ['fireball']; // prereq for waterSplash
    state.players[player.id] = player;

    const sent: Array<{ type: string }> = [];
    const direct = { send: (m: { type: string }) => sent.push(m) };
    persistPlayer.mockClear();

    onLearnSkill({ id: player.socketId }, direct, { publish: vi.fn() }, state, {
      type: 'LearnSkill',
      skillId: 'waterSplash',
    });

    // The learn actually happened…
    expect(player.unlockedSkills).toContain('waterSplash');
    expect(player.availableSkillPoints).toBe(0);
    // …and was persisted right away, with the full player object.
    expect(persistPlayer).toHaveBeenCalledTimes(1);
    expect((persistPlayer.mock.calls[0][0] as { id: string }).id).toBe(player.id);
  });

  test('a rejected learn does NOT persist (no wasted write)', () => {
    const state = createGameState();
    const player = createTransientPlayer('socket-mage-2', 'Lowbie');
    player.className = 'mage';
    player.level = 1; // too low for waterSplash
    player.availableSkillPoints = 1;
    player.unlockedSkills = ['fireball'];
    state.players[player.id] = player;
    persistPlayer.mockClear();

    onLearnSkill({ id: player.socketId }, { send: vi.fn() }, { publish: vi.fn() }, state, {
      type: 'LearnSkill',
      skillId: 'waterSplash',
    });

    expect(player.unlockedSkills).not.toContain('waterSplash');
    expect(persistPlayer).not.toHaveBeenCalled();
  });
});
