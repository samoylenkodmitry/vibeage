import { useEffect, useRef } from 'react';
import { ITEMS, isUsableConsumable } from '../../../../packages/content/items';
import { openWikiAt } from './wikiNavBus';

/**
 * Bag context menu — appears on right-click / long-press of a bag
 * slot. Replaces the old behavior (right-click → open wiki) with a
 * popup offering every applicable action: Use (consumables), Equip
 * (gear), Drop (spawn ground loot), Destroy (gone for good), and
 * Open in Wiki. The Wiki link moves *inside* the menu so power
 * users still reach it in one tap.
 *
 * The menu is fixed-positioned at the (clientX, clientY) where the
 * trigger fired. Clicking outside / pressing Escape closes it.
 */
export type BagContextMenuTrigger = {
  slotIndex: number;
  itemId: string;
  clientX: number;
  clientY: number;
};

type BagContextMenuProps = {
  trigger: BagContextMenuTrigger;
  canUse: boolean;
  canEquip: boolean;
  onUse: (slotIndex: number) => void;
  onEquip: (slotIndex: number) => void;
  onDrop: (slotIndex: number) => void;
  onDestroy: (slotIndex: number) => void;
  onClose: () => void;
};

export function BagContextMenu(props: BagContextMenuProps) {
  const { trigger, canUse, canEquip, onUse, onEquip, onDrop, onDestroy, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  // Close on outside click / Escape. Mouse + touch + key cover
  // desktop, mobile, and accessibility.
  useEffect(() => {
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current || rootRef.current.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const item = ITEMS[trigger.itemId];
  const name = item?.name ?? trigger.itemId;
  // Keep the menu inside the viewport — clamp the right + bottom
  // edges so the menu doesn't render off-screen for clicks near the
  // right/bottom corners of the panel.
  const left = Math.min(trigger.clientX, window.innerWidth - 180);
  const top = Math.min(trigger.clientY, window.innerHeight - 180);

  const fire = (action: (slotIndex: number) => void) => () => {
    action(trigger.slotIndex);
    onClose();
  };

  return (
    <div
      ref={rootRef}
      className="bag-context-menu"
      style={{ left, top }}
      role="menu"
      aria-label={`Actions for ${name}`}
    >
      <div className="bag-context-menu-title">{name}</div>
      {canUse && (
        <button type="button" role="menuitem" onClick={fire(onUse)}>Use</button>
      )}
      {canEquip && (
        <button type="button" role="menuitem" onClick={fire(onEquip)}>Equip</button>
      )}
      <button type="button" role="menuitem" onClick={fire(onDrop)}>
        Drop on ground
      </button>
      <button
        type="button"
        role="menuitem"
        className="bag-context-menu-destroy"
        onClick={fire(onDestroy)}
      >
        Destroy
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          openWikiAt('items', trigger.itemId);
          onClose();
        }}
      >
        Open in Wiki
      </button>
    </div>
  );
}

/**
 * Helper for the InventoryPanel: given an item id, what actions
 * apply? Kept out of the panel itself so it stays testable + the
 * component reads as data flow.
 */
export function actionsForItemId(
  itemId: string,
  playerLevel: number,
  equipMinLevelFn: (itemId: string) => number,
): { canUse: boolean; canEquip: boolean } {
  const item = ITEMS[itemId];
  if (!item) return { canUse: false, canEquip: false };
  const canUse = isUsableConsumable(item);
  const equipMinLevel = item.equip ? equipMinLevelFn(itemId) : 0;
  const canEquip = Boolean(item.equip) && playerLevel >= equipMinLevel;
  return { canUse, canEquip };
}
