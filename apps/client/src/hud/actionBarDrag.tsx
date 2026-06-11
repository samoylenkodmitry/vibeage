import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { SkillId } from '../../../../packages/content/skills';
import type { ActionRef } from './useActionBar';

/**
 * Touch drag-and-drop for the action bar. Desktop keeps native HTML5
 * DnD (mouse distinguishes click vs drag for free); touch devices never
 * fire HTML5 drag from a button, so we run a pointer-based controller
 * instead: press a source, move past a threshold, release over a bar
 * slot. A short stationary press is still a tap (cast/use). The whole
 * thing is gated by the bar's `locked` flag.
 */
export type BarDragPayload =
  | { kind: 'skill'; id: SkillId }
  | { kind: 'item'; id: string }
  | { kind: 'action'; id: string }
  | { kind: 'reorder'; fromSlot: number };

export type BarDropAction =
  | { type: 'set'; slot: number; ref: ActionRef }
  | { type: 'swap'; from: number; to: number }
  | { type: 'clear'; slot: number }
  | { type: 'none' };

/** Pure resolution of a touch drop. `toSlot` is the bar slot under the
 *  release point, or null when released off the bar. Dragging a slot off
 *  the bar removes it; dropping a skill/item off the bar does nothing. */
export function resolveBarDrop(payload: BarDragPayload, toSlot: number | null): BarDropAction {
  if (toSlot === null) {
    return payload.kind === 'reorder' ? { type: 'clear', slot: payload.fromSlot } : { type: 'none' };
  }
  if (payload.kind === 'reorder') {
    return payload.fromSlot === toSlot ? { type: 'none' } : { type: 'swap', from: payload.fromSlot, to: toSlot };
  }
  if (payload.kind === 'skill') {
    return { type: 'set', slot: toSlot, ref: { kind: 'skill', id: payload.id } };
  }
  if (payload.kind === 'action') {
    return { type: 'set', slot: toSlot, ref: { kind: 'action', id: payload.id } };
  }
  return { type: 'set', slot: toSlot, ref: { kind: 'item', id: payload.id } };
}

// Touch drag is long-press initiated: hold still for LONG_PRESS_MS to pick the
// thing up, then drag. A quick tap casts/uses; a swipe scrolls the list. If the
// finger travels more than MOVE_CANCEL_PX before the hold completes, it's read
// as a scroll/tap and the drag is abandoned.
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 12;

/** The action-bar slot index under a viewport point, or null if none.
 *
 *  Uses elementsFromPoint (the whole hit stack, not just the topmost) so a slot
 *  is still found when another HUD surface overlaps it at the drop point — on a
 *  phone the side-rail toggle buttons cover the bar's rightmost column and an
 *  open ActionsPanel covers its top row, so plain elementFromPoint returns those
 *  overlays and the drop silently misses the slot beneath them. */
function slotUnderPoint(x: number, y: number): number | null {
  // Fall back to elementFromPoint where elementsFromPoint is unavailable (JSDOM,
  // very old browsers) so this never throws.
  const stack: Element[] = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(x, y)
    : [document.elementFromPoint(x, y)].filter((el): el is Element => el !== null);
  for (const el of stack) {
    const slotEl = (el as HTMLElement).closest?.<HTMLElement>('[data-bar-slot]');
    if (!slotEl) continue;
    const idx = Number(slotEl.dataset.barSlot);
    if (Number.isInteger(idx)) return idx;
  }
  return null;
}

type DragContext = {
  /** Start a touch drag from a source. No-op for mouse pointers or when
   *  the bar is locked. `label` is shown in the drag ghost. */
  beginDrag: (payload: BarDragPayload, event: ReactPointerEvent, label: string) => void;
  /** Returns true once right after a drag finished, so a source's click
   *  handler can swallow the tap that pointerup would otherwise trigger. */
  consumeDragClick: () => boolean;
};

const NOOP: DragContext = {
  beginDrag: () => {
    /* no provider mounted — touch drag inert */
  },
  consumeDragClick: () => false,
};

const ActionBarDragContext = createContext<DragContext>(NOOP);

export function useActionBarDrag(): DragContext {
  return useContext(ActionBarDragContext);
}

type Candidate = {
  payload: BarDragPayload;
  label: string;
  el: HTMLElement;
  prevTouchAction: string;
  x0: number;
  y0: number;
  lastX: number;
  lastY: number;
  active: boolean;
  timerId: number;
};

type Ghost = { x: number; y: number; label: string };
type DropCallbacks = {
  setSlot: (slotIndex: number, ref: ActionRef) => void;
  swapSlots: (from: number, to: number) => void;
  clearSlot: (slotIndex: number) => void;
};

/** Install the window pointer/touch listeners that drive an active drag.
 *  Bound once; reads live state through refs. Returns a teardown. */
function installDragListeners(
  candidateRef: MutableRefObject<Candidate | null>,
  justDraggedRef: MutableRefObject<boolean>,
  setGhost: (ghost: Ghost | null) => void,
  cbRef: MutableRefObject<DropCallbacks>,
): () => void {
  const abandon = (c: Candidate) => {
    clearTimeout(c.timerId);
    c.el.style.touchAction = c.prevTouchAction;
    candidateRef.current = null;
  };
  const onMove = (event: PointerEvent) => {
    const c = candidateRef.current;
    if (!c) return;
    c.lastX = event.clientX;
    c.lastY = event.clientY;
    if (!c.active) {
      // Moved before the hold completed → treat as a scroll/tap, not a drag.
      if (Math.hypot(event.clientX - c.x0, event.clientY - c.y0) > MOVE_CANCEL_PX) abandon(c);
      return;
    }
    setGhost({ x: event.clientX, y: event.clientY, label: c.label });
  };
  // Once a drag is active, cancel the browser's scroll for the gesture.
  // Guard on cancelable: preventDefault on an in-progress scroll is a no-op
  // that logs a console warning.
  const onTouchMove = (event: TouchEvent) => {
    if (candidateRef.current?.active && event.cancelable) event.preventDefault();
  };
  const finish = (event: PointerEvent, drop: boolean) => {
    const c = candidateRef.current;
    candidateRef.current = null;
    if (!c) return;
    clearTimeout(c.timerId);
    c.el.style.touchAction = c.prevTouchAction;
    setGhost(null);
    if (!c.active) return; // released before the hold — let it be a tap
    justDraggedRef.current = true;
    // Clear after the click that immediately follows pointerup. If the drag
    // ended over a non-consuming target (e.g. the world), this stops the flag
    // from swallowing the user's *next* unrelated tap.
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 0);
    if (!drop) return;
    const action = resolveBarDrop(c.payload, slotUnderPoint(event.clientX, event.clientY));
    const cb = cbRef.current;
    if (action.type === 'set') cb.setSlot(action.slot, action.ref);
    else if (action.type === 'swap') cb.swapSlots(action.from, action.to);
    else if (action.type === 'clear') cb.clearSlot(action.slot);
  };
  const onUp = (event: PointerEvent) => finish(event, true);
  const onCancel = (event: PointerEvent) => finish(event, false);
  // Long-press is the drag gesture — keep Android's long-press context menu
  // (text selection / link menu) from hijacking it mid-hold.
  const onContextMenu = (event: Event) => {
    if (candidateRef.current) event.preventDefault();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('contextmenu', onContextMenu);
  return () => {
    // Drag armed but not finished at unmount: clear the pending long-press so
    // it can't fire setGhost on a gone component or leave touchAction stuck.
    const c = candidateRef.current;
    if (c) abandon(c);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('contextmenu', onContextMenu);
  };
}

export function ActionBarDragProvider({
  locked,
  setSlot,
  swapSlots,
  clearSlot,
  children,
}: {
  locked: boolean;
  setSlot: (slotIndex: number, ref: ActionRef) => void;
  swapSlots: (from: number, to: number) => void;
  clearSlot: (slotIndex: number) => void;
  children: ReactNode;
}) {
  const candidateRef = useRef<Candidate | null>(null);
  const justDraggedRef = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  // Keep the latest callbacks in a ref so the window listeners (bound
  // once) always dispatch through the current action-bar setters.
  const cbRef = useRef<DropCallbacks>({ setSlot, swapSlots, clearSlot });
  cbRef.current = { setSlot, swapSlots, clearSlot };

  const beginDrag = useCallback<DragContext['beginDrag']>((payload, event, label) => {
    if (locked || event.pointerType === 'mouse') return;
    // Tear down a still-armed prior candidate (rapid taps / multi-touch) so we
    // don't leak its timer, ghost, or a stuck touchAction.
    const prev = candidateRef.current;
    if (prev) {
      clearTimeout(prev.timerId);
      prev.el.style.touchAction = prev.prevTouchAction;
      setGhost(null);
    }
    const el = event.currentTarget as HTMLElement;
    const x0 = event.clientX;
    const y0 = event.clientY;
    const candidate: Candidate = {
      payload, label, el, prevTouchAction: el.style.touchAction,
      x0, y0, lastX: x0, lastY: y0, active: false, timerId: 0,
    };
    // Arm the long-press: if the finger is still here after the hold, pick the
    // thing up. touch-action:none is only set on activation so a swipe before
    // then still scrolls the list normally (onMove abandons the candidate).
    candidate.timerId = window.setTimeout(() => {
      if (candidateRef.current !== candidate) return;
      candidate.active = true;
      el.style.touchAction = 'none';
      setGhost({ x: candidate.lastX, y: candidate.lastY, label });
    }, LONG_PRESS_MS);
    candidateRef.current = candidate;
  }, [locked]);

  const consumeDragClick = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return true;
    }
    return false;
  }, []);

  useEffect(
    () => installDragListeners(candidateRef, justDraggedRef, setGhost, cbRef),
    [],
  );

  return (
    <ActionBarDragContext.Provider value={{ beginDrag, consumeDragClick }}>
      {children}
      {ghost && (
        <div className="action-bar-drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghost.label}
        </div>
      )}
    </ActionBarDragContext.Provider>
  );
}
