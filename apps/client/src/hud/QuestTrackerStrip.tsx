import { useMemo } from 'react';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import type { PlayerEntity } from '../gameTypes';
import { resolveStageMarker } from './questMarkers';

/**
 * §49/M2 PR008 — heads-up quest tracker.
 *
 * Always-visible strip showing the player's current objective so
 * they don't have to open the Quest panel. The strip exposes three
 * actions inline so the player can act without opening the panel:
 *   - Show on map (drops the navigation marker)
 *   - Next (advances the stage when objective is met but not last)
 *   - Claim (claims the reward when the quest is readyToClaim)
 *
 * The strip used to be a single button (clicking dropped the
 * marker) — the user reported the Next button was unreachable.
 * Root cause: the strip says "press Next" but the actual Next
 * button was buried in QuestPanel which the player has to open.
 * Fix: inline the Next/Claim buttons directly on the strip.
 */
type QuestTrackerStripProps = {
  player: PlayerEntity | null;
  trackedQuestId?: string | null;
  onShowMarker: (pos: { x: number; z: number }) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
};

export function QuestTrackerStrip({
  player,
  trackedQuestId,
  onShowMarker,
  onAdvanceQuest,
  onClaimQuestReward,
}: QuestTrackerStripProps) {
  const tracked = useMemo(() => pickTrackedStage(player, trackedQuestId ?? null), [player, trackedQuestId]);
  if (!tracked) return null;
  const { quest, stageIndex, stage, progress, marker, readyToClaim } = tracked;
  const objectiveText = describeObjective(stage.objective, progress);
  const distance = marker && player ? distanceTo(player.position, marker) : null;
  const objectiveMet = isObjectiveMet(stage.objective, progress);
  const isLastStage = stageIndex === quest.stages.length - 1;
  // Show "Claim" when the server says readyToClaim. Show "Next"
  // when the objective is met but it's not the final stage. The
  // server is the source of truth for readyToClaim so we never
  // show Claim prematurely.
  const showClaim = readyToClaim;
  const showNext = !readyToClaim && objectiveMet && !isLastStage;
  // §49/M2 — light up the strip when the objective is met OR the
  // server has flipped readyToClaim. Two distinct states because
  // the player should be able to tell 'I just hit the goal' apart
  // from 'I can claim the reward right now'. Both flavours pulse
  // a brighter border so the strip yanks the eye toward Next/Claim.
  const completionClass = showClaim
    ? ' quest-tracker-strip--ready'
    : (showNext ? ' quest-tracker-strip--objective-met' : '');
  return (
    <section className={`quest-tracker-strip${completionClass}`} aria-label="Tracked quest">
      <div className="quest-tracker-text">
        <small className="quest-tracker-label">Quest</small>
        <strong>{quest.name}</strong>
        <small className="quest-tracker-stage">
          Stage {stageIndex + 1}/{quest.stages.length}: {objectiveText}
        </small>
        {distance !== null && (
          <small className="quest-tracker-distance">{formatDistance(distance)} away</small>
        )}
      </div>
      <div className="quest-tracker-actions">
        <button
          type="button"
          className="quest-tracker-marker-button"
          title="Drop a navigation marker"
          onClick={() => marker && onShowMarker(marker)}
          disabled={!marker}
        >
          Show on map
        </button>
        {showClaim && (
          <button
            type="button"
            className="quest-tracker-action quest-tracker-claim"
            onClick={() => onClaimQuestReward(quest.id)}
          >
            Claim
          </button>
        )}
        {showNext && (
          <button
            type="button"
            className="quest-tracker-action quest-tracker-next"
            onClick={() => onAdvanceQuest(quest.id)}
          >
            Next
          </button>
        )}
      </div>
    </section>
  );
}

function distanceTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = from.x - to.x;
  const dz = from.z - to.z;
  return Math.hypot(dx, dz);
}

export function formatDistance(metres: number): string {
  if (metres < 1) return '<1 m';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export type TrackedStage = {
  quest: QuestDef;
  stageIndex: number;
  stage: QuestDef['stages'][number];
  progress: number;
  marker: { x: number; z: number } | null;
  readyToClaim: boolean;
};

/**
 * §52 playtest follow-up — the strip used to lock onto whichever
 * quest happened to be first in `Object.entries(active)`, ignoring
 * the player's selection in QuestPanel. Now honors `trackedQuestId`
 * when set (and the quest is still active), falling back to the
 * first active quest otherwise. The fallback keeps the legacy
 * single-quest UX working for fresh players who haven't picked
 * anything yet.
 */
export function pickTrackedStage(
  player: PlayerEntity | null,
  trackedQuestId: string | null = null,
): TrackedStage | null {
  if (!player?.questState?.active) return null;
  const active = player.questState.active;
  const preferred = trackedQuestId && active[trackedQuestId] ? trackedQuestId : null;
  const order = preferred ? [preferred, ...Object.keys(active).filter((id) => id !== preferred)] : Object.keys(active);
  for (const questId of order) {
    const entry = active[questId];
    if (!entry) continue;
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (!stage) continue;
    const giver = QUEST_NPCS[quest.npcId];
    const marker = resolveStageMarker(stage, giver?.position ?? null);
    return {
      quest,
      stageIndex: entry.stageIndex,
      stage,
      progress: entry.progress,
      marker,
      readyToClaim: entry.readyToClaim ?? false,
    };
  }
  return null;
}

/**
 * Has the player satisfied the objective enough that Next should be
 * tappable? Mirrors the "press Next" copy in describeObjective so
 * the button and the prompt agree.
 */
export function isObjectiveMet(
  objective: QuestDef['stages'][number]['objective'],
  progress: number,
): boolean {
  switch (objective.kind) {
    case 'kill':
      return progress >= objective.count;
    case 'kill_boss':
    case 'reach':
    case 'talk':
      return progress >= 1;
    case 'manual':
      return true;
    default:
      return false;
  }
}

function describeObjective(
  objective: QuestDef['stages'][number]['objective'],
  progress: number,
): string {
  switch (objective.kind) {
    case 'kill':
      return `${progress}/${objective.count} ${objective.enemyType}`;
    case 'kill_boss': {
      const boss = getMiniBossById(objective.bossId);
      return progress >= 1
        ? `${boss?.name ?? objective.bossId} slain — press Next`
        : `slay ${boss?.name ?? objective.bossId}`;
    }
    case 'reach':
      return progress >= 1 ? 'at waypoint — press Next' : 'travel to marker';
    case 'talk': {
      const npc = QUEST_NPCS[objective.npcId];
      return progress >= 1 ? 'spoke — press Next' : `return to ${npc?.name ?? objective.npcId}`;
    }
    case 'manual':
      return 'press Next when ready';
    default:
      return '';
  }
}

