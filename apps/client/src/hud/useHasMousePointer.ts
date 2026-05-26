import { useEffect, useState } from 'react';

/**
 * True when the device has a fine, hovering pointer (a mouse/trackpad).
 * Touch-only devices can't reliably initiate HTML5 drag from a button, so
 * callers gate native `draggable` on this and fall back to the pointer-based
 * drag controller for touch.
 */
export function useHasMousePointer(): boolean {
  const [hasMouse, setHasMouse] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setHasMouse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return hasMouse;
}
