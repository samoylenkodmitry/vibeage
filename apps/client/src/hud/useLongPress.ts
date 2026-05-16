import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 380;
const CANCEL_MOVE_PX = 8;
const SUPPRESS_CLICK_MS = 400;

export type LongPressInfo<T> = {
  payload: T;
  clientX: number;
  clientY: number;
};

/**
 * Returns handlers + state for an item tooltip triggered by a long press
 * (or right-click on desktop). The caller chooses what to show via the
 * returned `info` value and dismisses by tapping anywhere outside.
 *
 * `consumePendingClick()` is exposed for components whose onClick fires
 * after a long-press release: it returns true if a click should be
 * suppressed because the tooltip just opened.
 */
export function useLongPress<T>() {
  const [info, setInfo] = useState<LongPressInfo<T> | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; payload: T } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const open = useCallback((payload: T, clientX: number, clientY: number) => {
    setInfo({ payload, clientX, clientY });
    suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
  }, []);

  const start = useCallback((payload: T, clientX: number, clientY: number, opts?: { instant?: boolean }) => {
    cancel();
    if (opts?.instant) {
      open(payload, clientX, clientY);
      return;
    }
    startRef.current = { x: clientX, y: clientY, payload };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const seed = startRef.current;
      startRef.current = null;
      if (!seed) return;
      open(seed.payload, seed.x, seed.y);
    }, LONG_PRESS_MS);
  }, [cancel, open]);

  const move = useCallback((clientX: number, clientY: number) => {
    const seed = startRef.current;
    if (!seed) return;
    if (Math.abs(clientX - seed.x) > CANCEL_MOVE_PX || Math.abs(clientY - seed.y) > CANCEL_MOVE_PX) {
      cancel();
    }
  }, [cancel]);

  const dismiss = useCallback(() => setInfo(null), []);

  /**
   * Call this from a button's `onClick`. Returns true and dismisses the
   * tooltip when the click is actually the trailing tap of a long-press
   * (so the caller should NOT fire its usual action).
   */
  const consumePendingClick = useCallback((): boolean => {
    if (Date.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return true;
    }
    return false;
  }, []);

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

  return { info, start, cancel, move, dismiss, consumePendingClick };
}
