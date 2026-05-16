import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 380;
const CANCEL_MOVE_PX = 8;

export type LongPressInfo<T> = {
  payload: T;
  clientX: number;
  clientY: number;
};

/**
 * Returns handlers + state for an item tooltip triggered by a long press
 * (or right-click on desktop). The caller chooses what to show via the
 * returned `info` value and dismisses by tapping anywhere outside.
 */
export function useLongPress<T>() {
  const [info, setInfo] = useState<LongPressInfo<T> | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; payload: T } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const start = useCallback((payload: T, clientX: number, clientY: number) => {
    cancel();
    startRef.current = { x: clientX, y: clientY, payload };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const seed = startRef.current;
      startRef.current = null;
      if (!seed) return;
      setInfo({ payload: seed.payload, clientX: seed.x, clientY: seed.y });
    }, LONG_PRESS_MS);
  }, [cancel]);

  const move = useCallback((clientX: number, clientY: number) => {
    const seed = startRef.current;
    if (!seed) return;
    if (Math.abs(clientX - seed.x) > CANCEL_MOVE_PX || Math.abs(clientY - seed.y) > CANCEL_MOVE_PX) {
      cancel();
    }
  }, [cancel]);

  const dismiss = useCallback(() => setInfo(null), []);

  useEffect(() => {
    if (!info) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.item-tooltip')) return;
      setInfo(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInfo(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [info]);

  return { info, start, cancel, move, dismiss };
}
