import { occupiedSlotsForSpec } from '../../../../packages/content/equipmentTypes';
import { ITEMS, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
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
  /** Destroy a stack without spawning ground loot. */
  onDestroyItem: (slotIndex: number) => void;
};

type TooltipPayload = { slotIndex: number; itemId: string };

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
  const tooltip = useTooltipTrigger<TooltipPayload>();
  const callbacks: InventorySlotCallbacks = {
    onUseItem, onEquipItem, onOpenRecipe, onDropItem,
    // Hover / long-press / right-click open the ItemTooltip in
    // its auto-close mode. Click opens the SAME tooltip in sticky
    // mode (no auto-close; explicit × needed) — this gives the
    // player a single discoverable surface for every action
    // (Use / Equip / Recipe / Drop / Destroy / Wiki) without
    // multiple gesture paths.
    tooltipTriggerProps: (slotIndex, itemId) => tooltip.triggerProps({ slotIndex, itemId }),
    onOpenStickyTooltip: (slotIndex, itemId, clientX, clientY) =>
      tooltip.openSticky({ slotIndex, itemId }, clientX, clientY),
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
          itemId={tooltip.info.payload.itemId}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          hoverHandlers={tooltip.hoverHandlers}
          compareStats={resolveCompareStats(tooltip.info.payload.itemId, equipment)}
          sticky={tooltip.info.sticky}
          bagActions={{
            slotIndex: tooltip.info.payload.slotIndex,
            canUse: Boolean(ITEMS[tooltip.info.payload.itemId] && isUsableConsumable(ITEMS[tooltip.info.payload.itemId])),
            // Show the Equip button whenever the item IS equippable.
            // If the player can't (low level / wrong class), the
            // server returns CommandRejected with a typed reason and
            // the combat log shows "Couldn't equip: …" so the user
            // sees the actual constraint instead of a no-op click.
            canEquip: Boolean(ITEMS[tooltip.info.payload.itemId]?.equip),
            canOpenRecipe: Boolean(ITEMS[tooltip.info.payload.itemId]?.recipe),
            onUse: onUseItem,
            onEquip: onEquipItem,
            onOpenRecipe,
            onDrop: onDropItem,
            onDestroy: onDestroyItem,
            onClose: tooltip.dismiss,
          }}
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
