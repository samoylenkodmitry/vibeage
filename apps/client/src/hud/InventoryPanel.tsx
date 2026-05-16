import { ITEMS, isUsableConsumable } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useLongPress } from './useLongPress';

type InventoryPanelProps = {
  inventory: InventorySlot[];
  maxSlots: number;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
};

export function InventoryPanel({ inventory, maxSlots, onUseItem, onEquipItem }: InventoryPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('inventory');
  const usedSlots = inventory.filter((slot) => slot && slot.quantity > 0).length;
  const longPress = useLongPress<string>();
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
          ? `${itemName} (${slot.quantity})${action ? ` — ${action}` : ''} · long-press for details`
          : 'Empty slot';

        const onClick = canUse ? () => onUseItem(index) : canEquip ? () => onEquipItem(index) : undefined;

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!onClick && !slot}
            title={title}
            aria-label={slot && action ? `${action} ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={(event) => {
              if (longPress.consumePendingClick()) {
                event.stopPropagation();
                return;
              }
              onClick?.();
              event.stopPropagation();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              if (slot) {
                longPress.start(slot.itemId, event.clientX, event.clientY, { instant: true });
              }
            }}
            onPointerDown={(event) => {
              if (slot && event.pointerType === 'touch') {
                longPress.start(slot.itemId, event.clientX, event.clientY);
              }
            }}
            onPointerMove={(event) => {
              if (event.pointerType === 'touch') {
                longPress.move(event.clientX, event.clientY);
              }
            }}
            onPointerUp={() => longPress.cancel()}
            onPointerLeave={() => longPress.cancel()}
            onPointerCancel={() => longPress.cancel()}
          >
            <span>{slot ? getItemInitial(itemName) : ''}</span>
            {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
          </button>
        );
      })}
      </div>
      {longPress.info && (
        <ItemTooltip
          itemId={longPress.info.payload}
          clientX={longPress.info.clientX}
          clientY={longPress.info.clientY}
        />
      )}
    </section>
  );
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
