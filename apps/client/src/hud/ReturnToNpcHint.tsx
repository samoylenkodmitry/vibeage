import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS } from '../../../../packages/content/quests';
import type { GameClientState } from '../gameTypes';

/**
 * §49/M2 — return-to-NPC hint. The moment the player's active
 * quest enters a `talk` stage with no progress yet, render a small
 * banner naming the NPC they need to walk back to. Auto-dismisses
 * the instant the talk-objective progress flips (server bumps
 * progress on TalkNpc), or once the starter path is complete.
 *
 * Reuses the same hint banner shape as TargetingHint (#307) and
 * SkillUseHint (#308); shares a CSS keyframe via the existing
 * loot-pickup-hint-fade animation.
 */
type ReturnToNpcHintProps = {
  state: GameClientState;
};

export function ReturnToNpcHint({ state }: ReturnToNpcHintProps) {
  const target = pickReturnNpc(state);
  if (!target) return null;
  return (
    <section className="return-to-npc-hint" role="status" aria-live="polite">
      <strong>Return to {target.npcName}</strong>
      <small>Walk back to <strong>{target.npcName}</strong> to advance the quest.</small>
    </section>
  );
}

export type ReturnNpcHint = {
  npcId: string;
  npcName: string;
};

/**
 * Visibility predicate + lookup. Returns null when no banner
 * should render. Exported for unit testing without React.
 */
export function pickReturnNpc(state: GameClientState): ReturnNpcHint | null {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player?.isAlive) return null;
  if (state.starterProgress?.isComplete) return null;
  const active = player.questState?.active ?? {};
  for (const [questId, entry] of Object.entries(active)) {
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (!stage) continue;
    if (stage.objective.kind !== 'talk') continue;
    // Talk progress already met — no need to nag.
    if (entry.progress >= 1) continue;
    const npc = QUEST_NPCS[stage.objective.npcId];
    if (!npc) continue;
    return { npcId: npc.id, npcName: npc.name };
  }
  return null;
}
