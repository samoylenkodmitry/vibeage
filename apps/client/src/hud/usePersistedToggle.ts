import { useCallback, useEffect, useState } from 'react';

/**
 * §52 polish — `useState<boolean>(initial)` siblings that survive a
 * page reload via `localStorage`. The HUD has 10+ panel-toggle
 * useStates (statsOpen, questOpen, bagOpen, …); without persistence
 * every reload snaps every panel back to its initial state, which
 * is irritating for a returning player who left their bag + skill
 * tree open.
 *
 *   const [open, setOpen, toggle] = usePersistedToggle('stats', true);
 *
 * The third tuple item is a stable toggler so callsites don't need
 * `() => setOpen((prev) => !prev)` boilerplate.
 *
 * Cross-tab sync via the `storage` event so one tab's toggle
 * propagates to the others. Mirrors `useDismissibleHint`.
 *
 * Private-browsing / quota errors are swallowed (best-effort
 * persistence) — UI state degrades to the legacy "every reload
 * resets" without throwing.
 */
const STORAGE_PREFIX = 'vibeage.panel.';

export const PERSISTED_TOGGLE_STORAGE_PREFIX = STORAGE_PREFIX;

/**
 * Read a persisted toggle value from `localStorage`. Exported so
 * unit tests can exercise the storage contract without needing a
 * DOM environment to mount the React hook.
 */
export function readPersistedToggle(key: string, initial: boolean): boolean {
  return readPersisted(`${STORAGE_PREFIX}${key}.v1`, initial);
}

/**
 * Write a persisted toggle value to `localStorage`. Best-effort —
 * private-browsing / quota errors are swallowed.
 */
export function writePersistedToggle(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}.v1`, value ? '1' : '0');
  } catch { /* ignore */ }
}

export function usePersistedToggle(
  key: string,
  initial: boolean,
): readonly [boolean, (next: boolean) => void, () => void] {
  const storageKey = `${STORAGE_PREFIX}${key}.v1`;
  const [value, setValue] = useState<boolean>(() => readPersisted(storageKey, initial));

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === storageKey) setValue(readPersisted(storageKey, initial));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, initial]);

  const write = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    } catch { /* private mode / quota */ }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch { /* private mode / quota */ }
      return next;
    });
  }, [storageKey]);

  return [value, write, toggle] as const;
}

function readPersisted(storageKey: string, initial: boolean): boolean {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return initial;
  } catch {
    return initial;
  }
}
