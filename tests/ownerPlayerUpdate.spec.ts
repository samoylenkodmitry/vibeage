import { describe, expect, it, vi } from 'vitest';
import {
  PRIVATE_PLAYER_STATE_FIELDS,
} from '../server/transport/clientState';
import { createGameState } from '../server/gameState';
import {
  makeColyseusOutbound,
  type ColyseusBroadcastLike,
  type ColyseusClientLike,
} from '../server/transport/colyseusRoomAdapter';
import { createTransientPlayer } from '../server/playerFactory';

/**
 * PR BB regression — owner-aware playerUpdated broadcast.
 *
 * Before the fix, every playerUpdated event was sanitised (private
 * fields stripped) for every recipient including the owner. That
 * meant per-tick deltas carrying questState / characterInventory
 * were silently dropped, and the owner only saw those fields refresh
 * on a full reconnect snapshot. Quest progress (kill counters,
 * readyToClaim flips) appeared stuck mid-game.
 */
describe('owner-aware playerUpdated broadcast', () => {
  it('delivers the un-sanitised update to the owner socket and the public copy to everyone else', () => {
    const state = createGameState();
    const own = createTransientPlayer('socket-own', 'Owner');
    own.id = 'own';
    own.questState = { active: { rats_in_the_cellar: { stageIndex: 0, progress: 3 } }, completed: [] };
    state.players[own.id] = own;
    const other = createTransientPlayer('socket-other', 'Other');
    other.id = 'other';
    state.players[other.id] = other;

    const sendOwn = vi.fn();
    const sendOther = vi.fn();
    const broadcastSpy = vi.fn();
    const room: ColyseusBroadcastLike = {
      clients: [
        { sessionId: 'socket-own', send: sendOwn } as ColyseusClientLike,
        { sessionId: 'socket-other', send: sendOther } as ColyseusClientLike,
      ],
      broadcast: broadcastSpy,
    };
    const sink = makeColyseusOutbound(room, {
      getGameState: () => state,
      getRegions: () => [],
    });

    sink.publish({
      type: 'playerUpdated',
      update: { id: 'own', health: 88, questState: own.questState },
    });

    expect(broadcastSpy).not.toHaveBeenCalled();
    expect(sendOwn).toHaveBeenCalledTimes(1);
    const ownPayload = sendOwn.mock.calls[0][1] as Record<string, unknown>;
    expect(ownPayload.health).toBe(88);
    expect(ownPayload.questState).toBeDefined();

    expect(sendOther).toHaveBeenCalledTimes(1);
    const otherPayload = sendOther.mock.calls[0][1] as Record<string, unknown>;
    expect(otherPayload.health).toBe(88);
    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      expect(otherPayload, `private ${field} leaked to a non-owner client`).not.toHaveProperty(field);
    }
  });
});
