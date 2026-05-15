import { useEffect, useRef } from 'react';

export function useDraggablePanel<T extends HTMLElement = HTMLElement>(): React.RefObject<T | null> {
  const panelRef = useRef<T | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }
    const handle = panel.querySelector<HTMLElement>('.panel-title');
    if (!handle) {
      return undefined;
    }

    handle.classList.add('panel-drag-handle');
    let dragging = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;

    const apply = () => {
      panel.style.transform = `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px)`;
    };

    apply();

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX - offsetRef.current.x;
      startY = event.clientY - offsetRef.current.y;
      handle.setPointerCapture(pointerId);
      event.preventDefault();
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }
      offsetRef.current.x = event.clientX - startX;
      offsetRef.current.y = event.clientY - startY;
      apply();
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      dragging = false;
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // capture may already be released
      }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);

    return () => {
      handle.classList.remove('panel-drag-handle');
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', release);
      handle.removeEventListener('pointercancel', release);
    };
  }, []);

  return panelRef;
}
