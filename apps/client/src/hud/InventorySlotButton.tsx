import type { HTMLAttributes } from 'react';
import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';

/**
 * Single bag slot — a button that handles tap-to-use / equip /
 * open-recipe, Shift+click to drop, and right-click / long-press
 * for the context menu. Split out of `InventoryPanel` so the panel
 * stays under the maintainability cap and the per-slot logic is
 * testable in isolation.
 */
export type InventorySlotCallbacks = {
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
  onOpenRecipe: (slotIndex: number) => void;
  onDropItem: (slotIndex: number) => void;
  onOpenMenu: (slotIndex: number, itemId: string, clientX: number, clientY: number) => void;
  /** Per-slot tooltip trigger handlers — the panel-level call site
   *  supplies onLongPress + onContextAction overrides so both
   *  gestures land on the action menu instead of the item tooltip. */
  tooltipTriggerProps: (slotIndex: number, itemId: string) => HTMLAttributes<HTMLElement> | undefined;
  consumePendingClick: () => boolean;
};

export function InventorySlotButton({
  slot,
  index,
  playerLevel,
  callbacks,
}: {
  slot: InventorySlot | null;
  index: number;
  playerLevel: number;
  callbacks: InventorySlotCallbacks;
}) {
  const item = slot ? ITEMS[slot.itemId] : null;
  const canUse = Boolean(slot && slot.quantity > 0 && isUsableConsumable(item));
  const isEquippable = Boolean(slot && item?.equip);
  const isRecipe = Boolean(slot && item?.recipe);
  const equipMinLevel = item?.equip
    ? getEffectiveMinLevel(getItemGrade(item), item.equip.requirements?.minLevel)
    : 0;
  const locked = isEquippable && playerLevel < equipMinLevel;
  const canEquip = isEquippable && !locked;
  const itemName = item?.name ?? slot?.itemId ?? 'Empty slot';
  const action = canUse
    ? 'Use'
    : isRecipe
      ? 'Recipe'
      : canEquip ? 'Equip' : locked ? `Lv ${equipMinLevel}` : '';
  const title = slot
    ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · Shift+click to drop · right-click or long-press for menu · hover for details`
    : 'Empty slot';
  const onClick = canUse
    ? () => callbacks.onUseItem(index)
    : isRecipe
      ? () => callbacks.onOpenRecipe(index)
      : canEquip ? () => callbacks.onEquipItem(index) : undefined;
  const triggerProps = slot ? callbacks.tooltipTriggerProps(index, slot.itemId) : undefined;
  return (
    <button
      type="button"
      className="inventory-slot"
      disabled={!onClick && !slot}
      title={title}
      aria-label={slot && action ? `${action} ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
      onClick={(event) => {
        if (callbacks.consumePendingClick()) {
          event.stopPropagation();
          return;
        }
        if (slot && event.shiftKey) {
          event.stopPropagation();
          callbacks.onDropItem(index);
          return;
        }
        onClick?.();
        event.stopPropagation();
      }}
      {...(triggerProps ?? {})}
    >
      <span>{slot ? itemName.trim().charAt(0).toUpperCase() : ''}</span>
      {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
    </button>
  );
}
