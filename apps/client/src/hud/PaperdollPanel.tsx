import { type CSSProperties } from 'react';
import { EQUIP_SLOTS, GRADE_SPECS, type EquipSlot } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade } from '../../../../packages/content/items';
import { ItemTooltip } from './ItemTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';

type PaperdollPanelProps = {
  equipment: Record<string, string>;
  onUnequip: (slot: string) => void;
};

const SLOT_LABELS: Record<EquipSlot, string> = {
  HEAD: 'Head', CHEST: 'Chest', LEGS: 'Legs', GLOVES: 'Gloves', BOOTS: 'Boots',
  MAIN_HAND: 'Main hand', OFF_HAND: 'Off hand',
  NECK: 'Neck', EAR_LEFT: 'Ear (L)', EAR_RIGHT: 'Ear (R)',
  RING_LEFT: 'Ring (L)', RING_RIGHT: 'Ring (R)',
  BELT: 'Belt', CLOAK: 'Cloak', SHIRT: 'Shirt',
};

type PaperdollTooltipPayload = { itemId: string; slot: string };

export function PaperdollPanel({ equipment, onUnequip }: PaperdollPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('paperdoll');
  const equippedCount = Object.values(equipment).filter(Boolean).length;
  const tooltip = useTooltipTrigger<PaperdollTooltipPayload>();
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
          const triggerProps = itemId ? tooltip.triggerProps({ itemId, slot }) : undefined;
          // Tint the equipped row by item grade so a Lv-52 A-grade chest
          // visibly outranks a D-grade fallback at a glance (same colour
          // semantics + CSS var the bag uses — see InventorySlotButton).
          const grade = item ? getItemGrade(item) : 'none';
          const slotStyle: CSSProperties | undefined = item && grade !== 'none'
            ? ({ ['--slot-grade-color' as string]: GRADE_SPECS[grade].color } as CSSProperties)
            : undefined;
          const gradeClass = item && grade !== 'none' ? ` paperdoll-row--grade-${grade}` : '';
          return (
            <li key={slot} className={`paperdoll-row${canUnequip ? ' paperdoll-row--filled' : ''}${gradeClass}`} style={slotStyle}>
              <span className="paperdoll-slot-label">{SLOT_LABELS[slot]}</span>
              <button
                type="button"
                className="paperdoll-slot-item"
                disabled={!itemId}
                title={canUnequip ? `${itemName} — click for actions, right-click jumps to Wiki` : 'Empty'}
                onContextMenu={(event) => {
                  if (!itemId) return;
                  event.preventDefault();
                  openWikiAt('items', itemId);
                }}
                onClick={(event) => {
                  if (!itemId) return;
                  event.stopPropagation();
                  const r = event.currentTarget.getBoundingClientRect();
                  tooltip.openSticky({ itemId, slot }, event.clientX, event.clientY, {
                    top: r.top, bottom: r.bottom, left: r.left, right: r.right,
                  });
                }}
                {...(triggerProps ?? {})}
              >
                {item?.icon && <img className="paperdoll-slot-icon" src={item.icon} alt="" aria-hidden="true" />}
                <span>{itemName}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {tooltip.info && (
        <ItemTooltip
          itemId={tooltip.info.payload.itemId}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          anchorRect={tooltip.info.anchorRect}
          hoverHandlers={tooltip.hoverHandlers}
          sticky={tooltip.info.sticky}
          equippedActions={tooltip.info.sticky ? {
            slot: tooltip.info.payload.slot,
            onUnequip,
            onClose: tooltip.dismiss,
          } : undefined}
        />
      )}
    </section>
  );
}
