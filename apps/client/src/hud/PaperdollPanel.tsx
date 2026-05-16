import { EQUIP_SLOTS, type EquipSlot } from '../../../../packages/content/equipmentTypes';
import { ITEMS } from '../../../../packages/content/items';
import { useDraggablePanel } from './useDraggablePanel';

type PaperdollPanelProps = {
  equipment: Record<string, string>;
  onUnequip: (slot: string) => void;
};

const SLOT_LABELS: Record<EquipSlot, string> = {
  HEAD: 'Head',
  CHEST: 'Chest',
  LEGS: 'Legs',
  GLOVES: 'Gloves',
  BOOTS: 'Boots',
  MAIN_HAND: 'Main hand',
  OFF_HAND: 'Off hand',
  NECK: 'Neck',
  EAR_LEFT: 'Ear (L)',
  EAR_RIGHT: 'Ear (R)',
  RING_LEFT: 'Ring (L)',
  RING_RIGHT: 'Ring (R)',
  BELT: 'Belt',
  CLOAK: 'Cloak',
  SHIRT: 'Shirt',
};

export function PaperdollPanel({ equipment, onUnequip }: PaperdollPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('paperdoll');
  const equippedCount = Object.values(equipment).filter(Boolean).length;
  return (
    <section ref={panelRef} className="paperdoll-panel" aria-label="Equipment">
      <div className="panel-title">
        <strong>Equipment</strong>
        <span>{equippedCount}/{EQUIP_SLOTS.length}</span>
      </div>
      <ul className="paperdoll-list">
        {EQUIP_SLOTS.map((slot) => {
          const itemId = equipment[slot];
          const item = itemId ? ITEMS[itemId] : null;
          const itemName = item?.name ?? '—';
          const canUnequip = Boolean(item);
          return (
            <li key={slot} className={`paperdoll-row${canUnequip ? ' paperdoll-row--filled' : ''}`}>
              <span className="paperdoll-slot-label">{SLOT_LABELS[slot]}</span>
              <span className="paperdoll-slot-item">{itemName}</span>
              <button
                type="button"
                className="paperdoll-unequip"
                disabled={!canUnequip}
                onClick={() => canUnequip && onUnequip(slot)}
                title={canUnequip ? `Unequip ${itemName}` : 'Empty slot'}
                aria-label={canUnequip ? `Unequip ${itemName} from ${SLOT_LABELS[slot]}` : `${SLOT_LABELS[slot]} is empty`}
              >
                {canUnequip ? '×' : ''}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
