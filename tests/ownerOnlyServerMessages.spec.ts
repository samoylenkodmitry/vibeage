import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { createTransientPlayer } from '../server/playerFactory';
import {
  makeColyseusOutbound,
  type ColyseusClientLike,
} from '../server/transport/colyseusRoomAdapter';
import type { ServerWorldRegion } from '../server/world/regions';

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

});

describe('owner-only server message guard: routing + batch + metrics', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

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

});

describe('owner-only server message guard: metrics + public unaffected', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

  it('drops a BatchUpdate that wraps an owner-only message (recursive guard)', () => {
    const clientA = makeClient('socket-a');
    const clientB = makeClient('socket-b');
    const broadcast = vi.fn();
    const room = { clients: [clientA, clientB], broadcast };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'serverMessage',
      message: {
        type: 'BatchUpdate',
        updates: [
          { type: 'InventoryUpdate', playerId: 'p', inventory: [], maxInventorySlots: 20 },
        ],
      },
    });

    expect(broadcast).not.toHaveBeenCalled();
    expect(clientA.send).not.toHaveBeenCalled();
    expect(clientB.send).not.toHaveBeenCalled();
    expect(runtimeMetrics.snapshot().counters['outbound.ownerOnlyBroadcastDropped']).toBe(1);
  });

  it('drops a BatchUpdate even when only one nested entry is owner-only (mixed batch is a bug)', () => {
    const broadcast = vi.fn();
    const room = { clients: [], broadcast };
    const outbound = makeColyseusOutbound(room);

    outbound.publish({
      type: 'serverMessage',
      message: {
        type: 'BatchUpdate',
        updates: [
          { type: 'ChatBroadcast', fromId: 'p', fromName: 'P', text: 'hi', scope: 'all', ts: 1 },
          { type: 'LearnSkillFailed', skillId: 'fireball', reason: 'noSkillPoints' },
        ],
      },
    });

    expect(broadcast).not.toHaveBeenCalled();
    expect(runtimeMetrics.snapshot().counters['outbound.ownerOnlyBroadcastDropped']).toBe(1);
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

describe('BatchUpdate empty-filter behaviour', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('drops an empty filtered BatchUpdate instead of sending an empty wire payload', () => {
    const state = createGameState();
    const playerA = createTransientPlayer('socket-a', 'A');
    const playerB = createTransientPlayer('socket-b', 'B');
    const enemyB = createEnemy('wolf', 1, { x: 306, y: 0.5, z: 0 }, 2);
    playerA.id = 'player-a';
    playerB.id = 'player-b';
    playerA.position = { x: 0, y: 0.5, z: 0 };
    playerB.position = { x: 300, y: 0.5, z: 0 };
    state.players[playerA.id] = playerA;
    state.players[playerB.id] = playerB;
    state.enemies[enemyB.id] = enemyB;
    state.zones.activeZoneIds = ['zone-a', 'zone-b'];
    state.zones.playerZoneIds = { [playerA.id]: 'zone-a', [playerB.id]: 'zone-b' };
    state.zones.enemyZoneIds = { [enemyB.id]: 'zone-b' };

    const clientA = makeClient('socket-a');
    const clientB = makeClient('socket-b');
    const room = { clients: [clientA, clientB], broadcast: vi.fn() };
    const outbound = makeColyseusOutbound(room, {
      getGameState: () => state,
      getRegions: () => makeBatchRegions(),
    });

    // Batch contains only updates visible to zone-b (enemy B). Client A
    // (in zone-a) should receive nothing — not an empty BatchUpdate.
    outbound.publish({
      type: 'serverMessage',
      message: {
        type: 'BatchUpdate',
        updates: [
          { type: 'PosSnap', id: enemyB.id, pos: { x: 306, z: 0 }, vel: { x: 0, z: 0 }, snapTs: 1 },
        ],
      },
    });

    expect(clientB.send).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'BatchUpdate',
      updates: [expect.objectContaining({ id: enemyB.id })],
    }));
    expect(clientA.send).not.toHaveBeenCalled();
    expect(room.broadcast).not.toHaveBeenCalled();
  });
});

function makeBatchRegions(): ServerWorldRegion[] {
  return [
    { id: 'zone-a', zoneId: 'zone-a', name: 'zone-a', center: { x: 0, y: 0, z: 0 }, radius: 50, active: true, maxEnemies: 4 },
    { id: 'zone-b', zoneId: 'zone-b', name: 'zone-b', center: { x: 300, y: 0, z: 0 }, radius: 50, active: true, maxEnemies: 4 },
  ];
}
