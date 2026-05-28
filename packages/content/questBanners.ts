import { QUESTS, type QuestDef } from './quests.js';
import { QUEST_NPCS } from './npcs.js';
import { GAME_ZONES, ZoneManager } from './zones.js';
import { zoneIconPath } from './zoneIcons.js';

/**
 * Quest banner art — every quest gets a painterly header by reusing the
 * zone landscape (#722) of where the quest actually takes you, so no
 * per-quest generation is needed:
 *   1. a `kill_boss` stage → the zone whose mini-boss is that boss
 *   2. otherwise the giver NPC's zone (by position)
 *   3. fallback: the starter meadow
 * The banner reinforces "where am I going" the moment a quest opens.
 */
const FALLBACK_ZONE_ID = 'starter_meadow';
const zoneManager = new ZoneManager();

/** Zone id whose mini-boss matches `bossId`, or null. */
function zoneForBoss(bossId: string): string | null {
  for (const zone of GAME_ZONES) {
    if (zone.miniBoss?.id === bossId) return zone.id;
  }
  return null;
}

/** The representative zone id for a quest (see module doc for the rules). */
export function questZoneId(quest: QuestDef): string {
  for (const stage of quest.stages) {
    if (stage.objective.kind === 'kill_boss') {
      const zoneId = zoneForBoss(stage.objective.bossId);
      if (zoneId) return zoneId;
    }
  }
  const giver = QUEST_NPCS[quest.npcId];
  if (giver) {
    const zone = zoneManager.getZoneAtPosition(giver.position);
    if (zone) return zone.id;
  }
  return FALLBACK_ZONE_ID;
}

/** Banner image path for a quest — a zone landscape. */
export function questBannerPath(quest: QuestDef): string {
  return zoneIconPath(questZoneId(quest));
}

/** Resolve by id (convenience for the UI, which holds quest ids). */
export function questBannerPathById(questId: string): string | null {
  const quest = QUESTS[questId];
  return quest ? questBannerPath(quest) : null;
}
