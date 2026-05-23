import { describe, expect, it, vi } from 'vitest';
import { tryGiveLoot } from '../server/loot/groundLoot';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { ITEMS } from '../packages/content/items';
import type { OutboundEvent } from '../server/transport/outboundEvents';

/**
 * User: "cant pickup wyvern drop - say bag is full, but bag say 19/20."
 *
 * Pre-fix `pickupGroundLoot` was all-or-nothing: any single drop
 * that couldn't fit rolled the whole pickup back, including gold
 * (which doesn't even need a slot) and any items that did fit.
 * A wyvern boss can drop 4+ items at once and a near-full bag
 * looked at the chat saying "your bag is full" while staring at
 * a 19/20 slot count — the failing item needed slot 20 + a new
 * slot, no rollback possible.
 *
 * Now: take what fits, leave what doesn't on the ground.
 */
describe('partial loot pickup', () => {
  it('picks up the items that fit and leaves the rest on the ground', () => {
    const state = createGameState();
    const player = createTransientPlayer('s1', 'looter');
    // Trim bag to 1 free slot.
    player.maxInventorySlots = 2;
    if (player.characterInventory) player.characterInventory.limits = { baseSlots: 2, bonusSlots: 0, maxWeight: 9_999_999 };
    addItemsToPlayer(player, 'worn_sword', 1); // fills 1 slot (non-stackable)
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-1'] = {
      position: { x: 0, z: 0 },
      // 3 non-stackable items + 1 gold drop — only 1 slot free in bag,
      // gold doesn't need a slot.
      items: [
        { itemId: 'gold_coin', quantity: 20 },
        { itemId: 'goblin_ear', quantity: 1 },
        { itemId: 'troll_bone', quantity: 1 },
        { itemId: 'wolf_pelt', quantity: 1 },
      ],
    };
    const events: OutboundEvent[] = [];
    const outbound = { publish: vi.fn((e: OutboundEvent) => events.push(e)) };

    const result = tryGiveLoot(state, outbound, player.id, 'loot-1');

    expect(result.ok).toBe(true);
    // Gold + one stackable item should have made it. The remaining
    // items stay on the pile.
    expect(player.gold).toBeGreaterThanOrEqual(20);
    expect(state.groundLoot['loot-1']).toBeDefined();
    const remaining = state.groundLoot['loot-1'].items;
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    expect(remaining.length).toBeLessThan(4);
  });

  it('clears the pile when every drop fit', () => {
    const state = createGameState();
    const player = createTransientPlayer('s2', 'roomy');
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-2'] = {
      position: { x: 0, z: 0 },
      items: [
        { itemId: 'gold_coin', quantity: 5 },
        { itemId: 'goblin_ear', quantity: 1 },
      ],
    };
    const outbound = { publish: vi.fn() };
    const result = tryGiveLoot(state, outbound, player.id, 'loot-2');
    expect(result.ok).toBe(true);
    expect(state.groundLoot['loot-2']).toBeUndefined();
  });

  it('still rejects when NOTHING could fit (no gold, no slots)', () => {
    const state = createGameState();
    const player = createTransientPlayer('s3', 'full');
    player.maxInventorySlots = 1;
    if (player.characterInventory) player.characterInventory.limits = { baseSlots: 1, bonusSlots: 0, maxWeight: 9_999_999 };
    addItemsToPlayer(player, 'worn_sword', 1);
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-3'] = {
      position: { x: 0, z: 0 },
      items: [{ itemId: 'goblin_ear', quantity: 1 }],
    };
    const outbound = { publish: vi.fn() };
    const result = tryGiveLoot(state, outbound, player.id, 'loot-3');
    expect(result).toMatchObject({ ok: false, reason: 'inventoryFull' });
    expect(state.groundLoot['loot-3']).toBeDefined();
  });

  it('credits gold even when no slot is free for the bag drop', () => {
    const state = createGameState();
    const player = createTransientPlayer('s4', 'noslots');
    player.maxInventorySlots = 1;
    if (player.characterInventory) player.characterInventory.limits = { baseSlots: 1, bonusSlots: 0, maxWeight: 9_999_999 };
    addItemsToPlayer(player, 'worn_sword', 1);
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-4'] = {
      position: { x: 0, z: 0 },
      items: [
        { itemId: 'gold_coin', quantity: 50 },
        { itemId: 'goblin_ear', quantity: 1 },
      ],
    };
    const initialGold = player.gold ?? 0;
    const outbound = { publish: vi.fn() };
    const result = tryGiveLoot(state, outbound, player.id, 'loot-4');
    expect(result.ok).toBe(true);
    expect(player.gold).toBe(initialGold + 50);
    // The bag drop stays for a follow-up after the player makes room.
    expect(state.groundLoot['loot-4']).toBeDefined();
    expect(state.groundLoot['loot-4'].items).toEqual([{ itemId: 'goblin_ear', quantity: 1 }]);
    // Verify health_potion isn't in ITEMS as a placeholder check (sanity).
    expect(ITEMS.goblin_ear).toBeDefined();
  });
});
