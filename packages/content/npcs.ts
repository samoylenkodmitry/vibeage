import { getQuestsOfferedBy, type QuestVec3 } from './quests.js';

/**
 * Quest-giving NPCs. Static positions; non-combatant. The client
 * renders a marker at each position and, when the player is in
 * INTERACTION_RANGE, surfaces a "Talk" action that opens the
 * quest dialog (offered + active quests for that NPC).
 *
 * Pure data — adding an NPC means appending an entry here. The
 * actual offered-quest list is derived from QUESTS (any quest with
 * matching npcId), so an NPC and its quests stay loosely coupled.
 */
export interface QuestNpcDef {
  id: string;
  name: string;
  title: string;
  position: QuestVec3;
}

export const INTERACTION_RANGE = 4;

export const QUEST_NPCS: Record<string, QuestNpcDef> = {
  warden_galen: {
    id: 'warden_galen',
    name: 'Warden Galen',
    title: 'Talking Island Warden',
    position: { x: 4, y: 0.5, z: 4 },
  },
  captain_vorr: {
    id: 'captain_vorr',
    name: 'Captain Vorr',
    title: 'Gludin Garrison Captain',
    position: { x: 122, y: 0.5, z: 82 },
  },
};

export function getOfferedQuestIds(npcId: string): string[] {
  return getQuestsOfferedBy(npcId).map((q) => q.id);
}
