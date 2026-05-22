import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';
import type { InventorySlot } from '../packages/protocol/common';

/**
 * ROADMAP — reducer tests for InventoryUpdate, with the equip /
 * unequip flow as the central scenario.
 *
 * `EquipItem` on the server consumes the bag slot and sends back an
 * `InventoryUpdate` with the slot vacated. `UnequipItem` is the
 * symmetric path. The reducer must:
 *  - replace `state.inventory` with the new slot list when the update
 *    targets the local player (no `playerId` OR `playerId === me`)
 *  - update `state.maxInventorySlots`
 *  - mirror the same write into `state.players[playerId].inventory`
 *    when a `playerId` is present and the player is known
 *  - leave the local `state.inventory` alone when the update targets
 *    a *different* player (the existing visibility guard)
 *
 * The slot bookkeeping carries `slotIndex` + `instanceId` (§52 #11)
 * so the UI can render grid positions stably across updates.
 */

const ME = 'me';

function makePlayer(id: string, overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  return {
    id,
    name: id,
    inventory: [],
    maxInventorySlots: 20,
    ...overrides,
  } as unknown as PlayerEntity;
}

const baseState: GameClientState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: ME,
  players: { [ME]: makePlayer(ME) },
  inventory: [
    { itemId: 'rusty_sword', quantity: 1, slotIndex: 0, instanceId: 'inst-sword-1' },
    { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
  ],
  maxInventorySlots: 20,
};

function dispatchInventoryUpdate(
  state: GameClientState,
  inventory: InventorySlot[],
  options: { playerId?: string; maxInventorySlots?: number; now?: number } = {},
): GameClientState {
  return gameClientReducer(state, {
    type: 'serverMessage',
    now: options.now ?? 1000,
    message: {
      type: 'InventoryUpdate',
      playerId: options.playerId,
      inventory,
      maxInventorySlots: options.maxInventorySlots ?? state.maxInventorySlots,
    },
  });
}

describe('gameClientReducer — InventoryUpdate after equip', () => {
  it('removes the bag slot that the equipped item used to occupy', () => {
    // Player equips rusty_sword: server consumes slot 0, leaves the potion.
    const next = dispatchInventoryUpdate(baseState, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ]);
    expect(next.inventory).toEqual([
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ]);
    // §52 #11 — slotIndex 0 is GONE, not blanked: the grid renderer
    // keys on slotIndex, so the empty slot is implied by absence.
    expect(next.inventory.some((slot) => slot.slotIndex === 0)).toBe(false);
  });

  it('mirrors the new inventory onto state.players[me]', () => {
    const seeded: GameClientState = {
      ...baseState,
      players: { [ME]: makePlayer(ME, { inventory: baseState.inventory, maxInventorySlots: 20 }) },
    };
    const next = dispatchInventoryUpdate(seeded, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ], { playerId: ME });
    expect(next.players[ME].inventory).toEqual([
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ]);
  });

  it('treats a missing playerId as "the local player" (no-id form is normal for self-updates)', () => {
    const next = dispatchInventoryUpdate(baseState, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ]);
    expect(next.inventory).toHaveLength(1);
    // The players record only gets a mirrored write when a playerId
    // is explicitly provided — the no-id form skips the mirror.
    expect(next.players[ME].inventory).toBe(baseState.players[ME].inventory);
  });
});

describe('gameClientReducer — InventoryUpdate after unequip', () => {
  it('restores a bag slot when the unequipped item lands back in inventory', () => {
    // Symmetric: player unequips the chest piece — slot 2 is now full.
    const before: GameClientState = {
      ...baseState,
      inventory: [
        { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
      ],
    };
    const after = dispatchInventoryUpdate(before, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
      { itemId: 'leather_tunic', quantity: 1, slotIndex: 2, instanceId: 'inst-tunic-1' },
    ]);
    expect(after.inventory).toHaveLength(2);
    expect(after.inventory.find((slot) => slot.itemId === 'leather_tunic')?.slotIndex).toBe(2);
  });

  it('keeps maxInventorySlots in sync with the payload', () => {
    const next = dispatchInventoryUpdate(baseState, [], { maxInventorySlots: 30 });
    expect(next.maxInventorySlots).toBe(30);
  });
});

describe('gameClientReducer — InventoryUpdate cross-player visibility', () => {
  it('does NOT overwrite my local inventory when the update targets another player', () => {
    const seeded: GameClientState = {
      ...baseState,
      players: {
        [ME]: makePlayer(ME),
        other: makePlayer('other'),
      },
    };
    const next = dispatchInventoryUpdate(seeded, [
      { itemId: 'gold_coin', quantity: 99, slotIndex: 0, instanceId: 'inst-gold-other' },
    ], { playerId: 'other', maxInventorySlots: 24 });
    // My inventory & max are unchanged…
    expect(next.inventory).toEqual(baseState.inventory);
    expect(next.maxInventorySlots).toBe(20);
    // …but the other player's mirror is updated.
    expect(next.players.other.inventory).toEqual([
      { itemId: 'gold_coin', quantity: 99, slotIndex: 0, instanceId: 'inst-gold-other' },
    ]);
    expect(next.players.other.maxInventorySlots).toBe(24);
  });

  it('drops the players mirror for an unknown playerId (defensive: no incidental Record key)', () => {
    const next = dispatchInventoryUpdate(baseState, [
      { itemId: 'gold_coin', quantity: 1 },
    ], { playerId: 'ghost-player' });
    expect(next.players['ghost-player']).toBeUndefined();
    expect(next.inventory).toEqual(baseState.inventory);
  });
});

describe('gameClientReducer — InventoryUpdate ordering & duplicates', () => {
  it('a late duplicate payload is idempotent', () => {
    const a = dispatchInventoryUpdate(baseState, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ]);
    const b = dispatchInventoryUpdate(a, [
      { itemId: 'health_potion', quantity: 3, slotIndex: 1, instanceId: 'inst-pot-1' },
    ], { now: 2000 });
    expect(b.inventory).toEqual(a.inventory);
  });

  it('an empty inventory payload fully clears the bag (full-unequip-into-vendor edge case)', () => {
    const next = dispatchInventoryUpdate(baseState, []);
    expect(next.inventory).toEqual([]);
  });
});
