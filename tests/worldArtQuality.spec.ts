import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseWorldArtQuality } from '../apps/client/src/world-art/quality';

/**
 * `chooseWorldArtQuality` is the seam every cozy-coast component
 * reads to pick how heavy to render (tree count, water type,
 * shadow map size). The picker is intentionally cheap — it looks
 * at a few browser signals — and these tests pin the precedence
 * so a regression doesn't silently downgrade everyone to 'low' or
 * upgrade an underpowered device to 'high'.
 */
function withNavigator(stub: Partial<Navigator> & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number }) {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: stub, configurable: true });
  return () => Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
}

function withWindow(stub: Partial<Window>) {
  const original = (globalThis as { window?: Window }).window;
  (globalThis as { window?: Partial<Window> }).window = { ...(original ?? {}), ...stub };
  return () => { (globalThis as { window?: Window | undefined }).window = original; };
}

describe('chooseWorldArtQuality', () => {
  let restoreNav: (() => void) | null = null;
  let restoreWin: (() => void) | null = null;
  beforeEach(() => { restoreNav = null; restoreWin = null; });
  afterEach(() => { restoreNav?.(); restoreWin?.(); });

  it('returns medium when window is undefined (SSR-safe)', () => {
    const original = (globalThis as { window?: Window | undefined }).window;
    (globalThis as { window?: Window | undefined }).window = undefined;
    try {
      expect(chooseWorldArtQuality()).toBe('medium');
    } finally {
      (globalThis as { window?: Window | undefined }).window = original;
    }
  });

  it('low when save-data is enabled', () => {
    restoreWin = withWindow({ devicePixelRatio: 1 });
    restoreNav = withNavigator({ connection: { saveData: true } });
    expect(chooseWorldArtQuality()).toBe('low');
  });

  it('low on a 2G/3G effective network', () => {
    restoreWin = withWindow({ devicePixelRatio: 1 });
    restoreNav = withNavigator({ connection: { effectiveType: '3g' } });
    expect(chooseWorldArtQuality()).toBe('low');
  });

  it('medium when deviceMemory ≤ 4 GB', () => {
    restoreWin = withWindow({ devicePixelRatio: 1 });
    restoreNav = withNavigator({ deviceMemory: 4 });
    expect(chooseWorldArtQuality()).toBe('medium');
  });

  it('medium on a hidpi display (devicePixelRatio > 1.5)', () => {
    restoreWin = withWindow({ devicePixelRatio: 2 });
    restoreNav = withNavigator({});
    expect(chooseWorldArtQuality()).toBe('medium');
  });

  it('high on a roomy desktop with no save-data and dpr ≤ 1.5', () => {
    restoreWin = withWindow({ devicePixelRatio: 1 });
    restoreNav = withNavigator({ deviceMemory: 16 });
    expect(chooseWorldArtQuality()).toBe('high');
  });
});
