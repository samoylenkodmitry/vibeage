import { useCallback, useEffect, useState } from 'react';

/**
 * §49/M2 — shared dismissal hook for the onboarding hint banners
 * (TargetingHint, ReturnToNpcHint, SkillUseHint, LootPickupHint).
 *
 * Each hint has an auto-dismiss predicate (state-driven) AND now
 * an explicit user dismiss via × button. The user dismissal is
 * sticky via localStorage so the hint stays gone after reload.
 *
 *   const { dismissed, dismiss } = useDismissibleHint('targeting');
 *
 * Cross-tab sync via storage event so one open tab's dismissal
 * propagates to other tabs.
 */
export function useDismissibleHint(key: string): {
  dismissed: boolean;
  dismiss: () => void;
} {
  const storageKey = `vibeage.hint.${key}.dismissed.v1`;
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(storageKey));

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === storageKey) setDismissed(readDismissed(storageKey));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* private mode */ }
    setDismissed(true);
  }, [storageKey]);

  return { dismissed, dismiss };
}

function readDismissed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(storageKey) === '1'; } catch { return false; }
}
