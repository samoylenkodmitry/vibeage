import { EQUIP_SLOTS, type EquipSlot } from '../../../../packages/content/equipmentTypes';
import { ITEMS } from '../../../../packages/content/items';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';

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
  const tooltip = useTooltipTrigger<string>();
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
          const triggerProps = itemId ? tooltip.triggerProps(itemId) : undefined;
          return (
            <li key={slot} className={`paperdoll-row${canUnequip ? ' paperdoll-row--filled' : ''}`}>
              <span className="paperdoll-slot-label">{SLOT_LABELS[slot]}</span>
              <button
                type="button"
                className="paperdoll-slot-item"
                disabled={!itemId}
                title={canUnequip ? `${itemName} — click for details, right-click jumps to Wiki` : 'Empty'}
                onContextMenu={(event) => {
                  if (!itemId) return;
                  event.preventDefault();
                  openWikiAt('items', itemId);
                }}
                onClick={(event) => {
                  // PR JJ — clicking the equipped item name opens the
                  // info popup immediately (was hover-only). The popup
                  // carries the "Open in Wiki" link; the hover-bridge
                  // keeps it alive so users can reach the link.
                  if (!itemId) return;
                  tooltip.openAt(itemId, event.clientX, event.clientY);
                }}
                {...(triggerProps ?? {})}
              >
                {itemName}
              </button>
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
