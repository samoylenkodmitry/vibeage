import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import {
  makeColyseusOutbound,
  type ColyseusClientLike,
} from '../server/transport/colyseusRoomAdapter';

/**
 * Owner-only server messages (InventoryUpdate, LearnSkillFailed, ItemUsed,
 * etc.) must only ever reach the matching socket. The adapter has a guard
 * at `emitColyseusOutbound` that drops these if anyone accidentally
 * publishes them via `serverMessage` instead of `directServerMessage`.
 * These tests pin that behaviour.
 */

function makeClient(sessionId: string): ColyseusClientLike & { send: ReturnType<typeof vi.fn> } {
  return { sessionId, send: vi.fn() };
}

describe('owner-only server message guard', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  const ownerOnlyCases: Array<{ name: string; message: { type: string; [k: string]: unknown } }> = [
    { name: 'InventoryUpdate', message: { type: 'InventoryUpdate', playerId: 'p', inventory: [], maxInventorySlots: 20 } },
    { name: 'EquipmentUpdate', message: { type: 'EquipmentUpdate', equipment: [] } },
    { name: 'EquipFailed', message: { type: 'EquipFailed', reason: 'no' } },
    { name: 'LearnSkillFailed', message: { type: 'LearnSkillFailed', skillId: 'fireball', reason: 'noSkillPoints' } },
    { name: 'SkillLearned', message: { type: 'SkillLearned', skillId: 'fireball', remainingPoints: 0 } },
    { name: 'SkillShortcutUpdated', message: { type: 'SkillShortcutUpdated', slotIndex: 0, skillId: null } },
    { name: 'ClassSelected', message: { type: 'ClassSelected', className: 'mage', baseStats: {} } },
    { name: 'CastFail', message: { type: 'CastFail', clientSeq: 0, reason: 'cooldown' } },
    { name: 'ItemUsed', message: { type: 'ItemUsed', slotIndex: 0, itemId: 'health_potion', newQuantity: 0 } },
    { name: 'LootAcquired', message: { type: 'LootAcquired', items: [] } },
    { name: 'StarterProgressUpdate', message: { type: 'StarterProgressUpdate', progress: {} } },
  ];

  for (const { name, message } of ownerOnlyCases) {
    it(`drops ${name} when published via serverMessage (no broadcast, no client.send)`, () => {
      const clientA = makeClient('socket-a');
      const clientB = makeClient('socket-b');
      const broadcast = vi.fn();
      const room = { clients: [clientA, clientB], broadcast };
      const outbound = makeColyseusOutbound(room);

      outbound.publish({ type: 'serverMessage', message: message as never });

      expect(broadcast).not.toHaveBeenCalled();
      expect(clientA.send).not.toHaveBeenCalled();
      expect(clientB.send).not.toHaveBeenCalled();
    });
  }

  it('directServerMessage still delivers owner-only messages to the matching socket', () => {
    const clientA = makeClient('socket-a');
    const clientB = makeClient('socket-b');
    const broadcast = vi.fn();
    const room = { clients: [clientA, clientB], broadcast };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'directServerMessage',
      socketId: 'socket-a',
      message: { type: 'InventoryUpdate', playerId: 'p', inventory: [], maxInventorySlots: 20 },
    });

    expect(clientA.send).toHaveBeenCalledTimes(1);
    expect(clientB.send).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('increments the metrics counter on each dropped owner-only broadcast', () => {
    const broadcast = vi.fn();
    const room = { clients: [], broadcast };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'serverMessage',
      message: { type: 'InventoryUpdate', playerId: 'p', inventory: [], maxInventorySlots: 20 } as never,
    });
    outbound.publish({
      type: 'serverMessage',
      message: { type: 'LearnSkillFailed', skillId: 'fireball', reason: 'noSkillPoints' } as never,
    });

    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.ownerOnlyBroadcastDropped']).toBe(2);
  });

  it('public server messages are unaffected by the guard', () => {
    const clientA = makeClient('socket-a');
    const broadcast = vi.fn();
    const room = { clients: [clientA], broadcast };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'serverMessage',
      message: { type: 'LootPickup', lootId: 'l', playerId: 'p' },
    });
    outbound.publish({
      type: 'serverMessage',
      message: { type: 'ChatBroadcast', fromId: 'p', fromName: 'P', text: 'hi', scope: 'all', ts: 1 },
    });

    expect(broadcast).toHaveBeenCalledTimes(2);
  });
});
