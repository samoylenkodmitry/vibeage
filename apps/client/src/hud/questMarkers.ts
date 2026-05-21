import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { getMobZones } from '../../../../packages/content/mobLocations';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { GAME_ZONES } from '../../../../packages/content/zones';
import type { PlayerEntity } from '../gameTypes';

/**
 * §49/M2 — single source of truth for "where is the marker for
 * this quest stage?". Previously duplicated across QuestPanel,
 * QuestTrackerStrip, and now MapPanel; centralised here so a
 * future stage-marker rule (e.g. landmark anchors, randomised
 * mob picker) updates everywhere at once.
 *
 *  - readyToClaim → the quest giver (turn-in walk)  [§52 playtest]
 *  - explicit stage.marker wins
 *  - reach → the waypoint
 *  - talk → that NPC's position
 *  - kill_boss → the boss's spawn coord (PR V)
 *  - kill → the first zone the mob spawns in (zone center)
 *  - manual / fallback → the quest giver
 *
 * §52 playtest follow-up — when a quest is `readyToClaim`, the
 * stage index hasn't moved past the last stage (no further stage
 * exists). Without the readyToClaim short-circuit the marker
 * keeps pointing at the original kill / reach / talk location,
 * so "Show on map" walks the player back to the mobs and the
 * server then rejects the claim with `notNearNpc`. Routing to the
 * giver here matches the actual gameplay: hand-in happens at the
 * NPC, never at the kill zone.
 */
export function resolveStageMarker(
  stage: QuestDef['stages'][number],
  giverPos: { x: number; y: number; z: number } | null,
  readyToClaim: boolean = false,
): { x: number; z: number } | null {
  if (readyToClaim && giverPos) return { x: giverPos.x, z: giverPos.z };
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

export type ActiveQuestMarker = {
  questId: string;
  questName: string;
  stageIndex: number;
  marker: { x: number; z: number };
};

/**
 * Every active quest's current-stage marker, in dictionary-iteration
 * order. Used by MapPanel to drop a small pin per active quest so
 * the player can see all in-flight objectives at a glance.
 */
export function listActiveQuestMarkers(player: PlayerEntity | null): ActiveQuestMarker[] {
  if (!player?.questState?.active) return [];
  const out: ActiveQuestMarker[] = [];
  for (const [questId, entry] of Object.entries(player.questState.active)) {
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (!stage) continue;
    const giver = QUEST_NPCS[quest.npcId];
    const marker = resolveStageMarker(stage, giver?.position ?? null, entry.readyToClaim ?? false);
    if (!marker) continue;
    out.push({ questId, questName: quest.name, stageIndex: entry.stageIndex, marker });
  }
  return out;
}
