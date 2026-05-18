import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';

type InventoryPanelProps = {
  inventory: InventorySlot[];
  maxSlots: number;
  playerLevel: number;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
};

export function InventoryPanel({ inventory, maxSlots, playerLevel, onUseItem, onEquipItem }: InventoryPanelProps) {
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
        // Grade-driven equip floor: the same rule the server enforces
        // (GRADE_MIN_LEVEL + per-item minLevel). Hiding the button is
        // the UX hint; the server still rejects forged equips.
        const equipMinLevel = item?.equip
          ? getEffectiveMinLevel(getItemGrade(item), item.equip.requirements?.minLevel)
          : 0;
        const locked = isEquippable && playerLevel < equipMinLevel;
        const canEquip = isEquippable && !locked;
        const itemName = item?.name ?? slot?.itemId ?? 'Empty slot';
        const action = canUse ? 'Use' : canEquip ? 'Equip' : locked ? `Lv ${equipMinLevel}` : '';
        const title = slot
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · hover or long-press for details`
          : 'Empty slot';

        const onClick = canUse ? () => onUseItem(index) : canEquip ? () => onEquipItem(index) : undefined;
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
        />
      )}
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
