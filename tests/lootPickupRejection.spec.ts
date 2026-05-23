import { describe, expect, test, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { onLootPickup } from '../server/world/router/inventoryHandlers';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §11 / pickup-feedback — onLootPickup must emit a CommandRejected
 * envelope with the typed reason every time a pickup fails so the
 * client can render the cause in the combat log. The user shouldn't
 * be left wondering "why didn't anything happen" — that was the
 * actual bug.
 */

function makePlayer(socketId: string): PlayerState {
  const player: PlayerState = {
    id: 'p1', socketId, name: 'p',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: [], skillShortcuts: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    maxInventorySlots: 1,
  } as PlayerState;
  addItemsToPlayer(player, 'wolf_pelt', 1);
  return player;
}


describe('onLootPickup → CommandRejected', () => {
  test('emits playerNotFound when the player id is wrong', () => {
    const state = createGameState();
    const socket = { id: 'sock1', send: vi.fn(), emit: vi.fn() };
    const outbound = { publish: vi.fn() };
    onLootPickup(socket as never, { send: (m) => socket.emit('msg', m) } as never, state, {
      type: 'LootPickup', lootId: 'l1', playerId: 'nonexistent', clientSeq: 5,
    }, outbound);
    expect(socket.emit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      type: 'CommandRejected',
      commandType: 'LootPickup',
      reason: 'playerNotFound',
    }));
  });

  test('emits inventoryFull when the bag is full of non-stacking items', () => {
    const state = createGameState();
    const socket = { id: 'sock1', send: vi.fn(), emit: vi.fn() };
    state.players.p1 = makePlayer('sock1');
    // Bag is already at 1/1 capacity (a wolf_pelt). Drop different
    // loot to trigger inventoryFull.
    state.groundLoot.l1 = {
      position: { x: 0, z: 0 },
      items: [{ itemId: 'leather_strap', quantity: 1 }],
    };
    const events: OutboundEvent[] = [];
    const outbound = { publish: (e: OutboundEvent) => events.push(e) };
    onLootPickup(socket as never, { send: (m) => socket.emit('msg', m) } as never, state, {
      type: 'LootPickup', lootId: 'l1', playerId: 'p1', clientSeq: 9,
    }, outbound);
    expect(socket.emit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      type: 'CommandRejected',
      commandType: 'LootPickup',
      reason: 'inventoryFull',
    }));
    // Loot stays on the ground for another attempt.
    expect(state.groundLoot.l1).toBeDefined();
  });

  test('emits tooFar when the loot is out of pickup range', () => {
    const state = createGameState();
    const socket = { id: 'sock1', send: vi.fn(), emit: vi.fn() };
    state.players.p1 = makePlayer('sock1');
    state.groundLoot.l1 = {
      position: { x: 100, z: 0 },
      items: [{ itemId: 'leather_strap', quantity: 1 }],
    };
    const outbound = { publish: vi.fn() };
    onLootPickup(socket as never, { send: (m) => socket.emit('msg', m) } as never, state, {
      type: 'LootPickup', lootId: 'l1', playerId: 'p1', clientSeq: 1,
    }, outbound);
    expect(socket.emit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      reason: 'tooFar',
    }));
  });

  test('emits lootNotFound for unknown loot ids', () => {
    const state = createGameState();
    const socket = { id: 'sock1', send: vi.fn(), emit: vi.fn() };
    state.players.p1 = makePlayer('sock1');
    const outbound = { publish: vi.fn() };
    onLootPickup(socket as never, { send: (m) => socket.emit('msg', m) } as never, state, {
      type: 'LootPickup', lootId: 'ghost', playerId: 'p1', clientSeq: 2,
    }, outbound);
    expect(socket.emit).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      reason: 'lootNotFound',
    }));
  });

});
