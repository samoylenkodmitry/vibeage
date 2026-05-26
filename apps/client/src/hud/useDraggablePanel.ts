import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'vibeage:panel-offset:';
// Keep the grab handle's center at least this far inside the viewport so a
// stored offset (from a bigger screen) or a rotate/resize can never strand a
// panel off a small phone screen with no way to drag it back.
const HANDLE_MARGIN = 24;

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

/** Wire pointer-drag + viewport-clamp onto a panel/handle pair. Returns a
 *  teardown that removes every listener and the handle marker class. */
function installPanelDrag(
  panel: HTMLElement,
  handle: HTMLElement,
  storageKey: string | undefined,
  baseTransform: string,
): () => void {
  const offset = readStoredOffset(storageKey);
  handle.classList.add('panel-drag-handle');
  let dragging = false;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;

  const apply = () => {
    const drag = `translate(${offset.x}px, ${offset.y}px)`;
    panel.style.transform = baseTransform ? `${baseTransform} ${drag}` : drag;
  };
  const clampIntoView = (): boolean => {
    const rect = handle.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = 0;
    let dy = 0;
    if (cx < HANDLE_MARGIN) dx = HANDLE_MARGIN - cx;
    else if (cx > vw - HANDLE_MARGIN) dx = vw - HANDLE_MARGIN - cx;
    if (cy < HANDLE_MARGIN) dy = HANDLE_MARGIN - cy;
    else if (cy > vh - HANDLE_MARGIN) dy = vh - HANDLE_MARGIN - cy;
    if (dx === 0 && dy === 0) return false;
    offset.x += dx;
    offset.y += dy;
    apply();
    return true;
  };
  const persistIfNudged = () => {
    if (clampIntoView()) writeStoredOffset(storageKey, offset);
  };

  apply();
  // Defer the first clamp until after layout so the handle has a rect.
  const initialClamp = requestAnimationFrame(persistIfNudged);

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX - offset.x;
    startY = event.clientY - offset.y;
    handle.setPointerCapture(pointerId);
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    offset.x = event.clientX - startX;
    offset.y = event.clientY - startY;
    apply();
    clampIntoView();
  };
  const release = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    writeStoredOffset(storageKey, offset);
    try {
      handle.releasePointerCapture(pointerId);
    } catch {
      // capture may already be released
    }
  };

  window.addEventListener('resize', persistIfNudged);
  window.addEventListener('orientationchange', persistIfNudged);
  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);

  return () => {
    cancelAnimationFrame(initialClamp);
    window.removeEventListener('resize', persistIfNudged);
    window.removeEventListener('orientationchange', persistIfNudged);
    handle.classList.remove('panel-drag-handle');
    handle.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', release);
    handle.removeEventListener('pointercancel', release);
  };
}

export function useDraggablePanel<T extends HTMLElement = HTMLElement>(
  storageKey?: string,
  options?: { handleSelector?: string; baseTransform?: string },
): React.RefObject<T | null> {
  const panelRef = useRef<T | null>(null);
  const handleSelector = options?.handleSelector ?? '.panel-title';
  const baseTransform = options?.baseTransform ?? '';

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const handle = panel.querySelector<HTMLElement>(handleSelector);
    if (!handle) return undefined;
    return installPanelDrag(panel, handle, storageKey, baseTransform);
  }, [storageKey, handleSelector, baseTransform]);

  return panelRef;
}
