import { useState } from 'react';
import { getEffectiveMinLevel, occupiedSlotsForSpec } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { BagContextMenu, type BagContextMenuTrigger } from './InventoryContextMenu';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';

type InventoryPanelProps = {
  inventory: InventorySlot[];
  maxSlots: number;
  playerLevel: number;
  /** §49/M2 — currently-equipped slot → itemId, for stat-delta tooltips. */
  equipment?: Record<string, string>;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
  /**
   * PR AA — tapping a recipe item opens the dedicated CraftPanel
   * instead of firing the craft immediately. The panel itself
   * surfaces ingredients + counts + the craft button so the player
   * sees what they're consuming before committing.
   */
  onOpenRecipe: (recipeSlotIndex: number) => void;
  /** §46/slice-new — Shift+click drops the full stack at the player's feet. */
  onDropItem: (slotIndex: number) => void;
  /** Bag context menu — destroy a stack without spawning ground loot. */
  onDestroyItem: (slotIndex: number) => void;
};

export function InventoryPanel({
  inventory,
  maxSlots,
  playerLevel,
  equipment,
  onUseItem,
  onEquipItem,
  onOpenRecipe,
  onDropItem,
  onDestroyItem,
}: InventoryPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('inventory');
  const usedSlots = inventory.filter((slot) => slot && slot.quantity > 0).length;
  const tooltip = useTooltipTrigger<string>();
  const [menu, setMenu] = useState<BagContextMenuTrigger | null>(null);
  return (
    <section ref={panelRef} className="inventory-panel" aria-label="Inventory">
      <div className="panel-title">
        <strong>Bag</strong>
        <span>{usedSlots}/{maxSlots}</span>
      </div>
      <div className="inventory-grid">
      {Array.from({ length: maxSlots }).map((_, index) => {
        const slot = inventory[index] ?? null;
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
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · Shift+click to drop · right-click for menu · hover or long-press for details`
          : 'Empty slot';

        const onClick = canUse
          ? () => onUseItem(index)
          : isRecipe
            ? () => onOpenRecipe(index)
            : canEquip ? () => onEquipItem(index) : undefined;
        const triggerProps = slot ? tooltip.triggerProps(slot.itemId) : undefined;

        const openMenu = (slotItemId: string, clientX: number, clientY: number) => {
          setMenu({ slotIndex: index, itemId: slotItemId, clientX, clientY });
        };

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!onClick && !slot}
            title={title}
            aria-label={slot && action ? `${action} ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={(event) => {
              if (tooltip.consumePendingClick()) {
                event.stopPropagation();
                return;
              }
              if (slot && event.shiftKey) {
                event.stopPropagation();
                onDropItem(index);
                return;
              }
              onClick?.();
              event.stopPropagation();
            }}
            onContextMenu={(event) => {
              if (!slot) return;
              event.preventDefault();
              openMenu(slot.itemId, event.clientX, event.clientY);
            }}
            {...(triggerProps ?? {})}
          >
            <span>{slot ? getItemInitial(itemName) : ''}</span>
            {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
          </button>
        );
      })}
      </div>
      {tooltip.info && (
        <ItemTooltip
          itemId={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          hoverHandlers={tooltip.hoverHandlers}
          compareStats={resolveCompareStats(tooltip.info.payload, equipment)}
        />
      )}
      {menu && (
        <BagContextMenu
          trigger={menu}
          canUse={Boolean(ITEMS[menu.itemId] && isUsableConsumable(ITEMS[menu.itemId]))}
          canEquip={canEquipAt(menu.itemId, playerLevel)}
          onUse={onUseItem}
          onEquip={onEquipItem}
          onDrop={onDropItem}
          onDestroy={onDestroyItem}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

// Tooltip equip-delta lookup: see the docstring on the original
// implementation — finds the item currently occupying the hovered
// item's primary slot so the tooltip can show +N/-N stat deltas.
export function resolveCompareStats(
  hoveredItemId: string,
  equipment: Record<string, string> | undefined,
) {
  if (!equipment) return undefined;
  const hovered = ITEMS[hoveredItemId];
  const spec = hovered?.equip;
  if (!spec) return undefined;
  const primarySlot = occupiedSlotsForSpec(spec)[0];
  if (!primarySlot) return undefined;
  const equippedId = equipment[primarySlot];
  if (!equippedId) return undefined;
  return ITEMS[equippedId]?.stats;
}

// Mirrors the per-slot equip rule used in the grid render so the
// context menu and the tooltip agree on whether Equip is available.
function canEquipAt(itemId: string, playerLevel: number): boolean {
  const item = ITEMS[itemId];
  if (!item?.equip) return false;
  const minLevel = getEffectiveMinLevel(getItemGrade(item), item.equip.requirements?.minLevel);
  return playerLevel >= minLevel;
}
