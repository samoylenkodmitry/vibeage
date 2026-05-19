import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
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
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
  /**
   * PR AA — tapping a recipe item opens the dedicated CraftPanel
   * instead of firing the craft immediately. The panel itself
   * surfaces ingredients + counts + the craft button so the player
   * sees what they're consuming before committing.
   */
  onOpenRecipe: (recipeSlotIndex: number) => void;
};

export function InventoryPanel({ inventory, maxSlots, playerLevel, onUseItem, onEquipItem, onOpenRecipe }: InventoryPanelProps) {
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
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · hover or long-press for details`
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
        />
      )}
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
