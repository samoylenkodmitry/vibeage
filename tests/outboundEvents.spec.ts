import { describe, expect, test, vi } from 'vitest';
import type { Server } from 'socket.io';
import {
  WORLD_BROADCAST_EVENTS,
  emitBatchUpdate,
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  emitServerMessageToClient,
  makeSocketIoOutbound,
  makeSocketMessageSink,
} from '../server/transport/outboundEvents';

describe('outbound events', () => {
  test('adapts server messages to the current Socket.IO event name', () => {
    const io = { emit: vi.fn() } as unknown as Server;
    const outbound = makeSocketIoOutbound(io);

    emitServerMessage(outbound, {
      type: 'InventoryUpdate',
      inventory: [{ itemId: 'gold_coin', quantity: 1 }],
      maxInventorySlots: 20,
    });

    expect(io.emit).toHaveBeenCalledWith(WORLD_BROADCAST_EVENTS.message, {
      type: 'InventoryUpdate',
      inventory: [{ itemId: 'gold_coin', quantity: 1 }],
      maxInventorySlots: 20,
    });
  });

  test('keeps legacy entity update event names behind the adapter', () => {
    const io = { emit: vi.fn() } as unknown as Server;
    const outbound = makeSocketIoOutbound(io);

    emitPlayerUpdated(outbound, { id: 'player1', health: 75 });
    emitEnemyUpdated(outbound, { id: 'enemy1', health: 10 });

    expect(io.emit).toHaveBeenCalledWith(WORLD_BROADCAST_EVENTS.playerUpdated, {
      id: 'player1',
      health: 75,
    });
    expect(io.emit).toHaveBeenCalledWith(WORLD_BROADCAST_EVENTS.enemyUpdated, {
      id: 'enemy1',
      health: 10,
    });
  });

  test('batch updates are skipped when there are no deltas', () => {
    const io = { emit: vi.fn() } as unknown as Server;

    emitBatchUpdate(makeSocketIoOutbound(io), []);

    expect(io.emit).not.toHaveBeenCalled();
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

  test('direct outbound messages are sent only to the addressed socket id', () => {
    const directEmit = vi.fn();
    const io = {
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: directEmit })),
    } as unknown as Server;

    emitServerMessageToClient(makeSocketIoOutbound(io), 'socket1', {
      type: 'LootAcquired',
      items: [{ itemId: 'gold_coin', quantity: 1 }],
    });

    expect(io.emit).not.toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith('socket1');
    expect(directEmit).toHaveBeenCalledWith(WORLD_BROADCAST_EVENTS.message, {
      type: 'LootAcquired',
      items: [{ itemId: 'gold_coin', quantity: 1 }],
    });
  });
});
