import type { GameClientState } from '../gameTypes';
import { useDismissibleHint } from './useDismissibleHint';

/**
 * §49/M2 — loot pickup hint. Renders a small one-line banner
 * whenever ground loot exists in the player's view (mob drops,
 * dropped-from-bag piles, quest reward overflow, etc.). Tells the
 * player every path to pick it up so the discoverability gap that
 * trips up Mac/keyboard-unfamiliar users disappears.
 *
 * Dismissible via the × button; the dismissal persists via
 * localStorage (see useDismissibleHint).
 */
type LootPickupHintProps = {
  state: GameClientState;
};

export function LootPickupHint({ state }: LootPickupHintProps) {
  const { dismissed, dismiss } = useDismissibleHint('loot-pickup');
  if (dismissed) return null;
  if (!shouldShowLootHint(state)) return null;
  return (
    <section className="loot-pickup-hint" role="status" aria-live="polite">
      <strong>Loot nearby</strong>
      <small>Press <kbd>F</kbd>, click the glowing pile, or tap the Pickup button.</small>
      <button type="button" className="hint-dismiss" aria-label="Dismiss hint" onClick={dismiss}>×</button>
    </section>
  );
}

/**
 * Visibility predicate, pulled out so it stays unit-testable
 * without rendering the React tree.
 *
 *   - need a live player (renders nothing pre-spawn / while dead)
 *   - need at least one ground-loot stack on screen
 *
 * Previously the hint also gated on `starterProgress.lootPickups
 * === 0` so it only fired on a brand-new account. Players who had
 * picked anything up before (a mob drop, a quest reward) then later
 * dropped an item from their bag had no UI cue for how to pick it
 * back up — exactly the issue a fresh-account Mac tester hit. The
 * gate is gone; the persistent × dismiss is the right knob for
 * "I don't need this hint any more".
 */
export function shouldShowLootHint(state: GameClientState): boolean {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player?.isAlive) return false;
  return Object.keys(state.groundLoot).length > 0;
}
