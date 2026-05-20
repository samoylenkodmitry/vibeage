import { getEffectiveMinLevel, occupiedSlotsForSpec } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';

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
};

export function InventoryPanel({ inventory, maxSlots, playerLevel, equipment, onUseItem, onEquipItem, onOpenRecipe, onDropItem }: InventoryPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('inventory');
  const usedSlots = inventory.filter((slot) => slot && slot.quantity > 0).length;
  const tooltip = useTooltipTrigger<string>();
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
        // PR AA — recipe items open the craft panel on tap (which
        // gates the actual craft on full inventory). We just need
        // to know whether to show a Recipe affordance here.
        const isRecipe = Boolean(slot && item?.recipe);
        // Grade-driven equip floor: the same rule the server enforces
        // (GRADE_MIN_LEVEL + per-item minLevel). Hiding the button is
        // the UX hint; the server still rejects forged equips.
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
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · Shift+click to drop · hover or long-press for details`
          : 'Empty slot';

        const onClick = canUse
          ? () => onUseItem(index)
          : isRecipe
            ? () => onOpenRecipe(index)
            : canEquip ? () => onEquipItem(index) : undefined;
        const triggerProps = slot ? tooltip.triggerProps(slot.itemId) : undefined;

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!onClick && !slot}
            title={title}
            aria-label={slot && action ? `${action} ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={(event) => {
              // Touch long-press fires a synthesized click on
              // finger-lift; swallow it so the bag doesn't
              // immediately use/equip after the tooltip opens.
              if (tooltip.consumePendingClick()) {
                event.stopPropagation();
                return;
              }
              // §46/slice-new — Shift+click on an occupied slot drops
              // the full stack instead of triggering the primary action.
              if (slot && event.shiftKey) {
                event.stopPropagation();
                onDropItem(index);
                return;
              }
              onClick?.();
              event.stopPropagation();
            }}
            onContextMenu={(event) => {
              // PR V: right-click on a bag slot opens the Wiki at
              // this item. Hidden behind context-menu so it doesn't
              // hijack the normal use/equip click.
              if (!slot) return;
              event.preventDefault();
              openWikiAt('items', slot.itemId);
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
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

// §49/M2 — for a hovered bag item, find the item currently
// equipped in the matching EquipSlot and return its stats so the
// tooltip can render +N/-N deltas. Returns undefined when the
// hovered item isn't equippable OR nothing's equipped in its
// primary slot OR the equipped item template can't be resolved.
//
// Uses `occupiedSlotsForSpec(...)[0]` (the primary slot) — the
// camelCase `bodyPart` field on EquipSpec doesn't match the
// upper-snake `EquipSlot` keys that `state.equipment` uses.
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
