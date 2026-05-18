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

export type QuestStageObjective =
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

export interface QuestStage {
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
};

/** All quests offered by an NPC. */
export function getQuestsOfferedBy(npcId: string): QuestDef[] {
  return Object.values(QUESTS).filter((q) => q.npcId === npcId);
}
