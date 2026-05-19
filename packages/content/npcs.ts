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
  /**
   * PR EE — flavour text for the Wiki Npcs tab. Same record drives
   * the in-game dialog header (eventually) and the wiki description,
   * so a content drop only writes the line once.
   */
  description?: string;
}

export const INTERACTION_RANGE = 4;

export const QUEST_NPCS: Record<string, QuestNpcDef> = {
  warden_galen: {
    id: 'warden_galen',
    name: 'Warden Galen',
    title: 'Talking Island Warden',
    position: { x: 4, y: 0.5, z: 4 },
    description: 'Veteran of the early-evening watch. Knows every goblin path within a day\'s ride and hands out the first work to anyone new to the island.',
  },
  captain_vorr: {
    id: 'captain_vorr',
    name: 'Captain Vorr',
    title: 'Gludin Garrison Captain',
    position: { x: 122, y: 0.5, z: 82 },
    description: 'Career soldier who took the garrison commission after the Reach went quiet. Pays for goblin cullings when his patrols get thin.',
  },
  bounty_broker_mira: {
    id: 'bounty_broker_mira',
    name: 'Mira',
    title: 'Bounty Broker',
    position: { x: 130, y: 0.5, z: 70 },
    description: 'Keeps a board of named-mob bounties pinned to a market stall. Pays in coin and trophies; never asks how the work got done.',
  },
  pyromancer_kael: {
    id: 'pyromancer_kael',
    name: 'Pyromancer Kael',
    title: 'Hermit of the Peaks',
    position: { x: -380, y: 0.5, z: 280 },
    description: 'Self-exiled mage who claims he once read Vorthax\'s dreams. Will guide anyone reckless enough to climb the caldera.',
  },
  high_priest_ondrea: {
    id: 'high_priest_ondrea',
    name: 'High Priest Ondrea',
    title: 'Curator of the Cursed Ruins',
    position: { x: 380, y: 0.5, z: -90 },
    description: 'Tends the consecration rites that keep the ruins from spilling outward. Has a personal grudge against necromancers wearing other people\'s bones.',
  },
  smith_alric: {
    id: 'smith_alric',
    name: 'Smith Alric',
    title: 'Forge-Caller of Sunspire',
    position: { x: 134, y: 0.5, z: 64 },
    description: 'Travelling smith from the steppe whose home forge has gone cold. Wants Magmaheart\'s core to relight it; will pay anyone who brings him one.',
  },
  harbormaster_yiver: {
    id: 'harbormaster_yiver',
    name: 'Harbormaster Yiver',
    title: 'Watcher of the Wetland',
    position: { x: 116, y: 0.5, z: 76 },
    description: 'Reads the tides like other people read books. Convinced something older than the kingdom is stirring under the wetland — and offers coin to anyone who proves him right.',
  },
  scholar_thessa: {
    id: 'scholar_thessa',
    name: 'Scholar Thessa',
    title: 'Mapmaker of Gludin',
    position: { x: 128, y: 0.5, z: 84 },
    description: 'Updating the regional survey one waypoint at a time. Pays travelers for confirmed coordinates and a description of what they saw on the way.',
  },
};

export function getOfferedQuestIds(npcId: string): string[] {
  return getQuestsOfferedBy(npcId).map((q) => q.id);
}
