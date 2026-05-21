import { describe, expect, it } from 'vitest';
import { commandRejectedSchema } from '../packages/protocol/serverMessages';
import { handleEquipItem, handleUnequipItem } from '../server/inventory/equipHandlers';
import { createTransientPlayer } from '../server/playerFactory';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import type { DirectMessageSink } from '../server/transport/outboundEvents';

// §46/slice-5 — CommandRejected envelope: structured per-request
// rejection. Tests pin (a) the schema accepts the canonical shape,
// (b) equip / unequip handlers emit the envelope (alongside the
// legacy EquipFailed) with the right commandType + requestId.

describe('CommandRejected schema', () => {
  it('accepts minimal payload (no requestId, no detail)', () => {
    const result = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'EquipItem',
      reason: 'itemNotFound',
    });
    expect(result.success).toBe(true);
  });

  it('accepts payload with requestId + detail', () => {
    const result = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'EquipItem',
      reason: 'itemNotFound',
      requestId: 42,
      detail: 'slot 5 was empty when EquipItem arrived',
    });
    expect(result.success).toBe(true);
  });

  it('rejects oversize detail (> 240 chars)', () => {
    const result = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'EquipItem',
      reason: 'itemNotFound',
      detail: 'x'.repeat(241),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict)', () => {
    const result = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'EquipItem',
      reason: 'itemNotFound',
      extra: 'leak',
    });
    expect(result.success).toBe(false);
  });
});

function makeSink(): DirectMessageSink & { sent: unknown[] } {
  const sent: unknown[] = [];
  return { sent, send: (msg) => { sent.push(msg); } };
}

describe('EquipItem rejection emits CommandRejected', () => {
  it('emits CommandRejected with the requestId echo (§52 #1: EquipFailed retired — sole channel now)', () => {
    const player = createTransientPlayer('socket-1', 'EquipTest');
    player.characterInventory = createEmptyInventory(player.id, player.characterInventory!.limits);
    player.inventory = [];
    const sink = makeSink();

    handleEquipItem(player, { type: 'EquipItem', slotIndex: 99, clientSeq: 7 }, sink);

    // Pre-§52 this emitted EquipFailed + CommandRejected (2 messages).
    // After retirement, only CommandRejected goes out.
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]).toEqual({
      type: 'CommandRejected',
      commandType: 'EquipItem',
      reason: 'itemNotFound',
      requestId: 7,
    });
  });

  it('omits requestId when client did not supply clientSeq', () => {
    const player = createTransientPlayer('socket-2', 'EquipTest');
    player.characterInventory = createEmptyInventory(player.id, player.characterInventory!.limits);
    player.inventory = [];
    const sink = makeSink();

    handleEquipItem(player, { type: 'EquipItem', slotIndex: 99 }, sink);

    const rejection = sink.sent.find((m) => (m as { type?: string }).type === 'CommandRejected') as { requestId?: number; reason: string };
    expect(rejection).toBeDefined();
    expect(rejection.requestId).toBeUndefined();
    expect(rejection.reason).toBe('itemNotFound');
  });
});

describe('UnequipItem rejection emits CommandRejected', () => {
  it('invalid slot → CommandRejected with commandType=UnequipItem', () => {
    const player = createTransientPlayer('socket-3', 'UnequipTest');
    const sink = makeSink();

    handleUnequipItem(player, { type: 'UnequipItem', slot: 'NOT_A_SLOT', clientSeq: 11 }, sink);

    const rejection = sink.sent.find((m) => (m as { type?: string }).type === 'CommandRejected') as {
      commandType: string;
      reason: string;
      requestId?: number;
    };
    expect(rejection).toMatchObject({
      type: 'CommandRejected',
      commandType: 'UnequipItem',
      reason: 'invalidSlot',
      requestId: 11,
    });
  });
});
