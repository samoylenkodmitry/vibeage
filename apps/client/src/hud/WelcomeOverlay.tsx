import { useCallback, useEffect, useState } from 'react';
import type { PlayerEntity } from '../gameTypes';

/**
 * §49/M2 — first-time welcome overlay.
 *
 * Tells a fresh player how to move + where to go first. Renders
 * only when:
 *  - the player is level 1
 *  - hasn't completed any quest
 *  - hasn't accepted any quest yet (so it disappears the moment
 *    they engage with Galen)
 *  - hasn't dismissed the overlay in this browser before
 *
 * Dismissal is sticky via localStorage so coming back doesn't
 * re-show. The overlay is pure UI — no server round-trip.
 */
const DISMISS_KEY = 'vibeage.welcomeOverlay.dismissed.v1';

type WelcomeOverlayProps = {
  player: PlayerEntity | null;
};

export function WelcomeOverlay({ player }: WelcomeOverlayProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  useEffect(() => {
    // Cross-tab sync: if another tab dismisses, this one updates.
    function onStorage(e: StorageEvent) {
      if (e.key === DISMISS_KEY) setDismissed(readDismissed());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const onDismiss = useCallback(() => {
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setDismissed(true);
  }, []);

  if (!shouldShowWelcome(player, dismissed)) return null;

  return (
    <section className="welcome-overlay" role="dialog" aria-label="Welcome">
      <header>
        <strong>Welcome to VibeAge</strong>
      </header>
      <p>
        <strong>Click the ground</strong> to walk. Walk to the <strong>yellow cone</strong> ahead —
        that's <strong>Warden Galen</strong>, and he has your first job.
      </p>
      <small>Press <kbd>I</kbd> for inventory, <kbd>Tab</kbd> to cycle targets, <kbd>1-4</kbd> for skills.</small>
      <button type="button" onClick={onDismiss}>Got it</button>
    </section>
  );
}

// Exported for §49/M2 tests — the visibility predicate is the
// interesting bit; the React rendering is trivial wiring.
export function shouldShowWelcome(player: PlayerEntity | null, dismissed: boolean): boolean {
  if (!player) return false;
  if (dismissed) return false;
  if (player.level !== 1) return false;
  const completed = player.questState?.completed ?? [];
  const active = player.questState?.active ?? {};
  if (completed.length > 0) return false;
  if (Object.keys(active).length > 0) return false;
  return true;
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
