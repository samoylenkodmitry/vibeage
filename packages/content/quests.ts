import { ITEMS } from './items.js';

export type QuestVec3 = { x: number; y: number; z: number };

/**
 * Quest system — pure data. The engine reads QUESTS + NPC_QUEST_GIVERS;
 * no per-quest conditionals live in code. Adding a quest means
 * appending an entry here and (optionally) wiring an NPC to offer it.
 *
 * Quest shape:
 *   - stages[] runs in order; only the current stage's objective is
 *     evaluated. When the current stage's objective is met the
 *     player may press Next to advance; on the last stage Next
 *     becomes Claim (rewards granted, quest moved to completed).
 *   - kill/reach objectives auto-progress (engine ticks count /
 *     distance every relevant event); manual objectives require
 *     the player to press Next.
 */

type QuestStageObjective =
  | { kind: 'kill'; enemyType: string; count: number }
  /**
   * Slay a specific named mini-boss. `bossId` matches an entry in
   * packages/content/miniBosses.ts; the engine reads enemy.bossId on
   * kill and ticks any matching quest stage. Unlike `kill`, count is
   * always 1 — these are one-of-a-kind targets.
   */
  | { kind: 'kill_boss'; bossId: string }
  | { kind: 'reach'; position: QuestVec3; radius: number }
  | { kind: 'talk'; npcId: string }
  | { kind: 'manual'; description: string };

interface QuestStage {
  id: string;
  description: string;
  objective: QuestStageObjective;
  /** Optional map marker for this stage (defaults to objective position when applicable). */
  marker?: QuestVec3;
}

export interface QuestReward {
  xp?: number;
  gold?: number;
  /** Item template ids to grant. Quantity defaults to 1 each. */
  items?: ReadonlyArray<{ itemId: string; quantity?: number }>;
}

/**
 * §49/M6 PR029 — gate the quest behind other in-world state.
 * Any prereq set to an empty array is ignored; all listed sets
 * must be satisfied (AND). When omitted entirely the quest has
 * no extra gates (the existing `minLevel` still applies).
 *
 * Killed-boss prereqs are derived from completed quests that had
 * a kill_boss objective (no separate kill log exists yet) — pin
 * them via `completedQuests` until a real boss-kill registry
 * lands (own PR).
 */
interface QuestPrerequisites {
  /** Player must have *completed* every listed quest. */
  completedQuests?: ReadonlyArray<QuestId>;
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  /** NPC that offers + completes the quest (id from NPC_QUEST_GIVERS). */
  npcId: string;
  /** Minimum level to accept. */
  minLevel: number;
  stages: QuestStage[];
  reward: QuestReward;
  /** §49/M6 PR029 — optional prerequisite gate, evaluated server-side. */
  prerequisites?: QuestPrerequisites;
}

export type QuestId = string;

export const QUESTS: Record<QuestId, QuestDef> = {
  rats_in_the_cellar: {
    id: 'rats_in_the_cellar',
    name: 'Rats in the Cellar',
    description: 'The Talking Island warden needs help clearing the goblin den.',
    npcId: 'warden_galen',
    minLevel: 1,
    stages: [
      {
        id: 'kill_goblins',
        description: 'Slay 3 goblins near Talking Island.',
        objective: { kind: 'kill', enemyType: 'goblin', count: 3 },
      },
      {
        id: 'report_back',
        description: 'Return to Warden Galen.',
        objective: { kind: 'talk', npcId: 'warden_galen' },
      },
    ],
    reward: { xp: 120, gold: 25, items: [{ itemId: 'health_potion', quantity: 2 }] },
  },
  scout_the_road: {
    id: 'scout_the_road',
    name: 'Scout the Road',
    description: 'Walk the path toward Gludin and report what you see.',
    npcId: 'warden_galen',
    minLevel: 3,
    stages: [
      {
        id: 'reach_waypoint',
        description: 'Reach the waypoint south-east of the village.',
        objective: { kind: 'reach', position: { x: 60, y: 0.5, z: 40 }, radius: 5 },
        marker: { x: 60, y: 0.5, z: 40 },
      },
      {
        id: 'report_findings',
        description: 'Return and tell the warden what you saw.',
        objective: { kind: 'manual', description: 'Press Next to give your report.' },
      },
    ],
    reward: { xp: 200, gold: 40 },
  },
  cull_the_horde: {
    id: 'cull_the_horde',
    name: 'Cull the Horde',
    description: 'A larger goblin band is being seen further out. Cut their numbers.',
    npcId: 'captain_vorr',
    minLevel: 8,
    stages: [
      {
        id: 'slay_band',
        description: 'Defeat 8 goblins.',
        objective: { kind: 'kill', enemyType: 'goblin', count: 8 },
      },
    ],
    reward: { xp: 600, gold: 120, items: [{ itemId: 'mana_potion', quantity: 3 }] },
  },
  bounty_grakk: {
    id: 'bounty_grakk',
    name: 'Bounty: Grakk the Goblin Chief',
    description: 'Mira posts a bounty on the goblin warlord harassing the meadow. Bring her his warband horn.',
    npcId: 'bounty_broker_mira',
    minLevel: 4,
    stages: [
      {
        id: 'slay_grakk',
        description: 'Slay Grakk the Goblin Chief.',
        objective: { kind: 'kill_boss', bossId: 'grakk' },
      },
      {
        id: 'collect_bounty',
        description: 'Return to Mira to collect the bounty.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 400, gold: 180, items: [{ itemId: 'grakk_warband_horn', quantity: 1 }, { itemId: 'health_potion', quantity: 3 }] },
  },
  bounty_old_greyfang: {
    id: 'bounty_old_greyfang',
    name: 'Bounty: Old Greyfang',
    description: 'A pack-elder wolf has been picking off hunters in the pinewood. Mira wants its pelt.',
    npcId: 'bounty_broker_mira',
    minLevel: 5,
    stages: [
      {
        id: 'slay_greyfang',
        description: 'Slay Old Greyfang.',
        objective: { kind: 'kill_boss', bossId: 'old_greyfang' },
      },
      {
        id: 'deliver_pelt',
        description: 'Bring the pelt back to Mira.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 450, gold: 200, items: [{ itemId: 'greyfang_pelt', quantity: 1 }] },
  },
  bounty_hammerback: {
    id: 'bounty_hammerback',
    name: 'Bounty: Hammerback the Hill Troll',
    description: 'A troll has set up shop on the bouldered hills and dares anyone to take the slab from him.',
    npcId: 'bounty_broker_mira',
    minLevel: 7,
    stages: [
      {
        id: 'slay_hammerback',
        description: 'Slay Hammerback the Hill Troll.',
        objective: { kind: 'kill_boss', bossId: 'hammerback' },
      },
      {
        id: 'return_to_mira',
        description: 'Report success to Mira.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 700, gold: 320, items: [{ itemId: 'hammerback_slab_chip', quantity: 1 }] },
  },
  the_ember_trial: {
    id: 'the_ember_trial',
    name: 'The Ember Trial',
    description: 'Pyromancer Kael claims the wyrm Vorthax can be slain — if a mortal can climb to him without burning out first.',
    npcId: 'pyromancer_kael',
    minLevel: 12,
    stages: [
      {
        id: 'meet_kael',
        description: 'Speak with Pyromancer Kael at the foot of the peaks.',
        objective: { kind: 'talk', npcId: 'pyromancer_kael' },
      },
      {
        id: 'reach_caldera',
        description: 'Climb to the caldera where Vorthax sleeps.',
        objective: { kind: 'reach', position: { x: -400, y: 0.5, z: 300 }, radius: 30 },
        marker: { x: -400, y: 0.5, z: 300 },
      },
      {
        id: 'slay_vorthax',
        description: 'Slay Vorthax the Ember Wyrm.',
        objective: { kind: 'kill_boss', bossId: 'vorthax_ember_wyrm' },
      },
      {
        id: 'return_to_kael',
        description: 'Bring the ember scale back to Kael.',
        objective: { kind: 'talk', npcId: 'pyromancer_kael' },
      },
    ],
    reward: { xp: 2400, gold: 800, items: [{ itemId: 'vorthax_ember_scale', quantity: 1 }, { itemId: 'greater_health_potion', quantity: 5 }] },
  },
  bounty_mistwalker: {
    id: 'bounty_mistwalker',
    name: 'Bounty: The Mistwalker',
    description: 'Travellers have stopped returning from the Fogbound Barrows. Mira pays well for a body of evidence.',
    npcId: 'bounty_broker_mira',
    minLevel: 9,
    stages: [
      {
        id: 'slay_mistwalker',
        description: 'Slay the Mistwalker.',
        objective: { kind: 'kill_boss', bossId: 'mistwalker' },
      },
      {
        id: 'deliver_shroud',
        description: 'Bring the fogbound shroud to Mira.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 900, gold: 380, items: [{ itemId: 'mistwalker_shroud', quantity: 1 }, { itemId: 'mana_potion', quantity: 4 }] },
  },
  bounty_nyaraal: {
    id: 'bounty_nyaraal',
    name: 'Bounty: Nyaraal of the Hollow Path',
    description: 'A voidwalker with too many shadows haunts the Shadow Valley. Mira would rather it had none.',
    npcId: 'bounty_broker_mira',
    minLevel: 14,
    stages: [
      {
        id: 'slay_nyaraal',
        description: 'Slay Nyaraal of the Hollow Path.',
        objective: { kind: 'kill_boss', bossId: 'nyaraal' },
      },
      {
        id: 'return_with_shard',
        description: 'Return to Mira with the hollow shard.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 2000, gold: 700, items: [{ itemId: 'nyaraal_hollow_shard', quantity: 1 }] },
  },
  bounty_prism_warden: {
    id: 'bounty_prism_warden',
    name: 'Bounty: The Prism Warden',
    description: 'A crystal construct in the caverns is sending shards out at every passing caster. Cap its reflection forever.',
    npcId: 'bounty_broker_mira',
    minLevel: 14,
    stages: [
      {
        id: 'slay_warden',
        description: 'Slay the Prism Warden.',
        objective: { kind: 'kill_boss', bossId: 'prism_warden' },
      },
      {
        id: 'return_with_facet',
        description: 'Bring Mira the Warden\'s facet.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 2100, gold: 750, items: [{ itemId: 'prism_warden_facet', quantity: 1 }] },
  },
  bounty_elder_vinebrook: {
    id: 'bounty_elder_vinebrook',
    name: 'Bounty: Elder Vinebrook',
    description: 'The silverwood treant has rooted itself across a trade path. Mira would prefer it un-rooted.',
    npcId: 'bounty_broker_mira',
    minLevel: 16,
    stages: [
      {
        id: 'slay_vinebrook',
        description: 'Slay Elder Vinebrook.',
        objective: { kind: 'kill_boss', bossId: 'elder_vinebrook' },
      },
      {
        id: 'return_with_heartwood',
        description: 'Deliver the heartwood to Mira.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 2400, gold: 820, items: [{ itemId: 'vinebrook_heartwood', quantity: 1 }] },
  },
  the_forge_pact: {
    id: 'the_forge_pact',
    name: 'The Forge Pact',
    description: 'Smith Alric needs Magmaheart\'s core to relight Sunspire\'s great forge. He\'ll teach you what it can do once you bring it.',
    npcId: 'smith_alric',
    minLevel: 16,
    stages: [
      {
        id: 'meet_alric',
        description: 'Talk with Smith Alric at the Sunspire camp.',
        objective: { kind: 'talk', npcId: 'smith_alric' },
      },
      {
        id: 'slay_magmaheart',
        description: 'Slay Magmaheart at the molten heart of the steppe.',
        objective: { kind: 'kill_boss', bossId: 'magmaheart' },
      },
      {
        id: 'deliver_core',
        description: 'Hand the still-warm forge core to Smith Alric.',
        objective: { kind: 'talk', npcId: 'smith_alric' },
      },
    ],
    reward: { xp: 3200, gold: 1100, items: [{ itemId: 'magmaheart_core', quantity: 1 }, { itemId: 'greater_health_potion', quantity: 8 }] },
  },
  drowned_kingdom: {
    id: 'drowned_kingdom',
    name: 'The Drowned Kingdom',
    description: 'Harbormaster Yiver swears the wetland\'s tides are answering to something older than the realm. He wants it crowned only when it\'s dead.',
    npcId: 'harbormaster_yiver',
    minLevel: 22,
    stages: [
      {
        id: 'meet_yiver',
        description: 'Hear Harbormaster Yiver out at the wetland docks.',
        objective: { kind: 'talk', npcId: 'harbormaster_yiver' },
      },
      {
        id: 'thin_the_voidspawn',
        description: 'Cut down 6 tentacle horrors guarding the deep.',
        objective: { kind: 'kill', enemyType: 'tentacle_horror', count: 6 },
      },
      {
        id: 'slay_cthulun',
        description: 'Slay Cthulun, the Drowned King.',
        objective: { kind: 'kill_boss', bossId: 'cthulun' },
      },
      {
        id: 'present_crown',
        description: 'Present the barnacle crown to Harbormaster Yiver.',
        objective: { kind: 'talk', npcId: 'harbormaster_yiver' },
      },
    ],
    reward: { xp: 5400, gold: 2200, items: [{ itemId: 'cthulun_barnacle_crown', quantity: 1 }, { itemId: 'greater_health_potion', quantity: 10 }] },
  },
  trophies_of_the_wild: {
    id: 'trophies_of_the_wild',
    name: 'Trophies of the Wild',
    description: 'Mira is restocking her display wall. She\'ll pay for any reasonable pile of wolf and goblin trophies you can bring back.',
    npcId: 'bounty_broker_mira',
    minLevel: 4,
    stages: [
      {
        id: 'thin_wolves',
        description: 'Defeat 6 wolves.',
        objective: { kind: 'kill', enemyType: 'wolf', count: 6 },
      },
      {
        id: 'thin_goblins',
        description: 'Defeat 6 goblins.',
        objective: { kind: 'kill', enemyType: 'goblin', count: 6 },
      },
      {
        id: 'deliver_pile',
        description: 'Return to Mira with the pile.',
        objective: { kind: 'talk', npcId: 'bounty_broker_mira' },
      },
    ],
    reward: { xp: 800, gold: 240, items: [{ itemId: 'health_potion', quantity: 6 }, { itemId: 'mana_potion', quantity: 4 }] },
  },
  the_mapping_run: {
    id: 'the_mapping_run',
    name: 'The Mapping Run',
    description: 'Scholar Thessa is updating the regional map. She needs a walker to confirm three waypoints still exist where the last survey put them.',
    npcId: 'scholar_thessa',
    minLevel: 3,
    stages: [
      {
        id: 'collect_brief',
        description: 'Pick up the survey notes from Scholar Thessa.',
        objective: { kind: 'talk', npcId: 'scholar_thessa' },
      },
      {
        id: 'visit_north_marker',
        description: 'Reach the northern waypoint.',
        objective: { kind: 'reach', position: { x: 80, y: 0.5, z: 130 }, radius: 8 },
        marker: { x: 80, y: 0.5, z: 130 },
      },
      {
        id: 'visit_south_marker',
        description: 'Reach the southern waypoint.',
        objective: { kind: 'reach', position: { x: 100, y: 0.5, z: -40 }, radius: 8 },
        marker: { x: 100, y: 0.5, z: -40 },
      },
      {
        id: 'visit_west_marker',
        description: 'Reach the western waypoint.',
        objective: { kind: 'reach', position: { x: -120, y: 0.5, z: 30 }, radius: 8 },
        marker: { x: -120, y: 0.5, z: 30 },
      },
      {
        id: 'deliver_notes',
        description: 'Return the survey to Scholar Thessa.',
        objective: { kind: 'talk', npcId: 'scholar_thessa' },
      },
    ],
    reward: { xp: 600, gold: 220, items: [{ itemId: 'mana_potion', quantity: 3 }] },
  },
  the_bone_lord: {
    id: 'the_bone_lord',
    name: 'The Bone Lord',
    description: 'High Priest Ondrea has a problem: a necromancer who calls himself Vereth has chained the dead to his will.',
    npcId: 'high_priest_ondrea',
    minLevel: 9,
    stages: [
      {
        id: 'meet_ondrea',
        description: 'Hear Ondrea out at the ruin gate.',
        objective: { kind: 'talk', npcId: 'high_priest_ondrea' },
      },
      {
        id: 'thin_the_unbound',
        description: 'Cut down 5 of the bound skeletons.',
        objective: { kind: 'kill', enemyType: 'skeleton', count: 5 },
      },
      {
        id: 'slay_vereth',
        description: 'Slay Vereth the Bone Lord.',
        objective: { kind: 'kill_boss', bossId: 'vereth_bone_lord' },
      },
      {
        id: 'consecrate_ruin',
        description: 'Return to Ondrea with Vereth’s phylactery so it may be consecrated.',
        objective: { kind: 'talk', npcId: 'high_priest_ondrea' },
      },
    ],
    reward: { xp: 1500, gold: 500, items: [{ itemId: 'vereth_phylactery', quantity: 1 }, { itemId: 'mana_potion', quantity: 4 }] },
  },
  // §49/M1+ — three high-tier bounties closing the
  // "unquested boss" entries in docs/UNLINKED.md. Reward
  // levels mirror existing endgame bounties (kept proportional
  // to the boss tier). All gated behind Mira so they slot into
  // the existing Wildlands → Mira → Bounty path.
  bounty_skadrun: {
    id: 'bounty_skadrun',
    name: 'Bounty: Skadrun, Tundra King',
    description: 'An ice giant has claimed the Moonfall highland and the blizzards as his throne. Mira posts a contract on him; bring his crown shard.',
    npcId: 'bounty_broker_mira',
    minLevel: 28,
    stages: [
      { id: 'slay_skadrun', description: 'Slay Skadrun, Tundra King.', objective: { kind: 'kill_boss', bossId: 'skadrun' } },
      { id: 'deliver_crown_shard', description: "Bring Mira the crown shard.", objective: { kind: 'talk', npcId: 'bounty_broker_mira' } },
    ],
    reward: { xp: 5_000, gold: 1_500, items: [{ itemId: 'skadrun_crown_shard', quantity: 1 }, { itemId: 'greater_health_potion', quantity: 5 }] },
  },
  bounty_auriel: {
    id: 'bounty_auriel',
    name: 'Bounty: Auriel of the First Dawn',
    description: 'A celestial guardian walks the bonus tier — Mira wants the dawnfeather for proof and pay.',
    npcId: 'bounty_broker_mira',
    minLevel: 35,
    stages: [
      { id: 'slay_auriel', description: 'Slay Auriel of the First Dawn.', objective: { kind: 'kill_boss', bossId: 'auriel' } },
      { id: 'deliver_dawnfeather', description: "Return the dawnfeather to Mira.", objective: { kind: 'talk', npcId: 'bounty_broker_mira' } },
    ],
    reward: { xp: 8_000, gold: 2_500, items: [{ itemId: 'auriel_dawnfeather', quantity: 1 }, { itemId: 'mana_potion', quantity: 5 }] },
  },
  bounty_aethariel: {
    id: 'bounty_aethariel',
    name: 'Bounty: Aethariel, Warden of Hours',
    description: 'The Chronoglass desert hums with stalled time. Mira will pay a kingdom for proof Aethariel has stopped humming.',
    npcId: 'bounty_broker_mira',
    minLevel: 40,
    stages: [
      { id: 'slay_aethariel', description: 'Slay Aethariel, Warden of Hours.', objective: { kind: 'kill_boss', bossId: 'aethariel' } },
      { id: 'deliver_hourglass_sand', description: "Bring the hourglass sand to Mira.", objective: { kind: 'talk', npcId: 'bounty_broker_mira' } },
    ],
    reward: { xp: 12_000, gold: 4_000, items: [{ itemId: 'aethariel_hourglass_sand', quantity: 1 }, { itemId: 'greater_health_potion', quantity: 8 }] },
  },
};

/** All quests offered by an NPC. */
/**
 * §49/M6 PR029 — true when the player satisfies every declared
 * prerequisite. Designed to be cheap: O(prereqs), no allocations
 * for the common "no prereqs" case. NPCs that listed killed-boss
 * trophies as quest prereqs use this both server-side (gate the
 * accept) and (later) client-side (grey out the offer row).
 */
/**
 * §49/M6 — single-line reward summary used by both the NPC dialog
 * (pre-accept preview) and the server (post-claim ChatBroadcast).
 * Pure function over `QuestReward` + `ITEMS`; ids resolve to
 * display names. `''` when the reward bag is empty.
 */
export function formatRewardSummary(reward: QuestReward): string {
  const parts: string[] = [];
  if (reward.xp) parts.push(`${reward.xp} XP`);
  if (reward.gold) parts.push(`${reward.gold}g`);
  for (const grant of reward.items ?? []) {
    const name = ITEMS[grant.itemId]?.name ?? grant.itemId;
    const qty = grant.quantity && grant.quantity > 1 ? `${grant.quantity}× ` : '';
    parts.push(`${qty}${name}`);
  }
  return parts.join(', ');
}

export function meetsQuestPrerequisites(
  quest: QuestDef,
  state: { completedQuests: ReadonlyArray<QuestId> },
): boolean {
  const p = quest.prerequisites;
  if (!p?.completedQuests?.length) return true;
  for (const id of p.completedQuests) {
    if (!state.completedQuests.includes(id)) return false;
  }
  return true;
}

export function getQuestsOfferedBy(npcId: string): QuestDef[] {
  return Object.values(QUESTS).filter((q) => q.npcId === npcId);
}
