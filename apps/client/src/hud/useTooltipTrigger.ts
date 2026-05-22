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
  const t = useTooltipTimers<T>();
  const setOpen = useCallback((p: T, x: number, y: number) => setInfo({ payload: p, clientX: x, clientY: y }), []);

  const scheduleHover = useCallback((payload: T, x: number, y: number) => {
    t.clearTimers();
    t.hoverTimer.current = window.setTimeout(() => {
      t.hoverTimer.current = null;
      setOpen(payload, x, y);
    }, HOVER_DELAY_MS);
  }, [t, setOpen]);

  const scheduleClose = useCallback((payload: T) => {
    if (t.closeTimer.current !== null) window.clearTimeout(t.closeTimer.current);
    t.closeTimer.current = window.setTimeout(() => {
      t.closeTimer.current = null;
      setInfo((prev) => (prev?.payload === payload ? null : prev));
    }, CLOSE_DELAY_MS);
  }, [t]);

  const cancelClose = useCallback(() => {
    if (t.closeTimer.current !== null) {
      window.clearTimeout(t.closeTimer.current);
      t.closeTimer.current = null;
    }
  }, [t]);

  const beginLongPress = useCallback((
    payload: T,
    x: number,
    y: number,
    onFire?: (x: number, y: number) => void,
  ) => {
    t.clearTimers();
    t.pressOrigin.current = { payload, x, y };
    t.pressTimer.current = window.setTimeout(() => {
      t.pressTimer.current = null;
      const origin = t.pressOrigin.current;
      t.pressOrigin.current = null;
      if (!origin) return;
      t.suppressClickUntil.current = Date.now() + SUPPRESS_CLICK_MS;
      // When the trigger consumer supplies an `onLongPress` override
      // (e.g. bag slots opening an action menu instead of the
      // tooltip) we fire that instead of opening the tooltip popup.
      if (onFire) onFire(origin.x, origin.y);
      else setOpen(origin.payload, origin.x, origin.y);
    }, LONG_PRESS_MS);
  }, [t, setOpen]);

  const consumePendingClick = useCallback((): boolean => {
    if (Date.now() < t.suppressClickUntil.current) {
      t.suppressClickUntil.current = 0;
      return true;
    }
    return false;
  }, [t]);

  const onPointerMove = useCallback((x: number, y: number) => {
    const origin = t.pressOrigin.current;
    if (!origin) return;
    if (Math.abs(x - origin.x) > CANCEL_MOVE_PX || Math.abs(y - origin.y) > CANCEL_MOVE_PX) t.clearTimers();
  }, [t]);

  const openInstant = useCallback((payload: T, x: number, y: number) => {
    t.clearTimers();
    setOpen(payload, x, y);
  }, [t, setOpen]);

  const dismiss = useCallback(() => { t.clearTimers(); setInfo(null); }, [t]);

  useDismissOnOutside(info, setInfo);

  const triggerProps = useCallback((
    payload: T,
    opts?: TriggerPropsOptions,
  ) => buildTriggerProps({
    payload, scheduleHover, beginLongPress, onPointerMove,
    openInstant, clearTimers: t.clearTimers, scheduleClose, cancelClose,
    onLongPress: opts?.onLongPress,
    onContextAction: opts?.onContextAction,
  }), [scheduleHover, beginLongPress, onPointerMove, openInstant, t, scheduleClose, cancelClose]);

  // PR JJ — spread on the floating tooltip element to keep it alive
  // while the cursor sits inside it; otherwise the trigger's pointer-
  // leave fires the close timer and the wiki link inside is unreachable.
  const hoverHandlers = {
    onPointerEnter: cancelClose,
    onPointerLeave: () => { if (info) scheduleClose(info.payload); },
  };

  return { info, dismiss, triggerProps, consumePendingClick, hoverHandlers, openAt: openInstant };
}

function useTooltipTimers<T>() {
  const hoverTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number; payload: T } | null>(null);
  const suppressClickUntil = useRef(0);
  const clearTimers = useCallback(() => {
    if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    pressOrigin.current = null;
  }, []);
  return { hoverTimer, pressTimer, closeTimer, pressOrigin, suppressClickUntil, clearTimers };
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

/**
 * Per-consumer trigger overrides. When provided, the long-press
 * timer / right-click handler fires the supplied callback instead
 * of opening the tooltip popup. The bag-slot button uses these to
 * route both gestures into its own action menu (Drop / Destroy /
 * Use / Equip / Wiki) without sacrificing hover-tooltip on desktop.
 */
export type TriggerPropsOptions = {
  onLongPress?: (clientX: number, clientY: number) => void;
  onContextAction?: (clientX: number, clientY: number) => void;
};

type BuildTriggerPropsArgs<T> = {
  payload: T;
  scheduleHover: (payload: T, x: number, y: number) => void;
  beginLongPress: (
    payload: T,
    x: number,
    y: number,
    onFire?: (x: number, y: number) => void,
  ) => void;
  onPointerMove: (x: number, y: number) => void;
  openInstant: (payload: T, x: number, y: number) => void;
  clearTimers: () => void;
  scheduleClose: (payload: T) => void;
  cancelClose: () => void;
  onLongPress?: (clientX: number, clientY: number) => void;
  onContextAction?: (clientX: number, clientY: number) => void;
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
  onLongPress,
  onContextAction,
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
      if (event.pointerType === 'touch') beginLongPress(payload, event.clientX, event.clientY, onLongPress);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') onPointerMove(event.clientX, event.clientY);
    },
    onPointerUp: () => clearTimers(),
    onPointerCancel: () => clearTimers(),
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      // Bag slots (and other consumers that supply onContextAction)
      // open their own menu on right-click. Default: open the
      // tooltip popup at the click point.
      if (onContextAction) onContextAction(event.clientX, event.clientY);
      else openInstant(payload, event.clientX, event.clientY);
    },
  };
}
