import { useCallback, useEffect, useRef, useState } from 'react';

const HOVER_DELAY_MS = 350;
const LONG_PRESS_MS = 380;
const CANCEL_MOVE_PX = 8;

export type TooltipInfo<T> = {
  payload: T;
  clientX: number;
  clientY: number;
};

/**
 * Unified tooltip trigger for skill / action buttons. Returns spread
 * handlers that show a tooltip on:
 *   - mouse hover (after a short delay)
 *   - touch long-press (~380 ms)
 *   - right-click / context menu (instant)
 *
 * The tooltip stays open until the pointer leaves / a tap dismisses
 * it / Escape is pressed.
 */
export function useTooltipTrigger<T>() {
  const [info, setInfo] = useState<TooltipInfo<T> | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number; payload: T } | null>(null);

  const clearTimers = useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressOrigin.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setInfo(null);
  }, [clearTimers]);

  const scheduleHover = useCallback((payload: T, clientX: number, clientY: number) => {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      setInfo({ payload, clientX, clientY });
    }, HOVER_DELAY_MS);
  }, [clearTimers]);

  const beginLongPress = useCallback((payload: T, clientX: number, clientY: number) => {
    clearTimers();
    pressOrigin.current = { payload, x: clientX, y: clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      const origin = pressOrigin.current;
      pressOrigin.current = null;
      if (origin) {
        setInfo({ payload: origin.payload, clientX: origin.x, clientY: origin.y });
      }
    }, LONG_PRESS_MS);
  }, [clearTimers]);

  const onPointerMove = useCallback((clientX: number, clientY: number) => {
    const origin = pressOrigin.current;
    if (!origin) return;
    if (Math.abs(clientX - origin.x) > CANCEL_MOVE_PX || Math.abs(clientY - origin.y) > CANCEL_MOVE_PX) {
      clearTimers();
    }
  }, [clearTimers]);

  const openInstant = useCallback((payload: T, clientX: number, clientY: number) => {
    clearTimers();
    setInfo({ payload, clientX, clientY });
  }, [clearTimers]);

  useEffect(() => {
    if (!info) return undefined;
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // Tapping inside the tooltip or its trigger button keeps it open.
      if (target?.closest('.skill-tooltip, .item-tooltip')) return;
      setInfo(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInfo(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [info]);

  const triggerProps = useCallback((payload: T) => buildTriggerProps({
    payload,
    scheduleHover,
    beginLongPress,
    onPointerMove,
    openInstant,
    clearTimers,
    setInfo,
  }), [scheduleHover, beginLongPress, onPointerMove, openInstant, clearTimers]);

  return { info, dismiss, triggerProps };
}

type BuildTriggerPropsArgs<T> = {
  payload: T;
  scheduleHover: (payload: T, x: number, y: number) => void;
  beginLongPress: (payload: T, x: number, y: number) => void;
  onPointerMove: (x: number, y: number) => void;
  openInstant: (payload: T, x: number, y: number) => void;
  clearTimers: () => void;
  setInfo: React.Dispatch<React.SetStateAction<TooltipInfo<T> | null>>;
};

function buildTriggerProps<T>({
  payload,
  scheduleHover,
  beginLongPress,
  onPointerMove,
  openInstant,
  clearTimers,
  setInfo,
}: BuildTriggerPropsArgs<T>) {
  return {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse') scheduleHover(payload, event.clientX, event.clientY);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers();
      setInfo((prev) => (prev?.payload === payload ? null : prev));
    },
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') beginLongPress(payload, event.clientX, event.clientY);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') onPointerMove(event.clientX, event.clientY);
    },
    onPointerUp: () => clearTimers(),
    onPointerCancel: () => clearTimers(),
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      openInstant(payload, event.clientX, event.clientY);
    },
  };
}
