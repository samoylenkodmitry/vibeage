import type { QuestVec3 } from './quests.js';

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
  /**
   * PR KK — one-liner the NPC says when the player taps "Greet".
   * Server emits a direct ChatBroadcast with `fromName = npc.name`
   * so the line lands in the combat / chat log. Defaults to a
   * generic acknowledgement when absent.
   */
  greet?: string;
}

export const INTERACTION_RANGE = 4;

export const QUEST_NPCS: Record<string, QuestNpcDef> = {
  warden_galen: {
    id: 'warden_galen',
    name: 'Warden Galen',
    title: 'Talking Island Warden',
    position: { x: 4, y: 0.5, z: 4 },
    description: 'Veteran of the early-evening watch. Knows every goblin path within a day\'s ride and hands out the first work to anyone new to the island.',
    greet: "Stay sharp, traveller. The goblins have been bolder this week.",
  },
  captain_vorr: {
    id: 'captain_vorr',
    name: 'Captain Vorr',
    title: 'Gludin Garrison Captain',
    position: { x: 122, y: 0.5, z: 82 },
    description: 'Career soldier who took the garrison commission after the Reach went quiet. Pays for goblin cullings when his patrols get thin.',
    greet: "If you've come for the cullings, the work's posted — and the gold's good.",
  },
  bounty_broker_mira: {
    id: 'bounty_broker_mira',
    name: 'Mira',
    title: 'Bounty Broker',
    position: { x: 130, y: 0.5, z: 70 },
    description: 'Keeps a board of named-mob bounties pinned to a market stall. Pays in coin and trophies; never asks how the work got done.',
    greet: "Bounties on the board. Bring trophies, get paid — I don't ask how.",
  },
  pyromancer_kael: {
    id: 'pyromancer_kael',
    name: 'Pyromancer Kael',
    title: 'Hermit of the Peaks',
    position: { x: -380, y: 0.5, z: 280 },
    description: 'Self-exiled mage who claims he once read Vorthax\'s dreams. Will guide anyone reckless enough to climb the caldera.',
    greet: "You smell of cold ash. Good — the caldera doesn't suffer the warm.",
  },
  high_priest_ondrea: {
    id: 'high_priest_ondrea',
    name: 'High Priest Ondrea',
    title: 'Curator of the Cursed Ruins',
    position: { x: 380, y: 0.5, z: -90 },
    description: 'Tends the consecration rites that keep the ruins from spilling outward. Has a personal grudge against necromancers wearing other people\'s bones.',
    greet: "Walk softly inside the ruins. The dead remember footsteps.",
  },
  smith_alric: {
    id: 'smith_alric',
    name: 'Smith Alric',
    title: 'Forge-Caller of Sunspire',
    position: { x: 134, y: 0.5, z: 64 },
    description: 'Travelling smith from the steppe whose home forge has gone cold. Wants Magmaheart\'s core to relight it; will pay anyone who brings him one.',
    greet: "My forge is cold. Bring me a Magmaheart Core and we'll talk steel.",
  },
  harbormaster_yiver: {
    id: 'harbormaster_yiver',
    name: 'Harbormaster Yiver',
    title: 'Watcher of the Wetland',
    position: { x: 116, y: 0.5, z: 76 },
    description: 'Reads the tides like other people read books. Convinced something older than the kingdom is stirring under the wetland — and offers coin to anyone who proves him right.',
    greet: "The lights drift wrong tonight. Something deep is waking.",
  },
  scholar_thessa: {
    id: 'scholar_thessa',
    name: 'Scholar Thessa',
    title: 'Mapmaker of Gludin',
    position: { x: 128, y: 0.5, z: 84 },
    description: 'Updating the regional survey one waypoint at a time. Pays travelers for confirmed coordinates and a description of what they saw on the way.',
    greet: "Coordinates and a description — that's all I ask. Coin in exchange.",
  },
  // PR GG — vendor NPCs. Same QUEST_NPCS record drives marker placement
  // in-world AND the wiki Npcs tab; the linked VENDORS entry adds the
  // "Browse" action to the dialog.
  general_goods_thala: {
    id: 'general_goods_thala',
    name: 'Thala',
    title: 'Gludin General Goods',
    position: { x: 138, y: 0.5, z: 70 },
    description: 'Keeps the city stocked with the small comforts no adventurer admits to needing: potions, scrolls, and the rope they pretended to bring.',
    greet: "Potions, mana, resistance brews — all reasonably priced.",
  },
  tinker_drev: {
    id: 'tinker_drev',
    name: 'Tinker Drev',
    title: 'Apprentice Smith',
    position: { x: 142, y: 0.5, z: 78 },
    description: 'Sells the starter gear every fresh recruit is too proud to wear and every veteran wishes they had kept.',
    greet: "Leather, bone, plate — gear that won't get you killed.",
  },
  trophy_buyer_oren: {
    id: 'trophy_buyer_oren',
    name: 'Oren',
    title: 'Trophy Buyer',
    position: { x: 146, y: 0.5, z: 86 },
    description: 'Quiet old man with a ledger of trophies and a strict policy: he never asks who you took them from. Pays well for proof of work.',
    greet: "Show me what you brought. I pay fair — never ask questions.",
  },
  lenskeeper_savra: {
    id: 'lenskeeper_savra',
    name: 'Lenskeeper Savra',
    title: 'Crystal Surveyor',
    position: { x: -286, y: 0.5, z: -412 },
    description: 'Carries a satchel of cracked lenses and draws maps in reflected light. Needs fresh readings from the crystal caverns.',
    greet: "Mind the lattice. It grows into yesterday's footprints first.",
  },
  shade_reeve_marn: {
    id: 'shade_reeve_marn',
    name: 'Marn',
    title: 'Shade-Reeve',
    position: { x: 326, y: 0.5, z: 392 },
    description: 'Keeps a stern ledger at the valley edge. Treats monsters, debts, and adventurers as different columns of the same account.',
    greet: "Every shadow here owes something. I pay when the balance closes.",
  },
  hourglass_scribe_pelin: {
    id: 'hourglass_scribe_pelin',
    name: 'Pelin',
    title: 'Hourglass Scribe',
    position: { x: -690, y: 0.5, z: 704 },
    description: 'Records rift timings in narrow notebooks, then crosses them out when time changes its mind.',
    greet: "If the same minute greets you twice, write down what changed.",
  },
  frontier_quartermaster_vane: {
    id: 'frontier_quartermaster_vane',
    name: 'Vane',
    title: 'Frontier Quartermaster',
    position: { x: 154, y: 0.5, z: 92 },
    description: 'Supplies roadwardens and horizon scouts with gear built for long routes beyond Gludin.',
    greet: "Road gear, horizon gear, and no parade polish. If it is on this table, it has survived a patrol.",
  },
  roadwarden_saila: {
    id: 'roadwarden_saila',
    name: 'Saila',
    title: 'Roadwarden Guide',
    position: { x: 162, y: 0.5, z: 98 },
    description: 'Keeps a clean chain of frontier postings for adventurers who have chosen a specialization but are not ready for the far camps.',
    greet: 'If your path is chosen, I can keep your next ten levels from becoming empty road.',
  },
  firebreak_warden_iyen: {
    id: 'firebreak_warden_iyen',
    name: 'Iyen',
    title: 'Firebreak Warden',
    position: { x: 258_600, y: 0.5, z: -119_500 },
    description: 'Maintains cutlines across Sunspire when the steppe fires start moving like weather.',
    greet: "Stay upwind of the drakes. The cutline only matters if someone lives to redraw it.",
  },
  star_chartist_luma: {
    id: 'star_chartist_luma',
    name: 'Luma',
    title: 'Moonfall Chartist',
    position: { x: -318_700, y: 0.5, z: -259_100 },
    description: 'Maps Moonfall by watching what the stars refuse to illuminate twice.',
    greet: "The sky is lying again. Help me mark exactly where.",
  },
  marsh_marshal_orrin: {
    id: 'marsh_marshal_orrin',
    name: 'Orrin',
    title: 'Marsh Marshal',
    position: { x: 151_000, y: 0.5, z: 388_100 },
    description: 'Keeps patrols moving across the blackwater causeways when the wetland starts using borrowed voices.',
    greet: "If the marsh says your name, do not answer. Report to me instead.",
  },
  riftwright_nessa: {
    id: 'riftwright_nessa',
    name: 'Nessa',
    title: 'Riftwright',
    position: { x: -418_500, y: 0.5, z: 358_600 },
    description: 'Stabilizes chronoglass rifts with chalk, wire, and a refusal to believe any hour is final.',
    greet: "If you meet yourself at the breach, let the version carrying my notes talk first.",
  },
};
