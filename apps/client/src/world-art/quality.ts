/**
 * Cozy-coast quality picker.
 *
 * Reads cheap browser signals (save-data, effective network type,
 * device memory, devicePixelRatio) to settle on `low | medium |
 * high`. Every art component in `world-art/` reads this and decides
 * how heavy to render: tree count, water type (when reflective
 * water lands), shadow map size, etc.
 *
 * Deliberately simple — a user-facing override + persistence is
 * a follow-up. SSR-safe (returns `'medium'` when window is absent).
 */
export type WorldArtQuality = 'low' | 'medium' | 'high';

export function chooseWorldArtQuality(): WorldArtQuality {
  if (typeof window === 'undefined') {
    return 'medium';
  }

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };

  if (nav.connection?.saveData) return 'low';
  if (nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === '3g') return 'low';
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return 'medium';
  if (window.devicePixelRatio > 1.5) return 'medium';

  return 'high';
}
