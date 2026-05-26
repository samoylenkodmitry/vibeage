import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type HTMLAttributes,
} from 'react';
import { getEffectiveMinLevel, getGradeSpec } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { useHasMousePointer } from './useHasMousePointer';

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
  /** Drag a bag slot onto this one to rearrange (move/swap). */
  onMoveItem: (fromSlotIndex: number, toSlotIndex: number) => void;
  /** Open the click-sticky tooltip for this slot. Passes both the
   *  click coords AND the slot's bounding rect so the tooltip can
   *  position itself outside the slot (above/below/side) without
   *  overlapping the item the player just clicked. */
  onOpenStickyTooltip: (
    slotIndex: number, itemId: string,
    clientX: number, clientY: number,
    anchorRect: { top: number; bottom: number; left: number; right: number },
  ) => void;
  tooltipTriggerProps: (slotIndex: number, itemId: string) => HTMLAttributes<HTMLElement> | undefined;
  consumePendingClick: () => boolean;
};

/** Dragstart payload: a JSON blob with the source slot so a drop
 *  target (world canvas, future shortcut-bar) can identify what
 *  the user dragged without sharing React state across panels. */
export const INVENTORY_DRAG_MIME = 'application/x-vibeage-bag-slot';

function handleBagDragOver(event: ReactDragEvent) {
  if (event.dataTransfer.types.includes(INVENTORY_DRAG_MIME)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleBagDrop(
  event: ReactDragEvent,
  index: number,
  onMoveItem: (fromSlotIndex: number, toSlotIndex: number) => void,
) {
  const raw = event.dataTransfer.getData(INVENTORY_DRAG_MIME);
  if (!raw) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    const payload = JSON.parse(raw) as { slotIndex?: number };
    if (typeof payload.slotIndex === 'number' && payload.slotIndex !== index) {
      onMoveItem(payload.slotIndex, index);
    }
  } catch { /* malformed payload */ }
}

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
  // Tint the slot border by item grade so rare drops jump out of
  // the bag at a glance.
  const grade = slot && item ? getItemGrade(item) : 'none';
  const gradeColor = getGradeSpec(grade).color;
  const slotStyle = slot && grade !== 'none'
    ? { ['--slot-grade-color' as string]: gradeColor } as CSSProperties
    : undefined;
  return (
    <button
      type="button"
      className={`inventory-slot${slot ? '' : ' inventory-slot--empty'}${slot && grade !== 'none' ? ` inventory-slot--grade-${grade}` : ''}`}
      style={slotStyle}
      aria-disabled={!slot}
      title={title}
      aria-label={slot ? `${itemName}: click for actions` : `Inventory slot ${index + 1}: empty`}
      draggable={Boolean(slot) && hasMouse}
      onDragOver={handleBagDragOver}
      onDrop={(event) => handleBagDrop(event, index, callbacks.onMoveItem)}
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
        const r = event.currentTarget.getBoundingClientRect();
        callbacks.onOpenStickyTooltip(index, slot.itemId, event.clientX, event.clientY, {
          top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        });
      }}
      {...(triggerProps ?? {})}
    >
      <span>{slot ? itemName.trim().charAt(0).toUpperCase() : ''}</span>
      {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
    </button>
  );
}
