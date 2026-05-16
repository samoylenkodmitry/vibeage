import { ITEMS, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { useDraggablePanel } from './useDraggablePanel';

type InventoryPanelProps = {
  inventory: InventorySlot[];
  maxSlots: number;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
};

export function InventoryPanel({ inventory, maxSlots, onUseItem, onEquipItem }: InventoryPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('inventory');
  const usedSlots = inventory.filter((slot) => slot && slot.quantity > 0).length;
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
        const canEquip = Boolean(slot && item?.equip);
        const itemName = item?.name ?? slot?.itemId ?? 'Empty slot';
        const action = canUse ? 'Use' : canEquip ? 'Equip' : '';
        const title = slot
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''}`
          : 'Empty slot';

        const onClick = canUse ? () => onUseItem(index) : canEquip ? () => onEquipItem(index) : undefined;

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!onClick}
            title={title}
            aria-label={slot && action ? `${action} ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={onClick}
            onContextMenu={(event) => {
              event.preventDefault();
              onClick?.();
            }}
          >
            <span>{slot ? getItemInitial(itemName) : ''}</span>
            {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
          </button>
        );
      })}
      </div>
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
