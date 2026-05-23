import { useCallback, useEffect, useRef, useState } from 'react';
import { logBagDiag } from '../bagDiag';

const HOVER_DELAY_MS = 350;
const LONG_PRESS_MS = 380;
const CANCEL_MOVE_PX = 8;
const SUPPRESS_CLICK_MS = 450;
// PR JJ — grace window between the cursor leaving the trigger and the
// tooltip closing. Long enough that a normal-speed mouse can cross the
// (intentionally short) gap to the floating tooltip and click a link
// inside it without the tooltip vanishing mid-motion.
const CLOSE_DELAY_MS = 200;

export type TooltipAnchor = { top: number; bottom: number; left: number; right: number };
export type TooltipInfo<T> = {
  payload: T;
  clientX: number;
  clientY: number;
  /** Source element rect — when present, the rendered tooltip
   *  positions outside this rect (above/below/side) so the source
   *  slot stays visible underneath. Click-sticky from a slot sets
   *  this; cursor-anchored hover leaves it undefined. */
  anchorRect?: TooltipAnchor | null;
  /** When true, hover-leave / pointer-leave do NOT auto-close the
   *  tooltip. Only an explicit dismiss (× button, outside-click,
   *  Escape) takes it down. Click-to-open uses this; hover and
   *  long-press use the default auto-close behaviour. */
  sticky?: boolean;
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
  const setOpenSticky = useCallback((p: T, x: number, y: number, anchor?: TooltipAnchor) =>
    setInfo({ payload: p, clientX: x, clientY: y, sticky: true, anchorRect: anchor ?? null }),
  []);

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
      setInfo((prev) => {
        if (prev?.payload !== payload) return prev;
        // Sticky tooltips ignore auto-close — only an explicit
        // dismiss (× / outside-click / Escape) takes them down.
        if (prev.sticky) return prev;
        return null;
      });
    }, CLOSE_DELAY_MS);
  }, [t]);

  const cancelClose = useCallback(() => {
    if (t.closeTimer.current !== null) {
      window.clearTimeout(t.closeTimer.current);
      t.closeTimer.current = null;
    }
  }, [t]);

  const beginLongPress = useCallback((payload: T, x: number, y: number) => {
    logBagDiag('lp.armed', { x, y });
    t.clearTimers();
    t.pressOrigin.current = { payload, x, y };
    t.pressTimer.current = window.setTimeout(() => {
      t.pressTimer.current = null;
      const origin = t.pressOrigin.current;
      t.pressOrigin.current = null;
      if (!origin) { logBagDiag('lp.canceled', {}); return; }
      logBagDiag('lp.fired', {});
      t.suppressClickUntil.current = Date.now() + SUPPRESS_CLICK_MS;
      setOpen(origin.payload, origin.x, origin.y);
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

  const openSticky = useCallback((payload: T, x: number, y: number, anchor?: TooltipAnchor) => {
    t.clearTimers();
    setOpenSticky(payload, x, y, anchor);
  }, [t, setOpenSticky]);

  const dismiss = useCallback(() => { t.clearTimers(); setInfo(null); }, [t]);

  useDismissOnOutside(info, setInfo);

  const triggerProps = useCallback((payload: T) => buildTriggerProps({
    payload, scheduleHover, beginLongPress, onPointerMove,
    openInstant, clearTimers: t.clearTimers, scheduleClose, cancelClose,
  }), [scheduleHover, beginLongPress, onPointerMove, openInstant, t, scheduleClose, cancelClose]);

  // PR JJ — spread on the floating tooltip element to keep it alive
  // while the cursor sits inside it; otherwise the trigger's pointer-
  // leave fires the close timer and the wiki link inside is unreachable.
  const hoverHandlers = {
    onPointerEnter: cancelClose,
    onPointerLeave: () => { if (info) scheduleClose(info.payload); },
  };

  return { info, dismiss, triggerProps, consumePendingClick, hoverHandlers, openAt: openInstant, openSticky };
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
      logBagDiag('pd', { pt: event.pointerType, x: event.clientX, y: event.clientY });
      if (event.pointerType === 'touch') beginLongPress(payload, event.clientX, event.clientY);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') onPointerMove(event.clientX, event.clientY);
    },
    onPointerUp: (event: React.PointerEvent) => { logBagDiag('pu', { pt: event.pointerType }); clearTimers(); },
    onPointerCancel: (event: React.PointerEvent) => { logBagDiag('pc', { pt: event.pointerType }); clearTimers(); },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      openInstant(payload, event.clientX, event.clientY);
    },
  };
}
