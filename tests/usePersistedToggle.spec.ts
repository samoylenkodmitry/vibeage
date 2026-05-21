import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  PERSISTED_TOGGLE_STORAGE_PREFIX,
  readPersistedToggle,
  writePersistedToggle,
} from '../apps/client/src/hud/usePersistedToggle';

/**
 * §52 polish — Hud panel toggles persist across reloads via
 * `localStorage`. The full hook needs a DOM environment to mount;
 * the test surface here exercises the storage contract directly via
 * the exported `read*` / `write*` helpers, which is what the hook
 * calls internally.
 *
 * Three-state contract:
 *   - unset → returns the initial argument
 *   - "1"   → returns true
 *   - "0"   → returns false
 */

const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { window?: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
  };
});

afterEach(() => {
  if (ORIGINAL_WINDOW === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = ORIGINAL_WINDOW;
  }
});

describe('usePersistedToggle storage contract', () => {
  it('readPersistedToggle returns the initial when storage is empty', () => {
    expect(readPersistedToggle('test', true)).toBe(true);
    expect(readPersistedToggle('test', false)).toBe(false);
  });

  it('returns true when storage holds "1" regardless of initial', () => {
    writePersistedToggle('test', true);
    expect(readPersistedToggle('test', false)).toBe(true);
  });

  it('returns false when storage holds "0" regardless of initial', () => {
    writePersistedToggle('test', false);
    expect(readPersistedToggle('test', true)).toBe(false);
  });

  it('writePersistedToggle keys under the vibeage.panel.<key>.v1 namespace', () => {
    writePersistedToggle('bag', true);
    expect(window.localStorage.getItem(`${PERSISTED_TOGGLE_STORAGE_PREFIX}bag.v1`)).toBe('1');
    writePersistedToggle('bag', false);
    expect(window.localStorage.getItem(`${PERSISTED_TOGGLE_STORAGE_PREFIX}bag.v1`)).toBe('0');
  });

  it('different keys do not collide', () => {
    writePersistedToggle('a', true);
    writePersistedToggle('b', false);
    expect(readPersistedToggle('a', false)).toBe(true);
    expect(readPersistedToggle('b', true)).toBe(false);
  });

  it('unrecognized stored values fall back to initial (defensive)', () => {
    window.localStorage.setItem(`${PERSISTED_TOGGLE_STORAGE_PREFIX}weird.v1`, 'garbage');
    expect(readPersistedToggle('weird', true)).toBe(true);
    expect(readPersistedToggle('weird', false)).toBe(false);
  });
});
