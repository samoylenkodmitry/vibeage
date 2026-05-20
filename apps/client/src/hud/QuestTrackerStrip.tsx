import { useMemo } from 'react';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { GAME_ZONES } from '../../../../packages/content/zones';
import { getMobZones } from '../../../../packages/content/mobLocations';
import type { PlayerEntity } from '../gameTypes';

/**
 * §49/M2 PR008 — heads-up quest tracker.
 *
 * A compact always-visible strip showing the player's current
 * objective so they don't have to open the Quest panel to remember
 * what they were doing. Clicking it drops the navigation marker
 * for the current stage's recommended location (NPC, waypoint,
 * boss spawn, mob zone, or quest giver as fallback).
 *
 * Picks the *first* active quest that has unmet progress. When
 * everything is done or no quest is active, renders nothing.
 */
type QuestTrackerStripProps = {
  player: PlayerEntity | null;
  onShowMarker: (pos: { x: number; z: number }) => void;
};

export function QuestTrackerStrip({ player, onShowMarker }: QuestTrackerStripProps) {
  const tracked = useMemo(() => pickTrackedStage(player), [player]);
  if (!tracked) return null;
  const { quest, stageIndex, stage, progress, marker } = tracked;
  const objectiveText = describeObjective(stage.objective, progress);
  return (
    <button
      type="button"
      className="quest-tracker-strip"
      title="Click to drop a navigation marker"
      onClick={() => marker && onShowMarker(marker)}
      disabled={!marker}
    >
      <small className="quest-tracker-label">Quest</small>
      <strong>{quest.name}</strong>
      <small className="quest-tracker-stage">Stage {stageIndex + 1}/{quest.stages.length}: {objectiveText}</small>
    </button>
  );
}

export type TrackedStage = {
  quest: QuestDef;
  stageIndex: number;
  stage: QuestDef['stages'][number];
  progress: number;
  marker: { x: number; z: number } | null;
};

// Exported for §49/M2 PR008 unit tests; keeps the picker testable
// without bringing in a DOM renderer.
export function pickTrackedStage(player: PlayerEntity | null): TrackedStage | null {
  if (!player?.questState?.active) return null;
  const active = player.questState.active;
  for (const [questId, entry] of Object.entries(active)) {
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (!stage) continue;
    const giver = QUEST_NPCS[quest.npcId];
    const marker = resolveStageMarker(stage, giver?.position ?? null);
    return { quest, stageIndex: entry.stageIndex, stage, progress: entry.progress, marker };
  }
  return null;
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

// Mirrors QuestPanel's resolveStageMarker logic. Kept inline rather
// than imported to avoid pulling the panel's whole module just for
// this helper; lives independently here so the tracker is testable.
function resolveStageMarker(
  stage: QuestDef['stages'][number],
  giverPos: { x: number; y: number; z: number } | null,
): { x: number; z: number } | null {
  if (stage.marker) return { x: stage.marker.x, z: stage.marker.z };
  const obj = stage.objective;
  if (obj.kind === 'reach') return { x: obj.position.x, z: obj.position.z };
  if (obj.kind === 'talk') {
    const npc = QUEST_NPCS[obj.npcId];
    if (npc) return { x: npc.position.x, z: npc.position.z };
  }
  if (obj.kind === 'kill_boss') {
    const boss = getMiniBossById(obj.bossId);
    const zone = boss ? GAME_ZONES.find((z) => z.miniBoss?.id === boss.id) : null;
    const pos = zone?.miniBoss?.position;
    if (pos) return { x: pos.x, z: pos.z };
  }
  if (obj.kind === 'kill') {
    const zones = getMobZones(obj.enemyType);
    if (zones.length > 0) return { x: zones[0].position.x, z: zones[0].position.z };
  }
  return giverPos ? { x: giverPos.x, z: giverPos.z } : null;
}
