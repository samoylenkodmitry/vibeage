import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadTrackedQuestId,
  saveTrackedQuestId,
} from '../apps/client/src/trackedQuestStorage';

/**
 * §52 follow-up — round-trips the tracked-quest id through the
 * localStorage helper. The unit tests run in a node environment
 * without `window`; the helper itself short-circuits when
 * `typeof window === 'undefined'`, so we shim a minimal storage
 * before exercising the real read/write paths.
 */

type ShimStorage = {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

function installShimStorage(): ShimStorage {
  const store = new Map<string, string>();
  const shim: ShimStorage = {
    store,
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
  };
  (globalThis as unknown as { window: { localStorage: ShimStorage } }).window = {
    localStorage: shim,
  };
  return shim;
}

function uninstallShimStorage(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('trackedQuestStorage', () => {
  beforeEach(() => {
    uninstallShimStorage();
  });

  it('returns null when nothing is stored', () => {
    installShimStorage();
    expect(loadTrackedQuestId()).toBeNull();
  });

  it('round-trips a stored quest id', () => {
    installShimStorage();
    saveTrackedQuestId('rats_in_the_cellar');
    expect(loadTrackedQuestId()).toBe('rats_in_the_cellar');
  });

  it('save(null) removes the entry', () => {
    const shim = installShimStorage();
    saveTrackedQuestId('rats_in_the_cellar');
    expect(shim.store.size).toBe(1);
    saveTrackedQuestId(null);
    expect(shim.store.size).toBe(0);
    expect(loadTrackedQuestId()).toBeNull();
  });

  it('treats an empty string the same as missing', () => {
    const shim = installShimStorage();
    shim.store.set('vibeage.trackedQuest.v1', '');
    expect(loadTrackedQuestId()).toBeNull();
  });

  it('does not throw when window is unavailable (SSR / node)', () => {
    // No shim installed → window is undefined for this case.
    expect(loadTrackedQuestId()).toBeNull();
    expect(() => saveTrackedQuestId('x')).not.toThrow();
  });

  it('does not throw when localStorage.setItem rejects (private mode)', () => {
    installShimStorage();
    const win = (globalThis as unknown as { window: { localStorage: ShimStorage } }).window;
    win.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(() => saveTrackedQuestId('rats_in_the_cellar')).not.toThrow();
  });
});
