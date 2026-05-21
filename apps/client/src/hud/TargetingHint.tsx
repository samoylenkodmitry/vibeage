import { QUESTS } from '../../../../packages/content/quests';
import type { GameClientState } from '../gameTypes';
import { useDismissibleHint } from './useDismissibleHint';

/**
 * §49/M2 — one-time targeting hint. Renders a small banner when:
 *   - player is alive on the starter path (incomplete progress)
 *   - has at least one active quest with a `kill` objective in the
 *     current stage (the bit the hint actually solves)
 *   - has no selected target
 *   - hasn't defeated any enemy yet (avoid pestering after the
 *     first kill — by then targeting is "muscle memory")
 *   - the player hasn't explicitly dismissed it via × button
 *     (sticky via localStorage; cross-tab synced)
 *
 * Auto-dismisses via the predicate when the player selects
 * something or notches their first defeated enemy; manual dismiss
 * via × covers the "I know how to target, stop reminding me" case.
 */
type TargetingHintProps = {
  state: GameClientState;
};

export function TargetingHint({ state }: TargetingHintProps) {
  const { dismissed, dismiss } = useDismissibleHint('targeting');
  if (dismissed) return null;
  if (!shouldShowTargetingHint(state)) return null;
  return (
    <section className="targeting-hint" role="status" aria-live="polite">
      <strong>Pick a target</strong>
      <small>Click an enemy or press <kbd>Tab</kbd> to cycle the nearest one.</small>
      <button type="button" className="hint-dismiss" aria-label="Dismiss hint" onClick={dismiss}>×</button>
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
