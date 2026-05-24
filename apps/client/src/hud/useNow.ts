import { useEffect, useState } from 'react';

/**
 * Re-renders the calling component every `intervalMs` with a fresh
 * Date.now(). Used by cooldown/cast-progress UI that has to tick
 * independently of server snapshots.
 *
 * Keep this in the smallest component that actually needs it — a
 * useNow high in the tree (e.g. GameHud) forces the entire HUD to
 * reconcile on every tick. The skill bar + actions panel own their
 * own useNow so the rest of the HUD only re-renders on real state
 * changes.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
