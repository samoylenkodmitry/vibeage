import { useCallback } from 'react';
import { INVENTORY_DRAG_MIME } from './InventorySlotButton';

/**
 * Drag-and-drop drop-zone for the world canvas: dropping a bag slot
 * anywhere outside the inventory panel drops the stack at the
 * player's feet (same path as the Drop button / Shift+click). Other
 * HUD panels can intercept with their own drop handlers (e.g., a
 * future shortcut bar that accepts items) by calling
 * preventDefault + stopPropagation before this fires.
 */
export function useWorldDropTarget(dropItem: (slotIndex: number) => void): {
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
} {
  const onDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes(INVENTORY_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }, []);
  const onDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData(INVENTORY_DRAG_MIME);
    if (!raw) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.inventory-panel')) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(raw) as { slotIndex: number };
      if (typeof payload.slotIndex === 'number') {
        dropItem(payload.slotIndex);
      }
    } catch { /* malformed payload, ignore */ }
  }, [dropItem]);
  return { onDragOver, onDrop };
}
