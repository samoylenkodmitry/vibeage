import { useEffect, useState, type HTMLAttributes } from 'react';
import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';

/**
 * Mobile/touch devices can't reliably initiate HTML5 drag from a
 * `<button>` element — Safari/Chrome dispatch their own touch
 * handling that preempts our pointerdown long-press. We detect
 * mouse capability via the CSS media query `(hover: hover)` and
 * gate `draggable` accordingly. Touch users get the tooltip's
 * explicit Drop button instead; mouse users get drag.
 */
function useHasMousePointer(): boolean {
  const [hasMouse, setHasMouse] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setHasMouse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return hasMouse;
}

/**
 * Single bag slot. Click opens the ItemTooltip in sticky mode
 * (won't auto-close on pointer-leave; needs an explicit × tap).
 * The tooltip carries every action — Use / Equip / Open recipe /
 * Drop / Destroy / Open in Wiki. Shift+click is a power-user
 * shortcut that drops the stack without opening the tooltip.
 * Drag the slot to drop on the ground.
 */
export type InventorySlotCallbacks = {
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
  onOpenRecipe: (slotIndex: number) => void;
  onDropItem: (slotIndex: number) => void;
  /** Open the click-sticky tooltip at the cursor for this slot. */
  onOpenStickyTooltip: (slotIndex: number, itemId: string, clientX: number, clientY: number) => void;
  tooltipTriggerProps: (slotIndex: number, itemId: string) => HTMLAttributes<HTMLElement> | undefined;
  consumePendingClick: () => boolean;
};

/** Dragstart payload: a JSON blob with the source slot so a drop
 *  target (world canvas, future shortcut-bar) can identify what
 *  the user dragged without sharing React state across panels. */
export const INVENTORY_DRAG_MIME = 'application/x-vibeage-bag-slot';

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
  const hasMouse = useHasMousePointer();
  const title = slot
    ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · click for actions${hasMouse ? ' · drag to ground to drop' : ''}`
    : 'Empty slot';
  const triggerProps = slot ? callbacks.tooltipTriggerProps(index, slot.itemId) : undefined;
  return (
    <button
      type="button"
      className="inventory-slot"
      disabled={!slot}
      title={title}
      aria-label={slot ? `${itemName}: click for actions` : `Inventory slot ${index + 1}: empty`}
      draggable={Boolean(slot) && hasMouse}
      onDragStart={(event) => {
        if (!slot) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(INVENTORY_DRAG_MIME, JSON.stringify({
          slotIndex: index,
          itemId: slot.itemId,
        }));
        // Also stash on text/plain so older targets (including the
        // built-in Three.js canvas) at least see something.
        event.dataTransfer.setData('text/plain', `bag-slot:${index}`);
      }}
      onClick={(event) => {
        if (callbacks.consumePendingClick()) {
          event.stopPropagation();
          return;
        }
        if (!slot) return;
        if (event.shiftKey) {
          event.stopPropagation();
          callbacks.onDropItem(index);
          return;
        }
        event.stopPropagation();
        callbacks.onOpenStickyTooltip(index, slot.itemId, event.clientX, event.clientY);
      }}
      {...(triggerProps ?? {})}
    >
      <span>{slot ? itemName.trim().charAt(0).toUpperCase() : ''}</span>
      {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
    </button>
  );
}
