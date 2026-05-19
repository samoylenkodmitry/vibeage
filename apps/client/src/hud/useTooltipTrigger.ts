import { useCallback, useEffect, useRef, useState } from 'react';

const HOVER_DELAY_MS = 350;
const LONG_PRESS_MS = 380;
const CANCEL_MOVE_PX = 8;
const SUPPRESS_CLICK_MS = 450;
// PR JJ — grace window between the cursor leaving the trigger and the
// tooltip closing. Long enough that a normal-speed mouse can cross the
// (intentionally short) gap to the floating tooltip and click a link
// inside it without the tooltip vanishing mid-motion.
const CLOSE_DELAY_MS = 200;

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
  const closeTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number; payload: T } | null>(null);
  const suppressClickUntil = useRef(0);

  const clearTimers = useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    pressOrigin.current = null;
  }, []);

  // PR JJ — schedule the dismiss after CLOSE_DELAY_MS so the cursor
  // has time to cross to the floating tooltip. Re-entering the trigger
  // or the tooltip (via `hoverHandlers`) cancels the timer.
  const scheduleClose = useCallback((payload: T) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setInfo((prev) => (prev?.payload === payload ? null : prev));
    }, CLOSE_DELAY_MS);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
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
        // Long-press has fired — swallow the next click that the
        // browser synthesises when the user lifts their finger so the
        // bag slot doesn't immediately use/equip the item.
        suppressClickUntil.current = Date.now() + SUPPRESS_CLICK_MS;
      }
    }, LONG_PRESS_MS);
  }, [clearTimers]);

  /**
   * Caller invokes this from a button's onClick to ask 'is this click
   * just the lift-off of a long-press tap?'. Returns true if so and
   * the caller should bail out of its normal action.
   */
  const consumePendingClick = useCallback((): boolean => {
    if (Date.now() < suppressClickUntil.current) {
      suppressClickUntil.current = 0;
      return true;
    }
    return false;
  }, []);

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

  useDismissOnOutside(info, setInfo);

  const triggerProps = useCallback((payload: T) => buildTriggerProps({
    payload,
    scheduleHover,
    beginLongPress,
    onPointerMove,
    openInstant,
    clearTimers,
    scheduleClose,
    cancelClose,
  }), [scheduleHover, beginLongPress, onPointerMove, openInstant, clearTimers, scheduleClose, cancelClose]);

  // PR JJ — spread these on the floating tooltip element to keep it
  // alive while the cursor sits inside it. Without these, the
  // trigger's onPointerLeave fires the instant the cursor crosses
  // out of the button, the close timer ticks, and any link inside
  // the tooltip is unreachable.
  const hoverHandlers = {
    onPointerEnter: cancelClose,
    onPointerLeave: () => {
      if (info) scheduleClose(info.payload);
    },
  };

  return { info, dismiss, triggerProps, consumePendingClick, hoverHandlers, openAt: openInstant };
}

function useDismissOnOutside<T>(
  info: TooltipInfo<T> | null,
  setInfo: React.Dispatch<React.SetStateAction<TooltipInfo<T> | null>>,
): void {
  useEffect(() => {
    if (!info) return undefined;
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
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
  }, [info, setInfo]);
}

type BuildTriggerPropsArgs<T> = {
  payload: T;
  scheduleHover: (payload: T, x: number, y: number) => void;
  beginLongPress: (payload: T, x: number, y: number) => void;
  onPointerMove: (x: number, y: number) => void;
  openInstant: (payload: T, x: number, y: number) => void;
  clearTimers: () => void;
  scheduleClose: (payload: T) => void;
  cancelClose: () => void;
};

function buildTriggerProps<T>({
  payload,
  scheduleHover,
  beginLongPress,
  onPointerMove,
  openInstant,
  clearTimers,
  scheduleClose,
  cancelClose,
}: BuildTriggerPropsArgs<T>) {
  return {
    onPointerEnter: (event: React.PointerEvent) => {
      cancelClose();
      if (event.pointerType === 'mouse') scheduleHover(payload, event.clientX, event.clientY);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      // Stop the hover-open timer, but defer the close so the cursor
      // can cross the gap to the floating tooltip and click a link.
      if (event.currentTarget) clearTimers();
      scheduleClose(payload);
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
