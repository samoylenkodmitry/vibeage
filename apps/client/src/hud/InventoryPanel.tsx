import { ITEMS, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';

type InventoryPanelProps = {
  inventory: InventorySlot[];
  maxSlots: number;
  onUseItem: (slotIndex: number) => void;
};

export function InventoryPanel({ inventory, maxSlots, onUseItem }: InventoryPanelProps) {
  return (
    <section className="inventory-panel" aria-label="Inventory">
      {Array.from({ length: maxSlots }).map((_, index) => {
        const slot = inventory[index] ?? null;
        const item = slot ? ITEMS[slot.itemId] : null;
        const canUse = Boolean(slot && slot.quantity > 0 && isUsableConsumable(item));
        const itemName = item?.name ?? slot?.itemId ?? 'Empty slot';
        const title = slot
          ? `${itemName} (${slot.quantity})${canUse ? '' : ' - not usable'}`
          : 'Empty slot';

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!canUse}
            title={title}
            aria-label={slot && canUse ? `Use ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={() => canUse && onUseItem(index)}
            onContextMenu={(event) => {
              event.preventDefault();
              if (canUse) {
                onUseItem(index);
              }
            }}
          >
            <span>{slot ? getItemInitial(itemName) : ''}</span>
            {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
          </button>
        );
      })}
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
