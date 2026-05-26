import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
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
  return { type: 'set', slot: toSlot, ref: { kind: 'item', id: payload.id } };
}

const DRAG_THRESHOLD_PX = 8;

/** The action-bar slot index under a viewport point, or null if none. */
function slotUnderPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const slotEl = el?.closest<HTMLElement>('[data-bar-slot]');
  if (!slotEl) return null;
  const idx = Number(slotEl.dataset.barSlot);
  return Number.isInteger(idx) ? idx : null;
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
  x0: number;
  y0: number;
  label: string;
  active: boolean;
  el: HTMLElement;
  prevTouchAction: string;
};

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
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);

  // Keep the latest callbacks in a ref so the window listeners (bound
  // once) always dispatch through the current action-bar setters.
  const cbRef = useRef({ setSlot, swapSlots, clearSlot });
  cbRef.current = { setSlot, swapSlots, clearSlot };

  const beginDrag = useCallback<DragContext['beginDrag']>((payload, event, label) => {
    if (locked || event.pointerType === 'mouse') return;
    // Disable scrolling on the source for the gesture's duration so a swipe
    // can't fire pointercancel and abort the drag; restored on finish. We're
    // unlocked here (returned early when locked), so list scroll still works
    // in the normal locked/play mode.
    const el = event.currentTarget as HTMLElement;
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = 'none';
    candidateRef.current = { payload, x0: event.clientX, y0: event.clientY, label, active: false, el, prevTouchAction };
  }, [locked]);

  const consumeDragClick = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const c = candidateRef.current;
      if (!c) return;
      if (!c.active) {
        if (Math.hypot(event.clientX - c.x0, event.clientY - c.y0) < DRAG_THRESHOLD_PX) return;
        c.active = true;
      }
      event.preventDefault(); // suppress scroll while actively dragging
      setGhost({ x: event.clientX, y: event.clientY, label: c.label });
    };
    const finish = (event: PointerEvent, drop: boolean) => {
      const c = candidateRef.current;
      candidateRef.current = null;
      setGhost(null);
      if (c) c.el.style.touchAction = c.prevTouchAction; // restore source scroll
      if (!c || !c.active) return; // never crossed threshold — let it be a tap
      justDraggedRef.current = true;
      // Clear after the click that immediately follows pointerup. If the drag
      // ended over a non-consuming target (e.g. the world), this stops the
      // flag from swallowing the user's *next* unrelated tap.
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
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

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
