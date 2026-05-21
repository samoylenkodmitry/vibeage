import { useState } from 'react';
import { getEffectiveMinLevel, occupiedSlotsForSpec } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { BagContextMenu, type BagContextMenuTrigger } from './InventoryContextMenu';
import { InventorySlotButton, type InventorySlotCallbacks } from './InventorySlotButton';
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
   * PR AA — tapping a recipe item opens the dedicated CraftPanel.
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
  const callbacks: InventorySlotCallbacks = {
    onUseItem, onEquipItem, onOpenRecipe, onDropItem,
    onOpenMenu: (slotIndex, itemId, clientX, clientY) => setMenu({ slotIndex, itemId, clientX, clientY }),
    tooltipTriggerProps: (itemId) => tooltip.triggerProps(itemId),
    consumePendingClick: () => tooltip.consumePendingClick(),
  };
  // §52 #11 — render by explicit `slotIndex` when the server provides
  // it. Falls back to positional indexing for older server builds that
  // still emit the dense array (no slotIndex on each slot).
  const byIndex = indexInventoryBySlot(inventory);
  return (
    <section ref={panelRef} className="inventory-panel" aria-label="Inventory">
      <div className="panel-title">
        <strong>Bag</strong>
        <span>{usedSlots}/{maxSlots}</span>
      </div>
      <div className="inventory-grid">
        {Array.from({ length: maxSlots }).map((_, index) => (
          <InventorySlotButton
            key={index}
            slot={byIndex[index] ?? null}
            index={index}
            playerLevel={playerLevel}
            callbacks={callbacks}
          />
        ))}
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

function canEquipAt(itemId: string, playerLevel: number): boolean {
  const item = ITEMS[itemId];
  if (!item?.equip) return false;
  const minLevel = getEffectiveMinLevel(getItemGrade(item), item.equip.requirements?.minLevel);
  return playerLevel >= minLevel;
}

/**
 * §52 #11 — return a sparse map slotIndex → InventorySlot. When the
 * server includes explicit `slotIndex` (post §52 #11), positions are
 * honored exactly. Pre-§52 wire shapes (dense array, no slotIndex)
 * fall back to positional indexing for backwards compat.
 */
export function indexInventoryBySlot(inventory: InventorySlot[]): Record<number, InventorySlot> {
  const out: Record<number, InventorySlot> = {};
  inventory.forEach((slot, arrayIndex) => {
    if (!slot) return;
    const slotIndex = slot.slotIndex ?? arrayIndex;
    out[slotIndex] = slot;
  });
  return out;
}
