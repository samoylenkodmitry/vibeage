import type { HTMLAttributes } from 'react';
import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';

/**
 * Single bag slot — a button that handles tap-to-use / equip /
 * open-recipe + Shift+click to drop, PLUS a visible "⋯" menu button
 * in the corner that opens the BagContextMenu reliably on every
 * device. The dot-menu is the primary path to Drop / Destroy /
 * Open in Wiki; right-click and long-press still work as
 * power-user shortcuts but are no longer the only gesture.
 *
 * Structure: a wrapper <div> with two sibling <button>s (primary
 * + menu). Nesting <button> inside <button> is invalid HTML and
 * breaks event delivery in some browsers; the wrapper avoids that.
 */
export type InventorySlotCallbacks = {
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
  onOpenRecipe: (slotIndex: number) => void;
  onDropItem: (slotIndex: number) => void;
  onOpenMenu: (slotIndex: number, itemId: string, clientX: number, clientY: number) => void;
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
    ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · ⋯ for actions · Shift+click to drop · hover for details`
    : 'Empty slot';
  const onClick = canUse
    ? () => callbacks.onUseItem(index)
    : isRecipe
      ? () => callbacks.onOpenRecipe(index)
      : canEquip ? () => callbacks.onEquipItem(index) : undefined;
  const triggerProps = slot ? callbacks.tooltipTriggerProps(index, slot.itemId) : undefined;
  return (
    <div className="inventory-slot-wrapper">
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
      {slot && (
        <button
          type="button"
          className="inventory-slot-menu"
          aria-label={`Open actions menu for ${itemName}`}
          title={`Actions: drop, destroy, ${canUse ? 'use, ' : canEquip ? 'equip, ' : ''}wiki`}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            callbacks.onOpenMenu(index, slot.itemId, event.clientX, event.clientY);
          }}
        >
          ⋯
        </button>
      )}
    </div>
  );
}
