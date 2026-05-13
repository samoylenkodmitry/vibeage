import { describe, expect, test, vi } from 'vitest';
import {
  WORLD_BROADCAST_EVENTS,
  emitBatchUpdate,
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  emitServerMessageToClient,
  makeSocketMessageSink,
  type OutboundEvent,
  type OutboundEventSink,
} from '../server/transport/outboundEvents';

describe('outbound events', () => {
  test('publishes server messages through the outbound event contract', () => {
    const events: OutboundEvent[] = [];
    const outbound = makeRecordingOutbound(events);

    emitServerMessage(outbound, {
      type: 'InventoryUpdate',
      inventory: [{ itemId: 'gold_coin', quantity: 1 }],
      maxInventorySlots: 20,
    });

    expect(events).toEqual([{
      type: 'serverMessage',
      message: {
        type: 'InventoryUpdate',
        inventory: [{ itemId: 'gold_coin', quantity: 1 }],
        maxInventorySlots: 20,
      },
    }]);
  });

  test('publishes entity updates through the outbound event contract', () => {
    const events: OutboundEvent[] = [];
    const outbound = makeRecordingOutbound(events);

    emitPlayerUpdated(outbound, { id: 'player1', health: 75 });
    emitEnemyUpdated(outbound, { id: 'enemy1', health: 10 });

    expect(events).toContainEqual({
      type: 'playerUpdated',
      update: {
        id: 'player1',
        health: 75,
      },
    });
    expect(events).toContainEqual({
      type: 'enemyUpdated',
      update: {
        id: 'enemy1',
        health: 10,
      },
    });
  });

  test('batch updates are skipped when there are no deltas', () => {
    const publish = vi.fn();

    emitBatchUpdate({ publish }, []);

    expect(publish).not.toHaveBeenCalled();
  });

  test('direct message sink sends one client message', () => {
    const target = { emit: vi.fn() };
    const sink = makeSocketMessageSink(target);

    sink.send({
      type: 'SkillLearned',
      skillId: 'fireball',
      remainingPoints: 0,
    });

    expect(target.emit).toHaveBeenCalledWith(WORLD_BROADCAST_EVENTS.message, {
      type: 'SkillLearned',
      skillId: 'fireball',
      remainingPoints: 0,
    });
  });

  test('direct outbound messages target one client id', () => {
    const events: OutboundEvent[] = [];

    emitServerMessageToClient(makeRecordingOutbound(events), 'socket1', {
      type: 'LootAcquired',
      items: [{ itemId: 'gold_coin', quantity: 1 }],
    });

    expect(events).toEqual([{
      type: 'directServerMessage',
      socketId: 'socket1',
      message: {
        type: 'LootAcquired',
        items: [{ itemId: 'gold_coin', quantity: 1 }],
      },
    }]);
  });
});

function makeRecordingOutbound(events: OutboundEvent[]): OutboundEventSink {
  return {
    publish(event) {
      events.push(event);
    },
  };
}
