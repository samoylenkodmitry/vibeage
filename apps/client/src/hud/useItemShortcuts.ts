import { useCallback, useEffect, useState } from 'react';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { SKILL_BAR_ROW_COUNT, SKILL_BAR_SECONDARY_ROW_COUNT } from '../skillShortcuts';

const STORAGE_KEY = 'vibeage:itemShortcuts:v1';
const SLOT_COUNT = SKILL_BAR_ROW_COUNT + SKILL_BAR_SECONDARY_ROW_COUNT;

/**
 * Client-side persistence for "item bound to a shortcut bar slot".
 *
 * Server-side skillShortcuts only carry SkillId | null today. Items
 * piggyback on the same hotkey grid via this localStorage-backed
 * overlay: a slot whose `skillShortcut` is null but `itemShortcut`
 * is set renders an item button and the hotkey routes to UseItem
 * (looking up the first bag slot that still holds the bound itemId).
 * Bindings are per-browser; cross-device sync needs the protocol
 * change deferred to a follow-up PR.
 */
function loadFromStorage(): (string | null)[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return Array(SLOT_COUNT).fill(null);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Array(SLOT_COUNT).fill(null);
    return Array.from({ length: SLOT_COUNT }, (_, i) =>
      typeof parsed[i] === 'string' ? (parsed[i] as string) : null);
  } catch {
    return Array(SLOT_COUNT).fill(null);
  }
}

function saveToStorage(shortcuts: (string | null)[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts)); } catch { /* localStorage unavailable */ }
}

export function useItemShortcuts() {
  const [itemShortcuts, setShortcuts] = useState<(string | null)[]>(loadFromStorage);
  useEffect(() => { saveToStorage(itemShortcuts); }, [itemShortcuts]);

  const bindItem = useCallback((slotIndex: number, itemId: string) => {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
    setShortcuts((prev) => {
      const next = [...prev];
      // Same item can only sit in one slot — clear stale duplicates.
      next.forEach((id, i) => { if (id === itemId && i !== slotIndex) next[i] = null; });
      next[slotIndex] = itemId;
      return next;
    });
  }, []);

  const clearItem = useCallback((slotIndex: number) => {
    setShortcuts((prev) => {
      if (slotIndex < 0 || slotIndex >= SLOT_COUNT || prev[slotIndex] === null) return prev;
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  return { itemShortcuts, bindItem, clearItem };
}

/** Look up the first bag slot holding `itemId` with quantity > 0. */
export function findBagSlotForItem(
  inventory: readonly { itemId: string; quantity: number; slotIndex?: number }[],
  itemId: string,
): number | null {
  for (const slot of inventory) {
    if (slot.itemId === itemId && slot.quantity > 0) {
      return slot.slotIndex ?? inventory.indexOf(slot);
    }
  }
  return null;
}

/**
 * Combines persistence + per-slot use-routing so callers only thread
 * one helper through to the hotkey handler. Used by Hud.
 */
export function useItemShortcutBindings(
  inventory: InventorySlot[],
  onUseItem: (slotIndex: number) => void,
) {
  const persist = useItemShortcuts();
  const tryUseAt = useCallback((slotIndex: number): boolean => {
    const itemId = persist.itemShortcuts[slotIndex];
    if (!itemId) return false;
    const bagSlot = findBagSlotForItem(inventory, itemId);
    if (bagSlot === null) return false;
    onUseItem(bagSlot);
    return true;
  }, [persist.itemShortcuts, inventory, onUseItem]);
  return { ...persist, tryUseAt };
}
