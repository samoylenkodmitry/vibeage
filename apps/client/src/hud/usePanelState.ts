import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistedToggle } from './usePersistedToggle';

/** Every floating "window" the toggle rail owns, in rail order. */
export const WINDOW_PANEL_KEYS = [
  'stats', 'tree', 'actions', 'quest', 'bag', 'gear', 'map', 'wiki', 'video', 'gm',
] as const;
export type WindowPanelKey = typeof WINDOW_PANEL_KEYS[number];

/** Matches the styles.css mobile sweep, where every window pins to the same
 *  top edge and the same left/right gutters. */
export const NARROW_VIEWPORT_MAX_WIDTH = 680;

/** Live probe (not a mount-time snapshot) so rotating a phone into landscape
 *  or resizing a desktop window takes effect on the next toggle. */
export function isNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia(`(max-width: ${NARROW_VIEWPORT_MAX_WIDTH}px)`).matches; } catch { return false; }
}

/** Panels/rail start expanded on desktop and collapsed on phones. */
export function defaultRailOpen(): boolean {
  return !isNarrowViewport();
}

type Toggle = readonly [boolean, (next: boolean) => void, () => void];

function useWindowPanelToggles(desktopDefault: boolean): Record<WindowPanelKey, Toggle> {
  // Fixed call order — the object literal is just a lookup table over ten
  // unconditional `usePersistedToggle` calls. Stats + Actions default OPEN on
  // desktop but CLOSED on phones, where two always-open panels bury the world.
  return {
    stats: usePersistedToggle('stats', desktopDefault),
    tree: usePersistedToggle('tree', false),
    actions: usePersistedToggle('actions', desktopDefault),
    quest: usePersistedToggle('quest', false),
    bag: usePersistedToggle('bag', false),
    gear: usePersistedToggle('gear', false),
    map: usePersistedToggle('map', false),
    wiki: usePersistedToggle('wiki', false),
    video: usePersistedToggle('video', false),
    gm: usePersistedToggle('gm', false),
  };
}

export type PanelState = ReturnType<typeof usePanelState>;

/**
 * Open/closed state for every HUD window, persisted per browser
 * (`usePersistedToggle`), plus the collapsible toggle rail.
 *
 * Phones behave as a MODAL STACK: opening a window closes the others and
 * collapses the rail. On a 390px screen every window shares the same top-anchored
 * slot, so two open panels simply buried each other — the player saw whichever
 * happened to paint last and needed four taps (open rail, hide it, open rail,
 * hide the other) to dig out. Desktop keeps its layered multi-window HUD.
 */
export function usePanelState() {
  const [desktopDefault] = useState(defaultRailOpen);
  const toggles = useWindowPanelToggles(desktopDefault);
  const [railOpen, setRailOpen] = usePersistedToggle('rail-open', desktopDefault);
  const [craftRecipeSlot, setCraftRecipeSlot] = useState<number | null>(null);
  // Ref mirror so the callbacks below stay referentially stable (they are
  // handed to memoized children) while still reading fresh open/closed state.
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;

  const openPanel = useCallback((key: WindowPanelKey) => {
    const current = togglesRef.current;
    if (isNarrowViewport()) {
      for (const other of WINDOW_PANEL_KEYS) if (other !== key) current[other][1](false);
      setRailOpen(false); // the rail overlaps the window it just opened
    }
    current[key][1](true);
  }, [setRailOpen]);

  const closeAllPanels = useCallback(() => {
    for (const key of WINDOW_PANEL_KEYS) togglesRef.current[key][1](false);
    setCraftRecipeSlot(null);
  }, []);

  const togglePanel = useCallback((key: WindowPanelKey) => {
    if (togglesRef.current[key][0]) togglesRef.current[key][1](false);
    else openPanel(key);
  }, [openPanel]);

  const openWindowCount = WINDOW_PANEL_KEYS.filter((key) => toggles[key][0]).length
    + (craftRecipeSlot === null ? 0 : 1);
  useEscapeClosesPanels(openWindowCount > 0, closeAllPanels);

  return {
    statsOpen: toggles.stats[0], questOpen: toggles.quest[0], bagOpen: toggles.bag[0],
    gearOpen: toggles.gear[0], mapOpen: toggles.map[0], treeOpen: toggles.tree[0],
    actionsOpen: toggles.actions[0], wikiOpen: toggles.wiki[0], videoOpen: toggles.video[0],
    gmOpen: toggles.gm[0],
    craftRecipeSlot,
    railOpen,
    openWindowCount,
    toggleRail: useCallback(() => setRailOpen(!railOpen), [railOpen, setRailOpen]),
    togglePanel,
    closeAllPanels,
    toggleStats: useCallback(() => togglePanel('stats'), [togglePanel]),
    toggleQuest: useCallback(() => togglePanel('quest'), [togglePanel]),
    toggleBag: useCallback(() => togglePanel('bag'), [togglePanel]),
    toggleGear: useCallback(() => togglePanel('gear'), [togglePanel]),
    toggleMap: useCallback(() => togglePanel('map'), [togglePanel]),
    toggleTree: useCallback(() => togglePanel('tree'), [togglePanel]),
    toggleActions: useCallback(() => togglePanel('actions'), [togglePanel]),
    toggleWiki: useCallback(() => togglePanel('wiki'), [togglePanel]),
    toggleVideo: useCallback(() => togglePanel('video'), [togglePanel]),
    toggleGm: useCallback(() => togglePanel('gm'), [togglePanel]),
    openQuest: useCallback(() => openPanel('quest'), [openPanel]),
    openTree: useCallback(() => openPanel('tree'), [openPanel]),
    openWiki: useCallback(() => openPanel('wiki'), [openPanel]),
    openCraft: useCallback((slotIndex: number) => setCraftRecipeSlot(slotIndex), []),
    closeCraft: useCallback(() => setCraftRecipeSlot(null), []),
  };
}

/** Escape dismisses the open windows — the MMO-standard "get back to the
 *  world" key, and previously the HUD had no keyboard way out at all. */
function useEscapeClosesPanels(anyOpen: boolean, closeAll: () => void): void {
  useEffect(() => {
    if (!anyOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Typing in chat (or any field) — Escape belongs to the field.
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return;
      closeAll();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anyOpen, closeAll]);
}
