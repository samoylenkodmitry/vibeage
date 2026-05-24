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
 * Mobile hint: when the device is a touch primary (\`pointer: coarse\`),
 * swap the desktop click/keyboard copy for the touch equivalents.
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
  const isTouch = useIsTouchPrimary();

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
        <strong>{isTouch ? 'Tap' : 'Click'} the ground</strong> to walk. Walk to the <strong>yellow cone</strong> ahead —
        that's <strong>Warden Galen</strong>, and he has your first job.
      </p>
      {isTouch ? (
        <small>Use the on-screen buttons to attack, pick up loot, and open panels.</small>
      ) : (
        <small>
          <kbd>Tab</kbd> cycles targets, <kbd>A</kbd> basic attacks, <kbd>1–0</kbd>/<kbd>Q–P</kbd> cast skills,
          <kbd>F</kbd> picks up loot, <kbd>H</kbd> opens the full keybind list.
        </small>
      )}
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

/**
 * Touch-primary detection. \`pointer: coarse\` matches a finger; \`hover:
 * none\` rules out desktops that emulate a coarse pointer for testing.
 * Listens for changes so a 2-in-1 that flips orientation updates.
 */
function useIsTouchPrimary(): boolean {
  const [touch, setTouch] = useState(() => matchTouchPrimary());
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(pointer: coarse) and (hover: none)');
    const onChange = () => setTouch(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return touch;
}

function matchTouchPrimary(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
}
