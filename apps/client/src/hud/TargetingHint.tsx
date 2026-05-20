import { QUESTS } from '../../../../packages/content/quests';
import type { GameClientState } from '../gameTypes';

/**
 * §49/M2 — one-time targeting hint. Renders a small banner when:
 *   - player is alive on the starter path (incomplete progress)
 *   - has at least one active quest with a `kill` objective in the
 *     current stage (the bit the hint actually solves)
 *   - has no selected target
 *   - hasn't defeated any enemy yet (avoid pestering after the
 *     first kill — by then targeting is "muscle memory")
 *
 * Dismisses automatically by virtue of its own predicate flipping
 * the moment the player selects something or notches their first
 * defeated enemy.
 */
type TargetingHintProps = {
  state: GameClientState;
};

export function TargetingHint({ state }: TargetingHintProps) {
  if (!shouldShowTargetingHint(state)) return null;
  return (
    <section className="targeting-hint" role="status" aria-live="polite">
      <strong>Pick a target</strong>
      <small>Click an enemy or press <kbd>Tab</kbd> to cycle the nearest one.</small>
    </section>
  );
}

/**
 * Visibility predicate. Exported for unit testing — keeps the
 * branching honest without rendering React.
 */
export function shouldShowTargetingHint(state: GameClientState): boolean {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player?.isAlive) return false;
  if (state.starterProgress?.isComplete) return false;
  if ((state.starterProgress?.defeatedEnemies ?? 0) > 0) return false;
  if (state.selectedTargetId) return false;
  const active = player.questState?.active ?? {};
  for (const [questId, entry] of Object.entries(active)) {
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (stage?.objective.kind === 'kill') return true;
  }
  return false;
}
