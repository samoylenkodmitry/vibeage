import type { GameClientState } from '../gameTypes';

/**
 * §49/M2 — first-loot hint. Renders a small one-line banner the
 * moment a brand-new player has ground loot nearby but hasn't
 * picked anything up yet. Dismisses itself by virtue of its own
 * gating: once the player has any \`lootPickups\` recorded in
 * starterProgress, the predicate stops returning true.
 *
 * Lives outside the WelcomeOverlay so it can show *after* the
 * player accepts Galen's quest (which dismisses the welcome) but
 * before they figure out what to do with the corpse they just made.
 */
type LootPickupHintProps = {
  state: GameClientState;
};

export function LootPickupHint({ state }: LootPickupHintProps) {
  if (!shouldShowLootHint(state)) return null;
  return (
    <section className="loot-pickup-hint" role="status" aria-live="polite">
      <strong>Loot dropped!</strong>
      <small>Click the glowing pile — your character will walk over and grab it.</small>
    </section>
  );
}

/**
 * Visibility predicate, pulled out so it stays unit-testable
 * without rendering the React tree.
 *
 *   - need a player (renders nothing pre-spawn)
 *   - need at least one ground-loot stack on screen
 *   - need zero recorded \`lootPickups\` (first-time gate)
 *   - need the player to not yet be past the starter path
 *     (\`isComplete === false\`), so we don't pester veterans whose
 *     progress was cleared by a reset.
 */
export function shouldShowLootHint(state: GameClientState): boolean {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player?.isAlive) return false;
  const lootCount = Object.keys(state.groundLoot).length;
  if (lootCount === 0) return false;
  const progress = state.starterProgress;
  if (!progress) return false;
  if (progress.isComplete) return false;
  return progress.lootPickups === 0;
}
