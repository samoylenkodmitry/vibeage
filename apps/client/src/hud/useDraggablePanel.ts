import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'vibeage:panel-offset:';

function readStoredOffset(key: string | undefined): { x: number; y: number } {
  if (!key || typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return { x: 0, y: 0 };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { x: 0, y: 0 };
    }
    const record = parsed as Record<string, unknown>;
    const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : 0;
    const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : 0;
    return { x, y };
  } catch {
    return { x: 0, y: 0 };
  }
}

function writeStoredOffset(key: string | undefined, offset: { x: number; y: number }): void {
  if (!key || typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(offset));
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

export function useDraggablePanel<T extends HTMLElement = HTMLElement>(
  storageKey?: string,
): React.RefObject<T | null> {
  const panelRef = useRef<T | null>(null);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }
    const handle = panel.querySelector<HTMLElement>('.panel-title');
    if (!handle) {
      return undefined;
    }

    offsetRef.current = readStoredOffset(storageKey);
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
      writeStoredOffset(storageKey, offsetRef.current);
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
  }, [storageKey]);

  return panelRef;
}
