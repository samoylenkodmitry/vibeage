import { describe, expect, it } from 'vitest';
import {
  applyInventoryRejectedVisualState,
  INVENTORY_VERB_COMMANDS,
} from '../apps/client/src/clientVisualState';
import type { GameClientState } from '../apps/client/src/gameTypes';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §52 polish — vendor / craft / use / drop / destroy command
 * rejections now surface in the combat log so the player sees *why*
 * a button did nothing. Previously these silently dropped (the
 * reducer's CommandRejected branch only routed cast / equip / quest
 * verbs).
 *
 * The friendly copy maps each (commandType, reason) pair to a
 * sentence; unknown reasons fall through to "<commandType> failed:
 * <reason>" so future server-side enum additions still surface.
 */

function emptyState(): GameClientState {
  return { enemies: {}, players: {}, combatLog: [] } as unknown as GameClientState;
}

type RejectMsg = ServerMessage & { type: 'CommandRejected' };
function reject(commandType: RejectMsg['commandType'], reason: string): RejectMsg {
  return { type: 'CommandRejected', commandType, reason };
}

describe('INVENTORY_VERB_COMMANDS — set membership', () => {
  it('covers BuyFromVendor / SellToVendor', () => {
    expect(INVENTORY_VERB_COMMANDS.has('BuyFromVendor')).toBe(true);
    expect(INVENTORY_VERB_COMMANDS.has('SellToVendor')).toBe(true);
  });
  it('covers UseItem / DropItem / DestroyItem / CraftItem', () => {
    expect(INVENTORY_VERB_COMMANDS.has('UseItem')).toBe(true);
    expect(INVENTORY_VERB_COMMANDS.has('DropItem')).toBe(true);
    expect(INVENTORY_VERB_COMMANDS.has('DestroyItem')).toBe(true);
    expect(INVENTORY_VERB_COMMANDS.has('CraftItem')).toBe(true);
  });
  it('does NOT contain commands that have their own UI routing (Quest verbs, CastReq, Equip)', () => {
    expect(INVENTORY_VERB_COMMANDS.has('CastReq')).toBe(false);
    expect(INVENTORY_VERB_COMMANDS.has('EquipItem')).toBe(false);
    expect(INVENTORY_VERB_COMMANDS.has('UnequipItem')).toBe(false);
    expect(INVENTORY_VERB_COMMANDS.has('ClaimQuestReward')).toBe(false);
  });
});

describe('applyInventoryRejectedVisualState — vendor copy', () => {
  it('notEnoughGold reads as a friendly sentence', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('BuyFromVendor', 'notEnoughGold'), 0);
    expect(next.combatLog[0].text).toBe("You don't have enough gold for that.");
  });
  it('outOfStock', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('BuyFromVendor', 'outOfStock'), 0);
    expect(next.combatLog[0].text).toBe('The vendor is out of that item.');
  });
  it('tooFarFromVendor (buy)', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('BuyFromVendor', 'tooFarFromVendor'), 0);
    expect(next.combatLog[0].text).toBe('You need to be closer to the vendor.');
  });
  it('SellToVendor notSellable', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('SellToVendor', 'notSellable'), 0);
    expect(next.combatLog[0].text).toBe("The vendor won't take that.");
  });
});

describe('applyInventoryRejectedVisualState — craft / use / drop / destroy copy', () => {
  it('CraftItem missingReagents', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('CraftItem', 'missingReagents'), 0);
    expect(next.combatLog[0].text).toBe('Missing reagents for that recipe.');
  });
  it('CraftItem inventoryFull', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('CraftItem', 'inventoryFull'), 0);
    expect(next.combatLog[0].text).toBe('Your bag is too full to craft.');
  });
  it('UseItem onCooldown', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('UseItem', 'onCooldown'), 0);
    expect(next.combatLog[0].text).toBe('That item is on cooldown.');
  });
  it('DropItem invalidCount', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('DropItem', 'invalidCount'), 0);
    expect(next.combatLog[0].text).toBe('Invalid drop amount.');
  });
  it('DestroyItem itemNotFound', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('DestroyItem', 'itemNotFound'), 0);
    expect(next.combatLog[0].text).toBe("That item isn't in your bag.");
  });
});

describe('applyInventoryRejectedVisualState — prominent flash', () => {
  it('also flashes the failure above the action bar (actionFeedback)', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('BuyFromVendor', 'notEnoughGold'), 555);
    expect(next.actionFeedback).toEqual({ text: "You don't have enough gold for that.", at: 555 });
  });
});

describe('applyInventoryRejectedVisualState — unknown-reason fall-through', () => {
  it('falls through to generic per-commandType copy for an unknown vendor reason', () => {
    const next = applyInventoryRejectedVisualState(emptyState(), reject('BuyFromVendor', 'weirdNewReason'), 0);
    expect(next.combatLog[0].text).toBe('Vendor rejected: weirdNewReason');
  });
  it('falls through to "<commandType> failed:" for an entirely unknown commandType (defensive)', () => {
    // Archwork #3 — the typed registry forbids unknown commandType
    // at compile time, but the runtime fallback in
    // `applyInventoryRejectedVisualState` must still work in case a
    // server sends a string that wasn't in the client's registry
    // (e.g., during an old-client/new-server rollout). Cast through
    // `as RejectMsg['commandType']` to assert the runtime path.
    const msg = reject('SomeFuture' as RejectMsg['commandType'], 'someReason');
    const next = applyInventoryRejectedVisualState(emptyState(), msg, 0);
    expect(next.combatLog[0].text).toBe('SomeFuture failed: someReason');
  });
});
