import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import { createEmptyInventory } from '../packages/sim/characterInventory';
import { onDropItem } from '../server/inventory/dropItem';
import { makeClientDirectSink } from '../server/transport/clientSnapshot';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

// §46/slice-new — DropItem removes from the bag and spawns
// groundLoot at the caller's position. Ownership: only the bound
// socket may drop. Tests pin the server-side contract — UI / hover
// label lives on the client.

function setupPlayer(state: ReturnType<typeof createGameState>, socketId: string, position = { x: 5, y: 0.5, z: -3 }) {
  const player = createTransientPlayer(socketId, 'Dropper');
  player.id = `player-${socketId}`;
  player.characterInventory = createEmptyInventory(player.id, player.characterInventory!.limits);
  player.inventory = [];
  player.position = position;
  state.players[player.id] = player;
  return player;
}

describe('DropItem', () => {
  it('removes a full stack from the bag and spawns ground loot at the player position', () => {
    const state = createGameState();
    const player = setupPlayer(state, 'socket-1');
    addItemsToPlayer(player, 'health_potion', 3);

    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };
    const sendSpy = vi.fn();
    const direct = makeClientDirectSink({ sessionId: 'socket-1', send: sendSpy });

    onDropItem({ id: 'socket-1' }, direct, state, { type: 'DropItem', slotIndex: 0 }, outbound);

    expect(player.characterInventory!.items).toEqual({});
    // exactly one ground-loot stack created, anchored at the player
    const lootIds = Object.keys(state.groundLoot);
    expect(lootIds).toHaveLength(1);
    const loot = state.groundLoot[lootIds[0]];
    expect(loot.position).toEqual({ x: 5, z: -3 });
    expect(loot.items).toEqual([{ itemId: 'health_potion', quantity: 3 }]);

    // LootSpawn broadcast for other clients
    const lootSpawn = events.find((e) => e.type === 'serverMessage' && (e.message as { type?: string }).type === 'LootSpawn');
    expect(lootSpawn).toBeDefined();
    // owner's InventoryUpdate routed via direct sink
    expect(sendSpy).toHaveBeenCalled();
  });

  it('drops only the requested count when count < stack', () => {
    const state = createGameState();
    const player = setupPlayer(state, 'socket-1');
    addItemsToPlayer(player, 'health_potion', 5);

    const outbound: OutboundEventSink = { publish: vi.fn() };
    const direct = makeClientDirectSink({ sessionId: 'socket-1', send: vi.fn() });

    onDropItem({ id: 'socket-1' }, direct, state, { type: 'DropItem', slotIndex: 0, count: 2 }, outbound);

    // 3 of 5 remain in the bag
    const remainingCount = Object.values(player.characterInventory!.items).reduce((s, i) => s + i.count, 0);
    expect(remainingCount).toBe(3);
    const lootIds = Object.keys(state.groundLoot);
    expect(state.groundLoot[lootIds[0]].items).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
  });

  it('clamps a too-large count to the stack quantity', () => {
    const state = createGameState();
    const player = setupPlayer(state, 'socket-1');
    addItemsToPlayer(player, 'health_potion', 2);

    const outbound: OutboundEventSink = { publish: vi.fn() };
    const direct = makeClientDirectSink({ sessionId: 'socket-1', send: vi.fn() });

    onDropItem({ id: 'socket-1' }, direct, state, { type: 'DropItem', slotIndex: 0, count: 999 }, outbound);

    expect(player.characterInventory!.items).toEqual({});
    const lootIds = Object.keys(state.groundLoot);
    expect(state.groundLoot[lootIds[0]].items).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
  });

  it('rejects drops from an unknown socket without spawning loot', () => {
    const state = createGameState();
    setupPlayer(state, 'socket-1');

    const outbound: OutboundEventSink = { publish: vi.fn() };
    const direct = makeClientDirectSink({ sessionId: 'stranger', send: vi.fn() });

    onDropItem({ id: 'stranger' }, direct, state, { type: 'DropItem', slotIndex: 0 }, outbound);

    expect(Object.keys(state.groundLoot)).toEqual([]);
  });

  it('rejects drops while the player is dead', () => {
    const state = createGameState();
    const player = setupPlayer(state, 'socket-1');
    addItemsToPlayer(player, 'health_potion', 1);
    player.isAlive = false;

    const outbound: OutboundEventSink = { publish: vi.fn() };
    const direct = makeClientDirectSink({ sessionId: 'socket-1', send: vi.fn() });

    onDropItem({ id: 'socket-1' }, direct, state, { type: 'DropItem', slotIndex: 0 }, outbound);

    expect(Object.keys(state.groundLoot)).toEqual([]);
    // bag unchanged
    const remainingCount = Object.values(player.characterInventory!.items).reduce((s, i) => s + i.count, 0);
    expect(remainingCount).toBe(1);
  });
});
